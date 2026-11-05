// Lo que comparten los comandos que arman y desarman grupos de `backlog.md`: formar uno con tareas
// libres (`createGroup`), sacar una tarea de su grupo (`ejectTask`), sumarle tareas libres (`addTasks`),
// cambiar su título o resumen (`editGroup`) y deshacerlo (`dissolveGroup`). Un grupo vive en dos lugares a la vez:
// la referencia `### Grupo — título (Tareas 14, 15)` + `- **Resumen:** ...` en «Tareas libres» y el
// contenedor `### Grupo — título` con sus `#### Tarea N` en «Tareas agrupadas». Las funciones son
// puras: devuelven las ediciones calculadas sobre el texto original (una sola vez, sin solaparse)
// y no leen ni escriben nada. Un grupo necesita al menos `MIN_GROUP_TASKS` tareas: si queda con menos,
// se desarma y sus tareas vuelven a «Tareas libres».

import { parseBlocks } from "../../../_shared/parse/blocks.ts";
import { commentSpans } from "../../../_shared/parse/markdown.ts";
import { matchFieldLine } from "../../../_shared/parse/text-fields.ts";
import type { Group, ParsedBacklog, Task } from "../../../_shared/types.ts";
import { CliError } from "../cli/errors.ts";
import { WHERE } from "../commands/block.ts";
import { type Edit, insertAt, replaceRange } from "../edit/edits.ts";
import { blockSeparator, insertBlock, removeBlock } from "../edit/layout.ts";
import { normalizeTitle, type Place } from "../query/find.ts";
import { lineAt, trimRange } from "../query/lines.ts";
import type { Doc } from "../workspace/docs.ts";
import { type Block, removeBlocks } from "./blocking.ts";
import type { Strings } from "./language.ts";
import { insertIntoFree } from "./unblocking.ts";

/** Tareas mínimas de un grupo: con menos de estas, el grupo se desarma. */
export const MIN_GROUP_TASKS = 2;

// La lista de números va entre paréntesis al final del header de la referencia: `(Tareas 14, 15)`.
const REFERENCE_LIST_RE = /\(([^)]*\d[^)]*)\)\s*$/;

/** Dónde está una tarea que debería estar agrupada y no lo está; en curso, pausada y cerrada reutilizan las etiquetas de `block`. */
export const NOT_GROUPED: Record<Exclude<Place, "grouped">, string> = {
  ...(WHERE as Record<"in-progress" | "paused" | "history", string>),
  free: "es una tarea libre, no está agrupada",
  blocked: "está en «bloqueadas / pospuestas», no está agrupada",
};

/** Un grupo con sus dos mitades: el contenedor (sus tareas `####`) y su referencia en «Tareas libres». */
export interface GroupAt {
  /** Contenedor de «Tareas agrupadas»; sus `tasks` están en orden de aparición. */
  container: Group;
  /** Referencia de «Tareas libres» (`Resumen` y lista de números). */
  reference: Group;
}

/**
 * El grupo que contiene la tarea `number` (cualquiera de las suyas), o `null` si la tarea no está
 * agrupada. La referencia se busca por el número y, si la lista no lo trae, por el título del grupo.
 * @throws CliError el grupo no tiene referencia en «Tareas libres»
 */
export function findGroupOf(backlog: Doc<ParsedBacklog>, number: number): GroupAt | null {
  const { free, grouped } = backlog.parsed;
  const container = grouped.find((group) => group.tasks.some((task) => task.number === number));
  if (!container) return null;
  const reference = free.groups.find((group) => group.taskNumbers.includes(number)) ?? free.groups.find((group) => group.title === container.title);
  if (!reference) {
    throw new CliError(`El grupo «${container.title}» (con la Tarea ${number}) no tiene su referencia en «Tareas libres»: arréglalo a mano. No se escribió nada.`);
  }
  return { container, reference };
}

