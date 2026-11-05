// Lectura de campos de texto de una tarea (`- **Campo:** valor`), compartida por task-manager y
// task-tracker: qué línea abre un campo, qué etiqueta es la descripción, qué texto significa «nada» y
// cómo se separa el texto previo a las subsecciones de «Tarea en progreso». Funciones puras sobre strings.

import { commentSpans, stripComments } from "./markdown.ts";

/**
 * Línea que abre un campo: `- **Campo:** valor` o `- **Campo**: valor`. El grupo 1 es la etiqueta
 * (sin recortar); quien solo necesita saber si la línea abre un campo la usa con `.test`.
 */
export const FIELD_START_RE = /^[-*]\s+\*\*(.+?)(?::\*\*|\*\*:)/;

// La misma línea completa, armada desde FIELD_START_RE: grupo 1 = lo que va antes del valor (con su espacio), 2 = etiqueta, 3 = valor.
const FIELD_LINE_RE = new RegExp(`^(${FIELD_START_RE.source.slice(1)}\\s*)(.*)$`);

/**
 * Etiqueta del campo de la descripción (`Descripción` / `Description`). Replica la etiqueta
 * `description` de los idiomas que reconoce task-manager (`STRINGS.*.fields.description`); `language.ts` de task-manager la toma de acá.
 */
export const DESCRIPTION_LABEL_RE = /^(descripci[oó]n|description)$/i;

/** Texto que significa «nada» en una tarea (`Ninguno.`, `Ningunas`, `None`, `N/A`...). */
export const NONE_RE = /^(ningun[ao]s?|none|n\/a)\.?$/i;

// Línea `Origen: …` / `Origin: …` suelta (sin viñeta).
const ORIGIN_LINE_RE = /^\**(?:Origen|Origin)\**:/i;

/** Qué es una línea del texto previo a las subsecciones: texto libre (o línea en blanco), apertura de un campo o continuación de uno. */
export type PreambleLineKind = "text" | "field" | "continuation";

export interface PreambleLine {
  kind: PreambleLineKind;
  /** La línea tal como está escrita (con su sangría y espacios finales). */
  text: string;
  /** Posición del inicio de la línea en el texto analizado (con `maskComments`, el texto original). */
  offset: number;
}

/**
 * Clasifica las líneas del texto entre la línea `Tarea N — título` y la primera subsección, sin sus
 * comentarios HTML. Un campo abre con `- **Campo:** valor` y sigue en las líneas indentadas que lo
 * continúan; lo demás es texto libre (incluidas las líneas en blanco, que no cortan un campo).
 * @param looseOrigin una línea `Origen: …` suelta, sin viñeta, también abre un campo
 * @param maskComments en vez de quitar los comentarios, los reemplaza por espacios (conserva los saltos de
 *   línea): las posiciones y las líneas coinciden con las del texto original, aunque la línea de un comentario queda en blanco
 */
export function classifyPreamble(
  text: string,
  { looseOrigin = false, maskComments = false }: { looseOrigin?: boolean; maskComments?: boolean } = {},
): PreambleLine[] {
  let inField = false;
  let offset = 0;
  const clean = maskComments ? commentSpans(text).reduce((out, [from, to]) => out.slice(0, from) + out.slice(from, to).replace(/[^\n]/g, " ") + out.slice(to), text) : stripComments(text);
  return clean.split("\n").map((line): PreambleLine => {
    const start = offset;
    offset += line.length + 1;
    if (FIELD_START_RE.test(line) || (looseOrigin && ORIGIN_LINE_RE.test(line.trim()))) {
      inField = true;
      return { kind: "field", text: line, offset: start };
    }
    if (inField && /^\s+\S/.test(line)) return { kind: "continuation", text: line, offset: start };
    if (line.trim()) inField = false;
    return { kind: "text", text: line, offset: start };
  });
}

/** Una línea de campo `- **Etiqueta:** valor`: lo que va antes del valor (con su espacio), la etiqueta (sin recortar) y el valor (sin recortar), o `null` si no abre un campo. */
export function matchFieldLine(line: string): { prefix: string; label: string; value: string } | null {
  const match = line.match(FIELD_LINE_RE);
  return match ? { prefix: match[1], label: match[2], value: match[3] } : null;
}
