// `mode <guided|step-by-step|auto|extreme>`: registra el modo de ejecución acordado del plan de la
// tarea en curso, la línea `**Modo de ejecución acordado:** <modo>` al final de la subsección «Plan».
// Si la tarea ya trae una línea de modo (con el texto libre de antes o la etiqueta de otro idioma) la
// reemplaza; si no, la agrega. `extreme` exige `--confirm`: el agente debe haberlo confirmado con el
// operador en el chat (la herramienta no puede comprobarlo). Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { deleteRange, insertAt, replaceRange } from "../edit/edits.ts";
import { contentBounds } from "../edit/layout.ts";
import { commentSpans } from "../../../_shared/parse/markdown.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { EXECUTION_MODES, findPlan, inspectCurrent, modeLines, parseExecutionMode } from "../write/handoff.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { headerLabels } from "../write/samples.ts";

export const mode: Command = {
  name: "mode",
  summary: "Registra el modo de ejecución acordado del plan de la tarea en curso; escribe con --apply",
  usage: `mode <${EXECUTION_MODES.join("|")}> [--confirm] [--json] [--apply]`,
  writes: true,
  flags: {
    confirm: {
      type: "boolean",
      description: "Obligatorio con `extreme`: el agente ya lo confirmó con el operador en el chat (la herramienta no puede comprobarlo). Con los demás modos se ignora.",
    },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1) throw new UsageError(`Indica el modo: \`mode <${EXECUTION_MODES.join("|")}>\`.`);
    const value = parseExecutionMode(ctx.args[0], flags.confirm === true);
    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");

    if (!handoff.parsed.inProgress.task) {
      throw new CliError("No hay tarea en curso: «Tarea en progreso» dice «Sin tarea en curso». No se escribió nada.");
    }
    const current = inspectCurrent(handoff, "fijar el modo de ejecución de");
    const plan = findPlan(handoff.parsed.inProgress.subsections);
    if (!current.planLines || !plan?.range) {
      throw new CliError(`La Tarea ${current.number} no tiene plan (checkboxes) en «Tarea en progreso»: el modo de ejecución es del plan; agrega primero sus pasos. No se escribió nada.`);
    }

    const { lang, notice } = detectLanguage([current.label, ...headerLabels(docs)]);
    const S = STRINGS[lang];
    const line = `**${S.mode}:** ${value}`;
    const all = modeLines(handoff.text, handoff.parsed.inProgress.subsections);
    // La última es la vigente (la que leen el board y `close`); las anteriores sobran y se borran.
    const existing = all.at(-1);
    const extras = all.slice(0, -1);
    const previous = existing?.value ?? null;
    const unchanged = existing?.value === value && !extras.length;
    // Borrar la línea de un comentario HTML de varias líneas lo dejaría partido (y taparía o destaparía otras líneas del plan).
    const multiline = commentSpans(handoff.text).filter(([from, to]) => handoff.text.slice(from, to).includes("\n"));
    const split = extras.find((extra) => {
      const { start, end } = wholeLine(handoff.text, extra);
      return multiline.some(([from, to]) => from < end && to > start);
    });
    if (split) {
      throw new CliError(`La línea de modo ${split.line} comparte un comentario HTML de varias líneas con otras: no puedo borrarla sin partirlo; resuélvelo a mano en «Plan». No se escribió nada.`);
    }

    // Reemplaza la línea que haya, con su etiqueta en cualquier idioma; si no hay, va al final del plan.
    const edits = unchanged
      ? []
      : [
          existing
            ? replaceRange(existing, line)
            : insertAt(contentBounds(handoff.text, plan.range)!.end, `\n\n${line}`),
          ...extras.map((extra) => deleteRange(wholeLine(handoff.text, extra))),
        ];
    const result = ctx.commit([{ doc: handoff, edits }], { quiet: flags.json === true || unchanged });

    if (flags.json === true) {
      emitWriteJson(ctx, "mode", result, { task: { number: current.number, title: current.title }, mode: value, previous, unchanged, removed: extras.length, notice });
      return;
    }
    if (unchanged) {
      io.out(`Aviso: la Tarea ${current.number} ya tiene el modo de ejecución «${value}»: no hay nada que cambiar.`);
    } else if (result.files.some((file) => file.written)) {
      const sameValue = previous === value;
      io.out(
        sameValue
          ? `Tarea ${current.number}: modo de ejecución «${value}» (${relFile(ws, handoff.path)}).`
          : `Tarea ${current.number}: modo de ejecución ${previous ? `cambiado de «${previous}» a` : "fijado en"} «${value}» (${relFile(ws, handoff.path)}).`,
      );
    }
    if (extras.length && !unchanged) io.out(`Aviso: el plan tenía ${all.length} líneas de modo; quedó solo la última (${extras.length === 1 ? "se borró la línea" : "se borraron las líneas"} ${extras.map((extra) => extra.line).join(", ")}).`);
    if (notice) io.out(`Aviso: ${notice}`);
  },
};

/** El rango de la línea de `mode` entera (sangría y salto de línea incluidos), con la línea en blanco que la precede si la hay, para no dejar huecos. */
function wholeLine(text: string, mode: { start: number; end: number }): { start: number; end: number } {
  let start = text.lastIndexOf("\n", mode.start - 1) + 1;
  const newline = text.indexOf("\n", mode.end);
  const end = newline === -1 ? text.length : newline + 1;
  if (start >= 2 && text[start - 2] === "\n") start -= 1;
  return { start, end };
}
