// Estado de las tareas de un operador ya interpretado, listo para consultar (`status`, `next` y los
// comandos que vengan): tarea en curso con su plan, pausadas, libres (con sus grupos), bloqueadas
// con las tareas que menciona su motivo, últimas entradas de history, «Próximo número de tarea»
// y team-backlog. Solo lee lo que ya parseó `readDocs`; no toca el disco ni escribe.
//
// La lógica de interpretación (bloqueos, referencias entre tareas, plan, subsecciones) es la del
// task-tracker (`scripts/task-tracker/src/model/model.ts`), reescrita sobre `_shared` porque el
// task-manager no importa del tracker.

import { isPlaceholder } from "../../../_shared/parse/markdown.ts";
import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { findTaskRefs, type TaskIndex } from "../../../_shared/tasks/task-refs.ts";
import type { Field, Group, InProgress, PlanStep, Task, TeamTask } from "../../../_shared/types.ts";
import type { Docs } from "../workspace/docs.ts";
import { requireDoc } from "../workspace/docs.ts";
import { findNextTaskNumber } from "./next-number.ts";

/** Cuántas entradas de history.md entran en el estado (las más nuevas, que van arriba del archivo). */
export const RECENT_HISTORY = 3;

// Un checkbox de plan (`- [ ] Paso 1`): identifica la subsección del plan, que no es un detalle.
const CHECKBOX_LINE_RE = /^\s*[-*]\s+\[( |x|X)\]\s+/m;
// Etiqueta del campo del disparador (los campos están traducidos: se reconocen los idiomas conocidos).
const TRIGGER_LABEL_RE = /^(disparador|trigger)$/i;
/** Un disparador más largo que esto no se muestra en texto (es un párrafo, no una pista). */
export const SHORT_TRIGGER = 100;

/** Dónde vive hoy una tarea que otra menciona. `closed`: figura cerrada en history.md. */
export type RefState = "closed" | "current" | "paused" | "free" | "blocked" | "unknown";

export interface PlanProgress {
  done: number;
  total: number;
  /** Texto del primer paso pendiente; `null` si el plan está completo. */
  nextStep: string | null;
}

/** Subsección de detalle de la tarea en curso (título tal como está escrito en el handoff). */
export interface NextStepInfo {
  title: string;
  text: string;
}

export interface CurrentInfo {
  number: number;
  title: string;
  /** Línea (1-based) de `Tarea N — título` en handoff.md. */
  line: number | null;
  /** `null` si la tarea no trae plan (checkboxes). */
  plan: PlanProgress | null;
  /**
   * «Próximo paso concreto»: por convención de la plantilla es la última subsección de detalle
   * (sin los checkboxes del plan y sin placeholders). Como el título está traducido, se elige por
   * posición, no por nombre; `title` dice cuál es.
   */
  nextConcreteStep: NextStepInfo | null;
}

export interface PausedInfo {
  number: number;
  title: string;
  plan: PlanProgress | null;
}

export interface FreeInfo {
  number: number;
  title: string;
  /** Título del grupo si la tarea está agrupada (su detalle vive en «Tareas agrupadas»). */
  group: string | null;
  /** Valor del campo del disparador (`Disparador`/`Trigger`), primera línea. */
  trigger: string | null;
}

export interface RefInfo {
  number: number;
  title: string | null;
  state: RefState;
}

export interface BlockedInfo {
  number: number;
  title: string;
  /** Tag vigente (`dependencia`, `postergada`...); `null` si el bloqueo ya no tiene (Regla 8). */
  tag: string | null;
  reason: string | null;
  /** Tareas que menciona el motivo. */
  refs: RefInfo[];
  /** Candidata a desbloquear (Regla 8): todas las tareas que menciona están cerradas, o ya no tiene bloqueo vigente. */
  unblockCandidate: boolean;
}

export interface HistoryInfo {
  date: string;
  status: "done" | "discarded";
  number: number | null;
  title: string;
}

export interface TeamTaskInfo {
  title: string;
  tag: string | null;
  trigger: string | null;
}

export interface TeamInfo {
  free: TeamTaskInfo[];
  blocked: TeamTaskInfo[];
}

export interface TaskState {
  /** `null` = sin tarea en curso. */
  current: CurrentInfo | null;
  paused: PausedInfo[];
  /** En el orden del archivo; las tareas de un grupo siguen a su posición en «Tareas libres». */
  free: FreeInfo[];
  blocked: BlockedInfo[];
  /** Últimas `RECENT_HISTORY` entradas de history.md (vacío si no existe). */
  recentHistory: HistoryInfo[];
  /** `null` si backlog.md no existe o no tiene la línea. */
  nextTaskNumber: { value: number; line: number } | null;
  /** `null` en el repo plano o sin team-backlog.md. */
  team: TeamInfo | null;
  /** Problemas de los archivos que conviene saber (anclas que faltan, número de tarea repetido o bajo). */
  warnings: string[];
}

