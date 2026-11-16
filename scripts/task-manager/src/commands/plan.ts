// `plan [<N | T-N>]`: cambia los pasos del «Plan» de la tarea en curso (agregar, quitar, renombrar,
// mover o reemplazar la lista) sin editar handoff.md a mano. Una operación por invocación. El paso de
// cierre («Documentar cierre de tarea») siempre queda al final: no se quita, no se renombra, no se
// mueve y nada se coloca después de él. Pone al día «Qué falta» y «Próximo paso concreto» con la misma
// regla que `step` (un texto propio no se pisa). Sin `--apply` solo muestra el diff.

import type { PlanStep } from "../../../_shared/types.ts";
import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { deleteRange, type Edit, insertAt, replaceRange } from "../edit/edits.ts";
import { normalizeTitle, parseTarget } from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { textFlag } from "../write/flags.ts";
import { invalidPlanLineMessages, invalidPlanLines, structureProblemMessage, structureProblems } from "../write/handoff.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS, type Strings } from "../write/language.ts";
import { progressUpdates, resolveStep, staleNotice, stepTextRange } from "../write/plan.ts";
import { closingStepRe, parsePlan } from "../write/render.ts";
import { headerLabels } from "../write/samples.ts";
import { stepBase } from "../write/suffix.ts";

const OPERATIONS = ["add", "remove", "rename", "move", "set"] as const;
type Operation = (typeof OPERATIONS)[number];

/** Un paso del plan tal como queda: su texto y si está hecho. */
interface Item {
  text: string;
  done: boolean;
}

/** Lo que una operación calculó: las ediciones, cómo queda el plan y qué decir. */
interface Outcome {
  edits: Edit[];
  after: Item[];
  message: string;
  /** Avisos (no bloquean) propios de la operación. */
  notes: string[];
}

