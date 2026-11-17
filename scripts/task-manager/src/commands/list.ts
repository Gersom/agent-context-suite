// `list`: todas las tareas del operador (en curso, pausadas, libres, bloqueadas, cerradas y las del
// team-backlog) en una sola lista, de la más reciente a la más antigua, con filtros por estado,
// texto y grupo y un límite. Solo lectura; no imprime los bloques, solo una línea por tarea.

import { normalizeTitle } from "../../../_shared/parse/markdown.ts";
import type { Command } from "../cli/types.ts";
import { UsageError } from "../cli/errors.ts";
import { emitJson, relFile } from "../query/format.ts";
import { collectTasks, filterTasks, LIST_STATUSES, type ListedTask, parseStatuses } from "../query/list.ts";
import { requireDoc } from "../workspace/docs.ts";

/** Cuántas tareas se muestran si no se pasa `--last`. */
const DEFAULT_LIMIT = 20;

/** Largo máximo (en caracteres) del título en la salida de texto. */
const TITLE_MAX = 100;

/** Texto de un flag que debe traer algo: `null` si no se pasó; error de uso si está en blanco o queda vacío al normalizarlo. */
function textFlag(value: unknown, name: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !normalizeTitle(value)) throw new UsageError(`--${name} necesita un texto.`);
  return value.trim();
}

/** `--last`: entero ≥ 1; `null` si no se pasó. */
function parseLast(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim()) || Number(value) < 1) {
    throw new UsageError(`--last debe ser un entero mayor o igual a 1 (recibí «${String(value)}»).`);
  }
  return Number(value);
}

/** `T-153 · done · 2026-11-16 · título [grupo]`; `team` en lugar del número en las del team-backlog. */
function taskText(task: ListedTask, title: string): string {
  const who = task.number !== null ? `T-${task.number}` : task.team ? "team" : "—";
  return `${who} · ${task.status} · ${task.date ?? "—"} · ${title}${task.group ? ` [${task.group}]` : ""}`;
}

/** El título recortado a `TITLE_MAX` caracteres (por puntos de código: no parte un emoji) con «…»; `null` si cabe entero. */
function truncatedTitle(title: string): string | null {
  const chars = Array.from(title);
  return chars.length > TITLE_MAX ? `${chars.slice(0, TITLE_MAX).join("")}…` : null;
}

export const list: Command = {
  name: "list",
  summary: "Lista las tareas (en curso, pausadas, libres, bloqueadas, cerradas y del team-backlog), las más recientes primero (solo lectura)",
  usage: "list [--status <estado>] [--search <texto>] [--last <N>] [--group <nombre>] [--json]",
  flags: {
    status: {
      type: "string",
      valueName: "estado",
      multiple: true,
      description: `Solo las tareas en ese estado (${LIST_STATUSES.join(", ")}); se repite o se separa con comas.`,
    },
    search: { type: "string", valueName: "texto", description: "Solo las que contienen el texto (sin distinguir mayúsculas ni acentos) en su título, campos o cuerpo." },
    last: { type: "string", valueName: "N", description: `Cuántas mostrar, tras filtrar y ordenar (entero ≥ 1). Por defecto ${DEFAULT_LIMIT}.` },
    group: { type: "string", valueName: "nombre", description: "Solo las tareas de los grupos cuyo título contiene el texto." },
    json: { type: "boolean", description: "Salida estructurada (JSON) en vez de texto." },
  },
  run({ args, flags, io, workspace, docs }) {
    if (args.length) throw new UsageError("`list` no recibe argumentos: filtra con --status, --search o --group.");
    const rawStatus = flags.status === undefined ? null : Array.isArray(flags.status) ? flags.status : [String(flags.status)];
    const statuses = rawStatus && parseStatuses(rawStatus);
    const search = textFlag(flags.search, "search");
    const group = textFlag(flags.group, "group");
    const last = parseLast(flags.last);

    // Un operador «solo team-backlog» no tiene carpeta propia: solo se listan las tareas del team.
    const ws = workspace({ allowFolderless: true });
    const all = docs({ allowFolderless: true });
    if (!ws.operator?.folderless) requireDoc(all.handoff, "handoff.md");

    const found = filterTasks(collectTasks(all), { statuses, search, group });
    const shown = found.slice(0, last ?? DEFAULT_LIMIT);

    if (flags.json === true) {
      emitJson(io, "list", {
        operator: ws.operator?.folder ?? null,
        filters: { status: statuses, search, last, group },
        total: found.length,
        shown: shown.length,
        tasks: shown.map((task) => ({
          number: task.number,
          title: task.title,
          status: task.status,
          date: task.date,
          group: task.group,
          team: task.team,
          file: relFile(ws, task.path),
          startLine: task.startLine,
          ...(task.matched ? { matched: task.matched } : {}),
        })),
      });
      return;
    }

    if (!found.length) {
      io.out("Ninguna tarea coincide.");
      return;
    }
    const active = [
      statuses && `--status ${statuses.join(",")}`,
      search !== null && `--search «${search}»`,
      group !== null && `--group «${group}»`,
      last !== null && `--last ${last}`,
    ].filter(Boolean);
    const count = shown.length === found.length ? `${found.length} ${found.length === 1 ? "tarea" : "tareas"}` : `${shown.length} de ${found.length} tareas`;
    io.out(`${count} (${active.length ? active.join(" ") : "sin filtros"})`);
    let cut = false;
    for (const task of shown) {
      const short = truncatedTitle(task.title);
      cut ||= short !== null;
      io.out(taskText(task, short ?? task.title));
    }
    if (last === null && found.length > shown.length) {
      io.out(`Hay ${found.length - shown.length} más: usa --last <N> o filtra con --status/--search.`);
    }
    if (cut) io.out(`Títulos recortados a ${TITLE_MAX} caracteres: \`show <N>\` muestra la tarea completa.`);
  },
};