/** Primera línea no vacía del valor de un campo con esa etiqueta; `null` si no hay (o es un placeholder). */
export function fieldValue(fields: Field[], label: RegExp): string | null {
  const field = fields.find((f) => label.test(f.label.trim()));
  if (!field || field.isPlaceholder) return null;
  return field.value.split("\n").find((line) => line.trim())?.trim() ?? null;
}

/** Avance de un plan; `null` si no hay pasos. */
export function planProgress(steps: PlanStep[]): PlanProgress | null {
  if (!steps.length) return null;
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, nextStep: steps.find((s) => !s.done)?.text ?? null };
}

/** «Próximo paso concreto» de la tarea en curso (ver `CurrentInfo.nextConcreteStep`). */
export function nextConcreteStep({ subsections }: InProgress): NextStepInfo | null {
  const details = subsections.filter((s) => s.body.trim() !== "" && !isPlaceholder(s.body) && !CHECKBOX_LINE_RE.test(s.body));
  const last = details[details.length - 1];
  return last ? { title: last.title, text: last.body } : null;
}

/** Índice número → título de las tareas conocidas, cerradas y etiquetas de header, más dónde vive cada una. */
export function buildTaskIndex(docs: Docs): { index: TaskIndex; where: Map<number, RefState> } {
  const { inProgress, paused } = docs.handoff.parsed;
  const { free, blocked, grouped } = docs.backlog.parsed;
  const titles = new Map<number, string>();
  const labels = new Set<string>();
  const where = new Map<number, RefState>();
  const add = (task: { number: number; label: string; title: string }, state: RefState) => {
    if (!titles.has(task.number)) titles.set(task.number, task.title);
    if (!where.has(task.number)) where.set(task.number, state);
    labels.add(task.label);
  };
  if (inProgress.task) add(inProgress.task, "current");
  for (const task of paused) add(task, "paused");
  for (const task of free.tasks) add(task, "free");
  for (const task of grouped.flatMap((g) => g.tasks)) add(task, "free");
  for (const task of blocked) add(task, "blocked");

  const closed = new Set<number>();
  for (const entry of docs.history.parsed.entries) {
    if (entry.number == null) continue;
    closed.add(entry.number);
    if (!titles.has(entry.number)) titles.set(entry.number, entry.title);
    if (entry.label) labels.add(entry.label);
  }
  return { index: { titles, closed, labels }, where };
}

/** Todos los números de tarea que figuran en handoff, backlog (incluidos grupos) e history, sin repetir y ordenados. */
export function knownNumbers(docs: Docs): number[] {
  const numbers = new Set<number>();
  const { inProgress, paused } = docs.handoff.parsed;
  const { free, blocked, grouped } = docs.backlog.parsed;
  if (inProgress.task) numbers.add(inProgress.task.number);
  for (const task of [...paused, ...free.tasks, ...blocked, ...grouped.flatMap((g) => g.tasks)]) numbers.add(task.number);
  for (const group of free.groups) group.taskNumbers.forEach((n) => numbers.add(n));
  for (const entry of docs.history.parsed.entries) if (entry.number != null) numbers.add(entry.number);
  return [...numbers].sort((a, b) => a - b);
}

/** Tareas libres en el orden del archivo, con las de cada grupo (su detalle está en «Tareas agrupadas»). */
function freeInfos(docs: Docs, warnings: string[]): FreeInfo[] {
  const { free, grouped } = docs.backlog.parsed;
  const groupedTask = (number: number): Task | undefined => grouped.flatMap((g: Group) => g.tasks).find((t) => t.number === number);
  const items: Array<{ at: number; infos: FreeInfo[] }> = [];
  for (const task of free.tasks) {
    items.push({ at: task.range?.start ?? 0, infos: [{ number: task.number, title: task.title, group: null, trigger: fieldValue(task.fields, TRIGGER_LABEL_RE) }] });
  }
  for (const group of free.groups) {
    const infos = group.taskNumbers.map((number): FreeInfo => {
      const detail = groupedTask(number);
      if (!detail) warnings.push(`Tarea ${number}: el grupo «${group.title}» la lista pero no tiene detalle en «Tareas agrupadas».`);
      return { number, title: detail?.title ?? "(sin detalle en «Tareas agrupadas»)", group: group.title, trigger: detail ? fieldValue(detail.fields, TRIGGER_LABEL_RE) : null };
    });
    items.push({ at: group.range?.start ?? 0, infos });
  }
  return items.sort((a, b) => a.at - b.at).flatMap((item) => item.infos);
}