export const plan: Command = {
  name: "plan",
  summary: "Agrega, quita, renombra, mueve o reemplaza los pasos del plan de la tarea en curso; escribe con --apply",
  usage:
    "plan [<N | T-N>] --add <texto> [--at <pos>]   |   plan [<N>] --remove <paso>   |   plan [<N>] --rename <paso> <texto>   |   plan [<N>] --move <paso> --to <pos>   |   plan [<N>] --set -   [--json] [--apply]",
  writes: true,
  flags: {
    add: { type: "string", valueName: "texto", description: "Agrega el paso `- [ ] texto`: por defecto justo antes del paso de cierre." },
    at: { type: "string", valueName: "pos", description: "Con --add: posición (desde 1) del paso nuevo. Si cae después del paso de cierre, va justo antes." },
    remove: { type: "string", valueName: "paso", description: "Quita un paso (número o texto, como en `step`), también uno ya hecho. El paso de cierre no se quita." },
    rename: { type: "string", valueName: "paso", description: "Cambia todo el texto de un paso (número o texto), también su sufijo `(reabierto: …)`, por el argumento que sigue: `--rename 2 \"texto nuevo\"`. Conserva si está hecho. No aplica al paso de cierre." },
    move: { type: "string", valueName: "paso", description: "Mueve un paso (número o texto) a la posición de --to. El paso de cierre no se mueve ni nada pasa después de él." },
    to: { type: "string", valueName: "pos", description: "Con --move: posición (desde 1) en la que queda el paso." },
    set: {
      type: "string",
      valueName: "pasos",
      stdin: true,
      description: "Reemplaza todo el plan: un paso por línea (con `-`, de la entrada estándar). Los que ya existían (mismo texto) conservan su estado; el paso de cierre va al final y conserva el suyo.",
    },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    const chosen = OPERATIONS.filter((name) => typeof flags[name] === "string");
    if (chosen.length !== 1) {
      throw new UsageError(`Indica exactamente una operación: ${OPERATIONS.map((name) => `--${name}`).join(", ")}${chosen.length ? ` (pasaste ${chosen.map((name) => `--${name}`).join(" y ")})` : ""}.`);
    }
    const op: Operation = chosen[0];
    if (typeof flags.at === "string" && op !== "add") throw new UsageError("--at solo va con --add.");
    if (typeof flags.to === "string" && op !== "move") throw new UsageError("--to solo va con --move.");
    if (op === "move" && typeof flags.to !== "string") throw new UsageError("--move necesita --to <pos>.");

    // `--rename <paso> <texto>`: el texto es el último argumento; el anterior, si hay, es la tarea.
    const args = ctx.args;
    if (op === "rename" ? args.length < 1 || args.length > 2 : args.length > 1) {
      throw new UsageError(op === "rename" ? "Indica el texto nuevo: `plan [<N>] --rename <paso> <texto>`." : "`plan` recibe a lo sumo una tarea: `plan [<N | T-N>] --<operación>`.");
    }
    const taskArg = op === "rename" ? (args.length === 2 ? args[0] : undefined) : args[0];
    const wanted = taskArg === undefined ? null : parseTarget(taskArg);
    if (wanted?.kind === "title") throw new UsageError(`«${taskArg}» no es un número de tarea: \`plan [<N | T-N>]\`.`);
    if (wanted?.operator) throw new CliError(`plan solo modifica el plan de tu propia carpeta; «${taskArg}» es de otro operador (solo lectura). No se escribió nada.`);

    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");
    const { task, planSteps: steps, subsections } = handoff.parsed.inProgress;
    if (!task) throw new CliError("No hay tarea en curso: «Tarea en progreso» dice «Sin tarea en curso». No se escribió nada.");
    if (wanted && wanted.number !== task.number) {
      throw new CliError(`La Tarea ${wanted.number} no es la tarea en curso (es la ${task.number}): plan solo modifica el plan de la tarea en curso. No se escribió nada.`);
    }
    if (!steps.length) throw new CliError(`La Tarea ${task.number} no tiene plan (checkboxes) en «Tarea en progreso»: no hay pasos que modificar. No se escribió nada.`);

    const lang = detectLanguage([task.label, ...headerLabels(docs)]).lang;
    const S = STRINGS[lang];
    const ctxPlan: Context = { text: handoff.text, steps, S, closing: steps.findLastIndex((step) => closingStepRe(S).test(step.text)) };
    const outcome =
      op === "add"
        ? planAdd(ctxPlan, singleStep("add", textFlag(flags, "add")), position("at", flags.at))
        : op === "remove"
          ? planRemove(ctxPlan, requiredArg("remove", flags.remove))
          : op === "rename"
            ? planRename(ctxPlan, requiredArg("rename", flags.rename), singleStep("rename", args.at(-1)))
            : op === "move"
              ? planMove(ctxPlan, requiredArg("move", flags.move), position("to", flags.to)!)
              : planSet(ctxPlan, parsePlan(textFlag(flags, "set") ?? ""));

    // Avisa (no bloquea): `close` y `pause` rechazarían esas líneas.
    const notes = [
      ...outcome.notes,
      ...invalidPlanLineMessages(invalidPlanLines(handoff.text, subsections), lang),
      ...structureProblems(handoff.text, handoff.parsed, lang).map(structureProblemMessage),
    ];
    // Los textos generados llevan el paso sin el sufijo de reabierto.
    const pendingBefore = steps.filter((step) => !step.done).map((step) => stepBase(step.text));
    const pendingAfter = outcome.after.filter((item) => !item.done).map((item) => stepBase(item.text));
    const progress = progressUpdates({ text: handoff.text, subsections, S, taskNumber: task.number, pendingBefore, pendingAfter });
    const stale = progress.stale.map(staleNotice);

    const result = ctx.commit([{ doc: handoff, edits: [...outcome.edits, ...progress.edits] }], { quiet: flags.json === true });
    const done = outcome.after.filter((item) => item.done).length;
    if (flags.json === true) {
      emitWriteJson(ctx, "plan", result, {
        task: { number: task.number, title: task.title },
        operation: op,
        steps: outcome.after.map((item, i) => ({ index: i + 1, text: item.text, done: item.done })),
        plan: { done, total: outcome.after.length, nextStep: pendingAfter[0] ?? null },
        updated: progress.updated,
        notes: [...notes, ...stale],
      });
      return;
    }
    for (const note of notes) io.out(`Aviso: ${note}`);
    const written = result.files.some((file) => file.written);
    if (written) io.out(`Tarea ${task.number}: ${outcome.message} (${relFile(ws, handoff.path)}).`);
    else if (!result.dryRun && !result.files.some((file) => file.changed)) io.out(`Sin cambios: el plan de la Tarea ${task.number} ya estaba así (${outcome.message}).`);
    if (written || result.files.some((file) => file.changed)) {
      io.out(`Plan resultante (${done}/${outcome.after.length}):`);
      outcome.after.forEach((item, i) => io.out(`  ${i + 1}. [${item.done ? "x" : " "}] ${item.text}`));
    }
    if (written && progress.updated.length) io.out(`Actualizado: ${progress.updated.join(", ")}.`);
    for (const text of stale) io.out(`Aviso: ${text}`);
  },
};

