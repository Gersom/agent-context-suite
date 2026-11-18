// Etiquetas de una tarea: el campo opcional `- **Etiquetas:** empresa1 trabajo` (`- **Tags:** ...` en un
// proyecto en inglés), con las etiquetas separadas por espacios y sin `#`. Lectura compartida por el
// parseo de history.md y el task-tracker. Funciones puras sobre strings.

import { commentSpans, isPlaceholder } from "../parse/markdown.ts";
import { matchFieldLine } from "../parse/text-fields.ts";
import type { Field } from "../types.ts";

const FENCE_RE = /^\s*(```|~~~)/;

/** Etiqueta del campo de las etiquetas, en español o inglés y sin distinguir mayúsculas. */
export const LABELS_FIELD_RE = /^(etiquetas|tags)$/i;

/**
 * Las etiquetas de un valor de campo: separadas por espacios (o comas), sin el `#` inicial si lo
 * traen. Un valor vacío o un placeholder de la plantilla no tiene etiquetas; «Ninguna» sí es una etiqueta.
 */
export function parseLabelsValue(value: string | null | undefined): string[] {
  if (!value || isPlaceholder(value)) return [];
  return value
    .split(/[\s,]+/)
    .map((token) => token.replace(/^#+/, ""))
    .filter(Boolean);
}

/** Las etiquetas del campo `Etiquetas`/`Tags` de una tarea (el último, si se repite); `[]` si no lo tiene. */
export function fieldLabels(fields: Pick<Field, "label" | "value">[]): string[] {
  return parseLabelsValue(fields.filter((field) => LABELS_FIELD_RE.test(field.label.trim())).at(-1)?.value);
}

/** Una etiqueta válida: solo letras ASCII y números. Es la regla de `--labels` (add/edit) y la de `acsuite check`. */
export const LABEL_RE = /^[A-Za-z0-9]+$/;

/** Los caracteres de una etiqueta que no son letra ASCII ni número, sin repetir y en el orden en que aparecen. */
export function invalidLabelChars(label: string): string[] {
  return [...new Set([...label].filter((char) => !/[A-Za-z0-9]/.test(char)))];
}

/** Un problema del valor de un campo de etiquetas, tal como está escrito (ver `labelProblems`). */
export type LabelProblem =
  /** `token` no es una etiqueta válida; `chars` son sus caracteres no válidos (un `#` o una coma entre ellos). */
  | { kind: "format"; token: string; chars: string[] }
  /** `token` repite, sin distinguir mayúsculas, la etiqueta `first` que ya estaba escrita antes. */
  | { kind: "duplicate"; token: string; first: string };

/**
 * Los problemas del valor crudo de un campo de etiquetas, sin corregir nada: lo que escribe a mano quien
 * edita el archivo y `parseLabels` (task-manager) normalizaría en silencio. Las etiquetas se separan por
 * espacios, así que un `#`, una coma o cualquier carácter que no sea letra ASCII o número queda dentro del
 * token y se reporta; los duplicados se comparan sin distinguir mayúsculas (ignorando `#` y comas). Un valor
 * vacío o un placeholder de la plantilla no tiene problemas; «Ninguna» es una etiqueta válida.
 */
export function labelProblems(value: string | null | undefined): LabelProblem[] {
  if (!value || isPlaceholder(value)) return [];
  const problems: LabelProblem[] = [];
  const seen = new Map<string, string>();
  for (const token of value.split(/\s+/).filter(Boolean)) {
    if (!LABEL_RE.test(token)) problems.push({ kind: "format", token, chars: invalidLabelChars(token) });
    const key = token.replace(/[#,]/g, "").toLowerCase();
    if (!key) continue;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, token);
    else problems.push({ kind: "duplicate", token, first });
  }
  return problems;
}

/** El campo de etiquetas de una entrada de history.md: su valor y su línea (0-based) dentro del texto analizado. */
export interface EntryLabelsField {
  value: string;
  line: number;
}

/**
 * Las etiquetas de una entrada de history.md, leídas solo en su primer bloque de campos: las líneas
 * `- **Campo:** valor` contiguas (con sus continuaciones sangradas) que siguen al header, como las escribe
 * el task-manager (`Origen`, `Etiquetas`, y después las viñetas del resumen). Las líneas en blanco previas
 * al bloque y los comentarios HTML se saltan; el bloque termina en la primera línea en blanco, línea que no
 * es de campo o bloque de código, y lo que viene después (como una viñeta `- **Etiquetas:** …` del resumen) no se mira.
 * Si el bloque repite el campo, vale el primero; sin el campo, `[]`.
 * @param body texto de la entrada después de su header (acepta CRLF)
 */
export function entryLabels(body: string): string[] {
  return parseLabelsValue(entryLabelsField(body)?.value);
}

/** El campo `Etiquetas`/`Tags` que lee `entryLabels` (con la línea donde está), o `null` si la entrada no lo trae. */
export function entryLabelsField(body: string): EntryLabelsField | null {
  // Los comentarios se tapan con espacios (conservan las líneas) para distinguir una línea que era solo un comentario de una en blanco.
  const masked = commentSpans(body).reduce((out, [from, to]) => out.slice(0, from) + out.slice(from, to).replace(/[^\n]/g, " ") + out.slice(to), body);
  const original = body.split("\n");
  let inBlock = false;
  for (const [i, line] of masked.split("\n").entries()) {
    if (!line.trim()) {
      if (original[i].trim() || !inBlock) continue; // solo un comentario, o blanco antes del bloque
      break;
    }
    if (FENCE_RE.test(line)) break;
    const field = matchFieldLine(line);
    if (field) {
      inBlock = true;
      if (LABELS_FIELD_RE.test(field.label.trim())) return { value: field.value, line: i };
    } else if (!inBlock || !/^\s+\S/.test(line)) break; // texto suelto, o fin del bloque; la sangría continúa el campo anterior
  }
  return null;
}
