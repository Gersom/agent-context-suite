// Lo que `close` escribe en `history.md`: una entrada `## <fecha> — ✅|❌ Tarea N — título` con sus
// viñetas (qué se hizo y por qué, o el motivo del descarte), arriba de todas las demás (las más
// nuevas van primero). Funciones puras sobre el texto LF de `history.md`.

import { commentStateAfter, isPlaceholder } from "../../../_shared/parse/markdown.ts";
import type { ParsedHistory } from "../../../_shared/types.ts";
import { deleteRange, type Edit, insertAt, replaceRange } from "../edit/edits.ts";
import type { Doc } from "../workspace/docs.ts";
import { normalizeText } from "./render.ts";

export type Outcome = "done" | "discarded";

export const OUTCOME_MARK: Record<Outcome, string> = { done: "✅", discarded: "❌" };

export interface HistoryEntryInput {
  date: string;
  outcome: Outcome;
  /** Palabra del header de tarea (`Tarea`, `Task`). */
  label: string;
  number: number;
  title: string;
  /** El resumen (hecha) o el motivo (descartada), como lo escribió el operador. */
  text: string;
  /** La línea `- **Origen:** team-backlog` de la tarea, si la traía: viaja a la entrada tal cual. */
  origin?: string | null;
  /** La línea `- **Etiquetas:** a b` de la tarea, si la traía: viaja a la entrada tal cual, tras `Origen`. */
  labels?: string | null;
}

/**
 * Convierte un texto libre en viñetas de history.md: las líneas que ya son viñeta (`- ...`) o
 * continuación sangrada se conservan, y cada otra línea pasa a ser una viñeta. Se descartan las
 * líneas en blanco (las entradas no las llevan entre viñetas).
 */
export function bulletize(text: string): string {
  return normalizeText(text)
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => (/^\s/.test(line) || /^[-*]\s/.test(line) ? line : `- ${line}`))
    .join("\n");
}

/** La entrada completa (sin salto de línea final): header, línea en blanco y viñetas. */
export function renderHistoryEntry(input: HistoryEntryInput): string {
  const header = `## ${input.date} — ${OUTCOME_MARK[input.outcome]} ${input.label} ${input.number} — ${input.title}`;
  const carried = [input.origin, input.labels].flatMap((line) => (line ? [line.replace(/\s+$/, "")] : []));
  const bullets = [...carried, bulletize(input.text)];
  return `${header}\n\n${bullets.join("\n")}`;
}

/** Rango de la primera entrada de plantilla (`## [Placeholder fecha] — ✅ [Placeholder título]`), fuera de comentarios y bloques de código; `null` si no hay. */
function placeholderEntry(text: string): { start: number; end: number } | null {
  let inComment = false;
  let inFence = false;
  let offset = 0;
  let start: number | null = null;
  for (const line of text.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;
    const startsInComment = inComment;
    inComment = commentStateAfter(line, inComment);
    if (startsInComment) continue;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !/^##(?!#)\s/.test(line)) continue;
    if (start !== null) return { start, end: lineStart };
    if (isPlaceholder(line)) start = lineStart;
  }
  return start === null ? null : { start, end: text.length };
}

/** Una línea que es solo `Ninguna.` / `None.` (con o sin punto, sin distinguir mayúsculas): lo que deja el perfil no técnico en lugar de la entrada de ejemplo. */
const NONE_LINE_RE = /^(?:ninguna|none)\.?\s*$/i;

/**
 * Rangos de las líneas `Ninguna.` / `None.` sobrantes de la zona de entradas: las que están solas
 * antes de la primera entrada (o la de plantilla, o el primer `##`, o el fin del texto), fuera de
 * comentarios HTML y bloques de código. Cada rango incluye el salto de línea y, si la línea venía
 * tras una en blanco, las líneas en blanco que le siguen, para no dejar dos seguidas.
 */
function staleNoneLines(text: string, entryStart: number | undefined): Array<{ start: number; end: number }> {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const limit = entryStart ?? text.length;
  const found: Array<{ start: number; end: number }> = [];
  let inComment = false;
  let inFence = false;
  for (let i = 0; i < lines.length && starts[i] < limit; i++) {
    const line = lines[i];
    const startsInComment = inComment;
    inComment = commentStateAfter(line, inComment);
    if (startsInComment) continue;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^##(?!#)\s/.test(line)) break;
    if (!NONE_LINE_RE.test(line)) continue;
    let last = i;
    if (i === 0 || !lines[i - 1].trim()) {
      while (last + 1 < lines.length && !lines[last + 1].trim()) last++;
    }
    found.push({ start: starts[i], end: Math.min(starts[last] + lines[last].length + 1, text.length) });
  }
  return found;
}

/**
 * Ediciones que ponen la entrada arriba de las demás y retiran el `Ninguna.` / `None.` sobrante de
 * la zona de entradas (ver `staleNoneLines`). Si `history.md` no tiene entradas, reemplaza la de
 * plantilla (`[Placeholder ...]`) y, si tampoco hay, va al final del archivo.
 * @param entry la entrada, sin salto de línea final (ver `renderHistoryEntry`)
 */
export function insertHistoryEntry(history: Doc<ParsedHistory>, entry: string): Edit[] {
  const text = history.text;
  const first = history.parsed.entries[0];
  const stale = staleNoneLines(text, first?.range?.start);
  if (first?.range) return [...stale.map(deleteRange), insertAt(first.range.start, `${entry}\n\n`)];

  const placeholder = placeholderEntry(text);
  if (placeholder) {
    const used = text.slice(placeholder.start, placeholder.end).trimEnd().length;
    return [...stale.map(deleteRange), replaceRange({ start: placeholder.start, end: placeholder.start + used }, entry)];
  }

  // Al final del archivo: si lo último es un `Ninguna.` sobrante, la entrada ocupa su lugar.
  let end = text.trimEnd().length;
  for (let last = stale.at(-1); last && last.start < end && end <= last.end; last = stale.at(-1)) {
    stale.pop();
    end = text.slice(0, last.start).trimEnd().length;
  }
  const edits = stale.map(deleteRange);
  if (end === 0) return [...edits, replaceRange({ start: 0, end: text.length }, `${entry}\n`)];
  return [...edits, replaceRange({ start: end, end: text.length }, `\n\n${entry}\n`)];
}
