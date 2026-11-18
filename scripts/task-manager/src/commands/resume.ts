// `resume <N>`: el inverso de `pause`. Saca la tarea de «Tareas pausadas» de handoff.md y rearma
// «Tarea en progreso» con lo que el bloque guardaba (descripción, plan con sus pasos ya marcados,
// modo, Qué falta, Decisiones a medio camino, Próximo paso concreto y los demás campos como
// `Origen`). «Por qué se pausó» y «Qué espera para retomarse» se descartan: dejan de valer. Exige
// que no haya tarea en curso. Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { insertBlock, removeBlock } from "../edit/layout.ts";
import { describeKnownNumbers, findTask, parseTarget } from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { trimRange } from "../query/lines.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { partOf, requireFreeInProgress, stepLine } from "../write/handoff.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, findFieldOfKind, STRINGS } from "../write/language.ts";
import { assembleInProgress, fieldBody } from "../write/render.ts";
import { headerLabels } from "../write/samples.ts";

export const resume: Command = {
  name: "resume",
  summary: "Retoma una tarea pausada: la pasa a «Tarea en progreso»; escribe con --apply",
  usage: "resume <N | T-N> [--json] [--apply]",
  writes: true,
  flags: { json: JSON_FLAG },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1 || !ctx.args[0].trim()) throw new UsageError("Indica la tarea pausada: `resume <N>`.");
    const target = parseTarget(ctx.args[0]);
    if (target.kind === "title") throw new UsageError(`«${ctx.args[0]}» no es un número de tarea: \`resume <N>\`.`);
    if (target.operator) throw new CliError(`resume solo retoma tareas de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);
    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");

    const section = requireFreeInProgress(handoff, "retomar otra");
    const matches = handoff.parsed.paused.filter((task) => task.number === target.number);
    if (!matches.length) {
      const found = findTask(docs, target.number);
      throw new CliError(
        found.length
          ? `La Tarea ${target.number} no está pausada (está en: ${found.map((l) => l.place).join(", ")}). No se escribió nada.`
          : `No existe la Tarea ${target.number}. ${describeKnownNumbers(docs)}`,
      );
    }
    if (matches.length > 1) throw new CliError(`La Tarea ${target.number} aparece ${matches.length} veces en «Tareas pausadas»: corrígelo a mano. No se escribió nada.`);
    const task = matches[0];
    const text = handoff.text;

    const { lang, notice } = detectLanguage([task.label, ...headerLabels(docs)], docs.rulesText);
    const S = STRINGS[lang];
    const description = findFieldOfKind(task.fields, "description");
    const field = (part: "mode" | "missing" | "decisions" | "next") => {
      const found = task.fields.find((f) => partOf(f.label) === part && !f.isPlaceholder);
      return (found && fieldBody(text, found)) || null;
    };
    const extras = task.fields
      .filter((f) => f !== description && partOf(f.label) === null && !f.isPlaceholder)
      .map((f) => (f.range ? text.slice(f.range.start, f.range.end).replace(/\s+$/, "") : `- **${f.label}:** ${f.value}`));
    const planLines = task.steps.length ? task.steps.map((step) => stepLine(text, step)) : null;

    const body = assembleInProgress({
      strings: S,
      label: task.label,
      number: task.number,
      title: task.title,
      description: description && !description.isPlaceholder ? fieldBody(text, description) || null : null,
      extras,
      planLines,
      mode: field("mode"),
      missing: field("missing") ?? (planLines ? S.missingWithPlan : S.missingNoPlan),
      decisions: field("decisions") ?? S.noDecisions,
      next: field("next") ?? S.nextNoPlan,
    });
    const edits = [
      insertBlock(text, section.bodyRange, body, { hasBlocks: false }),
      removeBlock(text, trimRange(text, task.range!), S.emptySection, handoff.parsed.paused.length > 1),
    ];
    const result = ctx.commit([{ doc: handoff, edits }], { quiet: flags.json === true });

    if (flags.json === true) {
      emitWriteJson(ctx, "resume", result, { task: { number: task.number, title: task.title }, notice });
      return;
    }
    if (result.files.some((file) => file.written)) {
      io.out(`Tarea ${task.number} retomada: pasó de «Tareas pausadas» a «Tarea en progreso» de ${relFile(ws, handoff.path)}.`);
    }
    if (notice) io.out(`Aviso: ${notice}`);
  },
};