/**
 * Las tareas libres `numbers`, en ese orden, listas para agruparlas.
 * @param verb cómo dice el comando lo que hace con ellas, en el mensaje «solo <verb> tareas libres»
 * @throws CliError no hay números, uno se repite, o alguno no es una tarea de «Tareas libres» (el mensaje dice dónde está)
 */
export function pickFreeTasks(backlog: Doc<ParsedBacklog>, numbers: number[], verb = "se agrupan"): Task[] {
  if (!numbers.length) throw new CliError("Indica al menos una tarea libre. No se escribió nada.");
  const repeated = numbers.find((number, i) => numbers.indexOf(number) !== i);
  if (repeated !== undefined) throw new CliError(`La Tarea ${repeated} está repetida en la lista. No se escribió nada.`);

  const { free, blocked, grouped } = backlog.parsed;
  return numbers.map((number) => {
    const task = free.tasks.find((candidate) => candidate.number === number);
    if (task) return task;
    const group = grouped.find((candidate) => candidate.tasks.some((member) => member.number === number));
    const where = group
      ? `ya está en el grupo «${group.title}»`
      : blocked.some((candidate) => candidate.number === number)
        ? "está en «Tareas bloqueadas / pospuestas»"
        : "no figura en «Tareas libres» (¿en curso, pausada, cerrada o inexistente?)";
    throw new CliError(`La Tarea ${number} ${where}: solo ${verb} tareas libres. No se escribió nada.`);
  });
}

/** El texto de un bloque (tarea o grupo) sin las líneas en blanco de los extremos. */
export function blockText(text: string, block: Block): string {
  const range = trimRange(text, block.range!);
  return text.slice(range.start, range.end);
}

