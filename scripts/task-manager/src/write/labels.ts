// Etiquetas de una tarea (campo opcional `- **Etiquetas:** empresa1 trabajo`, `- **Tags:** ...` en un
// proyecto en inglés): la validación y normalización de `--labels` que comparten `add` y `edit`. Se
// guardan separadas por un espacio y sin `#`; cada una solo lleva letras ASCII y números.

import { invalidLabelChars, LABEL_RE } from "../../../_shared/tasks/labels.ts";
import { UsageError } from "../cli/errors.ts";

/**
 * Las etiquetas de un valor de `--labels`: separadas por espacios o comas, con un `#` inicial
 * opcional por etiqueta (se quita). Los duplicados se comparan sin distinguir mayúsculas y queda la
 * primera forma escrita; el orden se conserva. Un valor sin etiquetas (vacío o solo separadores)
 * da una lista vacía.
 * @param flag nombre del flag, para el mensaje de error
 * @throws UsageError una etiqueta tiene algo que no es una letra ASCII ni un número
 */
export function parseLabels(flag: string, value: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const token of value.split(/[\s,]+/)) {
    if (!token) continue;
    const label = token.startsWith("#") ? token.slice(1) : token;
    if (!label) {
      throw new UsageError(`--${flag}: la etiqueta «${token}» está vacía: tras el \`#\` va el nombre (ej. \`#trabajo\`). No se escribió nada.`);
    }
    if (!LABEL_RE.test(label)) {
      const bad = invalidLabelChars(label).map((char) => `«${char}»`).join(", ");
      throw new UsageError(
        `--${flag}: la etiqueta «${token}» no es válida (tiene ${bad}): solo admite letras ASCII y números, sin tildes, símbolos ni espacios (un \`#\` inicial es opcional). No se escribió nada.`,
      );
    }
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/** Valor del campo en el archivo: las etiquetas separadas por un espacio. */
export function formatLabels(labels: string[]): string {
  return labels.join(" ");
}
