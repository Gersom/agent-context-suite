// El bloque de una tarea nueva de `backlog.md` (`### Tarea N — título` y sus campos), con las
// palabras que el archivo ya usa. Lo usan `add` y `close --new`.

import type { Task } from "../../../_shared/types.ts";
import type { Docs } from "../workspace/docs.ts";
import type { Strings } from "./language.ts";
import { renderTaskBlock } from "./render.ts";
import { backlogTasks, headerLabels, labelResolver } from "./samples.ts";

export interface NewTaskInput {
  number: number;
  title: string;
  description: string;
  /** Por defecto «Ninguno.». */
  decisions?: string;
  /** Por defecto «Ninguno.». */
  blocker?: string;
  /** Por defecto, el genérico de la plantilla. */
  trigger?: string;
  /** Etiquetas ya normalizadas (separadas por un espacio, sin `#`). Si no se pasan, el campo se omite. */
  labels?: string;
  /** Si no se pasa, el campo se omite. */
  details?: string;
  /** Fecha de hoy (`YYYY-MM-DD`). */
  date: string;
}

/**
 * Bloque de una tarea nueva del backlog (sin salto de línea final). El header usa la palabra de
 * las tareas existentes y las etiquetas de campo salen de las de la sección destino (`sectionTasks`)
 * o, si no hay, de las demás tareas del archivo; sin ninguna, de la tabla del idioma.
 */
export function renderBacklogTask(docs: Docs, S: Strings, sectionTasks: Task[], input: NewTaskInput): string {
  const label = labelResolver([...sectionTasks, ...backlogTasks(docs)].map((task) => task.fields), S);
  const fields: Array<[string, string]> = [
    [label("description"), input.description],
    [label("decisions"), input.decisions ?? S.none],
    [label("blockers"), input.blocker ?? S.none],
    [label("trigger"), input.trigger ?? S.defaultTrigger],
  ];
  if (input.labels) fields.push([label("labels"), input.labels]);
  if (input.details) fields.push([label("details"), input.details]);
  fields.push([label("added"), `${input.date}.`]);
  return renderTaskBlock(`### ${headerLabels(docs)[0] ?? S.task} ${input.number} — ${input.title}`, fields);
}
