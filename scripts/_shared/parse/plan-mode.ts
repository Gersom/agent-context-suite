// Cómo se lee el modo de ejecución del plan en «Tarea en progreso» de handoff.md: la línea
// `**Modo de ejecución acordado:** <valor>` (o `**Agreed execution mode:** <valor>`) en el cuerpo de
// la subsección «Plan». Lo comparten task-manager (escribe y valida el handoff), docs-check (lo
// revisa) y task-tracker (lo muestra); las etiquetas de las partes del handoff viven aquí y
// `STRINGS` de task-manager las toma de esta tabla, para que haya una sola fuente.

import type { Subsection } from "../types.ts";
import { commentSpans, normalizeTitle } from "./markdown.ts";

/** Los idiomas de la documentación que se reconocen. */
export type Lang = "es" | "en";

/** Las partes con nombre de una tarea en curso (subsecciones) o pausada (campos). */
export type HandoffPart = "plan" | "missing" | "decisions" | "next" | "why" | "waits" | "mode";

/** Etiqueta de cada parte en los idiomas conocidos (español e inglés). */
export const PART_LABELS = {
  plan: { es: "Plan", en: "Plan" },
  missing: { es: "Qué falta", en: "What's left" },
  decisions: { es: "Decisiones a medio camino", en: "Decisions along the way" },
  next: { es: "Próximo paso concreto", en: "Next concrete step" },
  why: { es: "Por qué se pausó", en: "Why it was paused" },
  waits: { es: "Qué espera para retomarse", en: "What it is waiting for" },
  mode: { es: "Modo de ejecución acordado", en: "Agreed execution mode" },
} satisfies Record<HandoffPart, Record<Lang, string>>;

/** Cuál es la parte que nombra el título (o etiqueta de campo), en cualquiera de los idiomas conocidos; `null` si ninguna. */
export function partOf(title: string): HandoffPart | null {
  const wanted = normalizeTitle(title);
  for (const part of Object.keys(PART_LABELS) as HandoffPart[]) {
    for (const label of Object.values(PART_LABELS[part])) {
      const known = normalizeTitle(label);
      if (wanted === known || (wanted.startsWith(known) && /[^\p{L}\p{N}]/u.test(wanted[known.length]))) return part;
    }
  }
  return null;
}

/** Los modos de ejecución del plan, siempre en inglés (también en proyectos en español). Cualquier otro texto de un handoff ya escrito es legado. */
export const EXECUTION_MODES = ["guided", "step-by-step", "auto", "extreme"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

/** `value` es exactamente uno de los cuatro modos (los demás textos son legado). */
export function isExecutionMode(value: string): value is ExecutionMode {
  return (EXECUTION_MODES as readonly string[]).includes(value);
}

const MODE_RE = /^\*\*(.+?):\*\*\s*(.*)$/;

/** Un checkbox de plan (`- [ ] Paso 1`) en cualquier línea del texto: identifica la subsección del plan cuando su título no se reconoce. */
export const CHECKBOX_ANY_RE = /^\s*[-*]\s+\[[ xX]\]\s+/m;

/**
 * Si la línea (ya sin sangría ni comentarios) es la de modo de ejecución, con la etiqueta en
 * cualquier idioma conocido: su valor tal como está escrito, `null` si no trae ninguno. Si no es
 * una línea de modo, `undefined`.
 */
export function parseModeLine(line: string): { value: string | null } | undefined {
  const field = line.match(MODE_RE);
  if (field && partOf(field[1]) === "mode") return { value: field[2].trim() || null };
  return undefined;
}

/** Las subsecciones que se leen como el plan: la titulada «Plan» o, sin título conocido, la que trae checkboxes. */
export function planSubsections(subsections: Subsection[]): Subsection[] {
  return subsections.filter((sub) => (partOf(sub.title) ?? (CHECKBOX_ANY_RE.test(sub.body) ? "plan" : null)) === "plan");
}

/** Una línea de modo de ejecución del plan, con su posición. */
export interface ModeLine {
  /** Valor tal como está escrito; `null` si la línea no trae ninguno. */
  value: string | null;
  /** Desde el primer hasta el último carácter de la línea (sin sangría ni comentarios al final), en offsets del texto LF. */
  start: number;
  end: number;
  /** Su número de línea en el archivo (1-based). */
  line: number;
}

/**
 * Las líneas de modo de ejecución del plan (con la etiqueta en cualquier idioma conocido), en orden.
 * Ignora lo que está dentro de comentarios HTML. Las subsecciones sin posiciones no se miran.
 * @param text handoff.md completo, el mismo que se parseó
 */
export function modeLines(text: string, subsections: Subsection[]): ModeLine[] {
  return planSubsections(subsections).flatMap((sub): ModeLine[] => {
    if (!sub.range) return [];
    // Los comentarios se vacían con espacios (sin tocar los saltos de línea): los offsets y las líneas se conservan.
    const raw = text.slice(sub.range.start, sub.range.end);
    let clean = "";
    let at = 0;
    for (const [from, to] of commentSpans(raw)) {
      clean += raw.slice(at, from) + raw.slice(from, to).replace(/[^\n]/g, " ");
      at = to;
    }
    clean += raw.slice(at);
    const found: ModeLine[] = [];
    let offset = sub.range.start;
    clean.split("\n").forEach((l, i) => {
      const line = l.trim();
      // La línea 0 es el `### Plan`.
      const mode = i > 0 && line ? parseModeLine(line) : undefined;
      if (mode) {
        const start = offset + (l.length - l.trimStart().length);
        found.push({ value: mode.value, start, end: start + line.length, line: sub.range!.startLine + i });
      }
      offset += l.length + 1;
    });
    return found;
  });
}
