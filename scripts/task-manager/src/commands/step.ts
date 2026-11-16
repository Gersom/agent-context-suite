// `step`: marca (o con `--undo` desmarca) pasos del «Plan» de la tarea en curso y pone al día los
// textos de handoff.md que dependen del avance (Regla 7 de rules.md): «Qué falta» y «Próximo paso
// concreto». Esos dos se reescriben solos únicamente si siguen con el texto que dejó el script
// (el de `start` o el que `step` mismo generó); un texto que alguien escribió no se toca: para
// cambiarlo a mano está `edit` (`--missing`, `--next`). Un paso reabierto con `--undo --reason` queda
// con el sufijo ` (reabierto: <motivo>)` (write/suffix.ts); al marcarlo de nuevo se quita. Sin
// `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command, FlagValue } from "../cli/types.ts";
import { replaceRange, type Edit } from "../edit/edits.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { singleLine, textFlag } from "../write/flags.ts";
import { invalidPlanLineMessages, invalidPlanLines, structureProblemMessage, structureProblems } from "../write/handoff.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { progressUpdates, resolveStep, staleNotice, stepTextRange } from "../write/plan.ts";
import { headerLabels } from "../write/samples.ts";
import { hasReopenedMarker, parseStepText, stepBase, withReopened } from "../write/suffix.ts";

export const step: Command = {
  name: "step",
  summary: "Marca pasos del plan de la tarea en curso y actualiza «Qué falta» y «Próximo paso concreto»; escribe con --apply",
  usage: "step <N | texto>... [--undo [--reason <texto>]] [--json] [--apply]",
  writes: true,
  flags: {
    undo: { type: "boolean", description: "Desmarcar los pasos indicados en vez de marcarlos (la Regla 7 pide un motivo: --reason)." },
    reason: {
      type: "string",
      valueName: "texto",
      description: "Solo con --undo: el motivo de reabrir (una línea). A cada paso que pasa a pendiente se le añade ` (reabierto: <motivo>)` al final; si ya traía uno, se reemplaza. Marcar el paso de nuevo lo quita.",
    },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const undo = flags.undo === true;
    if (!ctx.args.length) throw new UsageError("Indica qué paso marcar: `step <N | texto>`.");
    const reason = reasonFlag(flags, undo);

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
      ...targets.filter((i) => steps[i].done === want).map((i) => `El paso ${i + 1} ya estaba ${want ? "hecho" : "pendiente"}: «${stepBase(steps[i].text)}».`),
      // Reabrir sin motivo funciona, pero la Regla 7 pide uno.
      ...(undo && reason === undefined && toggled.length ? ["La Regla 7 pide un motivo al reabrir: usa --reason."] : []),
      // Avisa (no bloquea): `close` y `pause` rechazarían esas líneas.
      ...invalidPlanLineMessages(invalidPlanLines(handoff.text, subsections), lang),
      ...structureProblems(handoff.text, handoff.parsed, lang).map(structureProblemMessage),
    ];

    const edits: Edit[] = toggled.map((i) => replaceRange(steps[i].markRange!, want ? "x" : " "));
    // El sufijo de reabierto: al marcar como hecho se quita; al reabrir con motivo se pone (reemplaza el que traía).
    const rewritten = new Map<number, string>();
    for (const i of toggled) {
      const text = want ? stepBase(steps[i].text) : reason === undefined ? steps[i].text : withReopened(S, steps[i].text, reason);
      if (text !== steps[i].text) rewritten.set(i, text);
    }
    edits.push(...[...rewritten].map(([i, text]) => replaceRange(stepTextRange(handoff.text, steps[i]), text)));

    const pendingBefore = steps.filter((s) => !s.done).map((s) => stepBase(s.text));
    const pendingAfter = steps.filter((s, i) => (toggled.includes(i) ? !want : !s.done)).map((s) => stepBase(s.text));
    const progress = progressUpdates({ text: handoff.text, subsections, S, taskNumber: task.number, pendingBefore, pendingAfter });
    const { updated, stale } = progress;
    edits.push(...progress.edits);

    const result = ctx.commit([{ doc: handoff, edits }], { quiet: flags.json === true });
    const done = steps.filter((s, i) => (toggled.includes(i) ? want : s.done)).length;
    if (flags.json === true) {
      emitWriteJson(ctx, "step", result, {
        task: { number: task.number, title: task.title },
        steps: steps.map((s, i) => {
          // El texto va sin el sufijo; el motivo de reabierto, aparte y solo si el paso lo trae (ya cambiado).
          const reopened = parseStepText(rewritten.get(i) ?? s.text).reopened;
          return { index: i + 1, text: stepBase(s.text), done: toggled.includes(i) ? want : s.done, changed: toggled.includes(i), ...(reopened ? { reopened } : {}) };
        }),
        plan: { done, total: steps.length, nextStep: pendingAfter[0] ?? null },
        updated,
        notes: [...notes, ...stale.map(({ label, command }) => `«${label}» tiene texto propio: no se actualizó solo; si ya no vale, actualízalo con \`${command}\` (Regla 7).`)],
      });
      return;
    }
    for (const note of notes) io.out(`Aviso: ${note}`);
    if (result.files.some((file) => file.written)) {
      for (const i of toggled) io.out(`Paso ${i + 1} ${want ? "marcado como hecho" : "desmarcado"}: «${stepBase(steps[i].text)}»${reason === undefined ? "" : ` (${S.reopened}: ${reason})`}.`);
      if (steps.length) io.out(`Plan ${done}/${steps.length}${pendingAfter[0] ? ` — siguiente: ${pendingAfter[0]}` : " — completo"} (${relFile(ws, handoff.path)}).`);
      if (updated.length) io.out(`Actualizado: ${updated.join(", ")}.`);
    }
    for (const text of stale) io.out(`Aviso: ${staleNotice(text)}`);
  },
};

/** El motivo de `--reason`: solo con `--undo`, una sola línea y sin el comienzo de un sufijo de reabierto. @throws UsageError */
function reasonFlag(flags: Record<string, FlagValue>, undo: boolean): string | undefined {
  if (typeof flags.reason !== "string") return undefined;
  if (!undo) throw new UsageError("--reason solo va con --undo: es el motivo de reabrir un paso.");
  const reason = textFlag(flags, "reason");
  if (!reason) throw new UsageError("--reason está vacío: pasa el motivo de reabrir el paso.");
  singleLine("reason", reason);
  if (hasReopenedMarker(reason)) throw new UsageError("--reason no puede contener `(reabierto: ` ni `(reopened: `: se confundiría con el sufijo del paso.");
  return reason;
}
