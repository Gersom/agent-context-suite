// Filtro por etiqueta del board (tecla `t`): qué etiquetas hay en lo que se muestra, cuál sigue en el
// ciclo y el modelo reducido a las tareas que llevan una etiqueta. Funciones puras, sin estado: el
// filtro activo vive en cli/label-filter.ts. Las etiquetas se comparan sin distinguir mayúsculas.

import type { FreeGroup, FreeTask, Model, TeamBacklogModel } from "../shared/types.ts";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** `true` si la tarea lleva `label`. */
function carries(task: { labels: string[] }, label: string): boolean {
  return task.labels.some((own) => same(own, label));
}

/**
 * Etiquetas que existen en lo que se muestra (las tareas del modelo y, si se da, las del
 * team-backlog): únicas sin distinguir mayúsculas (se conserva la primera forma, recorriendo las
 * cajas de arriba abajo) y en orden alfabético sin distinguir mayúsculas.
 */
export function modelLabels(model: Model, teamBacklog?: TeamBacklogModel): string[] {
  const tasks: Array<{ labels: string[] }> = [
    ...(teamBacklog ? [...teamBacklog.free, ...teamBacklog.blocked] : []),
    ...model.free.tasks,
    ...model.free.groups.flatMap((group) => group.tasks.filter(isLabeled)),
    ...model.blocked,
    ...(model.current ? [model.current] : []),
    ...model.paused,
    ...model.completed,
  ];
  const found = new Map<string, string>();
  for (const { labels } of tasks) {
    for (const label of labels) if (!found.has(label.toLowerCase())) found.set(label.toLowerCase(), label);
  }
  return [...found.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, label]) => label);
}

/** Etiqueta que sigue a `current` en el ciclo `todas → cada etiqueta → todas` (`null` es «todas»). Sin etiquetas, siempre `null`. */
export function nextLabel(labels: string[], current: string | null): string | null {
  if (!labels.length) return null;
  if (current === null) return labels[0];
  const at = labels.findIndex((label) => same(label, current));
  if (at < 0) return labels[0];
  return labels[at + 1] ?? null;
}

/** El filtro `current` tal como figura ahora en `labels` (con su forma actual), o `null` («todas») si esa etiqueta ya no existe. */
export function reconcileLabel(labels: string[], current: string | null): string | null {
  if (current === null) return null;
  return labels.find((label) => same(label, current)) ?? null;
}

function isLabeled(task: FreeTask | FreeGroup["tasks"][number]): task is FreeTask {
  return "labels" in task;
}

/**
 * El modelo con solo las tareas que llevan `label` en libres, bloqueadas, pausadas y completadas; la
 * tarea en curso se conserva siempre. Un grupo de libres se filtra por sus tareas y se descarta si
 * no le queda ninguna. Los contadores reflejan lo filtrado. Con `label: null` devuelve el mismo modelo.
 */
export function filterModel(model: Model, label: string | null): Model {
  if (label === null) return model;
  const free = model.free.tasks.filter((task) => carries(task, label));
  const groups: FreeGroup[] = [];
  for (const group of model.free.groups) {
    const tasks = group.tasks.filter((task) => isLabeled(task) && carries(task, label));
    if (tasks.length) groups.push({ ...group, tasks, taskNumbers: tasks.map((task) => task.number) });
  }
  const blocked = model.blocked.filter((task) => carries(task, label));
  const paused = model.paused.filter((task) => carries(task, label));
  return {
    ...model,
    completed: model.completed.filter((entry) => carries(entry, label)),
    paused,
    free: { tasks: free, groups },
    blocked,
    counts: {
      paused: paused.length,
      free: free.length + groups.reduce((sum, group) => sum + group.taskNumbers.length, 0),
      blocked: blocked.length,
    },
  };
}

/** El team-backlog con solo las tareas (libres y bloqueadas) que llevan `label`; con `null` devuelve el mismo. */
export function filterTeamBacklog(backlog: TeamBacklogModel, label: string | null): TeamBacklogModel {
  if (label === null) return backlog;
  return { ...backlog, free: backlog.free.filter((task) => carries(task, label)), blocked: backlog.blocked.filter((task) => carries(task, label)) };
}
