// Idioma de lo que el script escribe. La documentación de cada proyecto está en su idioma (regla 3
// de rules.md) y los parsers no dependen de él, pero al AGREGAR una tarea o reescribir el handoff
// hay que elegir las etiquetas. Se copian de lo que el archivo ya usa (`Tarea`/`Task`, las
// etiquetas de los campos de una tarea existente) y solo si no hay de dónde copiar se usa una tabla
// mínima en español o inglés. No se inventan traducciones a otros idiomas: ante lo desconocido se
// usa español y se avisa.

import { type Lang, PART_LABELS } from "../../../_shared/parse/plan-mode.ts";
import { DESCRIPTION_LABEL_RE, NONE_RE } from "../../../_shared/parse/text-fields.ts";
import type { Field } from "../../../_shared/types.ts";

export type { Lang };

// El texto que significa «nada» (`Ninguno.`, `None`...) vive en _shared (lo usa también task-tracker).
export { NONE_RE };

/** Campos de una tarea de backlog que el script reconoce en cualquier idioma conocido. */
export type FieldKind = "description" | "decisions" | "blockers" | "trigger" | "details" | "added";

const FIELD_PATTERNS: Record<FieldKind, RegExp> = {
  description: DESCRIPTION_LABEL_RE,
  decisions: /^(decisiones|decisions)$/i,
  blockers: /^(bloqueos?|blockers?)$/i,
  trigger: /^(disparador|trigger)$/i,
  details: /^(detalles?|details?)$/i,
  added: /^(agregada|added)$/i,
};

/** Primera palabra de una etiqueta (`Decisiones/temas a definir antes de empezar` → `Decisiones`). */
function firstWord(label: string): string {
  return label.trim().split(/[\s/:]+/)[0] ?? "";
}

/** ¿La etiqueta es la del campo `kind`, en español o inglés? */
export function isFieldKind(label: string, kind: FieldKind): boolean {
  return FIELD_PATTERNS[kind].test(firstWord(label));
}

/** El campo de la lista que es de ese tipo, si hay. */
export function findFieldOfKind(fields: Field[], kind: FieldKind): Field | undefined {
  return fields.find((field) => isFieldKind(field.label, kind));
}

/** Textos que el script escribe cuando no puede copiarlos de un archivo. */
export interface Strings {
  task: string;
  // Las palabras de un grupo: `### <group> — título (<tasks> 14, 15)` y `- **<summary>:** frase`.
  group: string;
  summary: string;
  /** Plural de `task` en la lista de la referencia de un grupo. */
  tasks: string;
  none: string;
  emptySection: string;
  /** Lo que queda en «Tareas agrupadas» cuando no queda ningún grupo. */
  emptyGrouped: string;
  defaultTrigger: string;
  fields: Record<FieldKind, string>;
  origin: string;
  /** «por» en `Agregada: <fecha> por <operador>`. */
  by: string;
  // Subsecciones del handoff, en el orden de la plantilla.
  plan: string;
  missing: string;
  decisions: string;
  next: string;
  mode: string;
  closeStep: string;
  missingWithPlan: string;
  missingNoPlan: string;
  nextNoPlan: string;
  noDecisions: string;
  // Lo que escriben `pause`, `resume` y `step`.
  /** Texto de «Tarea en progreso» sin tarea. */
  noTask: string;
  /** Campos de una tarea pausada que no son subsecciones del handoff. */
  why: string;
  waits: string;
  /** Encabezado de la lista de pasos pendientes que `step` escribe en «Qué falta». */
  pendingSteps: string;
  /** «Qué falta» cuando ya no queda ningún paso pendiente. */
  allDone: string;
  /** «Próximo paso concreto» cuando ya no queda ningún paso pendiente. */
  planDone: string;
  // Lo que escribe `unblock`: `[Resuelto el <fecha>] — era <bloqueo original>`.
  resolved: string;
  was: string;
  // Lo que escribe `close`.
  /** Descripción de una tarea nueva que surgió al cerrar otra. */
  raisedWhenClosing(task: string, number: number): string;
  /** Títulos del reporte de cierre (Regla 9 de rules.md). */
  report: { done: string; discarded: string; unblocked: string; created: string };
  /** Tags de bloqueo que `block` escribe en `Bloqueos` (`` `[dependencia]` motivo ``). */
  tags: { dependency: string; postponed: string };
}

