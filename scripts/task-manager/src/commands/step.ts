// `step`: marca (o con `--undo` desmarca) pasos del «Plan» de la tarea en curso y pone al día los
// textos de handoff.md que dependen del avance (Regla 7 de rules.md): «Qué falta» y «Próximo paso
// concreto». Esos dos se reescriben solos únicamente si siguen con el texto que dejó el script
// (el de `start` o el que `step` mismo generó); un texto que alguien escribió no se toca: para
// cambiarlo a mano está `edit` (`--missing`, `--next`). Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { replaceRange, type Edit } from "../edit/edits.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { invalidPlanLineMessages, invalidPlanLines, structureProblemMessage, structureProblems } from "../write/handoff.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { progressUpdates, resolveStep, staleNotice } from "../write/plan.ts";
import { headerLabels } from "../write/samples.ts";

export const step: Command = {
  name: "step",
  summary: "Marca pasos del plan de la tarea en curso y actualiza «Qué falta» y «Próximo paso concreto»; escribe con --apply",
  usage: "step <N | texto>... [--undo] [--json] [--apply]",
  writes: true,
  flags: {
    undo: { type: "boolean", description: "Desmarcar los pasos indicados en vez de marcarlos." },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const undo = flags.undo === true;
    if (!ctx.args.length) throw new UsageError("Indica qué paso marcar: `step <N | texto>`.");

    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");
    const { task, planSteps: steps, subsections } = handoff.parsed.inProgress;
    if (!task) throw new CliError("No hay tarea en curso: «Tarea en progreso» dice «Sin tarea en curso». No se escribió nada.");
    if (!steps.length) throw new CliError(`La Tarea ${task.number} no tiene plan (checkboxes) en «Tarea en progreso»: no hay pasos que marcar. No se escribió nada.`);

    const want = !undo;
    const targets = [...new Set(ctx.args.map((arg) => resolveStep(arg, steps)))];
    const toggled = targets.filter((i) => steps[i].done !== want);
    // Textos que dependen del avance. Con labels de la tarea se elige el idioma de los que se generan.
    const lang = detectLanguage([task.label, ...headerLabels(docs)]).lang;
    const S = STRINGS[lang];
    const notes = [
      ...targets.filter((i) => steps[i].done === want).map((i) => `El paso ${i + 1} ya estaba ${want ? "hecho" : "pendiente"}: «${steps[i].text}».`),
      // Avisa (no bloquea): `close` y `pause` rechazarían esas líneas.
      ...invalidPlanLineMessages(invalidPlanLines(handoff.text, subsections), lang),
      ...structureProblems(handoff.text, handoff.parsed, lang).map(structureProblemMessage),
    ];

    const edits: Edit[] = toggled.map((i) => replaceRange(steps[i].markRange!, want ? "x" : " "));

    const pendingBefore = steps.filter((s) => !s.done).map((s) => s.text);
    const pendingAfter = steps.filter((s, i) => (toggled.includes(i) ? !want : !s.done)).map((s) => s.text);
    const progress = progressUpdates({ text: handoff.text, subsections, S, taskNumber: task.number, pendingBefore, pendingAfter });
    const { updated, stale } = progress;
    edits.push(...progress.edits);

    const result = ctx.commit([{ doc: handoff, edits }], { quiet: flags.json === true });
    const done = steps.filter((s, i) => (toggled.includes(i) ? want : s.done)).length;
    if (flags.json === true) {
      emitWriteJson(ctx, "step", result, {
        task: { number: task.number, title: task.title },
        steps: steps.map((s, i) => ({ index: i + 1, text: s.text, done: toggled.includes(i) ? want : s.done, changed: toggled.includes(i) })),
        plan: { done, total: steps.length, nextStep: pendingAfter[0] ?? null },
        updated,
        notes: [...notes, ...stale.map(({ label, command }) => `«${label}» tiene texto propio: no se actualizó solo; si ya no vale, actualízalo con \`${command}\` (Regla 7).`)],
      });
      return;
    }
    for (const note of notes) io.out(`Aviso: ${note}`);
    if (result.files.some((file) => file.written)) {
      for (const i of toggled) io.out(`Paso ${i + 1} ${want ? "marcado como hecho" : "desmarcado"}: «${steps[i].text}».`);
      if (steps.length) io.out(`Plan ${done}/${steps.length}${pendingAfter[0] ? ` — siguiente: ${pendingAfter[0]}` : " — completo"} (${relFile(ws, handoff.path)}).`);
      if (updated.length) io.out(`Actualizado: ${updated.join(", ")}.`);
    }
    for (const text of stale) io.out(`Aviso: ${staleNotice(text)}`);
  },
};
