// Procesamiento: arma el modelo que se pinta en pantalla a partir de lo que interpretó el
// parseo (progreso del plan, motivos de bloqueo y sus dependencias, grupos, completadas,
// conteos y avisos).

import { parseBacklog } from "../../../_shared/parse/backlog.ts";
import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { parseHistory } from "../../../_shared/parse/history.ts";
import { type ExecutionMode, isExecutionMode, modeLines, planSubsections } from "../../../_shared/parse/plan-mode.ts";
import type { BlockedTask, CurrentTask, FreeGroup, Model, PausedTask, Plan } from "../shared/types.ts";
import type {
  CurrentTaskLine,
  Group,
  HistoryEntry,
  InProgress,
  ParsedBacklog,
  ParsedFile,
  ParsedHandoff,
  ParsedHistory,
  PlanStep,
  Subsection,
  Task,
} from "../../../_shared/types.ts";
import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { findTaskRefs, type TaskIndex } from "../../../_shared/tasks/task-refs.ts";

/** Cuántas entradas de history.md se muestran en "TAREAS COMPLETADAS". */
export const COMPLETED_LIMIT = 5;

// Un checkbox de plan (`- [ ] Paso 1`): identifica la subsección del plan, que ya se muestra aparte.
const CHECKBOX_LINE_RE = /^\s*[-*]\s+\[( |x|X)\]\s+/m;

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
  const current = inProgress?.task && handoffText ? buildCurrent(inProgress.task, inProgress, handoffText) : null;

  const grouped = backlog?.grouped ?? [];
  const freeGroups: FreeGroup[] = (backlog?.free.groups ?? []).map((ref) => ({
    ...ref,
    // El detalle de cada tarea vive en "Tareas agrupadas"; se enlaza por número.
    tasks: ref.taskNumbers.map((n) => findGroupedTask(grouped, n) ?? { number: n, label: null, title: null }),
  }));
  const freeTasks = backlog?.free.tasks ?? [];
  const paused: PausedTask[] = (handoff?.paused ?? []).map((task) => ({ ...task, plan: buildPlan(task.steps) }));
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
 * Tarea en progreso con el avance de su plan y sus subsecciones de detalle (todas menos la que
 * tiene los checkboxes del plan; sus títulos están traducidos, así que no se eligen por nombre) y
 * su modo de ejecución.
 */
function buildCurrent(task: CurrentTaskLine, { steps, subsections }: InProgress, handoffText: string): CurrentTask {
  const planSubs = new Set(planSubsections(subsections));
  const details = subsections.filter((s) => !planSubs.has(s) && !CHECKBOX_LINE_RE.test(s.body) && s.body.trim() !== "");
  return { ...task, plan: buildPlan(steps), details, subsections, mode: executionMode(handoffText, subsections) };
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
