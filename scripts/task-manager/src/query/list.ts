// Todas las tareas de los documentos de un operador en una sola lista (base de `list`): en curso,
// pausadas, libres (también las de un grupo), bloqueadas o pospuestas, cerradas (history) y las del
// team-backlog. Funciones puras sobre lo que ya parseó `readDocs`: no tocan el disco ni escriben.

import { normalizeTitle } from "../../../_shared/parse/markdown.ts";
import { classifyPreamble, matchFieldLine } from "../../../_shared/parse/text-fields.ts";
import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { fieldLabels } from "../../../_shared/tasks/labels.ts";
import type { Field, InProgress, Range } from "../../../_shared/types.ts";
import { UsageError } from "../cli/errors.ts";
import type { Docs } from "../workspace/docs.ts";
import { hasLabels } from "./labels.ts";

/** Estados que admite `--status` (siempre en inglés, sea cual sea el idioma del proyecto). */
export const LIST_STATUSES = ["free", "blocked", "postponed", "in-progress", "paused", "done", "discarded"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

/** Dónde coincidió `--search`: en el título, en los valores de los campos o en el cuerpo. */
export type Matched = "title" | "fields" | "body";

export interface ListedTask {
  /** `null` en las tareas del team-backlog y en las entradas de history sin número. */
  number: number | null;
  title: string;
  status: ListStatus;
  /** `YYYY-MM-DD`: cierre (history) o «Agregada»/«Added» (backlog y team); `null` si no hay. */
  date: string | null;
  /** Título del grupo si la tarea está agrupada. */
  group: string | null;
  /** `true` si es del `team-backlog.md`. */
  team: boolean;
  /** Etiquetas del campo `Etiquetas`/`Tags` (sin `#`); `[]` si no tiene. */
  labels: string[];
  /** Archivo del que sale (ruta absoluta) y su línea de inicio. */
  path: string;
  startLine: number;
  /** Valores de los campos (backlog y team): lo que busca `--search` como «fields». */
  fieldsText: string;
  /** Cuerpo sin la cabecera (en curso, pausadas y cerradas): lo que busca `--search` como «body». */
  bodyText: string;
  /** Solo tras filtrar con `--search`. */
  matched?: Matched[];
}

export interface ListFilters {
  /** `null` = todos los estados. */
  statuses: ListStatus[] | null;
  /** Texto ya validado (no vacío); `null` = sin búsqueda. */
  search: string | null;
  /** Texto ya validado (no vacío); `null` = todos los grupos. */
  group: string | null;
  /** Etiquetas ya validadas que la tarea debe traer todas (sin distinguir mayúsculas); `null` = sin filtro. */
  labels: string[] | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ADDED_DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
const ADDED_LABEL_RE = /^(agregada|added)$/;
const POSTPONED_TAG_RE = /^(postergada|postponed)$/;

/** Fecha del campo «Agregada»/«Added» (puede venir «2026-10-01 por gersom»); `null` si no hay o no es una fecha. */
function addedDate(fields: Field[]): string | null {
  const field = fields.find((f) => !f.isPlaceholder && ADDED_LABEL_RE.test(normalizeTitle(f.label)));
  return field?.value.trim().match(ADDED_DATE_RE)?.[1] ?? null;
}

/** Valores de los campos que no son placeholder, uno por línea. */
function fieldsText(fields: Field[]): string {
  return fields
    .filter((f) => !f.isPlaceholder)
    .map((f) => f.value)
    .join("\n");
}

/** Estado de una tarea de la sección de bloqueadas según su tag vigente (`dependencia`, sin tag u otro tag: `blocked`). */
function blockedStatus(task: { fields: Field[] }): ListStatus {
  const tag = blockInfo(task).tag;
  return tag && POSTPONED_TAG_RE.test(normalizeTitle(tag)) ? "postponed" : "blocked";
}

/** Etiquetas de la tarea en curso: el campo `Etiquetas`/`Tags` entre su línea y la primera subsección (o el fin de la sección). */
function currentLabels(handoffText: string, { task, subsections }: InProgress, sectionEnd: number | undefined): string[] {
  const start = task?.range?.end;
  const end = subsections[0]?.range?.start ?? sectionEnd;
  if (start === undefined || end === undefined || end <= start) return [];
  const lines = classifyPreamble(handoffText.slice(start, end), { looseOrigin: true });
  return fieldLabels(lines.flatMap(({ kind, text }) => (kind === "field" ? (matchFieldLine(text) ?? []) : [])));
}

/** El texto sin su primera línea (la cabecera del bloque). */
function afterHeader(text: string): string {
  const newline = text.indexOf("\n");
  return newline < 0 ? "" : text.slice(newline + 1);
}

type Kind = "current" | "paused" | "backlog" | "history" | "team";
// Con la misma fecha: primero lo cerrado, luego el backlog y al final el team.
const KIND_RANK: Record<Kind, number> = { current: 0, paused: 0, history: 0, backlog: 1, team: 2 };

interface Item {
  task: ListedTask;
  kind: Kind;
  /** Posición en el recorrido (el orden de los archivos). */
  seq: number;
}

/** 0 en curso, 1 pausadas, 2 con fecha, 3 sin fecha. */
function tier({ kind, task }: Item): number {
  if (kind === "current") return 0;
  if (kind === "paused") return 1;
  return task.date ? 2 : 3;
}

function compareItems(a: Item, b: Item): number {
  const byTier = tier(a) - tier(b);
  if (byTier) return byTier;
  if (tier(a) === 2) {
    // Fechas ISO: la comparación de cadenas es la cronológica. Más reciente primero.
    if (a.task.date !== b.task.date) return a.task.date! > b.task.date! ? -1 : 1;
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind) return byKind;
    if (a.kind === "backlog") return (b.task.number ?? 0) - (a.task.number ?? 0) || a.seq - b.seq;
  }
  return a.seq - b.seq;
}

/**
 * Todas las tareas de los documentos, en el orden por defecto: la en curso, las pausadas, luego el
 * resto de la más reciente a la más antigua y al final las que no tienen fecha (en el orden del
 * archivo). Con la misma fecha, las cerradas conservan el orden de history.md y las de backlog van
 * por número descendente. Las referencias de «Tareas libres» a un grupo no cuentan: sus tareas
 * salen de «Tareas agrupadas».
 */
export function collectTasks(docs: Docs): ListedTask[] {
  const items: Item[] = [];
  const add = (kind: Kind, task: Omit<ListedTask, "team" | "group"> & { group?: string | null }) => {
    items.push({ kind, seq: items.length, task: { group: null, team: kind === "team", ...task } });
  };
  const text = (doc: { text: string }, range: Range | undefined) => (range ? doc.text.slice(range.start, range.end) : "");

  const { handoff, backlog, history, teamBacklog } = docs;

  const current = handoff.parsed.inProgress.task;
  if (current) {
    const section = handoff.parsed.sections["in-progress"];
    const from = current.range?.end ?? section?.bodyRange.start ?? 0;
    add("current", {
      number: current.number,
      title: current.title,
      status: "in-progress",
      date: null,
      path: handoff.path,
      startLine: current.range?.startLine ?? section?.bodyRange.startLine ?? 1,
      labels: currentLabels(handoff.text, handoff.parsed.inProgress, section?.bodyRange.end),
      fieldsText: "",
      bodyText: section ? handoff.text.slice(from, section.bodyRange.end) : "",
    });
  }
  for (const task of handoff.parsed.paused) {
    add("paused", {
      number: task.number,
      title: task.title,
      status: "paused",
      date: null,
      path: handoff.path,
      startLine: task.range?.startLine ?? 1,
      labels: fieldLabels(task.fields),
      fieldsText: "",
      bodyText: afterHeader(text(handoff, task.range)),
    });
  }

  const backlogTask = (task: { number: number; title: string; fields: Field[]; range?: Range }, status: ListStatus, group: string | null) =>
    add("backlog", {
      number: task.number,
      title: task.title,
      status,
      date: addedDate(task.fields),
      group,
      path: backlog.path,
      startLine: task.range?.startLine ?? 1,
      labels: fieldLabels(task.fields),
      fieldsText: fieldsText(task.fields),
      bodyText: "",
    });
  for (const task of backlog.parsed.free.tasks) if (!task.isPlaceholder) backlogTask(task, "free", null);
  for (const task of backlog.parsed.blocked) if (!task.isPlaceholder) backlogTask(task, blockedStatus(task), null);
  for (const group of backlog.parsed.grouped) {
    for (const task of group.tasks) if (!task.isPlaceholder) backlogTask(task, "free", group.title);
  }

  for (const entry of history.parsed.entries) {
    add("history", {
      number: entry.number,
      title: entry.title,
      status: entry.status,
      date: ISO_DATE_RE.test(entry.date) ? entry.date : null,
      path: history.path,
      startLine: entry.range?.startLine ?? 1,
      labels: entry.labels, // ya leídas con `entryLabels` al parsear history.md
      fieldsText: "",
      bodyText: afterHeader(text(history, entry.range)),
    });
  }

  if (teamBacklog?.exists) {
    const teamTask = (task: { title: string; fields: Field[]; range?: Range }, status: ListStatus) =>
      add("team", {
        number: null,
        title: task.title,
        status,
        date: addedDate(task.fields),
        path: teamBacklog.path,
        startLine: task.range?.startLine ?? 1,
        labels: fieldLabels(task.fields),
        fieldsText: fieldsText(task.fields),
        bodyText: "",
      });
    for (const task of teamBacklog.parsed.free) if (!task.isPlaceholder) teamTask(task, "free");
    for (const task of teamBacklog.parsed.blocked) if (!task.isPlaceholder) teamTask(task, blockedStatus(task));
  }

  return items.sort(compareItems).map((item) => item.task);
}

/**
 * Las tareas que cumplen los filtros (todos a la vez), en el mismo orden. Texto y grupo se comparan
 * por subcadena, sin distinguir mayúsculas ni acentos. Con búsqueda, cada tarea trae `matched`.
 */
export function filterTasks(tasks: ListedTask[], filters: ListFilters): ListedTask[] {
  const needle = filters.search === null ? null : normalizeTitle(filters.search);
  const group = filters.group === null ? null : normalizeTitle(filters.group);
  const result: ListedTask[] = [];
  for (const task of tasks) {
    if (filters.statuses && !filters.statuses.includes(task.status)) continue;
    if (!hasLabels(task.labels, filters.labels)) continue;
    if (group !== null && !(task.group !== null && normalizeTitle(task.group).includes(group))) continue;
    if (needle === null) {
      result.push(task);
      continue;
    }
    const matched: Matched[] = [];
    if (normalizeTitle(task.title).includes(needle)) matched.push("title");
    if (task.fieldsText && normalizeTitle(task.fieldsText).includes(needle)) matched.push("fields");
    if (task.bodyText && normalizeTitle(task.bodyText).includes(needle)) matched.push("body");
    if (matched.length) result.push({ ...task, matched });
  }
  return result;
}

/**
 * Interpreta los valores de `--status` (el flag se repite y cada valor puede traer varios separados
 * por comas). Sin repetidos y en el orden pedido.
 * @throws UsageError un valor que no es un estado (el mensaje lista los válidos)
 */
export function parseStatuses(values: string[]): ListStatus[] {
  const valid = LIST_STATUSES.join(", ");
  const result: ListStatus[] = [];
  for (const raw of values.flatMap((value) => value.split(","))) {
    const name = raw.trim().toLowerCase();
    if (!name) throw new UsageError(`--status trae un valor vacío. Estados válidos: ${valid}.`);
    if (!(LIST_STATUSES as readonly string[]).includes(name)) throw new UsageError(`Estado desconocido en --status: «${raw.trim()}». Estados válidos: ${valid}.`);
    if (!result.includes(name as ListStatus)) result.push(name as ListStatus);
  }
  return result;
}
