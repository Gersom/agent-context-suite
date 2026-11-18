// Interpretación de history.md: sus entradas `## <fecha> — ✅|❌ [Tarea N —] título`, en el orden
// del archivo (por convención, las más nuevas arriba). No usa anclas: cada entrada es un `## `.

import type { HistoryEntry, ParsedHistory } from "../types.ts";
import { entryLabels } from "../tasks/labels.ts";
import { commentStateAfter, isPlaceholder } from "./markdown.ts";
import { LineIndex } from "./positions.ts";

const H2_RE = /^##(?!#)\s+(.+?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
const MARK_RE = /✅|❌/;
// `Tarea 18 — título` después de la marca (acepta —, – o -).
const TASK_RE = /^(\S+)\s+(\d+)\s*[—–-]\s*(.+)$/;
// Sufijo final entre paréntesis de una descartada, ej. "(descartada)" / "(discarded)".
const TRAILING_PAREN_RE = /\s*\([^)]*\)\s*$/;

/**
 * Entradas de history.md: headers `## ` fuera de comentarios HTML y bloques de código que
 * llevan la marca ✅ (hecha) o ❌ (descartada). Los placeholders de la plantilla se ignoran.
 * Cada entrada trae su `range` en el texto original: de su header hasta antes del siguiente `## `
 * (sea o no una entrada, fuera de comentarios y bloques de código) o el fin del texto.
 * @param text documento con saltos de línea LF
 */
export function parseHistory(text: string): ParsedHistory {
  const entries: HistoryEntry[] = [];
  const index = new LineIndex(text);
  // Línea (0-based) de cada `## ` válido, para cerrar el rango de cada entrada.
  const h2Lines: number[] = [];
  const pending: { entry: HistoryEntry; next: number; line: number }[] = [];
  let inComment = false;
  let inFence = false;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startsInComment = inComment;
    inComment = commentStateAfter(line, inComment);
    if (startsInComment) continue;

    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h2 = line.match(H2_RE);
    if (!h2) continue;
    h2Lines.push(i);
    const entry = parseEntry(h2[1]);
    if (!entry) continue;
    const next = h2Lines.length; // posición que tendrá el header siguiente en `h2Lines`
    entries.push(entry);
    pending.push({ entry, next, line: i });
  }

  for (const { entry, next, line } of pending) {
    const start = index.lineStart(line + 1);
    entry.range = index.range(start, next < h2Lines.length ? index.lineStart(h2Lines[next] + 1) : text.length);
    // El rango arranca en el header: las etiquetas se leen en lo que le sigue.
    entry.labels = entryLabels(text.slice(index.lineStart(line + 2), entry.range.end));
  }

  return { entries };
}

/** Una entrada a partir del texto de su header, o `null` si no es una entrada (sin marca o placeholder). */
export function parseEntry(header: string): HistoryEntry | null {
  const mark = header.match(MARK_RE);
  if (!mark || mark.index === undefined || isPlaceholder(header)) return null;

  const status = mark[0] === "❌" ? "discarded" : "done";
  // La fecha es lo que está antes de la marca, sin el separador que la precede.
  const date = header.slice(0, mark.index).replace(/\s*[—–-]\s*$/, "").trim();
  const after = header.slice(mark.index + mark[0].length).trim();

  const task = after.match(TASK_RE);
  let title = (task ? task[3] : after).trim();
  if (status === "discarded") title = title.replace(TRAILING_PAREN_RE, "");

  return {
    date,
    status,
    number: task ? Number(task[2]) : null,
    label: task ? task[1] : null,
    title,
    labels: [],
  };
}