function blockedInfos(docs: Docs): BlockedInfo[] {
  const { index, where } = buildTaskIndex(docs);
  return docs.backlog.parsed.blocked.map((task) => {
    const block = blockInfo(task);
    const refs = findTaskRefs(block.reason, task.number, index).map(
      (ref): RefInfo => ({ number: ref.number, title: ref.title, state: ref.closed ? "closed" : (where.get(ref.number) ?? "unknown") }),
    );
    return {
      number: task.number,
      title: task.title,
      tag: block.tag,
      reason: block.reason,
      refs,
      unblockCandidate: !block.tag || (refs.length > 0 && refs.every((ref) => ref.state === "closed")),
    };
  });
}

function teamInfos(tasks: TeamTask[]): TeamTaskInfo[] {
  return tasks
    .filter((task) => !task.isPlaceholder)
    .map((task) => ({ title: task.title, tag: blockInfo(task).tag, trigger: fieldValue(task.fields, TRIGGER_LABEL_RE) }));
}

/** Avisos de estructura de un archivo: anclas que faltan (la lectura sigue, por orden) o secciones ausentes. */
function structureWarnings(docs: Docs): string[] {
  const warnings: string[] = [];
  const parsed = [docs.handoff, docs.backlog, ...(docs.teamBacklog ? [docs.teamBacklog] : [])].filter((doc) => doc.exists);
  for (const doc of parsed) {
    const file = doc.parsed as { usedFallback: boolean; missing: string[] };
    if (file.usedFallback) warnings.push(`${doc.fileName} no tiene anclas de sección: se ubicaron las secciones por orden (plan B).`);
    if (file.missing.length) warnings.push(`${doc.fileName}: no se encontró la sección ${file.missing.map((id) => `«${id}»`).join(", ")}.`);
  }
  return warnings;
}

/**
 * Estado completo del operador.
 * @throws CliError si falta `handoff.md` (sin él no hay estado que mostrar); backlog, history y
 *   team-backlog ausentes no son un error (el set mínimo de la skill solo trae el handoff).
 */
export function buildState(docs: Docs): TaskState {
  requireDoc(docs.handoff, "handoff.md");
  const warnings = structureWarnings(docs);
  const { inProgress, paused } = docs.handoff.parsed;

  const current: CurrentInfo | null = inProgress.task
    ? {
        number: inProgress.task.number,
        title: inProgress.task.title,
        line: inProgress.task.range?.startLine ?? null,
        plan: planProgress(inProgress.planSteps),
        nextConcreteStep: nextConcreteStep(inProgress),
      }
    : null;

  const nextTaskNumber = docs.backlog.exists ? findNextTaskNumber(docs.backlog.text) : null;
  const numbers = knownNumbers(docs);
  if (docs.backlog.exists && !nextTaskNumber) warnings.push("backlog.md no tiene la línea «Próximo número de tarea».");
  else if (nextTaskNumber && numbers.length && nextTaskNumber.value <= numbers[numbers.length - 1]) {
    warnings.push(`«Próximo número de tarea» (${nextTaskNumber.value}) no es mayor que la tarea más alta (${numbers[numbers.length - 1]}).`);
  }

  const seen = new Map<number, number>();
  for (const number of [
    ...(inProgress.task ? [inProgress.task.number] : []),
    ...paused.map((t) => t.number),
    ...docs.backlog.parsed.free.tasks.map((t) => t.number),
    ...docs.backlog.parsed.blocked.map((t) => t.number),
    ...docs.backlog.parsed.grouped.flatMap((g) => g.tasks.map((t) => t.number)),
  ]) {
    seen.set(number, (seen.get(number) ?? 0) + 1);
  }
  const { closed } = buildTaskIndex(docs).index;
  for (const [number, count] of seen) {
    if (count > 1) warnings.push(`Tarea ${number} aparece ${count} veces entre handoff y backlog: una tarea vive en un solo lugar.`);
    else if (closed.has(number)) warnings.push(`Tarea ${number} figura cerrada en history.md pero sigue en handoff o backlog.`);
  }

  const blocked = blockedInfos(docs);
  for (const task of blocked) {
    if (!task.tag) warnings.push(`Tarea ${task.number} está en «bloqueadas» sin bloqueo vigente: ¿moverla a libres? (Regla 8)`);
  }

  const team = docs.teamBacklog?.exists
    ? { free: teamInfos(docs.teamBacklog.parsed.free), blocked: teamInfos(docs.teamBacklog.parsed.blocked) }
    : null;

  return {
    current,
    paused: paused.map((task) => ({ number: task.number, title: task.title, plan: planProgress(task.steps) })),
    free: freeInfos(docs, warnings),
    blocked,
    recentHistory: docs.history.parsed.entries
      .slice(0, RECENT_HISTORY)
      .map((entry) => ({ date: entry.date, status: entry.status, number: entry.number, title: entry.title })),
    nextTaskNumber: nextTaskNumber && { value: nextTaskNumber.value, line: nextTaskNumber.line },
    team,
    warnings,
  };
}
