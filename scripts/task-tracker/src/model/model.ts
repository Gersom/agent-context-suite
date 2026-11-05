// Procesamiento: arma el modelo que se pinta en pantalla a partir de lo que interpretó el
// parseo (progreso del plan, motivos de bloqueo y sus dependencias, grupos, completadas,
// conteos y avisos).

import { parseBacklog } from "../../../_shared/parse/backlog.ts";
import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { parseHistory } from "../../../_shared/parse/history.ts";
import { stripComments } from "../../../_shared/parse/markdown.ts";
import { type ExecutionMode, type HandoffPart, isExecutionMode, modeLines, partOf } from "../../../_shared/parse/plan-mode.ts";
import type { BlockedTask, CurrentTask, FreeGroup, Model, PausedTask, Plan } from "../shared/types.ts";
import type {
  CurrentTaskLine,
  Field,
  Group,
  HistoryEntry,
  InProgress,
  ParsedBacklog,
  ParsedFile,
  ParsedHandoff,
  ParsedHistory,
  ParsedPausedTask,
  PlanStep,
  Section,
  Subsection,
  Task,
} from "../../../_shared/types.ts";
import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { findTaskRefs, type TaskIndex } from "../../../_shared/tasks/task-refs.ts";

/** Cuántas entradas de history.md se muestran en "TAREAS COMPLETADAS". */
export const COMPLETED_LIMIT = 5;

// Campo `- **Campo:** valor` (o `- **Campo**: valor`) del texto previo a las subsecciones (`Origen`, `Detalles`...).
const FIELD_START_RE = /^[-*]\s+\*\*.+?(?::\*\*|\*\*:)/;
// Línea `Origen: …` / `Origin: …` suelta (sin viñeta), que tampoco es descripción.
const ORIGIN_LINE_RE = /^\**(?:Origen|Origin)\**:/i;
// Campo `Descripción` de una tarea pausada.
const DESCRIPTION_LABEL_RE = /^(descripci[oó]n|description)$/i;
// «Ninguna.» / «None»: decisiones sin nada que mostrar.
const NONE_RE = /^(ningun[ao]s?|none|n\/a)\.?$/i;

/**
 * Modelo completo para la pantalla.
 * `backlogText: null` y `historyText: null` son válidos (el set mínimo de la skill no los genera).
 */
export function buildModel({
  handoffText,
  backlogText,
  historyText = null,
  readErrors = [],
}: {
  handoffText: string | null;
  backlogText: string | null;
  historyText?: string | null;
  readErrors?: string[];
}): Model {
  const warnings = [...readErrors];
  const notes: string[] = [];

  let handoff: ParsedHandoff | null = null;
  if (handoffText == null) warnings.push("handoff.md no existe (¿se está reescribiendo?).");
  else if (!handoffText.trim()) warnings.push("handoff.md está vacío (¿se está reescribiendo?).");
  else handoff = parseHandoff(handoffText);

  let backlog: ParsedBacklog | null = null;
  if (backlogText == null) notes.push("Sin backlog.md (set mínimo de la skill): solo se muestran la tarea en progreso y las pausadas.");
  else if (!backlogText.trim()) warnings.push("backlog.md está vacío (¿se está reescribiendo?).");
  else backlog = parseBacklog(backlogText);

  // history.md es opcional (el set mínimo no lo genera): si no existe, no hay sección ni nota.
  let history: ParsedHistory | null = null;
  if (historyText != null) {
    if (!historyText.trim()) warnings.push("history.md está vacío (¿se está reescribiendo?).");
    else history = parseHistory(historyText);
  }

  const parsedFiles: [string, ParsedFile | null][] = [["handoff.md", handoff], ["backlog.md", backlog]];
  for (const [name, parsed] of parsedFiles) {
    if (!parsed) continue;
    if (parsed.usedFallback) warnings.push(`${name} no tiene anclas de sección: se ubicaron las secciones por orden (plan B).`);
    if (parsed.missing.length) warnings.push(`${name}: no se encontró la sección ${parsed.missing.map((id) => `"${id}"`).join(", ")}.`);
    if (parsed.placeholders) warnings.push(`${name} tiene placeholders sin completar.`);
  }

  const inProgress = handoff?.inProgress;
  const current = inProgress?.task && handoffText ? buildCurrent(inProgress.task, inProgress, handoffText, handoff?.sections["in-progress"]) : null;

  const grouped = backlog?.grouped ?? [];
  const freeGroups: FreeGroup[] = (backlog?.free.groups ?? []).map((ref) => ({
    ...ref,
    // El detalle de cada tarea vive en "Tareas agrupadas"; se enlaza por número.
    tasks: ref.taskNumbers.map((n) => findGroupedTask(grouped, n) ?? { number: n, label: null, title: null }),
  }));
  const freeTasks = backlog?.free.tasks ?? [];
  const paused: PausedTask[] = (handoff?.paused ?? []).map((task) => buildPaused(task));
  const historyEntries = history?.entries ?? [];

  const blockedTasks = backlog?.blocked ?? [];
  const index = buildTaskIndex({ current, paused, freeTasks, blockedTasks, grouped, historyEntries });
  const blocked: BlockedTask[] = blockedTasks.map((task) => {
    const block = blockInfo(task);
    return { ...task, block, dependsOn: findTaskRefs(block.reason, task.number, index) };
  });
  for (const task of blocked) {
    if (!task.block.tag) {
      warnings.push(`${task.label} ${task.number} está en "bloqueadas" sin bloqueo vigente: ¿moverla a libres? (Regla 8)`);
    }
  }

  return {
    hasBacklog: backlog != null,
    hasHistory: history != null,
    completed: historyEntries.slice(0, COMPLETED_LIMIT),
    current,
    paused,
    free: { tasks: freeTasks, groups: freeGroups },
    blocked,
    grouped,
    counts: {
      paused: paused.length,
      free: freeTasks.length + freeGroups.reduce((sum, g) => sum + g.taskNumbers.length, 0),
      blocked: blocked.length,
    },
    warnings,
    notes,
  };
}