export const STRINGS: Record<Lang, Strings> = {
  es: {
    task: "Tarea",
    group: "Grupo",
    summary: "Resumen",
    tasks: "Tareas",
    none: "Ninguno.",
    emptySection: "Ninguna.",
    emptyGrouped: "No aplica todavía — ningún grupo formado.",
    defaultTrigger: "cuando el operador pregunte por tareas pendientes.",
    fields: {
      description: "Descripción",
      decisions: "Decisiones/temas a definir antes de empezar",
      blockers: "Bloqueos",
      trigger: "Disparador",
      details: "Detalles",
      added: "Agregada",
    },
    origin: "Origen",
    by: "por",
    plan: PART_LABELS.plan.es,
    missing: PART_LABELS.missing.es,
    decisions: PART_LABELS.decisions.es,
    next: PART_LABELS.next.es,
    mode: PART_LABELS.mode.es,
    closeStep: "Documentar cierre de tarea",
    missingWithPlan: "Todos los pasos del plan.",
    missingNoPlan: "Toda la tarea.",
    nextNoPlan: "Empezar la tarea.",
    noDecisions: "Ninguna.",
    noTask: "Sin tarea en curso",
    why: PART_LABELS.why.es,
    waits: PART_LABELS.waits.es,
    pendingSteps: "Pasos pendientes:",
    allDone: "Todos los pasos del plan están hechos; falta cerrar la tarea.",
    planDone: "Plan completo: falta cerrar la tarea.",
    resolved: "Resuelto el",
    was: "era",
    raisedWhenClosing: (task, number) => `Surgió al cerrar la ${task} ${number}; falta detallarla.`,
    report: { done: "Tareas resueltas", discarded: "Tareas descartadas", unblocked: "Tareas desbloqueadas", created: "Tareas nuevas" },
    tags: { dependency: "dependencia", postponed: "postergada" },
  },
  en: {
    task: "Task",
    group: "Group",
    summary: "Summary",
    tasks: "Tasks",
    none: "None.",
    emptySection: "None.",
    emptyGrouped: "Not applicable yet — no groups formed.",
    defaultTrigger: "when the operator asks about pending tasks.",
    fields: {
      description: "Description",
      decisions: "Decisions/topics to settle before starting",
      blockers: "Blockers",
      trigger: "Trigger",
      details: "Details",
      added: "Added",
    },
    origin: "Origen",
    by: "by",
    plan: PART_LABELS.plan.en,
    missing: PART_LABELS.missing.en,
    decisions: PART_LABELS.decisions.en,
    next: PART_LABELS.next.en,
    mode: PART_LABELS.mode.en,
    closeStep: "Document task closure",
    missingWithPlan: "All the plan steps.",
    missingNoPlan: "The whole task.",
    nextNoPlan: "Start the task.",
    noDecisions: "None.",
    noTask: "No task in progress",
    why: PART_LABELS.why.en,
    waits: PART_LABELS.waits.en,
    pendingSteps: "Pending steps:",
    allDone: "All the plan steps are done; the task is left to close.",
    planDone: "Plan complete: the task is left to close.",
    resolved: "Resolved on",
    was: "was",
    raisedWhenClosing: (task, number) => `Raised when closing ${task} ${number}; still to be detailed.`,
    report: { done: "Resolved tasks", discarded: "Discarded tasks", unblocked: "Unblocked tasks", created: "New tasks" },
    tags: { dependency: "dependency", postponed: "postponed" },
  },
};

const ES_WORDS = /^(tarea|descripci[oó]n|bloqueos?|decisiones|disparador|agregada|detalles?)$/i;
const EN_WORDS = /^(task|description|blockers?|decisions|trigger|added|details?)$/i;

export interface DetectedLanguage {
  lang: Lang;
  /** Qué avisar al operador si no se pudo determinar (se usó español); `null` si se reconoció. */
  notice: string | null;
}

/**
 * Idioma según las palabras que ya usa el archivo: la de los headers de tarea (`Tarea`/`Task`) o las
 * etiquetas de sus campos, la primera que se reconozca. Sin ninguna, o con una desconocida, es
 * español con un aviso.
 */
export function detectLanguage(labels: string[]): DetectedLanguage {
  for (const label of labels) {
    const word = firstWord(label);
    if (ES_WORDS.test(word)) return { lang: "es", notice: null };
    if (EN_WORDS.test(word)) return { lang: "en", notice: null };
  }
  return {
    lang: "es",
    notice: labels.length
      ? `No reconozco el idioma de «${labels[0]}» (solo español e inglés): usé español para las etiquetas.`
      : "No pude determinar el idioma de los archivos (no hay tareas que lo indiquen): usé español para las etiquetas.",
  };
}
