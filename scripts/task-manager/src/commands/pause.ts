// `pause`: pasa la tarea en curso a «Tareas pausadas» de handoff.md como un bloque
// `### Tarea N — título` (con su Plan, Qué falta, Decisiones a medio camino, Próximo paso concreto,
// Por qué se pausó y Qué espera para retomarse) y deja «Tarea en progreso» en «Sin tarea en curso».
// Lo que «Tarea en progreso» trae además (la descripción, `Origen`, `Detalles`, el modo de ejecución)
// va al bloque como campos, para que `resume` pueda devolverlo todo. Si la sección tiene algo que no
// reconozco, se niega. Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { replaceRange } from "../edit/edits.ts";
import { blockSeparator, insertBlock } from "../edit/layout.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { requiredFlag, textFlag } from "../write/flags.ts";
import { inspectCurrent } from "../write/handoff.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { normalizeText, renderField } from "../write/render.ts";
import { headerLabels } from "../write/samples.ts";

export const pause: Command = {
  name: "pause",
  summary: "Pasa la tarea en curso a «Tareas pausadas» y deja «Sin tarea en curso»; escribe con --apply",
  usage: "pause --reason <texto> --waiting-for <texto> [--missing <texto>] [--decisions <texto>] [--next <texto>] [--json] [--apply]",
  writes: true,
  flags: {
    reason: { type: "string", valueName: "texto", stdin: true, description: "Por qué se pausó. Obligatorio." },
    "waiting-for": { type: "string", valueName: "texto", stdin: true, description: "Qué espera para retomarse. Obligatorio." },
    missing: { type: "string", valueName: "texto", stdin: true, description: "Reemplaza el texto de «Qué falta» al pausar." },
    decisions: { type: "string", valueName: "texto", stdin: true, description: "Reemplaza el texto de «Decisiones a medio camino» al pausar." },
    next: { type: "string", valueName: "texto", stdin: true, description: "Reemplaza el texto de «Próximo paso concreto» al pausar." },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length) throw new UsageError("`pause` no lleva argumentos: pausa la tarea en curso (solo hay una).");
    const why = requiredFlag(flags, "reason");
    const waits = requiredFlag(flags, "waiting-for");
    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");

    const current = inspectCurrent(handoff, "pausar");
    const paused = handoff.parsed.sections.paused;
    if (!paused) throw new CliError("handoff.md no tiene la sección «Tareas pausadas» (ancla `paused`). No se escribió nada.");
    if (handoff.parsed.paused.some((task) => task.number === current.number)) {
      throw new CliError(`La Tarea ${current.number} ya figura en «Tareas pausadas»: una tarea vive en un solo lugar; corrígelo a mano. No se escribió nada.`);
    }

    const { lang, notice } = detectLanguage([current.label, ...headerLabels(docs)], docs.rulesText);
    const S = STRINGS[lang];
    const override = (flag: string, kept: string | null) => {
      const given = textFlag(flags, flag);
      return given ? normalizeText(given) : kept;
    };
    const fields: string[] = [];
    if (current.description) fields.push(renderField(S.fields.description, current.description));
    fields.push(...current.extras);
    if (current.planLines) fields.push(`- **${S.plan}:**\n${current.planLines.map((line) => `  ${line}`).join("\n")}`);
    if (current.mode) fields.push(renderField(S.mode, current.mode));
    for (const [label, value] of [
      [S.missing, override("missing", current.missing)],
      [S.decisions, override("decisions", current.decisions)],
      [S.next, override("next", current.next)],
      [S.why, why],
      [S.waits, waits],
    ] as const) {
      if (value) fields.push(renderField(label, value));
    }
    const block = `### ${current.label} ${current.number} — ${current.title}\n\n${fields.join("\n")}`;

    const insert = insertBlock(handoff.text, paused.bodyRange, block, {
      hasBlocks: handoff.parsed.paused.length > 0,
      separator: blockSeparator(handoff.text, handoff.parsed.paused.flatMap((task) => (task.range ? [task.range] : []))),
    });
    const result = ctx.commit([{ doc: handoff, edits: [replaceRange(current.replace, S.noTask), insert] }], { quiet: flags.json === true });

    if (flags.json === true) {
      emitWriteJson(ctx, "pause", result, { task: { number: current.number, title: current.title }, why, waits, notice });
      return;
    }
    if (result.files.some((file) => file.written)) {
      io.out(`Tarea ${current.number} pausada: pasó de «Tarea en progreso» a «Tareas pausadas» de ${relFile(ws, handoff.path)}.`);
    }
    if (notice) io.out(`Aviso: ${notice}`);
  },
};
