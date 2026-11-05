// Lo que comparte `edit` para cambiar el contenido de una tarea sin tocar su estado ni su lugar:
// reemplazar el título de un header, reemplazar (o agregar) un campo `- **Etiqueta:** valor`, ubicar
// la descripción y los campos extra de «Tarea en progreso» y decidir cómo queda `Bloqueos` para que
// la sección de la tarea siga coincidiendo con su tag. Funciones puras sobre el texto LF de un
// archivo (`Doc.text`) y los rangos del parser: devuelven ediciones, no leen ni escriben nada.

import { commentSpans } from "../../../_shared/parse/markdown.ts";
import { classifyPreamble, FIELD_START_RE } from "../../../_shared/parse/text-fields.ts";
import { blockInfo, LEADING_TAG_RE } from "../../../_shared/tasks/block-info.ts";
import type { Field } from "../../../_shared/types.ts";
import { CliError } from "../cli/errors.ts";
import { type Edit, insertAt, replaceRange } from "../edit/edits.ts";
import { trimRange } from "../query/lines.ts";
import { BLOCKING_TAGS, blockedValue, citeBlockingTags } from "./blocking.ts";
import { partOf } from "./handoff.ts";
import { findFieldOfKind, isFieldKind, NONE_RE, type FieldKind, type Strings } from "./language.ts";
import { fieldBody, renderField } from "./render.ts";

