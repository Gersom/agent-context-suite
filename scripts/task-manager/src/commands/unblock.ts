// `unblock [<N>]`: saca tareas de «Tareas bloqueadas / pospuestas» y las pone al final de «Tareas
// libres» de tu `backlog.md` (Regla 8: `Bloqueos` no se borra, pasa a `` `[Resuelto el <fecha>]` — era
// `[tag]` motivo ``).
// - Con `<N>`: desbloquea esa tarea, sin más condiciones (la decisión ya la tomó quien lo pide).
// - Sin argumento: revisa todas las bloqueadas y desbloquea solas las que el motivo condiciona a
//   «Tarea N» y todas esas tareas ya están cerradas en `history.md` (y las que ya no tienen un
//   bloqueo vigente). Las de motivo en texto libre —o que mencionan una tarea de otro operador— no
//   se tocan: se listan para revisarlas a mano (y, si corresponde, `unblock <N>`).
// Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import type { ChangeResult } from "../edit/changes.ts";
import { describeKnownNumbers, findTask, parseTarget } from "../query/find.ts";
import { blockedText, relFile, taskLine } from "../query/format.ts";
import { type BlockedInfo, buildState } from "../query/state.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { formatLocalDate } from "../write/render.ts";
import { headerLabels } from "../write/samples.ts";
import { insertIntoFree, planUnblock, reviewBlocked, type Verdict } from "../write/unblocking.ts";

export const unblock: Command = {
  name: "unblock",
  summary: "Desbloquea tareas del backlog: una (`unblock N`) o, sin número, las que bloqueaba una tarea ya cerrada; escribe con --apply",
  usage: "unblock [<N | T-N>] [--json] [--apply]",
  writes: true,
  flags: { json: JSON_FLAG },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length > 1) throw new UsageError("`unblock` recibe a lo sumo una tarea: `unblock <N>`, o sin número para revisar todas las bloqueadas.");
    const wanted = ctx.args.length ? parseTarget(ctx.args[0]) : null;
    if (wanted?.kind === "title") throw new UsageError(`«${ctx.args[0]}» no es un número de tarea: \`unblock <N>\`.`);
    if (wanted?.operator) throw new CliError(`unblock solo desbloquea tareas de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);
    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const backlog = requireDoc(docs.backlog, "backlog.md");
    const state = buildState(docs);

    // Qué tareas bloqueadas se desbloquean, y las que quedan para revisar.
    const { verdicts } = reviewBlocked(state.blocked);
    let chosen: BlockedInfo[];
    if (wanted) {
      const found = findTask(docs, wanted.number);
      if (!found.length) throw new CliError(`No existe la Tarea ${wanted.number}. ${describeKnownNumbers(docs)}`);
      if (found.length > 1) {
        throw new CliError(`La Tarea ${wanted.number} aparece en ${found.length} lugares (${found.map((l) => l.place).join(", ")}): una tarea vive en un solo lugar; corrígelo a mano. No se escribió nada.`);
      }
      if (found[0].place !== "blocked") throw new CliError(`La Tarea ${wanted.number} no está en «bloqueadas / pospuestas» (está en: ${found[0].place}). No se escribió nada.`);
      chosen = state.blocked.filter((info) => info.number === wanted.number);
    } else {
      chosen = state.blocked.filter((info) => ["auto", "stale"].includes(verdicts.get(info.number)!));
    }
    const rest = (verdict: Verdict) => (wanted ? [] : state.blocked.filter((info) => verdicts.get(info.number) === verdict));

    let result: ChangeResult | null = null;
    if (chosen.length) {
      const { lang, notice } = detectLanguage([backlog.parsed.blocked[0]?.label, ...headerLabels(docs)].filter((label): label is string => !!label), docs.rulesText);
      const plan = planUnblock(backlog, chosen, formatLocalDate(ctx.now()), STRINGS[lang]);
      result = ctx.commit([{ doc: backlog, edits: [...plan.removals, insertIntoFree(backlog, plan.blocks)] }], { quiet: flags.json === true });
      if (notice && flags.json !== true) io.out(`Aviso: ${notice}`);
    }

    if (flags.json === true) {
      const row = (info: BlockedInfo) => ({ number: info.number, title: info.title, tag: info.tag, reason: info.reason, refs: info.refs });
      const payload = {
        unblocked: chosen.map((info) => ({ ...row(info), noActiveBlock: !info.tag })),
        manualReview: rest("manual").map(row),
        stillBlocked: rest("waiting").map(row),
      };
      if (result) emitWriteJson(ctx, "unblock", result, payload);
      else emitWriteJson(ctx, "unblock", { dryRun: ctx.global.dryRun, files: [] }, payload);
      return;
    }

    const written = result?.files.some((file) => file.written) ?? false;
    if (written) io.out(`Desbloqueadas (${chosen.length}), pasaron a «Tareas libres» de ${relFile(ws, backlog.path)}:`);
    else if (chosen.length) io.out(`Se desbloquearían (${chosen.length}):`);
    for (const info of chosen) {
      const why = !info.tag ? "ya no tenía un bloqueo vigente" : info.refs.length ? info.refs.map((ref) => `Tarea ${ref.number} cerrada`).join(", ") : "decidido por quien lo pidió";
      io.out(`  ${taskLine(info.number, info.title)} — ${why}`);
    }
    if (!chosen.length && !wanted) io.out("Ninguna tarea bloqueada se puede desbloquear sola.");
    if (rest("manual").length) {
      io.out(`Para revisar a mano (el motivo no nombra una tarea propia): si ya no aplica, \`unblock <N>\`:`);
      for (const info of rest("manual")) io.out(`  ${blockedText(info)}`);
    }
    if (rest("waiting").length) {
      io.out("Siguen bloqueadas:");
      for (const info of rest("waiting")) io.out(`  ${blockedText(info)}`);
    }
  },
};
