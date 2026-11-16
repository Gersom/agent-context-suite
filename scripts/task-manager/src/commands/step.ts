// `step`: marca (o con `--undo` desmarca) pasos del «Plan» de la tarea en curso y pone al día los
// textos de handoff.md que dependen del avance (Regla 7 de rules.md): «Qué falta» y «Próximo paso
// concreto». Esos dos se reescriben solos únicamente si siguen con el texto que dejó el script
// (el de `start` o el que `step` mismo generó); un texto que alguien escribió no se toca: para
// cambiarlo a mano está `edit` (`--missing`, `--next`). Excepción: al marcar, un «Próximo paso
// concreto» escrito a mano igual al texto de un paso que se marca se pone al día igual. Un paso reabierto con `--undo --reason` queda
// con el sufijo ` (reabierto: <motivo>)` (write/suffix.ts); al marcarlo de nuevo se quita. Al marcar
// un paso, `--evidence` y `--commit` anotan al final de su línea `· <evidencia> · commit <hash>`; sobre
// un paso ya hecho reemplazan esos campos y reabrirlo los quita. Sin `--apply` solo muestra el diff.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
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
import { hasReopenedMarker, isCommitHash, parseStepText, PROOF_SEPARATOR, stepBase, withoutProof, withProof, withReopened } from "../write/suffix.ts";