/** Lo que las operaciones necesitan saber del plan actual. */
interface Context {
  /** handoff.md (LF). */
  text: string;
  steps: PlanStep[];
  S: Strings;
  /** Índice del paso de cierre, o -1 si el plan no lo trae. */
  closing: number;
}

function requiredArg(name: string, value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new UsageError(`--${name} necesita el paso (número o texto).`);
  return text;
}

/** El texto de un solo paso: sin prefijo de lista o checkbox y en una línea. */
function singleStep(name: string, value: string | undefined): string {
  const lines = parsePlan(value ?? "");
  if (!lines.length) throw new UsageError(`--${name} está vacío: pasa el texto del paso.`);
  if (lines.length > 1) throw new UsageError(`--${name} es un solo paso (una línea); para varios usa \`--set -\`.`);
  return lines[0];
}

/** Una posición (desde 1) de `--at` o `--to`; `undefined` si no se pasó. */
function position(name: string, value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const wanted = value.trim();
  if (!/^\d+$/.test(wanted) || Number(wanted) < 1) throw new UsageError(`--${name} es una posición desde 1 (un número entero): recibí «${wanted}».`);
  return Number(wanted);
}

/** Borra la línea del paso con su salto de línea (o el que la precede si es la última del archivo). */
function deleteLine(text: string, step: PlanStep): Edit {
  const { start, end } = step.range!;
  return text[end] === "\n" ? deleteRange({ start, end: end + 1 }) : deleteRange({ start: Math.max(0, start - 1), end });
}

/** Inserta `line` para que sea el paso `index` (0-based) de `rest`: antes de ese, o tras el último si es el final. */
function insertLine(rest: PlanStep[], index: number, line: string): Edit {
  return index < rest.length ? insertAt(rest[index].range!.start, `${line}\n`) : insertAt(rest[rest.length - 1].range!.end, `\n${line}`);
}

const lineText = (text: string, step: PlanStep) => text.slice(step.range!.start, step.range!.end);

function planAdd({ steps, closing, S }: Context, step: string, at: number | undefined): Outcome {
  if (closing >= 0 && closingStepRe(S).test(step)) {
    throw new CliError(`No se puede agregar «${step}»: ese texto es el del paso de cierre, que ya existe (va siempre al final). No se escribió nada.`);
  }
  // Última posición válida: justo antes del paso de cierre (o al final si el plan no lo trae).
  const last = closing >= 0 ? closing + 1 : steps.length + 1;
  const pos = Math.min(at ?? last, last);
  const after: Item[] = steps.map(({ text: stepText, done }) => ({ text: stepText, done }));
  after.splice(pos - 1, 0, { text: step, done: false });
  return {
    edits: [insertLine(steps, pos - 1, `- [ ] ${step}`)],
    after,
    message: `paso agregado en la posición ${pos}: «${step}»`,
    notes: [
      ...(closing >= 0 && at !== undefined && at > last ? [`--at ${at} cae después del paso de cierre: lo puse justo antes, en la posición ${pos}.`] : []),
      ...(closing >= 0 && steps[closing].done ? ["el paso de cierre ya estaba hecho; se agregó un paso pendiente antes de él."] : []),
    ],
  };
}

function planRemove({ text, steps, closing, S }: Context, arg: string): Outcome {
  const i = resolveStep(arg, steps);
  if (i === closing) throw new CliError(`No se puede quitar el paso de cierre «${steps[i].text}»: todo plan termina en «${S.closeStep}». No se escribió nada.`);
  if (steps.length === 1) throw new CliError("No se puede quitar el único paso del plan: quedaría vacío. No se escribió nada.");
  return {
    edits: [deleteLine(text, steps[i])],
    after: steps.filter((_, j) => j !== i).map(({ text: stepText, done }) => ({ text: stepText, done })),
    message: `paso ${i + 1} quitado${steps[i].done ? " (ya estaba hecho)" : ""}: «${steps[i].text}»`,
    notes: [],
  };
}

