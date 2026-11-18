// Filtro por etiqueta (`--label` de `list` y `next`): interpreta el flag y comprueba si una tarea
// trae todas las etiquetas pedidas. Funciones puras; las etiquetas de cada tarea las leen los
// helpers compartidos (`fieldLabels`/`entryLabels`).

import { invalidLabelChars, LABEL_RE } from "../../../_shared/tasks/labels.ts";
import { UsageError } from "../cli/errors.ts";
import type { FlagValue } from "../cli/types.ts";

/**
 * Interpreta el valor de `--label` (el flag se repite y cada valor puede traer varias etiquetas
 * separadas por comas), con un `#` inicial opcional por etiqueta (se quita). Sin repetidos
 * (sin distinguir mayúsculas), con la primera forma escrita y en el orden pedido.
 * @returns `null` si el flag no se pasó
 * @throws UsageError un valor vacío o una etiqueta con algo que no es una letra ASCII ni un número
 */
export function parseLabelFilter(value: FlagValue): string[] | null {
  if (value === undefined) return null;
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  if (!values.length) throw new UsageError("--label necesita al menos una etiqueta (ej. `--label trabajo,#empresa1`).");
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of values.flatMap((item) => item.split(","))) {
    const token = raw.trim();
    if (!token) throw new UsageError("--label trae un valor vacío: pasa etiquetas separadas por comas (ej. `--label trabajo,#empresa1`).");
    const label = token.startsWith("#") ? token.slice(1) : token;
    if (!label) throw new UsageError(`--label: la etiqueta «${token}» está vacía: tras el \`#\` va el nombre (ej. \`#trabajo\`).`);
    if (!LABEL_RE.test(label)) {
      const bad = invalidLabelChars(label).map((char) => `«${char}»`).join(", ");
      throw new UsageError(`--label: la etiqueta «${token}» no es válida (tiene ${bad}): solo admite letras ASCII y números, sin tildes, símbolos ni espacios (un \`#\` inicial es opcional).`);
    }
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    labels.push(label);
  }
  return labels;
}

/** `true` si `labels` trae todas las etiquetas de `wanted` (sin distinguir mayúsculas); sin filtro (`null`), siempre. */
export function hasLabels(labels: string[], wanted: string[] | null): boolean {
  if (!wanted) return true;
  const have = new Set(labels.map((label) => label.toLowerCase()));
  return wanted.every((label) => have.has(label.toLowerCase()));
}

/** Las etiquetas con su `#`, separadas por un espacio (`#a #b`). */
export function hashLabels(labels: string[]): string {
  return labels.map((label) => `#${label}`).join(" ");
}
