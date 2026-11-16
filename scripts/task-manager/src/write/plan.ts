// Lo que comparten `step` y `plan` del «Plan» de la tarea en curso: cómo se resuelve «qué paso es» y
// cómo se ponen al día «Qué falta» y «Próximo paso concreto» (Regla 7 de rules.md) cuando cambian
// los pasos pendientes. Esos dos textos se reescriben solos únicamente si siguen con el que dejó el
// script (el de `start` o el que se generó antes); un texto que alguien escribió no se toca.

import type { PlanStep, Range, Subsection } from "../../../_shared/types.ts";
import { CliError } from "../cli/errors.ts";
import type { Edit } from "../edit/edits.ts";
import { replaceSubsectionBody } from "../edit/layout.ts";
import { normalizeTitle } from "../query/find.ts";
import { findPart } from "./handoff.ts";
import { STRINGS, type Strings } from "./language.ts";
import { stepBase } from "./suffix.ts";

/** El rango del texto de un paso en su línea (lo que sigue al `- [ ] `), para reemplazarlo. @param text handoff.md (LF) */
export function stepTextRange(text: string, step: PlanStep): Pick<Range, "start" | "end"> {
  const { start, end } = step.range!;
  const prefix = text.slice(start, end).match(/^\s*[-*]\s+\[[ xX]\]\s+/)![0];
  return { start: start + prefix.length, end };
}

/**
 * Qué paso es el que se pidió: un número (posición, desde 1) o parte del texto del paso. El texto
 * se busca sin sufijos (`stepBase`): ni el motivo de reabierto ni la evidencia y el commit son parte del nombre del paso.
 */
export function resolveStep(arg: string, steps: PlanStep[]): number {
  const wanted = arg.trim();
  if (/^\d+$/.test(wanted)) {
    const index = Number(wanted);
    if (index < 1 || index > steps.length) throw new CliError(`El plan tiene ${steps.length} pasos: no existe el paso ${index}. No se escribió nada.`);
    return index - 1;
  }
  const query = normalizeTitle(wanted);
  const exact = steps.flatMap((step, i) => (normalizeTitle(stepBase(step.text, step.done)) === query ? [i] : []));
  const found = exact.length ? exact : steps.flatMap((step, i) => (query && normalizeTitle(stepBase(step.text, step.done)).includes(query) ? [i] : []));
  if (!found.length) throw new CliError(`Ningún paso del plan tiene «${wanted}» en su texto. Usa el número del paso (1 a ${steps.length}). No se escribió nada.`);
  if (found.length > 1) {
    throw new CliError(`«${wanted}» coincide con ${found.length} pasos; usa su número:\n${found.map((i) => `  ${i + 1}. ${stepBase(steps[i].text, steps[i].done)}`).join("\n")}\nNo se escribió nada.`);
  }
  return found[0];
}

type Part = "missing" | "next";

/** Los textos que el script escribe solo (y por lo tanto reconoce como suyos) según los pasos pendientes. */
function generated(S: Strings, pending: string[]): Record<Part, string> {
  return {
    missing: pending.length ? `${S.pendingSteps}\n${pending.map((text) => `- ${text}`).join("\n")}` : S.allDone,
    next: pending[0] ?? S.planDone,
  };
}

/** Los textos por defecto de la plantilla (de `start`), en todos los idiomas conocidos. */
function defaults(part: Part): string[] {
  return Object.values(STRINGS).flatMap((strings) => (part === "missing" ? [strings.missingWithPlan, strings.missingNoPlan] : [strings.nextNoPlan]));
}

/** Una subsección que no se puso al día porque tiene un texto que alguien escribió. */
export interface StaleText {
  label: string;
  /** El comando que la cambia a mano (`edit N --missing`). */
  command: string;
}

/** Aviso de un texto propio que no se tocó, tal como lo dicen `step` y `plan`. */
export function staleNotice({ label, command }: StaleText): string {
  return `«${label}» tiene un texto propio y no lo toqué; si ya no vale, actualízalo con \`${command}\` (Regla 7).`;
}

/**
 * Las ediciones que ponen al día «Qué falta» y «Próximo paso concreto» cuando los pasos pendientes
 * pasan de `pendingBefore` a `pendingAfter`. Si no cambian, no hay nada que poner al día. Un texto
 * que no es el de `start` ni el generado para `pendingBefore` es propio: no se toca y se informa en `stale`.
 * @param text handoff.md (LF), el mismo que se parseó
 */
export function progressUpdates(opts: {
  text: string;
  subsections: Subsection[];
  S: Strings;
  taskNumber: number;
  pendingBefore: string[];
  pendingAfter: string[];
}): { edits: Edit[]; updated: string[]; stale: StaleText[] } {
  const { text, subsections, S, taskNumber, pendingBefore, pendingAfter } = opts;
  const edits: Edit[] = [];
  const updated: string[] = [];
  const stale: StaleText[] = [];
  if (pendingBefore.length === pendingAfter.length && pendingBefore.every((step, i) => step === pendingAfter[i])) return { edits, updated, stale };

  const before = generated(S, pendingBefore);
  const after = generated(S, pendingAfter);
  for (const part of ["missing", "next"] as const) {
    const sub = findPart(subsections, part);
    if (!sub) continue;
    // Sigue con el texto del script (el de `start` o el generado antes): se pone al día.
    const current = sub.body.trim();
    if (current !== before[part] && !defaults(part).includes(current)) {
      stale.push({ label: sub.title, command: `edit ${taskNumber} --${part}` });
      continue;
    }
    if (current === after[part]) continue;
    edits.push(replaceSubsectionBody(text, sub.range!, after[part]));
    updated.push(sub.title);
  }
  return { edits, updated, stale };
}
