// Los sufijos de un paso del plan, al final de su línea (Regla 7 de rules.md): ` (reabierto: <motivo>)`
// cuando un paso se reabre, y `· <evidencia> · commit <hash>` cuando se marca como hecho. Funciones
// puras sobre el texto de un paso (`PlanStep.text`, sin el checkbox): separan el texto base de los
// sufijos, los quitan o los ponen. `step`, `plan` y los textos generados de «Qué falta» y «Próximo
// paso concreto» trabajan con `stepBase`.
//
// Forma de la línea, siempre en este orden: `texto · evidencia · commit <hash>` (si falta uno de los
// dos, se omite su tramo). El separador es ` · ` (espacio, U+00B7, espacio) y la etiqueta `commit` es
// la misma en todos los idiomas. Para no romper un texto que lleva ` · ` por su cuenta, la evidencia
// se reconoce solo en estos casos:
//   - la línea termina en `· commit <7 a 40 hex>`: lo que va antes, tras el último ` · `, es la evidencia;
//   - el paso está hecho: el último tramo tras ` · ` es la evidencia.
// En un paso pendiente sin commit, ` · ` es parte del texto.

import { STRINGS, type Strings } from "./language.ts";

/** El separador de los tramos de evidencia y commit. */
export const PROOF_SEPARATOR = " · ";

/** El texto de un paso separado en el texto propio del paso y sus sufijos. */
export interface StepText {
  /** El texto del paso sin sufijos. */
  base: string;
  /** El motivo de `(reabierto: <motivo>)`, si el paso lo trae. */
  reopened?: string;
  /** La evidencia de `· <evidencia>`, si el paso la trae. */
  evidence?: string;
  /** El hash de `· commit <hash>` (7 a 40 hex, en minúsculas), si el paso lo trae. */
  commit?: string;
}

// `... · commit <hash>` al final: el hash son 7 a 40 hex.
const COMMIT_RE = /^(.+) · commit ([0-9a-f]{7,40})$/i;

/** ¿Es `value` un hash de commit válido (7 a 40 hex)? */
export function isCommitHash(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value);
}

/** Los comienzos del sufijo en cada idioma conocido (`(reabierto: `, `(reopened: `): se reconocen todos al leer. */
function reopenedMarkers(): string[] {
  return [...new Set(Object.values(STRINGS).map((strings) => `(${strings.reopened}: `))];
}

/** ¿El texto trae el comienzo de un sufijo de reabierto (en cualquier idioma)? No puede ir dentro de un motivo. */
export function hasReopenedMarker(text: string): boolean {
  return reopenedMarkers().some((marker) => text.includes(marker));
}

/** Quita el sufijo de reabierto del final de `text` (ya sin espacios finales), si lo trae. */
function takeReopened(text: string): { base: string; reopened: string } | null {
  if (!text.endsWith(")")) return null;
  let at = -1;
  let length = 0;
  for (const marker of reopenedMarkers()) {
    const found = text.lastIndexOf(marker);
    if (found > at) {
      at = found;
      length = marker.length;
    }
  }
  if (at < 1 || !/\s/.test(text[at - 1])) return null;
  const base = text.slice(0, at).trimEnd();
  const reopened = text.slice(at + length, -1).trim();
  return base && reopened ? { base, reopened } : null;
}

/** Quita `· <evidencia>` y `· commit <hash>` del final de `text` (ya sin espacios finales), según la regla del encabezado. */
function takeProof(text: string, done: boolean): { base: string; evidence?: string; commit?: string } | null {
  const withCommit = COMMIT_RE.exec(text);
  const commit = withCommit?.[2].toLowerCase();
  const rest = withCommit ? withCommit[1].trimEnd() : text;
  if (!commit && !done) return null;
  const at = rest.lastIndexOf(PROOF_SEPARATOR);
  const base = at > 0 ? rest.slice(0, at).trimEnd() : "";
  const evidence = at > 0 ? rest.slice(at + PROOF_SEPARATOR.length).trim() : "";
  if (base && evidence) return { base, evidence, ...(commit ? { commit } : {}) };
  return commit && rest ? { base: rest, commit } : null;
}

