// Dónde vive una tarea: la busca en handoff (en curso o pausada), backlog (libre, bloqueada o
// agrupada) e history y devuelve su posición exacta, sin leer ni imprimir el archivo entero. Es la
// base de `show` y de los comandos que editan una tarea (`start`, `step`, `close`...). Una tarea
// debería vivir en un solo lugar: si aparece en varios, se devuelven todos.

import { join } from "node:path";
import { normalizeTitle } from "../../../_shared/parse/markdown.ts";
import type { Range } from "../../../_shared/types.ts";
import { CliError } from "../cli/errors.ts";
import { type Doc, type Docs, readDocs } from "../workspace/docs.ts";
import { readOperators } from "../workspace/operator.ts";
import type { Workspace } from "../workspace/workspace.ts";
import { trimRange } from "./lines.ts";
import { findNextTaskNumber } from "./next-number.ts";
import { knownNumbers } from "./state.ts";

/** Dónde vive una tarea con número. */
export type Place = "in-progress" | "paused" | "free" | "blocked" | "grouped" | "history";
/** Dónde vive una tarea de team-backlog.md. */
export type TeamPlace = "team-free" | "team-blocked";

interface BaseLocation {
  title: string;
  /** Archivo del que sale (lleva `path`, `text`, etc.). */
  doc: Doc<unknown>;
  /** Rango del fragmento en `doc.text`, sin las líneas en blanco de los extremos. */
  range: Range;
}

export interface TaskLocation extends BaseLocation {
  place: Place;
  number: number;
  /** Título del grupo si es una tarea agrupada. */
  group: string | null;
  /** Solo en history: cómo se cerró. */
  outcome: "done" | "discarded" | null;
}

export interface TeamLocation extends BaseLocation {
  place: TeamPlace;
}

/** El texto del fragmento (siempre un trozo de `doc.text`, nunca el archivo entero). */
export function locationText(location: BaseLocation): string {
  return location.doc.text.slice(location.range.start, location.range.end);
}

/** El rango de un elemento parseado: los parsers siempre lo traen cuando reciben el texto completo. */
function rangeOf(range: Range | undefined, what: string): Range {
  if (!range) throw new Error(`El parser no devolvió la posición de ${what}.`);
  return range;
}

/**
 * Todos los lugares donde figura la tarea `number` (propia del operador de `docs`), en este
 * orden: en curso, pausada, libre, bloqueada, agrupada, history. Vacío si no existe. La tarea en
 * curso es la sección completa de «Tarea en progreso» (línea de la tarea, plan y subsecciones);
 * las demás, su bloque; las de history, su entrada.
 */
export function findTask(docs: Docs, number: number): TaskLocation[] {
  const found: TaskLocation[] = [];
  const { handoff, backlog, history } = docs;
  const push = (doc: Doc<unknown>, place: Place, title: string, range: Range | undefined, extra: Partial<TaskLocation> = {}) => {
    found.push({ place, number, title, doc, range: trimRange(doc.text, rangeOf(range, `la tarea ${number}`)), group: null, outcome: null, ...extra });
  };

  const current = handoff.parsed.inProgress.task;
  if (current?.number === number) push(handoff, "in-progress", current.title, handoff.parsed.sections["in-progress"]?.bodyRange);
  for (const task of handoff.parsed.paused) if (task.number === number) push(handoff, "paused", task.title, task.range);
  for (const task of backlog.parsed.free.tasks) if (task.number === number) push(backlog, "free", task.title, task.range);
  for (const task of backlog.parsed.blocked) if (task.number === number) push(backlog, "blocked", task.title, task.range);
  for (const group of backlog.parsed.grouped) {
    for (const task of group.tasks) if (task.number === number) push(backlog, "grouped", task.title, task.range, { group: group.title });
  }
  for (const entry of history.parsed.entries) {
    if (entry.number === number) push(history, "history", entry.title, entry.range, { outcome: entry.status });
  }
  return found;
}

export { normalizeTitle };

/**
 * Tareas de `team-backlog.md` (libres y bloqueadas) cuyo título coincide con `query`: las de
 * título exacto si las hay (sin distinguir mayúsculas ni acentos); si no, las que lo contienen.
 * Lista vacía si no hay team-backlog o nada coincide; el llamador decide qué hacer con varias.
 */
