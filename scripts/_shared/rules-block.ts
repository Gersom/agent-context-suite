// El bloque de la suite en rules.md: la sección delimitada que enseña al agente a usar las
// herramientas (`acsuite init` la escribe y `acsuite check` avisa si falta). Código puro, sin E/S:
// recibe el texto de rules.md en LF y devuelve el texto nuevo. Las reglas fijas de rules.md no se tocan;
// el bloque va al inicio del archivo, después del título y antes del primer encabezado `## ` (sin depender
// de ningún texto del idioma del proyecto).

import { commentStateAfter } from "./parse/markdown.ts";
import { FENCE_RE, H2_RE } from "./parse/sections.ts";

export const SUITE_BLOCK_START = "<!-- agent-context-suite:start -->";
export const SUITE_BLOCK_END = "<!-- agent-context-suite:end -->";

/** El bloque completo, con sus marcas (sin salto de línea final). */
export const SUITE_BLOCK = `${SUITE_BLOCK_START}
### Herramientas de la suite

Este proyecto usa [agent-context-suite](https://github.com/Gersom/agent-context-suite). No edites a mano \`handoff.md\`, \`backlog.md\` ni \`history.md\`: usa \`acsuite task\` (el detalle: \`acsuite task --help\`). El modo del plan se fija al empezar la tarea con \`acsuite task start <N> --plan - --mode <guided|step-by-step|auto|extreme>\` y se cambia con \`acsuite task mode <modo>\`. Las etiquetas de una tarea van con \`--labels\` en \`add\` y \`edit\` (de 1 a 3, cortas, por tema o repo), y se filtran con \`--label\` en \`list\` y \`next\`. Para verificar la documentación, \`acsuite check\`; para ver el tablero, \`acsuite board\`.
${SUITE_BLOCK_END}`;

export type RulesBlockAction = "inserted" | "updated" | "unchanged";

/** El bloque no se puede escribir sin adivinar (marcas incompletas, repetidas o invertidas). El mensaje es para el operador. */
export class RulesBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesBlockError";
  }
}

interface Scan {
  lines: string[];
  /** Líneas (0-based) de las marcas de inicio y de cierre. */
  starts: number[];
  ends: number[];
  /** Línea (0-based) del primer encabezado `## `, o `null` si no hay ninguno. */
  firstH2: number | null;
}

/** Recorre el texto ignorando bloques de código y comentarios HTML (lo que contienen no cuenta). */
function scan(text: string): Scan {
  const lines = text.split("\n");
  const result: Scan = { lines, starts: [], ends: [], firstH2: null };
  let inComment = false;
  let inFence = false;
  lines.forEach((line, i) => {
    const startsInComment = inComment;
    inComment = commentStateAfter(line, inComment);
    if (startsInComment) return;
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const trimmed = line.trim();
    if (trimmed === SUITE_BLOCK_START) result.starts.push(i);
    else if (trimmed === SUITE_BLOCK_END) result.ends.push(i);
    else if (result.firstH2 === null && H2_RE.test(line)) result.firstH2 = i;
  });
  return result;
}

/** `true` si el texto tiene el bloque: la marca de inicio y, después, la de cierre. No mira el contenido. */
export function hasSuiteBlock(text: string): boolean {
  const { starts, ends } = scan(text);
  return starts.length > 0 && ends.some((end) => end > starts[0]);
}

/** Mensaje del problema con las marcas, o `null` si hay exactamente una de cada una y en orden. */
function marksProblem({ starts, ends }: Scan): string | null {
  const both = `${SUITE_BLOCK_START} y ${SUITE_BLOCK_END}`;
  if (starts.length === 1 && ends.length === 1) {
    return starts[0] < ends[0] ? null : `La marca de cierre ${SUITE_BLOCK_END} está antes que la de inicio ${SUITE_BLOCK_START}.`;
  }
  if (starts.length === 1 && ends.length === 0) return `Falta la marca de cierre ${SUITE_BLOCK_END} (la de inicio está en la línea ${starts[0] + 1}).`;
  if (starts.length === 0 && ends.length === 1) return `Falta la marca de inicio ${SUITE_BLOCK_START} (la de cierre está en la línea ${ends[0] + 1}).`;
  return `Hay ${starts.length} marca(s) de inicio y ${ends.length} de cierre; tiene que haber una sola de cada una (${both}).`;
}

/**
 * Deja el bloque de la suite en `text`: lo reemplaza in situ si ya está y difiere, o lo inserta después
 * del título y antes del primer `## ` (si no hay ninguno, al final). No escribe nada: devuelve el texto
 * nuevo y qué hizo.
 * @param text contenido de rules.md con saltos de línea LF
 * @throws RulesBlockError marcas incompletas, repetidas o invertidas
 */
export function upsertSuiteBlock(text: string): { text: string; action: RulesBlockAction } {
  const found = scan(text);
  const { lines, starts, ends, firstH2 } = found;

  if (starts.length || ends.length) {
    const problem = marksProblem(found);
    if (problem) {
      throw new RulesBlockError(`${problem} No sé qué parte de rules.md es el bloque: arréglalo a mano (deja una sola marca de cada tipo, o bórralas) y vuelve a intentarlo.`);
    }
    const current = lines.slice(starts[0], ends[0] + 1).join("\n");
    if (current === SUITE_BLOCK) return { text, action: "unchanged" };
    const next = [...lines.slice(0, starts[0]), ...SUITE_BLOCK.split("\n"), ...lines.slice(ends[0] + 1)];
    return { text: next.join("\n"), action: "updated" };
  }

  const block = SUITE_BLOCK.split("\n");
  if (firstH2 !== null) {
    const head = lines.slice(0, firstH2);
    const next = [...head, ...(head.length && head[head.length - 1].trim() !== "" ? [""] : []), ...block, "", ...lines.slice(firstH2)];
    return { text: next.join("\n"), action: "inserted" };
  }
  // Sin ningún `## `: al final, conservando el salto de línea final si lo había.
  const endsWithNewline = lines[lines.length - 1] === "";
  const body = endsWithNewline ? lines.slice(0, -1) : lines;
  const next = [...body, ...(body.length && body[body.length - 1].trim() !== "" ? [""] : []), ...block, ...(endsWithNewline ? [""] : [])];
  return { text: next.join("\n"), action: "inserted" };
}