/**
 * Separa el texto de un paso en `{ base, reopened?, evidence?, commit? }`, leyendo desde el final. El
 * sufijo de reabierto es el último `(reabierto: ` (o `(reopened: `) precedido por un espacio que cierra
 * con `)` al final del texto; el motivo puede llevar paréntesis. La evidencia y el commit siguen la
 * regla del encabezado; `done` dice si el paso está hecho (`[x]`), que es lo que hace leer como
 * evidencia el último ` · ` aunque no haya commit. Sin sufijos (o con alguno vacío), `base` es el texto tal cual.
 */
export function parseStepText(text: string, done = false): StepText {
  let rest = text.trimEnd();
  const parts: StepText = { base: text };
  for (;;) {
    const reopened = parts.reopened === undefined ? takeReopened(rest) : null;
    if (reopened) {
      parts.reopened = reopened.reopened;
      rest = reopened.base;
      continue;
    }
    const proof = parts.evidence === undefined && parts.commit === undefined ? takeProof(rest, done) : null;
    if (!proof) break;
    if (proof.evidence !== undefined) parts.evidence = proof.evidence;
    if (proof.commit !== undefined) parts.commit = proof.commit;
    rest = proof.base;
  }
  parts.base = rest === text.trimEnd() ? text : rest;
  // Sin ningún sufijo, el texto queda tal cual (con sus espacios finales, si los tenía).
  return parts;
}

/**
 * El texto de un paso a partir de sus partes: `base`, `base · evidencia`, `base · evidencia · commit hash`
 * y, si hay motivo, `... (reabierto: motivo)` al final.
 */
export function formatStepText(S: Pick<Strings, "reopened">, { base, reopened, evidence, commit }: StepText): string {
  const proof = `${evidence ? `${PROOF_SEPARATOR}${evidence}` : ""}${commit ? `${PROOF_SEPARATOR}commit ${commit}` : ""}`;
  return `${base}${proof}${reopened ? ` (${S.reopened}: ${reopened})` : ""}`;
}

/** El texto del paso sin sufijos: con él se busca el paso y se escriben «Qué falta» y «Próximo paso concreto». `done`: ver `parseStepText`. */
export function stepBase(text: string, done = false): string {
  return parseStepText(text, done).base;
}

/** El texto del paso con el sufijo de reabierto puesto (reemplaza el que traía) y sin evidencia ni commit: ya no valen. `done`: ver `parseStepText`. */
export function withReopened(S: Pick<Strings, "reopened">, text: string, reason: string, done = true): string {
  return formatStepText(S, { base: stepBase(text, done), reopened: reason });
}

/** El texto de un paso hecho que se reabre sin motivo: sin evidencia ni commit (ya no valen); sin ellos, el texto tal cual. */
export function withoutProof(S: Pick<Strings, "reopened">, text: string): string {
  const { base, reopened, evidence, commit } = parseStepText(text, true);
  return evidence === undefined && commit === undefined ? text : formatStepText(S, { base, reopened });
}

/**
 * El texto del paso con la evidencia y el commit puestos: los que se pasan reemplazan a los que traía y
 * el que no se pasa se conserva. El sufijo de reabierto se quita (el paso se marca como hecho). `done`:
 * si el paso está hecho antes del cambio (ver `parseStepText`).
 */
export function withProof(S: Pick<Strings, "reopened">, text: string, done: boolean, proof: { evidence?: string; commit?: string }): string {
  const { base, evidence, commit } = parseStepText(text, done);
  return formatStepText(S, { base, evidence: proof.evidence ?? evidence, commit: proof.commit ?? commit });
}