/**
 * Tarea en progreso con el avance de su plan, su modo de ejecución, su descripción (el texto entre
 * la línea `Tarea N — título` y la primera subsección, sin sus campos `- **Campo:** valor`) y sus
 * decisiones. Las demás subsecciones («Qué falta», «Próximo paso concreto»...) no se exponen.
 */
function buildCurrent(task: CurrentTaskLine, { steps, subsections }: InProgress, handoffText: string, section: Section | undefined): CurrentTask {
  const decisions = subsections.find((s) => partOf(s.title) === "decisions");
  return {
    ...task,
    plan: buildPlan(steps),
    subsections,
    mode: executionMode(handoffText, subsections),
    description: currentDescription(task, subsections, handoffText, section),
    decisions: decisionsText(decisions?.body),
  };
}

/** Texto entre la línea de la tarea y la primera subsección (o el fin de la sección), sin comentarios ni campos `- **Campo:** valor`. */
function currentDescription(task: CurrentTaskLine, subsections: Subsection[], handoffText: string, section: Section | undefined): string | null {
  const start = task.range?.end;
  const end = subsections[0]?.range?.start ?? section?.bodyRange.end;
  if (start === undefined || end === undefined || end <= start) return null;
  const lines: string[] = [];
  let inField = false;
  for (const line of stripComments(handoffText.slice(start, end)).split("\n")) {
    if (FIELD_START_RE.test(line) || ORIGIN_LINE_RE.test(line.trim())) {
      inField = true;
      continue;
    }
    // Las líneas indentadas que siguen a un campo son su continuación.
    if (inField && /^\s+\S/.test(line)) continue;
    if (line.trim()) inField = false;
    if (line.trim()) lines.push(line.trim());
  }
  return lines.join("\n") || null;
}

/**
 * Tarea pausada con el avance de su plan y los campos que se muestran: modo, descripción,
 * decisiones, «Por qué se pausó» y «Qué espera para retomarse» (los demás, como «Qué falta», no).
 */
function buildPaused(task: ParsedPausedTask): PausedTask {
  const { fields } = task;
  const mode = pausedField(fields, "mode");
  return {
    ...task,
    plan: buildPlan(task.steps),
    mode: mode != null && isExecutionMode(mode) ? mode : null,
    description: fields.filter((f) => DESCRIPTION_LABEL_RE.test(f.label)).at(-1)?.value.trim() || null,
    decisions: decisionsText(pausedField(fields, "decisions")),
    why: pausedField(fields, "why"),
    waits: pausedField(fields, "waits"),
  };
}

/** «Decisiones a medio camino» tal como está escrito, o `null` si falta o dice «Ninguna.»/«None». */
function decisionsText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && !NONE_RE.test(text) ? text : null;
}

/** Valor del campo de una tarea pausada que corresponde a `part` (la última si se repite), `null` si no hay o está vacío. */
function pausedField(fields: Field[], part: HandoffPart): string | null {
  return fields.filter((f) => partOf(f.label) === part).at(-1)?.value.trim() || null;
}

/**
 * Modo de ejecución del plan: el de la última línea de modo (como `inspectCurrent` y `task mode`), solo si es uno de los cuatro valores
 * válidos (texto legado, vacío o sin línea de modo → `null`).
 */
function executionMode(handoffText: string, subsections: Subsection[]): ExecutionMode | null {
  const value = modeLines(handoffText, subsections).at(-1)?.value;
  return value != null && isExecutionMode(value) ? value : null;
}

/** Avance de un plan: pasos hechos, total y el primer paso pendiente (el actual). */
function buildPlan(steps: PlanStep[]): Plan {
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    currentStep: steps.find((s) => !s.done) ?? null,
  };
}

/** Índice número → título/estado de todas las tareas conocidas, para resolver dependencias. */
function buildTaskIndex({
  current,
  paused,
  freeTasks,
  blockedTasks,
  grouped,
  historyEntries,
}: {
  current: CurrentTask | null;
  paused: Task[];
  freeTasks: Task[];
  blockedTasks: Task[];
  grouped: Group[];
  historyEntries: HistoryEntry[];
}): TaskIndex {
  const titles = new Map<number, string>();
  const labels = new Set<string>();
  const add = (task: { number: number; label: string; title: string }) => {
    if (!titles.has(task.number)) titles.set(task.number, task.title);
    labels.add(task.label);
  };
  if (current) add(current);
  for (const task of [...paused, ...freeTasks, ...blockedTasks, ...grouped.flatMap((g) => g.tasks)]) add(task);

  const closed = new Set<number>();
  for (const entry of historyEntries) {
    if (entry.number == null) continue;
    closed.add(entry.number);
    if (!titles.has(entry.number)) titles.set(entry.number, entry.title);
    if (entry.label) labels.add(entry.label);
  }
  return { titles, closed, labels };
}

function findGroupedTask(grouped: Group[], number: number): Task | null {
  for (const group of grouped) {
    const task = group.tasks.find((t) => t.number === number);
    if (task) return task;
  }
  return null;
}
