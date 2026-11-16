// El sufijo de un paso del plan: ` (reabierto: <motivo>)` al final de su línea (Regla 7 de rules.md:
// un paso que se reabre dice por qué). Funciones puras sobre el texto de un paso (`PlanStep.text`, sin
// el checkbox): separan el texto base del sufijo, lo quitan o lo ponen. Está pensado para que otros
// sufijos del mismo texto (evidencia, commit) se sumen a `StepText` y a `parseStepText` /
// `formatStepText` sin reescribir a los que ya lo usan: `step`, `plan` y los textos generados de
// «Qué falta» y «Próximo paso concreto» trabajan con `stepBase`.

import { STRINGS, type Strings } from "./language.ts";

/** El texto de un paso separado en el texto propio del paso y sus sufijos. */
export interface StepText {
  /** El texto del paso sin sufijos. */
  base: string;
  /** El motivo de `(reabierto: <motivo>)`, si el paso lo trae. */
  reopened?: string;
}

/** Los comienzos del sufijo en cada idioma conocido (`(reabierto: `, `(reopened: `): se reconocen todos al leer. */
function reopenedMarkers(): string[] {
  return [...new Set(Object.values(STRINGS).map((strings) => `(${strings.reopened}: `))];
}

/** ¿El texto trae el comienzo de un sufijo de reabierto (en cualquier idioma)? No puede ir dentro de un motivo. */
export function hasReopenedMarker(text: string): boolean {
  return reopenedMarkers().some((marker) => text.includes(marker));
}

/**
 * Separa el texto de un paso en `{ base, reopened? }`. El sufijo es el último `(reabierto: ` (o
 * `(reopened: `) precedido por un espacio que cierra con `)` al final del texto; el motivo puede llevar
 * paréntesis. Sin sufijo (o con un motivo vacío), `base` es el texto tal cual.
 */
export function parseStepText(text: string): StepText {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(")")) return { base: text };
  let at = -1;
  let length = 0;
  for (const marker of reopenedMarkers()) {
    const found = trimmed.lastIndexOf(marker);
    if (found > at) {
      at = found;
      length = marker.length;
    }
  }
  if (at < 1 || !/\s/.test(trimmed[at - 1])) return { base: text };
  const base = trimmed.slice(0, at).trimEnd();
  const reopened = trimmed.slice(at + length, -1).trim();
  return base && reopened ? { base, reopened } : { base: text };
}

/** El texto de un paso a partir de sus partes: `base`, y `base (reabierto: motivo)` si hay motivo. */
export function formatStepText(S: Pick<Strings, "reopened">, { base, reopened }: StepText): string {
  return reopened ? `${base} (${S.reopened}: ${reopened})` : base;
}

/** El texto del paso sin sufijos: con él se busca el paso y se escriben «Qué falta» y «Próximo paso concreto». */
export function stepBase(text: string): string {
  return parseStepText(text).base;
}

/** El texto del paso con el sufijo de reabierto puesto (reemplaza el que traía). */
export function withReopened(S: Pick<Strings, "reopened">, text: string, reason: string): string {
  return formatStepText(S, { base: stepBase(text), reopened: reason });
}