/** El bloque de una tarea libre (`### Tarea N`) como tarea de un grupo (`#### Tarea N`): solo cambia el nivel del header. */
export function asGrouped(block: string): string {
  return block.replace(/^###(?!#)/, "####");
}

/** El bloque de una tarea agrupada (`#### Tarea N`) como tarea libre (`### Tarea N`): solo cambia el nivel del header. */
export function asFree(block: string): string {
  return block.replace(/^####(?!#)/, "###");
}

/**
 * Los contenedores `###` de «Tareas agrupadas», todos: también los que se quedaron sin tareas, que
 * `parseBacklog` descarta de `parsed.grouped`. Cada rango va sin líneas en blanco de los extremos.
 * @throws CliError falta la sección «Tareas agrupadas»
 */
export function groupedContainers(backlog: Doc<ParsedBacklog>): Block[] {
  const section = backlog.parsed.sections.grouped;
  if (!section) throw new CliError("backlog.md no tiene la sección «Tareas agrupadas» (ancla `grouped`). No se escribió nada.");
  const { text } = backlog;
  const { start, end } = section.bodyRange;
  const body = text.slice(start, end);
  const comments = commentSpans(body);
  const starts = [...body.matchAll(/^###(?!#)\s+/gm)]
    .map((match) => match.index ?? 0)
    .filter((at) => !comments.some(([from, to]) => at >= from && at < to))
    .map((at) => start + at);
  return starts.map((from, i): Block => {
    const to = starts[i + 1] ?? end;
    return { range: trimRange(text, { startLine: lineAt(text, from), endLine: lineAt(text, to - 1), start: from, end: to }) };
  });
}

/**
 * Edición que reescribe la lista de números de la referencia (`(Tareas 14, 15)`), con la palabra que
 * ya usa (`Tareas`, `Tasks`) y sin tocar el resto del header.
 * @throws CliError el header no termina en una lista entre paréntesis
 */
export function referenceEdit(text: string, reference: Group, numbers: number[]): Edit {
  const start = reference.range!.start;
  const newline = text.indexOf("\n", start);
  const header = text.slice(start, newline === -1 ? text.length : newline);
  const list = header.match(REFERENCE_LIST_RE);
  if (!list || list.index === undefined) {
    throw new CliError(`No reconozco la lista de tareas del header de «${reference.title}» (${header.trim().slice(0, 80)}): cámbiala a mano. No se escribió nada.`);
  }
  const from = start + list.index + 1;
  return replaceRange({ start: from, end: from + list[1].length }, list[1].match(/^\D*/)![0] + numbers.join(", "));
}

/**
 * Ediciones que reemplazan la referencia de «Tareas libres» por `blocks` (ya renderizados) al final
 * de la sección. Si la referencia es el último bloque, `blocks` ocupan su lugar (quitarla y agregar
 * al final tocarían el mismo rango); si no, se quita sin dejar huecos y se agrega al final.
 */
function replaceReference(backlog: Doc<ParsedBacklog>, reference: Group, blocks: string[], S: Strings): Edit[] {
  const { text } = backlog;
  const { free } = backlog.parsed;
  const freeBlocks = [...free.tasks, ...free.groups];
  const last = freeBlocks.reduce((a, b) => (b.range!.start > a.range!.start ? b : a));
  if (last !== reference) return [...removeBlocks(text, freeBlocks, [reference], S.emptySection), insertIntoFree(backlog, blocks)];
  const separator = blockSeparator(text, freeBlocks.map((block) => block.range!));
  return [replaceRange(trimRange(text, reference.range!), blocks.join(separator))];
}

/** Las etiquetas que son la de un resumen (en minúsculas): las de español e inglés y la del idioma `S`. */
function summaryWords(S: Strings): Set<string> {
  return new Set(["Resumen", "Summary", S.summary].map((label) => label.toLowerCase()));
}

/**
 * Las palabras de un grupo (`Grupo`, `Resumen`, `Tareas`) para escribir uno nuevo: las del primer grupo
 * que el archivo ya tenga (su header, la lista de su referencia y su línea de resumen, que se reconoce solo
 * por ser una etiqueta de resumen conocida, no por ser el primer campo) y, para lo que no se pueda copiar,
 * las de la tabla del idioma.
 */
export function groupLabels(backlog: Doc<ParsedBacklog>, S: Strings): Pick<Strings, "group" | "summary" | "tasks"> {
  const { free, grouped } = backlog.parsed;
  const { text } = backlog;
  const words = summaryWords(S);
  const labels = { group: [...free.groups, ...grouped].find((group) => group.label)?.label ?? S.group, summary: S.summary, tasks: S.tasks };
  let listed = false;
  for (const reference of free.groups) {
    if (!reference.range) continue;
    const newline = text.indexOf("\n", reference.range.start);
    const list = text.slice(reference.range.start, newline === -1 ? text.length : newline).match(REFERENCE_LIST_RE);
    if (!list) continue;
    if (!listed) {
      labels.tasks = list[1].match(/^\D*/)![0].trim() || S.tasks;
      listed = true;
    }
    const label = reference.body.split("\n").map((line) => matchFieldLine(line)?.label.trim()).find((found) => found && words.has(found.toLowerCase()));
    if (label) {
      labels.summary = label;
      break;
    }
  }
  return labels;
}

/**
 * El título de un contenedor, por su primera línea `### Grupo — título` (sin la palabra, misma regla que `GROUP_RE`
 * del parser); el header entero si no tiene esa forma. El contenedor no lleva lista de números: un paréntesis final
 * (`Migrar (v2)`) es parte del título. Las referencias de «Tareas libres» ya traen su título sin lista (`Group.title`).
 */
function groupTitle(block: string): string {
  const line = block.split("\n", 1)[0].replace(/^###\s+/, "").trim();
  return line.match(/^\S+\s*[—–-]\s*(.+?)$/)?.[1] ?? line;
}

/**
 * Valida el título y/o el resumen que se van a escribir en un grupo (ya sin espacios en los extremos); el que sea `undefined` no se valida.
 * @throws CliError vacío o de varias líneas, con `<!--`/`-->`, o un título que termina en una lista entre paréntesis con números (se leería como referencia)
 */
function checkGroupText(name: string | undefined, phrase: string | undefined): void {
  if (name !== undefined && (!name || name.includes("\n"))) throw new CliError("El título del grupo debe ser una sola línea y no estar vacío. No se escribió nada.");
  if (phrase !== undefined && (!phrase || phrase.includes("\n"))) throw new CliError("El resumen del grupo debe ser una sola frase (una línea) y no estar vacío. No se escribió nada.");
  if (name !== undefined && (name.includes("<!--") || name.includes("-->"))) throw new CliError("El título del grupo no puede contener «<!--» ni «-->»: abrirían o cerrarían un comentario HTML. No se escribió nada.");
  if (phrase !== undefined && (phrase.includes("<!--") || phrase.includes("-->"))) throw new CliError("El resumen del grupo no puede contener «<!--» ni «-->»: abrirían o cerrarían un comentario HTML. No se escribió nada.");
  if (name !== undefined && REFERENCE_LIST_RE.test(name)) {
    throw new CliError(`El título «${name}» termina en una lista entre paréntesis con números: se leería como la referencia de un grupo. Cámbialo. No se escribió nada.`);
  }
}

/**
 * Falla si `name` ya es el título de otro grupo (sin distinguir mayúsculas ni acentos), también el de un contenedor
 * huérfano. Con `own`, ese grupo (su referencia y su contenedor) no cuenta.
 * @param containers `groupedContainers(backlog)`
 */
function checkTitleFree(backlog: Doc<ParsedBacklog>, name: string, containers: Block[], own?: GroupAt): void {
  const { text } = backlog;
  const ownStart = own && trimRange(text, own.container.range!).start;
  const taken = [
    ...backlog.parsed.free.groups.filter((group) => group !== own?.reference).map((group) => group.title),
    ...containers.filter((block) => block.range!.start !== ownStart).map((block) => groupTitle(blockText(text, block))),
  ];
  const repeated = taken.find((existing) => normalizeTitle(existing) === normalizeTitle(name));
  if (repeated !== undefined) throw new CliError(`Ya hay un grupo con el título «${repeated}»: el título identifica al grupo y debe ser único. No se escribió nada.`);
}

/**
 * Falla si el header de la referencia que se va a escribir no se relee con el mismo título y las mismas tareas: un título con un
 * paréntesis sin cerrar (`Fase (2`) hace que el parser parta el header en otro lugar.
 */
function checkHeaderReads(header: string, name: string, numbers: number[]): void {
  const reread = parseBlocks(header).groups[0];
  if (!reread || reread.title !== name || reread.taskNumbers.join() !== numbers.join()) {
    throw new CliError(`El título «${name}» tiene un paréntesis sin cerrar o algo que confunde al parser: el header del grupo no se leería con el mismo título y las mismas tareas. Cámbialo. No se escribió nada.`);
  }
}

/**
 * Forma un grupo con las tareas libres `numbers` (en ese orden, mínimo `MIN_GROUP_TASKS`): las saca de
 * «Tareas libres», pone la referencia (`### Grupo — título (Tareas 14, 15)` + `- **Resumen:** ...`) al final de
 * esa sección y el contenedor (`### Grupo — título` con sus `#### Tarea N`, mismo contenido que tenían) al
 * final de «Tareas agrupadas», que si solo tenía su texto de vacío lo reemplaza. Las palabras salen de
 * `groupLabels`.
 * @throws CliError tareas que no son libres o repetidas (ver `pickFreeTasks`), menos de `MIN_GROUP_TASKS`,
 *   título o resumen vacío, de varias líneas o con `<!--`/`-->`, título que se leería como referencia, que
 *   rompería el reparseo del header (paréntesis sin cerrar) o que ya usa otro grupo, o falta alguna de las dos secciones
 */
export function createGroup(backlog: Doc<ParsedBacklog>, numbers: number[], title: string, summary: string, S: Strings): Edit[] {
  const tasks = pickFreeTasks(backlog, numbers);
  if (tasks.length < MIN_GROUP_TASKS) throw new CliError(`Un grupo necesita al menos ${MIN_GROUP_TASKS} tareas (recibí ${tasks.length}). No se escribió nada.`);
  const name = title.trim();
  const phrase = summary.trim();
  checkGroupText(name, phrase);
  if (!backlog.parsed.sections.free) throw new CliError("backlog.md no tiene la sección «Tareas libres» (ancla `free`). No se escribió nada.");
  const { text } = backlog;
  const { free } = backlog.parsed;
  const containers = groupedContainers(backlog);

  checkTitleFree(backlog, name, containers);

  const labels = groupLabels(backlog, S);
  const referenceHeader = `### ${labels.group} — ${name} (${labels.tasks} ${numbers.join(", ")})`;
  checkHeaderReads(referenceHeader, name, numbers);
  const referenceBlock = `${referenceHeader}\n\n- **${labels.summary}:** ${phrase}`;
  const containerBlock = [`### ${labels.group} — ${name}`, ...tasks.map((task) => asGrouped(blockText(text, task)))].join("\n\n");

  // La referencia va al final de «libres». Si la última tarea de la sección es una de las quitadas,
  // quitarla y agregar al final tocarían el mismo rango: la referencia ocupa el lugar de las últimas.
  const freeBlocks = [...free.tasks, ...free.groups].sort((a, b) => a.range!.start - b.range!.start);
  const tail = freeBlocks.length - 1;
  let from = tail;
  while (from >= 0 && tasks.includes(freeBlocks[from] as Task)) from--;
  const freeEdits =
    from === tail
      ? [...removeBlocks(text, freeBlocks, tasks, S.emptySection), insertIntoFree(backlog, [referenceBlock])]
      : [
          ...removeBlocks(text, freeBlocks, tasks.filter((task) => freeBlocks.indexOf(task) <= from), S.emptySection),
          replaceRange({ start: trimRange(text, freeBlocks[from + 1].range!).start, end: trimRange(text, freeBlocks[tail].range!).end }, referenceBlock),
        ];

  const grouped = backlog.parsed.sections.grouped!;
  const insert = insertBlock(text, grouped.bodyRange, containerBlock, {
    hasBlocks: containers.length > 0,
    separator: blockSeparator(text, containers.map((block) => block.range!)),
  });
  return [...freeEdits, insert];
}

/**
 * Saca la tarea agrupada `number` de su grupo: su bloque pasa de `#### Tarea N` a `### Tarea N` (mismo
 * contenido) al final de «Tareas libres» y su número sale de la lista de la referencia. Si el grupo
 * queda con menos de `MIN_GROUP_TASKS` tareas se desarma: la que quedaba pasa también a libres (tras la
 * sacada) y se eliminan la referencia y el contenedor. Si «Tareas agrupadas» queda sin grupos, vuelve a
 * su texto de vacío.
 * @throws CliError la tarea no está agrupada, o el grupo no se puede ubicar en alguna de las dos secciones
 */
export function ejectTask(backlog: Doc<ParsedBacklog>, number: number, S: Strings): Edit[] {
  const at = findGroupOf(backlog, number);
  if (!at) throw new CliError(`La Tarea ${number} no está en «Tareas agrupadas»: solo se sacan de su grupo las tareas agrupadas. No se escribió nada.`);
  if (!backlog.parsed.sections.free) throw new CliError("backlog.md no tiene la sección «Tareas libres» (ancla `free`). No se escribió nada.");
  const { container, reference } = at;
  const { text } = backlog;

  const task = container.tasks.find((candidate) => candidate.number === number)!;
  const rest = container.tasks.filter((candidate) => candidate !== task);
  if (rest.length >= MIN_GROUP_TASKS) {
    return [
      referenceEdit(text, reference, rest.map((candidate) => candidate.number)),
      insertIntoFree(backlog, [asFree(blockText(text, task))]),
      removeBlock(text, trimRange(text, task.range!), S.emptyGrouped, true),
    ];
  }

  return disband(backlog, at, [task, ...rest], S);
}

/** El bloque de `container` entre los contenedores de «Tareas agrupadas». @throws CliError no se ubica */
function ownContainer(backlog: Doc<ParsedBacklog>, container: Group, containers: Block[]): Block {
  const start = trimRange(backlog.text, container.range!).start;
  const own = containers.find((candidate) => candidate.range!.start === start);
  if (!own) throw new CliError(`No ubico el contenedor del grupo «${container.title}» en «Tareas agrupadas»: arréglalo a mano. No se escribió nada.`);
  return own;
}

/**
 * Desarma el grupo `at`: sus `tasks` (en ese orden) pasan a `### Tarea N` al final de «Tareas libres» y se eliminan la
 * referencia y el contenedor; si «Tareas agrupadas» queda sin grupos vuelve a su texto de vacío.
 */
function disband(backlog: Doc<ParsedBacklog>, at: GroupAt, tasks: Task[], S: Strings): Edit[] {
  const { text } = backlog;
  const containers = groupedContainers(backlog);
  const own = ownContainer(backlog, at.container, containers);
  const blocks = tasks.map((moved) => asFree(blockText(text, moved)));
  return [...replaceReference(backlog, at.reference, blocks, S), ...removeBlocks(text, containers, [own], S.emptyGrouped)];
}

/**
 * Deshace el grupo que contiene la tarea `number`: todas sus tareas pasan de `#### Tarea N` a `### Tarea N` (mismo
 * contenido) al final de «Tareas libres», en el orden del contenedor, y se eliminan la referencia y el contenedor. Si
 * «Tareas agrupadas» queda sin grupos, vuelve a su texto de vacío.
 * @throws CliError la tarea no está agrupada, o el grupo no se puede ubicar en alguna de las dos secciones
 */
export function dissolveGroup(backlog: Doc<ParsedBacklog>, number: number, S: Strings): Edit[] {
  const at = findGroupOf(backlog, number);
  if (!at) throw new CliError(`La Tarea ${number} no está en «Tareas agrupadas»: indica una tarea del grupo que deshaces. No se escribió nada.`);
  if (!backlog.parsed.sections.free) throw new CliError("backlog.md no tiene la sección «Tareas libres» (ancla `free`). No se escribió nada.");
  return disband(backlog, at, at.container.tasks, S);
}

// El header de una referencia (`### Grupo — título (Tareas 14, 15)`) o de un contenedor (`### Grupo — título`): lo que va antes del título, el título y lo que sigue.
const REFERENCE_HEADER_RE = /^(###\s+\S+\s*[—–-]\s*)(.+?)(\s*\([^)]*\d[^)]*\)\s*)$/;
const CONTAINER_HEADER_RE = /^(###\s+\S+\s*[—–-]\s*)(.+?)(\s*)$/;

/**
 * Edición que reescribe solo el título del header que empieza en `start`, y el header resultante.
 * @param withList el header es el de una referencia: si trae su lista entre paréntesis, se conserva
 * @throws CliError el header trae un comentario HTML, o no tiene la forma `### Grupo — título`
 */
function retitleEdit(text: string, start: number, name: string, withList: boolean): { edit: Edit; header: string } {
  const newline = text.indexOf("\n", start);
  const header = text.slice(start, newline === -1 ? text.length : newline);
  if (header.includes("<!--")) {
    throw new CliError(`El header del grupo (${header.trim().slice(0, 80)}) tiene un comentario HTML: quita el comentario del header a mano. No se escribió nada.`);
  }
  const match = (withList && header.match(REFERENCE_HEADER_RE)) || header.match(CONTAINER_HEADER_RE);
  if (!match) throw new CliError(`No reconozco el header del grupo (${header.trim().slice(0, 80)}): cámbialo a mano. No se escribió nada.`);
  const from = match[1].length;
  return { edit: replaceRange({ start: start + from, end: start + from + match[2].length }, name), header: header.slice(0, from) + name + header.slice(from + match[2].length) };
}

/** La línea `- **Resumen:** frase` de una referencia: su valor (con las líneas de continuación) y dónde está. */
interface SummaryLine {
  /** Inicio de la línea. */
  lineStart: number;
  /** Desde dónde se reemplaza el valor, y con qué relleno si la línea no tenía espacio tras la etiqueta. */
  start: number;
  pad: string;
  /** Fin de la última línea del valor. */
  end: number;
  value: string;
}

/**
 * La línea de `Resumen` de la referencia (la primera cuya etiqueta es la de un resumen en español o inglés o la del idioma;
 * ningún otro campo cuenta, aunque sea el primero), o `null` si no tiene.
 */
function summaryLine(backlog: Doc<ParsedBacklog>, reference: Group, S: Strings): SummaryLine | null {
  const { text } = backlog;
  const wanted = summaryWords(S);
  const range = trimRange(text, reference.range!);
  const lines = text.slice(range.start, range.end).split("\n");
  let found: SummaryLine | null = null;
  let lineStart = range.start + lines[0].length + 1; // tras el header
  for (const line of lines.slice(1)) {
    if (!found) {
      const match = matchFieldLine(line);
      if (match && wanted.has(match.label.trim().toLowerCase())) {
        const spaced = match.value !== "" || /\s$/.test(match.prefix);
        found = { lineStart, start: lineStart + (spaced ? match.prefix.length : match.prefix.trimEnd().length), pad: spaced ? "" : " ", end: lineStart + line.length, value: match.value.trim() };
      }
    } else if (/^\s+\S/.test(line)) {
      found.end = lineStart + line.length;
      found.value = found.value ? `${found.value}\n${line.trim()}` : line.trim();
    } else {
      break; // el campo terminó
    }
    lineStart += line.length + 1;
  }
  return found;
}

/** Lo que se pide cambiar de un grupo; el que falta no se toca. */
export interface GroupEditValues {
  title?: string;
  summary?: string;
}

/** El resumen (valor de la línea `Resumen`) de la referencia del grupo, o `null` si no tiene esa línea. */
export function groupSummary(backlog: Doc<ParsedBacklog>, at: GroupAt, S: Strings): string | null {
  return summaryLine(backlog, at.reference, S)?.value ?? null;
}

/**
 * Cambia el título y/o el resumen del grupo que contiene la tarea `number`. El título se reescribe en el header de la
 * referencia (con su lista `(Tareas ...)` y su palabra de grupo) y en el del contenedor; el resumen, en el valor de la
 * línea `Resumen` de la referencia (con su etiqueta), que si falta se agrega tras el header con el espaciado de los
 * demás grupos. El valor que ya es el actual no se toca; un título que difiere del de la referencia o del del contenedor sí
 * cuenta como cambio y reescribe los dos. `S` solo pone las palabras de una línea de `Resumen` que haya que agregar.
 * @throws CliError la tarea no está agrupada, no se pide ningún cambio ni cambia nada, título o resumen inválidos (ver
 *   `checkGroupText`), título que ya usa otro grupo o que no se releería igual, un header con comentario HTML, o el grupo no se ubica
 */
export function editGroup(backlog: Doc<ParsedBacklog>, number: number, values: GroupEditValues, S: Strings): Edit[] {
  const at = findGroupOf(backlog, number);
  if (!at) throw new CliError(`La Tarea ${number} no está en «Tareas agrupadas»: indica una tarea que ya pertenezca al grupo. No se escribió nada.`);
  const name = values.title?.trim();
  const phrase = values.summary?.trim();
  if (name === undefined && phrase === undefined) throw new CliError("Indica qué cambiar del grupo: el título, el resumen o ambos. No se escribió nada.");
  checkGroupText(name, phrase);

  const { container, reference } = at;
  const { text } = backlog;
  const current = summaryLine(backlog, reference, S);
  // Un desajuste manual entre los dos títulos (`Dos` vs `DOS`) también es un cambio: reescribir los dos lo repara.
  const retitle = name !== undefined && (name !== reference.title || name !== container.title);
  const resummarize = phrase !== undefined && phrase !== current?.value;
  if (!retitle && !resummarize) {
    const same = name !== undefined && phrase !== undefined ? "el título y el resumen" : name !== undefined ? "el título" : "el resumen";
    throw new CliError(`El grupo «${reference.title}» ya tiene ${same} que indicas: no hay nada que cambiar. No se escribió nada.`);
  }

  const edits: Edit[] = [];
  if (retitle) {
    const containers = groupedContainers(backlog);
    checkTitleFree(backlog, name, containers, at);
    const own = ownContainer(backlog, container, containers);
    const header = retitleEdit(text, reference.range!.start, name, true);
    checkHeaderReads(header.header, name, reference.taskNumbers);
    edits.push(header.edit, retitleEdit(text, own.range!.start, name, false).edit);
  }
  if (resummarize) {
    if (current) {
      edits.push(replaceRange({ start: current.start, end: current.end }, current.pad + phrase));
    } else {
      // Entre el header y el resumen, lo que ya hay en los demás grupos (una línea en blanco si ninguno lo tiene).
      const headerEnd = (start: number) => (text.indexOf("\n", start) === -1 ? text.length : text.indexOf("\n", start));
      const gap = backlog.parsed.free.groups
        .map((other) => ({ other, line: other === reference ? null : summaryLine(backlog, other, S) }))
        .filter((candidate) => candidate.line)
        .map(({ other, line }) => text.slice(headerEnd(other.range!.start), line!.lineStart))
        .find((between) => /^\n+$/.test(between));
      edits.push(insertAt(headerEnd(reference.range!.start), `${gap ?? "\n\n"}- **${groupLabels(backlog, S).summary}:** ${phrase}`));
    }
  }
  return edits;
}

/**
 * Suma tareas libres al grupo que contiene la tarea `groupNumber`: sus bloques pasan de `### Tarea N` a
 * `#### Tarea N` al final del contenedor (en el orden de `numbers`) y sus números se agregan a la
 * referencia, que queda con los del grupo en orden de aparición y luego los nuevos. No toca el `Resumen`.
 * `S` solo lo pide `removeBlocks`: la referencia sigue en «Tareas libres», que nunca queda vacía, así que no se escribe ningún texto de `S`.
 * @throws CliError `groupNumber` no está agrupada, o `numbers` no son tareas libres distintas (ver `pickFreeTasks`)
 */
export function addTasks(backlog: Doc<ParsedBacklog>, groupNumber: number, numbers: number[], S: Strings): Edit[] {
  const at = findGroupOf(backlog, groupNumber);
  if (!at) throw new CliError(`La Tarea ${groupNumber} no está en «Tareas agrupadas»: indica una tarea que ya pertenezca al grupo. No se escribió nada.`);
  const tasks = pickFreeTasks(backlog, numbers, "se suman al grupo");
  const { container, reference } = at;
  const { text } = backlog;
  const { free } = backlog.parsed;

  const separator = blockSeparator(text, container.tasks.map((task) => task.range!));
  const blocks = tasks.map((task) => asGrouped(blockText(text, task)));
  const list = [...container.tasks.map((task) => task.number), ...numbers];
  return [
    ...removeBlocks(text, [...free.tasks, ...free.groups], tasks, S.emptySection),
    referenceEdit(text, reference, list),
    insertAt(trimRange(text, container.range!).end, separator + blocks.join(separator)),
  ];
}