export const step: Command = {
  name: "step",
  summary: "Marca pasos del plan de la tarea en curso (con evidencia y commit) y actualiza «Qué falta» y «Próximo paso concreto»; escribe con --apply",
  usage: "step <N | texto>... [--evidence <texto>] [--commit <hash | auto>] [--undo [--reason <texto>]] [--json] [--apply]",
  writes: true,
  flags: {
    undo: { type: "boolean", description: "Desmarcar los pasos indicados en vez de marcarlos (la Regla 7 pide un motivo: --reason). Quita la evidencia y el commit del paso." },
    reason: {
      type: "string",
      valueName: "texto",
      description: "Solo con --undo: el motivo de reabrir (una línea). A cada paso que pasa a pendiente se le añade ` (reabierto: <motivo>)` al final; si ya traía uno, se reemplaza. Marcar el paso de nuevo lo quita.",
    },
    evidence: {
      type: "string",
      valueName: "texto",
      description: "Al marcar: la evidencia de que el paso está hecho (una línea, sin ` · `). Se anota al final de la línea del paso como ` · <evidencia>`. En un paso ya hecho reemplaza la evidencia que traía.",
    },
    commit: {
      type: "string",
      valueName: "hash",
      description: "Al marcar: el commit del paso (7 a 40 hex) o `auto` (el hash corto de HEAD: `git rev-parse --short HEAD` en la raíz del proyecto). Se anota al final de la línea como ` · commit <hash>`. En un paso ya hecho reemplaza el commit que traía.",
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
    const proofArgs = proofFlags(flags, undo);

    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");
    const { task, planSteps: steps, subsections } = handoff.parsed.inProgress;
    if (!task) throw new CliError("No hay tarea en curso: «Tarea en progreso» dice «Sin tarea en curso». No se escribió nada.");
    if (!steps.length) throw new CliError(`La Tarea ${task.number} no tiene plan (checkboxes) en «Tarea en progreso»: no hay pasos que marcar. No se escribió nada.`);

    const want = !undo;
    const targets = [...new Set(ctx.args.map((arg) => resolveStep(arg, steps)))];
    const toggled = targets.filter((i) => steps[i].done !== want);
    // `--commit auto` se resuelve con los pasos ya validados: si git falla no se escribe nada.
    const proof = { evidence: proofArgs.evidence, commit: proofArgs.commit === AUTO ? headCommit(ws.projectDir) : proofArgs.commit };
    const hasProof = proof.evidence !== undefined || proof.commit !== undefined;
    // Textos que dependen del avance. Con labels de la tarea se elige el idioma de los que se generan.
    const lang = detectLanguage([task.label, ...headerLabels(docs)]).lang;
    const S = STRINGS[lang];

    // El texto nuevo de cada paso. Al marcar: se quita el sufijo de reabierto y se ponen la evidencia y el commit (en un
    // paso ya hecho, solo si se pasaron: reemplazan a los que traía). Al reabrir: se quitan la evidencia y el commit
    // (ya no valen) y, con motivo, se pone el sufijo de reabierto (reemplaza el que traía).
    const rewritten = new Map<number, string>();
    const refreshed: number[] = [];
    for (const i of targets) {
      const { text, done: wasDone } = steps[i];
      const next =
        wasDone === want
          ? want && hasProof
            ? withProof(S, text, wasDone, proof)
            : text
          : want
            ? withProof(S, text, wasDone, proof)
            : reason === undefined
              ? withoutProof(S, text)
              : withReopened(S, text, reason);
      if (next === text) continue;
      rewritten.set(i, next);
      if (wasDone === want) refreshed.push(i);
    }
    const notes = [
      ...targets.filter((i) => steps[i].done === want && !refreshed.includes(i)).map((i) => `El paso ${i + 1} ya estaba ${want ? "hecho" : "pendiente"}: «${stepBase(steps[i].text, steps[i].done)}».`),
      // Reabrir sin motivo funciona, pero la Regla 7 pide uno.
      ...(undo && reason === undefined && toggled.length ? ["La Regla 7 pide un motivo al reabrir: usa --reason."] : []),
      // Un paso que se marca sin evidencia ni commit y trae ` · ` en su texto: hecho, su último tramo se lee como evidencia.
      ...(want && !hasProof
        ? toggled.flatMap((i) => {
            const base = stepBase(steps[i].text);
            const at = base.lastIndexOf(PROOF_SEPARATOR);
            return at < 0 ? [] : [`El paso ${i + 1} lleva « · » en su texto y queda hecho sin evidencia ni commit: su último tramo («${base.slice(at + PROOF_SEPARATOR.length).trim()}») se leerá como evidencia, y reabrirlo con --undo lo quitaría.`];
          })
        : []),
      // Avisa (no bloquea): `close` y `pause` rechazarían esas líneas.
      ...invalidPlanLineMessages(invalidPlanLines(handoff.text, subsections), lang),
      ...structureProblems(handoff.text, handoff.parsed, lang).map(structureProblemMessage),
    ];

    const edits: Edit[] = toggled.map((i) => replaceRange(steps[i].markRange!, want ? "x" : " "));
    edits.push(...[...rewritten].map(([i, text]) => replaceRange(stepTextRange(handoff.text, steps[i]), text)));

    const pendingBefore = steps.filter((s) => !s.done).map((s) => stepBase(s.text));
    // Un paso que se reabre lleva todavía su evidencia en la línea de hoy: se lee con su estado de hoy (hecho).
    const pendingAfter = steps.filter((s, i) => (toggled.includes(i) ? !want : !s.done)).map((s) => stepBase(s.text, s.done));
    // Al marcar, un «Próximo paso concreto» escrito a mano igual a un paso recién marcado (su texto pendiente, sin sufijos) también se pone al día.
    const markedTexts = want ? toggled.map((i) => stepBase(steps[i].text)) : [];
    const progress = progressUpdates({ text: handoff.text, subsections, S, taskNumber: task.number, pendingBefore, pendingAfter, markedTexts });
    const { updated, stale } = progress;
    edits.push(...progress.edits);

    const result = ctx.commit([{ doc: handoff, edits }], { quiet: flags.json === true });
    const done = steps.filter((s, i) => (toggled.includes(i) ? want : s.done)).length;
    // Cómo queda cada paso: el texto sin sufijos y, aparte, los sufijos que trae (ya cambiados).
    const after = (i: number) => parseStepText(rewritten.get(i) ?? steps[i].text, toggled.includes(i) ? want : steps[i].done);
    if (flags.json === true) {
      emitWriteJson(ctx, "step", result, {
        task: { number: task.number, title: task.title },
        steps: steps.map((s, i) => {
          const { base, reopened, evidence, commit } = after(i);
          return {
            index: i + 1,
            text: base,
            done: toggled.includes(i) ? want : s.done,
            changed: toggled.includes(i) || refreshed.includes(i),
            ...(reopened ? { reopened } : {}),
            ...(evidence ? { evidence } : {}),
            ...(commit ? { commit } : {}),
          };
        }),
        plan: { done, total: steps.length, nextStep: pendingAfter[0] ?? null },
        updated,
        notes: [...notes, ...stale.map(({ label, command }) => `«${label}» tiene texto propio: no se actualizó solo; si ya no vale, actualízalo con \`${command}\` (Regla 7).`)],
      });
      return;
    }
    for (const note of notes) io.out(`Aviso: ${note}`);
    if (result.files.some((file) => file.written)) {
      for (const i of [...toggled, ...refreshed].sort((a, b) => a - b)) {
        const { base, evidence, commit } = after(i);
        const proofText = [...(evidence ? [`evidencia: ${evidence}`] : []), ...(commit ? [`commit ${commit}`] : [])].join(", ");
        const state = refreshed.includes(i) ? "actualizado" : want ? "marcado como hecho" : "desmarcado";
        io.out(`Paso ${i + 1} ${state}: «${base}»${reason === undefined ? "" : ` (${S.reopened}: ${reason})`}${want && proofText ? ` (${proofText})` : ""}.`);
      }
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

/** El valor de `--commit` que pide el HEAD del proyecto en vez de un hash. */
const AUTO = "auto";

/**
 * `--evidence` y `--commit`: solo al marcar (no con `--undo`), cada uno de una sola línea y no vacío. La evidencia no puede
 * llevar ` · ` (no se leería como un solo tramo) ni parecer un commit o un sufijo de reabierto. El commit es un hash
 * de 7 a 40 hex (se guarda en minúsculas) o `auto`. @throws UsageError
 */
function proofFlags(flags: Record<string, FlagValue>, undo: boolean): { evidence?: string; commit?: string } {
  const given = ["evidence", "commit"].filter((name) => typeof flags[name] === "string");
  if (undo && given.length) throw new UsageError(`${given.map((name) => `--${name}`).join(" y ")} solo va al marcar un paso como hecho, no con --undo (reabrir quita la evidencia y el commit).`);
  const value = (name: string): string | undefined => {
    if (typeof flags[name] !== "string") return undefined;
    const text = textFlag(flags, name);
    if (!text) throw new UsageError(`--${name} está vacío: pasa ${name === "evidence" ? "la evidencia del paso" : "el hash del commit o `auto`"}.`);
    return singleLine(name, text);
  };
  const evidence = value("evidence");
  if (evidence !== undefined) {
    // Un `·` en los extremos se pegaría al separador de la línea (`· · foo`) y la evidencia ya no se leería igual: la línea crecería al repetir.
    if (evidence.startsWith("·") || evidence.endsWith(" ·")) throw new UsageError("--evidence no puede empezar ni terminar con «·»: se confundiría con el separador « · » de la línea del paso.");
    if (evidence.includes(PROOF_SEPARATOR)) throw new UsageError(`--evidence no puede contener «${PROOF_SEPARATOR}»: separa la evidencia del commit en la línea del paso.`);
    if (hasReopenedMarker(evidence)) throw new UsageError("--evidence no puede contener `(reabierto: ` ni `(reopened: `: se confundiría con el sufijo del paso.");
    if (/^commit [0-9a-f]{7,40}$/i.test(evidence)) throw new UsageError("--evidence no puede ser `commit <hash>`: se confundiría con el commit del paso; usa --commit.");
  }
  let commit = value("commit");
  if (commit !== undefined) {
    if (commit.toLowerCase() === AUTO) commit = AUTO;
    else if (isCommitHash(commit)) commit = commit.toLowerCase();
    else throw new UsageError(`--commit «${commit}» no es un hash: pasa de 7 a 40 caracteres hexadecimales o \`auto\`.`);
  }
  return { ...(evidence !== undefined ? { evidence } : {}), ...(commit !== undefined ? { commit } : {}) };
}

/** El hash corto de HEAD en la raíz del proyecto (`git rev-parse --short HEAD`). @throws CliError si no es un repo git o no tiene commits */
function headCommit(projectDir: string): string {
  const fail = (why: string) => new CliError(`--commit auto: no se pudo leer el commit actual en ${projectDir} (${why}). Pasa el hash con --commit <hash>. No se escribió nada.`);
  let out: SpawnSyncReturns<string>;
  try {
    out = spawnSync("git", ["-C", projectDir, "rev-parse", "--short", "HEAD"], { encoding: "utf8", timeout: 5000 });
  } catch {
    throw fail("no se pudo ejecutar git");
  }
  if (out.error) throw fail("no se pudo ejecutar git");
  const hash = out.status === 0 ? out.stdout.trim().toLowerCase() : "";
  if (!isCommitHash(hash)) throw fail("¿es un repo git con al menos un commit?");
  return hash;
}
