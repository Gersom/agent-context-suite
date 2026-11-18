// Procesamiento de la vista de equipo (modo multi-operador): una fila por operador con lo que
// está haciendo y sus conteos, y las tareas sin dueño del team-backlog.md. Reutiliza `buildModel`
// por operador, así que cada fila sale de lo mismo que su panel.

import { parseTeamBacklog } from "../../../_shared/parse/team-backlog.ts";
import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { fieldLabels } from "../../../_shared/tasks/labels.ts";
import type { Field } from "../../../_shared/types.ts";
import type { TeamBacklogModel, TeamBacklogTask, TeamModel, TeamRead, TeamRow } from "../shared/types.ts";
import { buildModel } from "./model.ts";

export function buildTeamModel(read: TeamRead): TeamModel {
  const warnings = [...read.warnings];
  const rows: TeamRow[] = [];

  for (const { entry, snapshot } of read.operators) {
    if (!snapshot) {
      rows.push({ folder: entry.folder, folderless: true, missing: false, current: null, counts: { free: 0, blocked: 0 }, lastCompleted: null });
      continue;
    }
    const model = buildModel({
      handoffText: snapshot.handoffText,
      backlogText: snapshot.backlogText,
      historyText: snapshot.historyText,
      readErrors: snapshot.warnings,
    });
    // Los avisos de cada operador se prefijan con su carpeta; las notas del set mínimo no aplican acá.
    for (const warning of model.warnings) warnings.push(`[${entry.folder}] ${warning}`);
    rows.push({
      folder: entry.folder,
      folderless: false,
      missing: snapshot.handoffText == null,
      current: model.current
        ? { label: model.current.label, number: model.current.number, title: model.current.title, done: model.current.plan.done, total: model.current.plan.total }
        : null,
      counts: { free: model.counts.free, blocked: model.counts.blocked },
      lastCompleted: model.completed[0] ?? null,
    });
  }

  const teamBacklog = buildTeamBacklog(read.teamBacklogText);
  warnings.push(...teamBacklog.warnings);
  return { rows, teamBacklog, warnings };
}

/** Tareas sin dueño a partir del texto de team-backlog.md (`null` si no existe). */
export function buildTeamBacklog(text: string | null): TeamBacklogModel {
  if (text == null) return { present: false, free: [], blocked: [], warnings: [] };
  const warnings: string[] = [];
  if (!text.trim()) {
    warnings.push("team-backlog.md está vacío (¿se está reescribiendo?).");
    return { present: true, free: [], blocked: [], warnings };
  }

  const parsed = parseTeamBacklog(text);
  if (parsed.usedFallback) warnings.push("team-backlog.md no tiene anclas de sección: se ubicaron las secciones por orden (plan B).");
  if (parsed.missing.length) warnings.push(`team-backlog.md: no se encontró la sección ${parsed.missing.map((id) => `"${id}"`).join(", ")}.`);
  if (parsed.placeholders) warnings.push("team-backlog.md tiene placeholders sin completar.");

  const toTask = (task: { title: string; fields: Field[] }): TeamBacklogTask => ({ title: task.title, labels: fieldLabels(task.fields), block: blockInfo(task) });
  const free = parsed.free.filter((t) => !t.isPlaceholder).map(toTask);
  const blocked = parsed.blocked.filter((t) => !t.isPlaceholder).map(toTask);
  for (const task of blocked) {
    if (!task.block.tag) warnings.push(`"${task.title}" está en "bloqueadas" del team-backlog.md sin bloqueo vigente: ¿moverla a libres?`);
  }
  return { present: true, free, blocked, warnings };
}