export function findTeamTasks(docs: Docs, query: string): TeamLocation[] {
  const team = docs.teamBacklog;
  if (!team?.exists) return [];
  const wanted = normalizeTitle(query);
  if (!wanted) return [];
  const all: TeamLocation[] = [];
  const collect = (place: TeamPlace, tasks: typeof team.parsed.free) => {
    for (const task of tasks) {
      if (task.isPlaceholder) continue;
      all.push({ place, title: task.title, doc: team, range: trimRange(team.text, rangeOf(task.range, `la tarea «${task.title}»`)) });
    }
  };
  collect("team-free", team.parsed.free);
  collect("team-blocked", team.parsed.blocked);
  const exact = all.filter((location) => normalizeTitle(location.title) === wanted);
  return exact.length ? exact : all.filter((location) => normalizeTitle(location.title).includes(wanted));
}

/** Lo que se pidió con `show`: un número (de uno mismo o de otro operador) o parte del título de una tarea del equipo. */
export type TaskTarget = { kind: "number"; number: number; operator: string | null } | { kind: "title"; query: string };

/**
 * Interpreta el argumento: `24`, `T-24` o `T-24@ana` (también `24@ana`) son números; cualquier otro
 * texto es un título (o parte) de una tarea de `team-backlog.md`.
 */
export function parseTarget(arg: string): TaskTarget {
  const match = arg.trim().match(/^(?:T-)?(\d+)(?:@(\S+))?$/i);
  if (match) return { kind: "number", number: Number(match[1]), operator: match[2] ?? null };
  return { kind: "title", query: arg.trim() };
}

// Cómo se nombra cada lugar en los mensajes de error (no las claves internas de `Place`).
const PLACE_NAME: Record<Place, string> = {
  free: "libres",
  grouped: "agrupadas",
  blocked: "bloqueadas",
  "in-progress": "en curso",
  paused: "pausada",
  history: "history.md",
};

/**
 * El lugar de la tarea `number`, que debe vivir en uno solo.
 * @throws CliError no existe (con los números conocidos) o figura en varios lugares (el mensaje los nombra)
 */
export function findSinglePlace(docs: Docs, number: number): Place {
  const found = findTask(docs, number);
  if (!found.length) throw new CliError(`No existe la Tarea ${number}. ${describeKnownNumbers(docs)}`);
  if (found.length > 1) {
    throw new CliError(`La Tarea ${number} aparece en ${found.length} lugares (${found.map((l) => PLACE_NAME[l.place]).join(", ")}): una tarea vive en un solo lugar; corrígelo a mano. No se escribió nada.`);
  }
  return found[0].place;
}

/** Texto con los números conocidos (rango y total) y el próximo, para los errores de «no existe». */
export function describeKnownNumbers(docs: Docs): string {
  const numbers = knownNumbers(docs);
  const next = docs.backlog.exists ? findNextTaskNumber(docs.backlog.text) : null;
  const tail = next ? ` «Próximo número de tarea»: ${next.value}.` : "";
  if (!numbers.length) return `No hay tareas numeradas.${tail}`;
  return `Números conocidos: ${numbers[0]} a ${numbers[numbers.length - 1]} (${numbers.length} tareas).${tail}`;
}

/**
 * Lee los archivos de OTRO operador (solo lectura: las carpetas ajenas no se editan), resolviendo
 * su carpeta por `operators.md`. No lee `team-backlog.md` (es del equipo, no del operador).
 * @throws CliError repo plano, operador desconocido o «solo team-backlog», o carpeta sin handoff.md
 */
export function readOperatorDocs(workspace: Workspace, folder: string): { folder: string; docs: Docs } {
  if (workspace.mode === "flat") {
    throw new CliError(`@${folder}: este repo es plano (no hay operators.md), no tiene otros operadores.`);
  }
  const { entries } = readOperators(workspace.agentsRoot);
  const choices = entries.filter((e) => !e.folderless).map((e) => e.folder);
  const hint = choices.length ? ` Operadores con carpeta: ${choices.join(", ")}.` : "";
  const entry = entries.find((e) => e.folder.toLowerCase() === folder.toLowerCase());
  if (!entry) throw new CliError(`«${folder}» no figura en operators.md.${hint}`);
  if (entry.folderless) throw new CliError(`«${entry.folder}» figura como «solo team-backlog»: no tiene carpeta propia.${hint}`);
  const dir = join(workspace.agentsRoot, entry.folder);
  const docs = readDocs({
    files: { handoff: join(dir, "handoff.md"), backlog: join(dir, "backlog.md"), history: join(dir, "history.md"), teamBacklog: null },
  });
  if (!docs.handoff.exists) throw new CliError(`La carpeta «${entry.folder}» figura en operators.md pero no tiene handoff.md (${dir}).`);
  return { folder: entry.folder, docs };
}
