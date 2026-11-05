// Cómo se lee y se valida «Tarea en progreso» de handoff.md para los comandos que la cambian
// (`step`, `pause`, `resume`): las subsecciones se reconocen por su título en español o inglés, y lo
// que no se reconoce se rechaza con un error en vez de reescribirse o perderse.

import { commentSpans, stripComments } from "../../../_shared/parse/markdown.ts";
import {
  CHECKBOX_ANY_RE,
  EXECUTION_MODES,
  type ExecutionMode,
  type HandoffPart,
  isExecutionMode,
  type ModeLine,
  modeLines,
  parseModeLine,
  partOf,
  planSubsections,
} from "../../../_shared/parse/plan-mode.ts";
import type { ParsedHandoff, PlanStep, Section, Subsection } from "../../../_shared/types.ts";
import { CliError, UsageError } from "../cli/errors.ts";
import type { Doc } from "../workspace/docs.ts";
import { detectLanguage, type Lang, NONE_RE, STRINGS } from "./language.ts";

// La lectura del modo de ejecución y de las partes del handoff vive en _shared (la usa también task-tracker).
export { EXECUTION_MODES, type ExecutionMode, type HandoffPart, isExecutionMode, type ModeLine, modeLines, partOf };

/** La subsección de esa parte, si la hay. */
export function findPart(subsections: Subsection[], part: HandoffPart): Subsection | undefined {
  return subsections.find((sub) => partOf(sub.title) === part);
}

/**
 * La sección «Tarea en progreso» si está libre para escribir una tarea ahí: sin tarea en curso y
 * sin contenido que no sea «Sin tarea en curso».
 * @param next qué se iba a hacer, para el mensaje (`empezar otra`, `retomar otra`)
 * @throws CliError hay una tarea en curso, falta la sección o tiene contenido ajeno
 */
export function requireFreeInProgress(handoff: Doc<ParsedHandoff>, next: string): Section {
  const current = handoff.parsed.inProgress.task;
  if (current) {
    throw new CliError(
      `Ya hay una tarea en curso (${current.label} ${current.number} — ${current.title}): pausa (\`pause\`) o cierra esa tarea antes de ${next}. No se escribió nada.`,
    );
  }
  const section = handoff.parsed.sections["in-progress"];
  if (!section) throw new CliError("handoff.md no tiene la sección «Tarea en progreso» (ancla `in-progress`). No se escribió nada.");
  const { steps, subsections } = handoff.parsed.inProgress;
  const lines = stripComments(handoff.text.slice(section.bodyRange.start, section.bodyRange.end)).split("\n").filter((line) => line.trim());
  if (steps.length || subsections.length || lines.length > 2) {
    throw new CliError(
      "«Tarea en progreso» de handoff.md tiene contenido que no es «Sin tarea en curso» (subsecciones o texto que no reconozco como una tarea): revísalo a mano; no lo sobrescribo. No se escribió nada.",
    );
  }
  return section;
}

/** Lo que `pause` necesita saber de la tarea en curso, ya validado. */
export interface CurrentParts {
  label: string;
  number: number;
  title: string;
  /** Texto entre la línea de la tarea y la primera subsección, sin sus campos `- **Campo:** valor`. */
  description: string | null;
  /** Esos campos (`Origen`, `Detalles`...) tal como están escritos. */
  extras: string[];
  /** Los checkboxes del plan, tal como están escritos (`- [x] paso`); `null` si la tarea no trae plan. */
  planLines: string[] | null;
  mode: string | null;
  missing: string | null;
  decisions: string | null;
  next: string | null;
  /** Desde el inicio de la línea de la tarea hasta el último carácter de la sección: lo que se reemplaza al pausar. */
  replace: { start: number; end: number };
}

const FIELD_START_RE = /^[-*]\s+\*\*.+?(?::\*\*|\*\*:)/;
const CHECKBOX_RE = /^\s*[-*]\s+\[[ xX]\]\s+/;

/** Qué es una línea del cuerpo de la subsección «Plan»: un paso, la línea de modo, un «nada» o texto que `close` y `pause` rechazan. */
export type PlanLine = { kind: "step" } | { kind: "mode"; value: string | null } | { kind: "none" } | { kind: "invalid" };

