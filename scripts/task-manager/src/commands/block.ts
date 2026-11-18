// `block <N> --tag <dependency|postponed> --reason <texto>`: bloquea una tarea libre de tu
// `backlog.md`. Pone su campo `Bloqueos` en `` `[tag]` motivo `` (el tag en el idioma del proyecto:
// `dependencia`/`postergada` o `dependency`/`postponed`; si ya traía un `[Resuelto ...]` de un
// bloqueo anterior, queda después: el vigente va primero) y mueve su bloque de «Tareas libres» al
// final de «Tareas bloqueadas / pospuestas». Sin `--apply` solo muestra el diff.

import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { blockSeparator, insertBlock } from "../edit/layout.ts";
import { describeKnownNumbers, findTask, parseTarget } from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { trimRange } from "../query/lines.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { blockedValue, currentBlockers, parseTagFlag, removeBlocks, withBlockers } from "../write/blocking.ts";
import { requiredFlag } from "../write/flags.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, NONE_RE, STRINGS } from "../write/language.ts";
import { headerLabels } from "../write/samples.ts";

export const WHERE: Record<string, string> = {
  "in-progress": "es la tarea en curso",
  paused: "está pausada",
  history: "ya está cerrada (figura en history.md)",
};

export const block: Command = {
  name: "block",
  summary: "Bloquea una tarea libre del backlog y la mueve a «bloqueadas / pospuestas»; escribe con --apply",
  usage: "block <N | T-N> --tag <dependency|postponed> --reason <texto> [--json] [--apply]",
  writes: true,
  flags: {
    tag: { type: "string", valueName: "tag", description: "`dependency` (no se puede empezar técnicamente) o `postponed` (conviene esperar). Se escribe en el idioma del proyecto. Obligatorio." },
    reason: {
      type: "string",
      valueName: "texto",
      stdin: true,
      description: "Por qué está bloqueada. Si depende de otra tarea, nómbrala como `Tarea N`: `unblock` la reconoce y la desbloquea sola al cerrarse. Obligatorio.",
    },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1 || !ctx.args[0].trim()) throw new UsageError("Indica la tarea: `block <N> --tag <dependency|postponed> --reason <texto>`.");
    const target = parseTarget(ctx.args[0]);
    if (target.kind === "title") throw new UsageError(`«${ctx.args[0]}» no es un número de tarea: \`block <N>\`.`);
    if (target.operator) throw new CliError(`block solo bloquea tareas de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);
    const tagFlag = requiredFlag(flags, "tag");
    const tag = parseTagFlag(tagFlag);
    if (!tag) {
      const spanish = /^`?\[?(dependencia|postergada)\]?`?$/i.test(tagFlag.trim());
      throw new UsageError(`--tag debe ser \`dependency\` o \`postponed\` (recibí «${tagFlag}»)${spanish ? ": los valores en español ya no valen, el flag va en inglés (el archivo se escribe en el idioma del proyecto)" : ""}.`);
    }
    const reason = requiredFlag(flags, "reason");

    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const backlog = requireDoc(docs.backlog, "backlog.md");

    const found = findTask(docs, target.number);
    if (!found.length) throw new CliError(`No existe la Tarea ${target.number}. ${describeKnownNumbers(docs)}`);
    if (found.length > 1) {
      throw new CliError(`La Tarea ${target.number} aparece en ${found.length} lugares (${found.map((l) => l.place).join(", ")}): una tarea vive en un solo lugar; corrígelo a mano. No se escribió nada.`);
    }
    const location = found[0];
    if (WHERE[location.place]) throw new CliError(`La Tarea ${target.number} ${WHERE[location.place]}: solo se bloquean las tareas libres. No se escribió nada.`);
    if (location.place === "blocked") {
      const task = backlog.parsed.blocked.find((candidate) => candidate.number === target.number);
      const info = task && blockInfo(task);
      throw new CliError(
        `La Tarea ${target.number} ya está en «bloqueadas / pospuestas»${info?.tag ? ` (${info.tag}${info.reason ? `: ${info.reason}` : ""})` : ""}: para cambiar su motivo edita \`Bloqueos\` a mano. No se escribió nada.`,
      );
    }
    if (location.place === "grouped") {
      throw new CliError(
        `La Tarea ${target.number} es una tarea agrupada (grupo «${location.group}»): para bloquearla hay que sacarla del grupo: \`acsuite task group-eject ${target.number}\` la pasa a «Tareas libres»; vuelve a intentarlo después. No se escribió nada.`,
      );
    }
    const { free, blocked } = backlog.parsed;
    const task = free.tasks.find((candidate) => candidate.number === target.number);
    const source = backlog.parsed.sections.free;
    const destination = backlog.parsed.sections.blocked;
    if (!task || !source || !destination) {
      throw new CliError("backlog.md no tiene las secciones «Tareas libres» y «Tareas bloqueadas / pospuestas» (anclas `free` y `blocked`). No se escribió nada.");
    }

    const existing = currentBlockers(backlog.text, task.fields);
    if (blockInfo(task).tag) {
      throw new CliError(
        `La Tarea ${target.number} está en «libres» pero ya tiene un bloqueo vigente (${blockInfo(task).tag}): el archivo es incoherente; corrígelo a mano. No se escribió nada.`,
      );
    }
    const kept = existing && !NONE_RE.test(existing) ? existing : null;
    const { lang, notice } = detectLanguage([task.label, ...headerLabels(docs)], docs.rulesText);
    const text = backlog.text;
    const range = trimRange(text, location.range);
    const written = STRINGS[lang].tags[tag];
    const moved = withBlockers(text, range, task.fields, STRINGS[lang].fields.blockers, blockedValue(written, reason, kept));

    const removal = removeBlocks(text, [...free.tasks, ...free.groups], [task], STRINGS[lang].emptySection);
    const destinationEdit = insertBlock(text, destination.bodyRange, moved, {
      hasBlocks: blocked.length > 0,
      separator: blockSeparator(text, blocked.flatMap((b) => (b.range ? [b.range] : []))),
    });
    const result = ctx.commit([{ doc: backlog, edits: [...removal, destinationEdit] }], { quiet: flags.json === true });

    if (flags.json === true) {
      emitWriteJson(ctx, "block", result, { task: { number: task.number, title: task.title }, tag: written, reason, notice });
      return;
    }
    if (result.files.some((file) => file.written)) {
      io.out(`Tarea ${task.number} bloqueada (${written}): pasó de «Tareas libres» a «Tareas bloqueadas / pospuestas» de ${relFile(ws, backlog.path)}.`);
    }
    if (notice) io.out(`Aviso: ${notice}`);
  },
};