function planRename({ text, steps, closing, S }: Context, arg: string, newText: string): Outcome {
  const i = resolveStep(arg, steps);
  if (i === closing) throw new CliError(`No se puede renombrar el paso de cierre «${steps[i].text}»: todo plan termina en «${S.closeStep}». No se escribió nada.`);
  if (closingStepRe(S).test(newText)) {
    throw new CliError(`No se puede renombrar el paso ${i + 1} a «${newText}»: ese texto es el del paso de cierre, que va siempre al final. No se escribió nada.`);
  }
  return {
    // Reemplaza todo el texto del paso, también un sufijo (`(reabierto: …)`).
    edits: [replaceRange(stepTextRange(text, steps[i]), newText)],
    after: steps.map((step, j) => ({ text: j === i ? newText : step.text, done: step.done })),
    message: `paso ${i + 1} renombrado de «${steps[i].text}» a «${newText}»`,
    notes: [],
  };
}

function planMove({ text, steps, closing, S }: Context, arg: string, to: number): Outcome {
  const i = resolveStep(arg, steps);
  if (i === closing) throw new CliError(`No se puede mover el paso de cierre «${steps[i].text}»: todo plan termina en «${S.closeStep}». No se escribió nada.`);
  const rest = steps.filter((_, j) => j !== i);
  // Nada pasa después del paso de cierre: el tope es su lugar (ya sin el paso movido).
  const limit = closing >= 0 ? closing - (i < closing ? 1 : 0) : rest.length;
  const target = Math.min(to - 1, limit);
  const after = rest.map(({ text: stepText, done }) => ({ text: stepText, done }));
  after.splice(target, 0, { text: steps[i].text, done: steps[i].done });
  const notes = closing >= 0 && to - 1 > limit ? [`--to ${to} cae después del paso de cierre: lo puse justo antes, en la posición ${target + 1}.`] : [];
  if (target === i) return { edits: [], after, message: `el paso ${i + 1} ya estaba en la posición ${i + 1}: «${steps[i].text}»`, notes };
  return {
    edits: [deleteLine(text, steps[i]), insertLine(rest, target, lineText(text, steps[i]))],
    after,
    message: `paso «${steps[i].text}» movido de la posición ${i + 1} a la ${target + 1}`,
    notes,
  };
}

function planSet({ text, steps, closing, S }: Context, lines: string[]): Outcome {
  if (!lines.length) throw new UsageError("--set no trae ningún paso: escribe uno por línea.");
  const isClosing = closingStepRe(S);
  const existing = new Map<string, Array<{ step: PlanStep; i: number }>>();
  steps.forEach((step, i) => {
    if (i === closing) return;
    // Se compara sin el sufijo de reabierto: el paso conserva su línea (y su sufijo) venga o no en la entrada.
    const key = normalizeTitle(stepBase(step.text));
    existing.set(key, [...(existing.get(key) ?? []), { step, i }]);
  });

  // Cada paso conserva su línea original si ya existía (y con ella su estado); los demás nacen pendientes.
  const kept: string[] = [];
  const list: Array<Item & { line: string }> = [];
  for (const line of lines.filter((candidate) => !isClosing.test(candidate))) {
    const match = existing.get(normalizeTitle(stepBase(line)))?.shift();
    if (match) {
      kept.push(match.step.text);
      list.push({ text: match.step.text, done: match.step.done, line: lineText(text, match.step) });
    } else {
      list.push({ text: line, done: false, line: `- [ ] ${line}` });
    }
  }
  // El paso de cierre va al final: el que ya había (con su estado) o uno nuevo, con el texto que traiga la lista.
  const closingLines = lines.filter((candidate) => isClosing.test(candidate));
  const closingLine = closingLines[0];
  list.push(closing >= 0 ? { text: steps[closing].text, done: steps[closing].done, line: lineText(text, steps[closing]) } : { text: closingLine ?? S.closeStep, done: false, line: `- [ ] ${closingLine ?? S.closeStep}` });

  // Se quitan todas las líneas de paso y la lista nueva entra donde estaba la primera: lo demás (modo, comentarios) no se toca.
  return {
    edits: [insertAt(steps[0].range!.start, `${list.map((item) => item.line).join("\n")}\n`), ...steps.map((step) => deleteLine(text, step))],
    after: list.map(({ text: stepText, done }) => ({ text: stepText, done })),
    message: `plan reemplazado: ${list.length} pasos (${kept.length} conservaron su texto y estado)`,
    // Solo una línea hace de cierre: las demás que lo parecen se descartan, y se dice cuáles.
    notes: closingLines.slice(1).map((line) => `--set: ignoré la línea «${line}»: parece el paso de cierre, que va una sola vez y siempre al final.`),
  };
}