/** Clasifica una línea (ya sin sangría ni comentarios) del cuerpo de «Plan». */
export function classifyPlanLine(line: string): PlanLine {
  if (CHECKBOX_RE.test(line)) return { kind: "step" };
  const mode = parseModeLine(line);
  if (mode) return { kind: "mode", value: mode.value };
  if (NONE_RE.test(line) || /^no aplica\.?$/i.test(line)) return { kind: "none" };
  return { kind: "invalid" };
}

/**
 * El formato que acepta el plan, para citarlo en un mensaje: los pasos y la línea de modo con la
 * etiqueta del idioma (`Modo de ejecución acordado` / `Agreed execution mode`).
 */
export function planFormat(lang: Lang): string {
  const step = lang === "en" ? "Step N — text" : "Paso N — texto";
  const text = lang === "en" ? "<text>" : "<texto>";
  return `pasos \`- [ ] ${step}\` o \`- [x] ${step}\`, y la línea de modo \`**${STRINGS[lang].mode}:** ${text}\``;
}

/** Una línea del plan que `close` y `pause` rechazan. */
export interface InvalidPlanLine {
  /** La línea sin sangría. */
  text: string;
  /** Su número de línea en el archivo (1-based); `null` si la subsección no trae posiciones. */
  line: number | null;
}

/** La subsección del plan de la tarea en curso (la primera si hubiera varias; `inspectCurrent` rechaza las repetidas), si la hay. */
export function findPlan(subsections: Subsection[]): Subsection | undefined {
  return planSubsections(subsections)[0];
}

/** El modo que ya requiere confirmación explícita del operador (`--confirm`). */
const CONFIRMED_MODE: ExecutionMode = "extreme";

/**
 * Interpreta el modo que pide el operador (argumento de `mode` o `start --mode`).
 * @param confirmed se pasó `--confirm`; solo `extreme` lo exige (con los demás se ignora)
 * @throws UsageError no es uno de los cuatro modos, o es `extreme` sin `--confirm`
 */
export function parseExecutionMode(raw: string, confirmed: boolean): ExecutionMode {
  const value = raw.trim();
  if (!isExecutionMode(value)) {
    throw new UsageError(`«${value}» no es un modo de ejecución válido: usa ${EXECUTION_MODES.map((mode) => `\`${mode}\``).join(", ")}.`);
  }
  if (value === CONFIRMED_MODE && !confirmed) {
    throw new UsageError(
      `El modo \`${CONFIRMED_MODE}\` exige --confirm: antes, el agente debe confirmar con el operador en el chat que quiere ese modo (la herramienta no puede comprobarlo); luego repite el comando con --confirm. No se escribió nada.`,
    );
  }
  return value;
}

/**
 * Las líneas del plan de «Tarea en progreso» que `close` y `pause` rechazarían (ni paso, ni línea de
 * modo, ni «ninguno»/«no aplica»), con su número de línea. Pura: no valida nada más del handoff.
 * @param text handoff.md completo, el mismo que se parseó (para ubicar las líneas)
 */
export function invalidPlanLines(text: string, subsections: Subsection[]): InvalidPlanLine[] {
  return planSubsections(subsections).flatMap((sub): InvalidPlanLine[] => {
    if (!sub.range) {
      return sub.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && classifyPlanLine(l).kind === "invalid")
        .map((l) => ({ text: l, line: null }));
    }
    // Los comentarios se vacían sin quitar sus saltos de línea, para que cada línea conserve su número.
    const raw = text.slice(sub.range.start, sub.range.end);
    let clean = "";
    let at = 0;
    for (const [from, to] of commentSpans(raw)) {
      clean += raw.slice(at, from) + raw.slice(from, to).replace(/[^\n]/g, "");
      at = to;
    }
    clean += raw.slice(at);
    const found: InvalidPlanLine[] = [];
    clean.split("\n").forEach((l, i) => {
      const line = l.trim();
      // La línea 0 es el `### Plan`.
      if (i > 0 && line && classifyPlanLine(line).kind === "invalid") found.push({ text: line, line: sub.range!.startLine + i });
    });
    return found;
  });
}

/** Aviso (no bloquea) para `step`, `edit` y docs-check: una línea del plan que `close` rechazaría, con el formato válido. */
export function invalidPlanLineMessage(invalid: InvalidPlanLine, lang: Lang): string {
  const where = invalid.line === null ? "" : ` (línea ${invalid.line})`;
  return `El plan tiene una línea que no es un paso ni el modo de ejecución${where}: «${invalid.text.slice(0, 60)}»; \`close\` y \`pause\` la rechazarían. Formato válido: ${planFormat(lang)}.`;
}

