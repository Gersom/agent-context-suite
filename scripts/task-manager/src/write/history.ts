// Lo que `close` escribe en `history.md`: una entrada `## <fecha> — ✅|❌ Tarea N — título` con sus
// viñetas (qué se hizo y por qué, o el motivo del descarte), arriba de todas las demás (las más
// nuevas van primero). Funciones puras sobre el texto LF de `history.md`.

import { commentStateAfter, isPlaceholder } from "../../../_shared/parse/markdown.ts";
import type { ParsedHistory } from "../../../_shared/types.ts";
import { type Edit, insertAt, replaceRange } from "../edit/edits.ts";
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

/**
 * Edición que pone la entrada arriba de las demás. Si `history.md` no tiene entradas, reemplaza la
 * de plantilla (`[Placeholder ...]`) y, si tampoco hay, va al final del archivo.
 * @param entry la entrada, sin salto de línea final (ver `renderHistoryEntry`)
 */
export function insertHistoryEntry(history: Doc<ParsedHistory>, entry: string): Edit {
  const first = history.parsed.entries[0];
  if (first?.range) return insertAt(first.range.start, `${entry}\n\n`);

  const text = history.text;
  const placeholder = placeholderEntry(text);
  if (placeholder) {
    const used = text.slice(placeholder.start, placeholder.end).trimEnd().length;
    return replaceRange({ start: placeholder.start, end: placeholder.start + used }, entry);
  }
  if (!text.trim()) return replaceRange({ start: 0, end: text.length }, `${entry}\n`);
  return replaceRange({ start: text.trimEnd().length, end: text.length }, `\n\n${entry}\n`);
}