/** Un tramo `[start, end)` del texto LF. */
export interface Span {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------------------------
// Título
// ---------------------------------------------------------------------------------------------

/** Dónde está el título: en `### Tarea N — título` (o `####`), en `### título` (team-backlog) o en la línea `Tarea N — título` de «Tarea en progreso». */
export type TitleShape = "numbered" | "team" | "current";

const TITLE_RE: Record<TitleShape, RegExp> = {
  numbered: /^(#{3,4}\s+\S+\s+\d+\s*[—–-]\s*)(.+?)(\s*)$/,
  team: /^(###(?!#)\s+)(.+?)(\s*)$/,
  current: /^(\s*(?:\*\*[^*]+:\*\*\s*)?\S+\s+\d+\s*[—–-]\s*)(.+?)(\s*)$/,
};

const plain = (title: string): string => title.replace(/\*\*/g, "").trim();

/**
 * Edición que cambia solo el texto del título en la primera línea de `block`: conserva el nivel del
 * header, la palabra y el número de la tarea y el guion.
 * @param current título que el parser leyó, para comprobar que se está reemplazando el correcto
 * @throws CliError la línea no tiene la forma esperada
 */
export function titleEdit(text: string, block: Span, shape: TitleShape, current: string, next: string): Edit {
  const newline = text.indexOf("\n", block.start);
  const end = newline === -1 || newline > block.end ? block.end : newline;
  const match = text.slice(block.start, end).match(TITLE_RE[shape]);
  if (!match || plain(match[2]) !== plain(current)) {
    throw new CliError(`No reconozco la línea del título de «${current}» (${text.slice(block.start, end).trim().slice(0, 80)}): cámbiala a mano. No se escribió nada.`);
  }
  const start = block.start + match[1].length;
  return replaceRange({ start, end: start + match[2].length }, next);
}

// ---------------------------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------------------------

/** Cómo agregar un campo que la tarea no tiene: recibe el campo ya renderizado y devuelve la edición. */
export type Placement = (rendered: string) => Edit;

/** Los campos que se editan por su tipo, con su texto nuevo. */
export type FieldValues = Partial<Record<"description" | "decisions" | "blockers" | "trigger" | "details", string>>;

const FIELD_ORDER: Array<keyof FieldValues> = ["description", "decisions", "blockers", "trigger", "details"];

/**
 * Dónde va un campo nuevo en una tarea de backlog.md o team-backlog.md: antes del campo `Agregada`
 * si lo tiene; si no, tras el último campo (o al final del bloque si no tiene ninguno).
 * @param block rango del bloque sin líneas en blanco de los extremos (`trimRange`)
 */
export function backlogPlacement(text: string, block: Span, fields: Field[]): Placement {
  const added = findFieldOfKind(fields, "added");
  if (added?.range) {
    const at = trimRange(text, added.range).start;
    return (rendered) => insertAt(at, `${rendered}\n`);
  }
  const last = fields[fields.length - 1];
  if (last?.range) {
    const at = trimRange(text, last.range).end;
    return (rendered) => insertAt(at, `\n${rendered}`);
  }
  return (rendered) => insertAt(block.end, `\n\n${rendered}`);
}

/**
 * Dónde va un campo nuevo en una tarea pausada: tras los campos que preceden a los del avance
 * (descripción, `Detalles`, `Origen`...), que es donde los deja `pause`; si no hay ninguno, justo
 * tras el header.
 * @param headerEnd offset del fin de la línea del header
 */
export function pausedPlacement(text: string, headerEnd: number, fields: Field[]): Placement {
  const leading: Field[] = [];
  for (const field of fields) {
    if (partOf(field.label) !== null) break;
    leading.push(field);
  }
  const last = leading[leading.length - 1];
  if (last?.range) {
    const at = trimRange(text, last.range).end;
    return (rendered) => insertAt(at, `\n${rendered}`);
  }
  return (rendered) => insertAt(headerEnd, `\n\n${rendered}`);
}

/** Reemplaza el campo del tipo `kind` (con su etiqueta, la traducida del archivo) o, si falta, lo agrega con `label`. */
export function setField(text: string, fields: Field[], kind: FieldKind, label: string, value: string, place: Placement): Edit {
  const field = findFieldOfKind(fields, kind);
  if (field?.range) return replaceRange(trimRange(text, field.range), renderField(field.label, value));
  return place(renderField(label, value));
}

/** Las ediciones de los campos de `values` (en el orden de la plantilla). `label` da la etiqueta de un campo que hay que agregar. */
export function fieldEdits(text: string, fields: Field[], values: FieldValues, label: (kind: FieldKind) => string, place: Placement): Edit[] {
  return FIELD_ORDER.flatMap((kind) => {
    const value = values[kind];
    return value === undefined ? [] : [setField(text, fields, kind, label(kind), value, place)];
  });
}

/** El campo de la lista cuya etiqueta es esa parte del avance (`Qué falta`, `Decisiones a medio camino`, `Próximo paso concreto`). */
export function findPartField(fields: Field[], part: "missing" | "decisions" | "next"): Field | undefined {
  return fields.find((field) => partOf(field.label) === part);
}

/**
 * Falla si el valor de un campo de una tarea de backlog empieza con un tag `[...]`: `blockInfo` toma
 * el primer campo cuyo valor empieza así como tag de bloqueo, así que ese texto cambiaría el estado
 * que lee el parser. (Un link `[texto](url)` no cuenta.) `Bloqueos` queda fuera: su tag es el estado.
 * @throws CliError el valor empieza con un tag entre corchetes
 */
export function rejectLeadingTag(flag: string, value: string): void {
  if (!LEADING_TAG_RE.test(value)) return;
  throw new CliError(
    `--${flag}: un valor que empieza con un tag entre corchetes («${value.trim().slice(0, 40)}») se leería como tag de bloqueo de la tarea y cambiaría su estado; empieza el texto de otra forma (usa \`block\` para bloquear, o \`--blocker\` para el campo Bloqueos). No se escribió nada.`,
  );
}

const STRUCTURAL_LINE_RE = /^\s*(?:#|[-*]\s+\[[ xX]\])/;

/**
 * Falla si alguna línea del valor, que se escribe tal cual bajo «Tarea en progreso» o en un campo
 * de una tarea pausada, crearía una subsección (`#`) o un paso de plan (`- [ ]`, `- [x]`, `* [ ]`).
 * @throws CliError una línea empieza con `#` o con un checkbox
 */
export function rejectStructuralLines(flag: string, value: string): void {
  const line = value.split(/\r\n?|\n/).find((candidate) => STRUCTURAL_LINE_RE.test(candidate));
  if (line === undefined) return;
  throw new CliError(
    `--${flag}: la línea «${line.trim().slice(0, 40)}» empieza con \`#\` o con un checkbox y, en «Tarea en progreso» o en una tarea pausada, crearía una subsección o un paso del plan (los pasos son de \`step\`); reescríbela sin ese inicio. No se escribió nada.`,
  );
}

// ---------------------------------------------------------------------------------------------
// Bloqueos
// ---------------------------------------------------------------------------------------------

const RESOLVED_TAG_RE = /(`?)\[(?:resuelto|resolved)\b[^\]\n]*\]\1(?!\()/i;

/** El historial resuelto (`[Resuelto ...] — era ...`) que sigue al bloqueo vigente en el valor de `Bloqueos`, o `null` si no hay. */
function resolvedHistory(body: string): string | null {
  const lead = body.match(LEADING_TAG_RE);
  const rest = lead ? body.slice(lead[0].length) : body;
  const found = rest.match(RESOLVED_TAG_RE);
  if (found?.index === undefined) return null;
  // Una etiqueta como «Antes:» pegada al historial viaja con él.
  const label = rest.slice(0, found.index).match(/[^\s.]+:\s*$/);
  return rest.slice(found.index - (label?.[0].length ?? 0));
}

const RESOLVED_LEAD_RE = /^(resuelto|resolved)\b/i;

/** El historial resuelto que conserva `Bloqueos`: el campo entero si empieza con `[Resuelto ...]` (tarea ya desbloqueada) o lo que sigue al bloqueo vigente; `null` si no hay. */
function keptHistory(current: string | null): string | null {
  if (!current) return null;
  const lead = current.match(LEADING_TAG_RE);
  if (lead && RESOLVED_LEAD_RE.test(lead[2].trim())) return current.trim();
  return resolvedHistory(current);
}

/**
 * Falla si el valor empieza con un tag entre corchetes que no es de bloqueo ni `[Resuelto ...]`:
 * `blockInfo` lo leería como el tag de la tarea y el estado quedaría incoherente con su sección.
 * @throws CliError el valor empieza con un tag que no es de bloqueo ni de historial
 */
function rejectUnknownLeadingTag(value: string, tags?: Strings["tags"]): void {
  const lead = value.match(LEADING_TAG_RE);
  if (!lead) return;
  const tag = lead[2].trim();
  if (BLOCKING_TAGS.test(tag) || RESOLVED_LEAD_RE.test(tag)) return;
  throw new CliError(
    `--blocker: un valor que empieza con un tag entre corchetes («${value.trim().slice(0, 40)}») se leería como tag de la tarea y dejaría su estado incoherente; solo valen ${citeBlockingTags(tags, "/")} (en una bloqueada) o \`[Resuelto ...]\`. Quita los corchetes iniciales. No se escribió nada.`,
  );
}

/** El valor nuevo primero y el historial después (mismo formato que `blockedValue`); si el valor ya trae su propio `[Resuelto ...]`, no se duplica. */
function withHistory(value: string, history: string | null): string {
  if (!history || RESOLVED_TAG_RE.test(value)) return value;
  return `${value}${value.includes("\n") || history.includes("\n") ? "\n" : " "}${history}`;
}

export interface BlockerInput {
  /** Dónde está la tarea: en una sección de libres o de bloqueadas. */
  state: "free" | "blocked";
  /** Valor actual del campo `Bloqueos` (sin etiqueta), o `null` si falta. */
  current: string | null;
  /** Lo que se pidió escribir. */
  value: string;
  /** ¿El valor pedido bloquea (empieza con un tag `[dependencia]` / `[postergada]`)? */
  blocking: boolean;
  /** Los tags de bloqueo del idioma del archivo, si se conoce; sin ellos los mensajes citan los de ambos idiomas. */
  tags?: Strings["tags"];
  /** La tarea es del team-backlog.md (no hay `block` ni `unblock` para ella). */
  team: boolean;
}

/**
 * El valor con el que queda `Bloqueos` sin cambiar el estado de la tarea (el estado lo decide el
 * tag con el que empieza el campo; la sección tiene que coincidir con él):
 * - libre: el valor no puede bloquearla;
 * - bloqueada: un valor con tag bloqueante se respeta (puede pasar de `[dependencia]` a `[postergada]`);
 *   uno sin tag conserva el tag actual y reemplaza solo el motivo; uno que la desbloquea
 *   («Ninguno.», `[Resuelto ...]`) se rechaza;
 * - en ambas, un corchete inicial que no es tag de bloqueo ni `[Resuelto ...]` se rechaza (se leería
 *   como tag de la tarea).
 * En todos los casos el historial `[Resuelto ...]` que ya hubiera se conserva tras el valor nuevo
 * (Regla 8: no se borra), salvo que el valor pedido traiga el suyo.
 * @throws CliError el valor cambiaría el estado de la tarea (el mensaje dice con qué comando)
 */
export function resolveBlocker(input: BlockerInput): string {
  const { state, current, value, blocking, team, tags } = input;
  const move = (command: string, what: string) =>
    team ? `${what}: cambia su sección, y para el team-backlog.md no hay comando; hazlo a mano` : `${what}: usa \`${command}\``;

  if (state === "free") {
    if (blocking) throw new CliError(`Ese valor de Bloqueos bloquearía la tarea y edit no cambia su estado (${move("block <N> --tag <dependency|postponed> --reason <texto>", "para bloquearla")}). No se escribió nada.`);
    rejectUnknownLeadingTag(value, tags);
    return withHistory(value, keptHistory(current));
  }

  if (NONE_RE.test(value.trim())) {
    throw new CliError(`Ese valor de Bloqueos desbloquearía la tarea y edit no cambia su estado (${move("unblock <N>", "para desbloquearla")}). No se escribió nada.`);
  }
  if (LEADING_TAG_RE.test(value)) {
    if (blocking) return withHistory(value, keptHistory(current));
    rejectUnknownLeadingTag(value, tags);
    throw new CliError(
      `El valor de Bloqueos empieza con un tag que no es ${citeBlockingTags(tags, "ni")}: la tarea dejaría de estar bloqueada y edit no cambia su estado (${move("unblock <N>", "para desbloquearla")}). No se escribió nada.`,
    );
  }
  const tag = current ? blockInfo({ fields: [{ label: "Bloqueos", value: current }] }).tag : null;
  if (!tag || !BLOCKING_TAGS.test(tag)) {
    throw new CliError(
      `La tarea está en «bloqueadas / pospuestas» pero su campo Bloqueos no tiene un tag vigente que conservar: escribe el valor con ${citeBlockingTags(tags, "o")} al inicio. No se escribió nada.`,
    );
  }
  return blockedValue(tag, value, current ? resolvedHistory(current) : null);
}

// ---------------------------------------------------------------------------------------------
// «Tarea en progreso»
// ---------------------------------------------------------------------------------------------

/** Lo que hay entre la línea `Tarea N — título` y la primera subsección: la descripción y los campos `- **Campo:** valor`. */
export interface Preamble {
  /** Desde el inicio de su primera línea hasta el último carácter de la última; `null` si no hay. */
  description: Span | null;
  fields: Array<{ label: string; span: Span }>;
}

/**
 * Ubica la descripción y los campos extra del texto de `region` con las mismas reglas con que `pause`
 * los separa (un campo sigue en sus líneas indentadas; lo demás es descripción). Los comentarios HTML
 * no cuentan como texto.
 * @throws CliError la descripción está mezclada con campos o con comentarios: no se sabe qué reemplazar
 */
export function parsePreamble(text: string, region: Span): Preamble {
  const slice = text.slice(region.start, region.end);
  const comments = commentSpans(slice);

  const fields: Preamble["fields"] = [];
  let first = -1;
  let last = -1;
  for (const { kind, text: line, offset } of classifyPreamble(slice, { maskComments: true })) {
    const end = offset + line.trimEnd().length;
    if (kind === "field") {
      fields.push({ label: line.match(FIELD_START_RE)![1].trim(), span: { start: region.start + offset, end: region.start + end } });
    } else if (kind === "continuation") {
      fields[fields.length - 1].span.end = region.start + end;
    } else if (line.trim()) {
      if (first === -1) first = offset;
      last = end;
    }
  }
  if (first === -1) return { description: null, fields };

  const description = { start: region.start + first, end: region.start + last };
  const mixed = fields.some(({ span }) => span.start > description.start && span.start < description.end);
  const commented = comments.some(([from, to]) => region.start + from < description.end && region.start + to > description.start);
  if (mixed || commented) {
    throw new CliError("La descripción de «Tarea en progreso» está mezclada con campos o comentarios: no sé qué texto reemplazar; edítala a mano. No se escribió nada.");
  }
  return { description, fields };
}

/** Ediciones de la descripción y de `Detalles` de «Tarea en progreso». `taskEnd`: fin de la línea de la tarea. */
export function preambleEdits(
  preamble: Preamble,
  taskEnd: number,
  values: { description?: string; details?: string },
  detailsLabel: () => string,
): Edit[] {
  const edits: Edit[] = [];
  const { description, fields } = preamble;
  if (values.description !== undefined) {
    edits.push(description ? replaceRange(description, values.description) : insertAt(taskEnd, `\n\n${values.description}`));
  }
  if (values.details !== undefined) {
    const existing = fields.find(({ label }) => isFieldKind(label, "details"));
    if (existing) {
      edits.push(replaceRange(existing.span, renderField(existing.label, values.details)));
    } else {
      const rendered = renderField(detailsLabel(), values.details);
      const last = fields[fields.length - 1];
      if (last) edits.push(insertAt(last.span.end, `\n${rendered}`));
      else edits.push(insertAt(description?.end ?? taskEnd, `\n\n${rendered}`));
    }
  }
  return edits;
}

/** El texto de un campo existente tal como se lee (para comparar con lo pedido). */
export function currentFieldBody(text: string, fields: Field[], kind: FieldKind): string | null {
  const field = findFieldOfKind(fields, kind);
  if (!field || field.isPlaceholder) return null;
  return fieldBody(text, field) || null;
}