/** Separa el texto previo a las subsecciones en descripción y campos `- **Campo:** valor` (con sus líneas de continuación). */
function splitPreamble(text: string): { description: string | null; extras: string[] } {
  const extras: string[] = [];
  const rest: string[] = [];
  let inField = false;
  for (const line of text.split("\n")) {
    if (FIELD_START_RE.test(line)) {
      extras.push(line.replace(/\s+$/, ""));
      inField = true;
    } else if (inField && /^\s+\S/.test(line)) {
      extras[extras.length - 1] += `\n${line.replace(/\s+$/, "")}`;
    } else {
      if (line.trim()) inField = false;
      rest.push(line);
    }
  }
  const description = rest.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { description: description || null, extras };
}

/**
 * Valida y descompone «Tarea en progreso» de una tarea en curso.
 * @throws CliError no hay tarea en curso, o la sección tiene algo que no reconozco (subsección con
 *   otro título, repetida, texto suelto en el plan...): hay que resolverlo a mano
 */
export function inspectCurrent(handoff: Doc<ParsedHandoff>, action: string): CurrentParts {
  const { task, steps, subsections } = handoff.parsed.inProgress;
  const section = handoff.parsed.sections["in-progress"];
  if (!task?.range || !section) throw new CliError(`No hay tarea en curso que ${action}: «Tarea en progreso» dice «Sin tarea en curso». No se escribió nada.`);
  const manual = (why: string) => new CliError(`No puedo ${action} la Tarea ${task.number}: ${why}. Revisa «Tarea en progreso» de handoff.md a mano. No se escribió nada.`);
  const text = handoff.text;

  const before = stripComments(text.slice(section.bodyRange.start, task.range.start));
  if (before.trim()) throw manual("hay texto antes de la línea `Tarea N — título`");

  const parts = new Map<HandoffPart, Subsection>();
  for (const sub of subsections) {
    const part = partOf(sub.title) ?? (CHECKBOX_ANY_RE.test(sub.body) ? "plan" : null);
    if (!part || part === "why" || part === "waits" || part === "mode") throw manual(`la subsección «${sub.title}» no es una de las conocidas (Plan, ${STRINGS.es.missing}, ${STRINGS.es.decisions}, ${STRINGS.es.next})`);
    if (parts.has(part)) throw manual(`la subsección «${sub.title}» está repetida`);
    parts.set(part, sub);
  }

  const plan = parts.get("plan");
  let mode: string | null = null;
  const planLines: string[] | null = plan ? [] : null;
  if (plan) {
    if (steps.some((step) => !step.range || step.range.start < plan.range!.start || step.range.end > plan.range!.end)) {
      throw manual("hay checkboxes fuera de la subsección del plan");
    }
    for (const line of plan.body.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const kind = classifyPlanLine(line);
      if (kind.kind === "step") planLines!.push(line);
      else if (kind.kind === "mode") mode = kind.value;
      else if (kind.kind === "invalid") {
        throw manual(`el plan tiene texto que no es un paso ni el modo de ejecución («${line.slice(0, 60)}»); formato válido: ${planFormat(detectLanguage([task.label]).lang)}`);
      }
    }
  } else if (steps.length) {
    throw manual("hay checkboxes fuera de la subsección del plan");
  }

  const firstSub = subsections[0]?.range?.start ?? section.bodyRange.end;
  const preamble = splitPreamble(stripComments(text.slice(task.range.end, firstSub)));
  const body = (part: HandoffPart) => parts.get(part)?.body.trim() || null;
  const end = section.bodyRange.start + text.slice(section.bodyRange.start, section.bodyRange.end).trimEnd().length;
  return {
    label: task.label,
    number: task.number,
    title: task.title,
    ...preamble,
    planLines: planLines?.length ? planLines : null,
    mode,
    missing: body("missing"),
    decisions: body("decisions"),
    next: body("next"),
    replace: { start: task.range.start, end },
  };
}

/** Texto de un paso del plan tal como está escrito en el archivo (su línea, sin sangría). */
export function stepLine(text: string, step: PlanStep): string {
  return text.slice(step.range!.start, step.range!.end).trim();
}
