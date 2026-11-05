// `edit <N | título>`: modifica el contenido (título, descripción, decisiones, bloqueo, disparador,
// detalles y, en handoff.md, «Qué falta», «Decisiones a medio camino» y «Próximo paso concreto») de
// una tarea existente. Nunca cambia su estado ni su lugar: una libre sigue libre, una bloqueada sigue
// bloqueada (el tag de `Bloqueos` decide el estado, ver `resolveBlocker`), una en curso o pausada
// sigue donde está, y no se mueven bloques entre secciones ni archivos. Solo se cambian los campos
// cuyo flag se pasa. Una tarea de history.md no se edita (es un registro). Sin `--apply` solo
// muestra el diff.

import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import type { Field, Task, TeamTask } from "../../../_shared/types.ts";
import { CliError, UsageError } from "../cli/errors.ts";
import type { Command, CommandContext } from "../cli/types.ts";
import { type Edit, replaceRange } from "../edit/edits.ts";
import { replaceSubsectionBody } from "../edit/layout.ts";
import { describeKnownNumbers, findTask, findTeamTasks, normalizeTitle, parseTarget, type Place, type TaskLocation, type TeamPlace } from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { trimRange } from "../query/lines.ts";
import { requireDoc, type Doc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { BLOCKING_TAGS } from "../write/blocking.ts";
import { singleLine, textFlag } from "../write/flags.ts";
import { findPart, invalidPlanLineMessages, invalidPlanLines, structureProblemMessage, structureProblems } from "../write/handoff.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS, type FieldKind } from "../write/language.ts";
import { normalizeText, renderField } from "../write/render.ts";
import { backlogTasks, headerLabels, labelResolver } from "../write/samples.ts";
import {
  backlogPlacement,
  currentFieldBody,
  fieldEdits,
  findPartField,
  type FieldValues,
  parsePreamble,
  pausedPlacement,
  preambleEdits,
  rejectLeadingTag,
  rejectStructuralLines,
  resolveBlocker,
  titleEdit,
} from "../write/task-edit.ts";
import { classifyBlocker } from "./add.ts";

const TEXT_FLAGS = ["title", "description", "decisions", "blocker", "trigger", "details", "missing", "next"] as const;
type TextFlag = (typeof TEXT_FLAGS)[number];
type Given = Partial<Record<TextFlag, string>>;

const PLACE_LABEL: Record<Place | TeamPlace, string> = {
  "in-progress": "en curso (handoff)",
  paused: "pausada (handoff)",
  free: "libre (backlog)",
  blocked: "bloqueada (backlog)",
  grouped: "agrupada (backlog)",
  history: "history",
  "team-free": "libre (team-backlog)",
  "team-blocked": "bloqueada (team-backlog)",
};

/** Lo que una edición calculó, listo para `commit`. */
interface Plan {
  doc: Doc<unknown>;
  edits: Edit[];
  /** `number` es `null` en las tareas del team-backlog (se identifican por su título). */
  task: { number: number | null; title: string };
  place: Place | TeamPlace;
  /** Avisos (no bloquean), uno por línea de salida. */
  notices: string[];
}

function textFlagDef(description: string) {
  return { type: "string", valueName: "texto", stdin: true, description } as const;
}

export const edit: Command = {
  name: "edit",
  summary: "Modifica el contenido de una tarea sin cambiar su estado; escribe con --apply",
  usage:
    "edit <N | título de una tarea del team-backlog> [--title <texto>] [--description <texto>] [--decisions <texto>] [--blocker <texto>] [--trigger <texto>] [--details <texto>] [--missing <texto>] [--next <texto>] [--json] [--apply]",
  writes: true,
  flags: {
    title: textFlagDef("Nuevo título (una línea). Reemplaza solo el texto: conserva el número y el nivel del header."),
    description: textFlagDef("Nueva descripción (en una tarea en curso, el texto bajo la línea `Tarea N — título`)."),
    decisions: textFlagDef("Nuevas decisiones/temas a definir (en handoff.md, «Decisiones a medio camino»)."),
    blocker: textFlagDef(
      "Nuevo valor de Bloqueos sin cambiar el estado: en una libre no puede bloquearla (usa `block`); en una bloqueada, con tag `[dependencia]`/`[postergada]` (`[dependency]`/`[postponed]` en inglés) se respeta y sin tag solo cambia el motivo. El tag se guarda tal cual se escribe: usa el del idioma de la documentación. No aplica en handoff.md.",
    ),
    trigger: textFlagDef("Nuevo Disparador. No aplica en el team-backlog.md ni en handoff.md."),
    details: textFlagDef("Nuevo contexto extendido (Detalles); si la tarea no tiene el campo, se agrega."),
    missing: textFlagDef("Nuevo texto de «Qué falta». Solo en una tarea en curso o pausada."),
    next: textFlagDef("Nuevo texto de «Próximo paso concreto». Solo en una tarea en curso o pausada."),
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1 || !ctx.args[0].trim()) {
      throw new UsageError("Indica la tarea: `edit <N> --title <texto> ...` o `edit <título de una tarea del team-backlog> ...`.");
    }
    const given: Given = {};
    for (const name of TEXT_FLAGS) {
      if (typeof flags[name] !== "string") continue;
      const value = textFlag(flags, name);
      if (!value) throw new UsageError(`--${name} está vacío: edit no borra campos; pasa el texto nuevo.`);
      given[name] = name === "title" ? singleLine("title", value) : value;
    }
    const changed = TEXT_FLAGS.filter((name) => given[name] !== undefined);
    if (!changed.length) {
      throw new UsageError(`Indica qué cambiar: ${TEXT_FLAGS.map((name) => `--${name}`).join(", ")}.`);
    }

    const target = parseTarget(ctx.args[0]);
    if (target.kind === "number" && target.operator) {
      throw new CliError(`edit solo edita tareas de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);
    }
    const plan = target.kind === "number" ? planNumbered(ctx, target.number, given) : planTeam(ctx, target.query, given);

    const result = ctx.commit([{ doc: plan.doc, edits: plan.edits }], { quiet: flags.json === true });
    if (flags.json === true) {
      emitWriteJson(ctx, "edit", result, {
        task: plan.task,
        place: plan.place,
        fields: changed,
        notice: plan.notices.join(" ") || null,
        notices: plan.notices,
      });
      return;
    }
    const who = plan.task.number != null ? `Tarea ${plan.task.number}` : `Tarea «${plan.task.title}»`;
    if (!result.dryRun && !result.files.some((file) => file.changed)) {
      io.out(`Sin cambios: la ${who} ya tenía esos valores.`);
    } else if (result.files.some((file) => file.written)) {
      io.out(`${who} editada (${changed.map((name) => `--${name}`).join(", ")}): ${PLACE_LABEL[plan.place]}, ${relFile(ctx.workspace({ allowFolderless: true }), plan.doc.path)}. Su estado no cambió.`);
    }
    for (const notice of plan.notices) io.out(`Aviso: ${notice}`);
  },
};

/** Falla si se pidió un flag que no aplica donde vive la tarea. */
function rejectFlags(given: Given, names: TextFlag[], why: string): void {
  const bad = names.filter((name) => given[name] !== undefined);
  if (bad.length) throw new CliError(`${bad.map((name) => `--${name}`).join(" y ")}: ${why}. No se escribió nada.`);
}

/** La etiqueta de un campo que haya que agregar: la de las tareas del archivo, o la del idioma detectado (con su aviso). */
function labelFor(fieldLists: Field[][], labels: string[]): { label: (kind: FieldKind) => string; notice: () => string | null } {
  let notice: string | null = null;
  const detected = () => {
    const found = detectLanguage(labels);
    notice = found.notice;
    return STRINGS[found.lang];
  };
  return {
    label: (kind) => labelResolver(fieldLists, detected())(kind),
    notice: () => notice,
  };
}

const WHERE_BLOCKER = (task: { fields: Field[] }) => {
  const tag = blockInfo(task).tag;
  return tag != null && BLOCKING_TAGS.test(tag);
};

/** Los valores de campos de una tarea de backlog.md o team-backlog.md, con `Bloqueos` ya resuelto según su estado. */
function backlogValues(
  text: string,
  task: { fields: Field[] },
  place: Place | TeamPlace,
  given: Given,
  team: boolean,
): FieldValues {
  const values: FieldValues = {};
  for (const name of ["description", "decisions", "trigger", "details"] as const) {
    const value = given[name];
    if (value === undefined) continue;
    rejectLeadingTag(name, value);
    values[name] = value;
  }
  if (given.blocker !== undefined) {
    const blocking = classifyBlocker(given.blocker).blocked;
    if (place === "grouped" && (blocking || WHERE_BLOCKER(task))) {
      throw new CliError("--blocker: una tarea agrupada no se bloquea ni se desbloquea desde el grupo (no sé a qué sección pertenece su estado). Sácala con `acsuite task group-eject N` y usa `block`/`unblock` o vuelve a editarla. No se escribió nada.");
    }
    // Los tags que citan los mensajes: los del idioma de los campos de la tarea, si se reconoce.
    const language = detectLanguage(task.fields.map((field) => field.label));
    values.blockers = resolveBlocker({
      tags: language.notice ? undefined : STRINGS[language.lang].tags,
      state: place === "blocked" || place === "team-blocked" ? "blocked" : "free",
      current: currentFieldBody(text, task.fields, "blockers"),
      value: given.blocker,
      blocking,
      team,
    });
  }
  return values;
}

function planNumbered(ctx: CommandContext, number: number, given: Given): Plan {
  const ws = ctx.workspace();
  requireOwnFolder(ws);
  const docs = ctx.docs();
  const found = findTask(docs, number);
  if (!found.length) throw new CliError(`No existe la Tarea ${number}. ${describeKnownNumbers(docs)}`);
  if (found.length > 1) {
    throw new CliError(`La Tarea ${number} aparece en ${found.length} lugares (${found.map((l) => l.place).join(", ")}): una tarea vive en un solo lugar; corrígelo a mano. No se escribió nada.`);
  }
  const location = found[0];
  if (location.place === "history") {
    throw new CliError(`La Tarea ${number} ya está cerrada (figura en history.md): history.md es un registro de solo lectura y edit no lo modifica. No se escribió nada.`);
  }
  if (location.place === "in-progress" || location.place === "paused") return planHandoff(ctx, location, given);

  const backlog = requireDoc(docs.backlog, "backlog.md");
  rejectFlags(given, ["missing", "next"], "«Qué falta» y «Próximo paso concreto» solo existen en una tarea en curso o pausada (handoff.md)");
  const { free, blocked, grouped } = backlog.parsed;
  const pool: Task[] = location.place === "free" ? free.tasks : location.place === "blocked" ? blocked : grouped.flatMap((group) => group.tasks);
  const task = pool.find((candidate) => candidate.number === number);
  if (!task) throw new CliError(`No pude ubicar la Tarea ${number} en backlog.md. No se escribió nada.`);

  const text = backlog.text;
  const block = location.range;
  const values = backlogValues(text, task, location.place, given, false);
  const names = labelFor(backlogTasks(docs).map((candidate) => candidate.fields), [task.label, ...headerLabels(docs)]);
  const edits = fieldEdits(text, task.fields, values, names.label, backlogPlacement(text, block, task.fields));
  if (given.title !== undefined) edits.unshift(titleEdit(text, block, "numbered", task.title, given.title));
  return { doc: backlog, edits, task: { number, title: given.title ?? task.title }, place: location.place, notices: names.notice() === null ? [] : [names.notice()!] };
}

function planHandoff(ctx: CommandContext, location: TaskLocation, given: Given): Plan {
  rejectFlags(given, ["blocker", "trigger"], "una tarea en curso o pausada no tiene ese campo (solo lo tienen las del backlog)");
  const docs = ctx.docs();
  const handoff = requireDoc(docs.handoff, "handoff.md");
  const text = handoff.text;
  const fieldLists = backlogTasks(docs).map((candidate) => candidate.fields);
  const edits: Edit[] = [];
  let names: ReturnType<typeof labelFor>;
  let title: string;

  if (location.place === "in-progress") {
    const { task, subsections } = handoff.parsed.inProgress;
    const section = handoff.parsed.sections["in-progress"];
    if (!task?.range || !section) throw new CliError(`No pude ubicar la Tarea ${location.number} en «Tarea en progreso». No se escribió nada.`);
    title = task.title;
    names = labelFor(fieldLists, [task.label, ...headerLabels(docs)]);
    if (given.title !== undefined) edits.push(titleEdit(text, task.range, "current", task.title, given.title));
    // Estos textos se escriben tal cual bajo «Tarea en progreso»: una línea con `#` o checkbox cambiaría su estructura.
    for (const name of ["description", "missing", "decisions", "next"] as const) {
      const value = given[name];
      if (value !== undefined) rejectStructuralLines(name, value);
    }

    if (given.description !== undefined || given.details !== undefined) {
      const region = { start: task.range.end, end: subsections[0]?.range?.start ?? section.bodyRange.end };
      const preamble = parsePreamble(text, region);
      edits.push(
        ...preambleEdits(
          preamble,
          task.range.end,
          { description: given.description && normalizeText(given.description), details: given.details },
          () => names.label("details"),
        ),
      );
    }
    for (const part of ["missing", "decisions", "next"] as const) {
      const value = given[part];
      if (value === undefined) continue;
      const sub = findPart(subsections, part);
      if (!sub?.range) throw new CliError(`«Tarea en progreso» no tiene la subsección «${STRINGS.es[part]}»: agrégala a mano antes de editarla. No se escribió nada.`);
      edits.push(replaceSubsectionBody(text, sub.range, normalizeText(value)));
    }
  } else {
    const task = handoff.parsed.paused.find((candidate) => candidate.number === location.number);
    if (!task?.range) throw new CliError(`No pude ubicar la Tarea ${location.number} en «Tareas pausadas». No se escribió nada.`);
    title = task.title;
    names = labelFor(fieldLists, [task.label, ...headerLabels(docs)]);
    const block = location.range;
    const newline = text.indexOf("\n", block.start);
    const headerEnd = newline === -1 || newline > block.end ? block.end : newline;
    if (given.title !== undefined) edits.push(titleEdit(text, block, "numbered", task.title, given.title));
    // Igual que en curso: estos textos se escriben tal cual y una línea con `#` o checkbox cambiaría la estructura.
    for (const name of ["description", "details", "missing", "decisions", "next"] as const) {
      const value = given[name];
      if (value !== undefined) rejectStructuralLines(name, value);
    }

    const values: FieldValues = {};
    if (given.description !== undefined) values.description = given.description;
    if (given.details !== undefined) values.details = given.details;
    edits.push(...fieldEdits(text, task.fields, values, names.label, pausedPlacement(text, headerEnd, task.fields)));
    for (const part of ["missing", "decisions", "next"] as const) {
      const value = given[part];
      if (value === undefined) continue;
      const field = findPartField(task.fields, part);
      if (!field?.range) throw new CliError(`La Tarea ${task.number} pausada no tiene el campo «${STRINGS.es[part]}»: agrégalo a mano antes de editarlo. No se escribió nada.`);
      edits.push(replaceRange(trimRange(text, field.range), renderField(field.label, value)));
    }
  }
  // Avisa (no bloquea) de las líneas del plan de la tarea en curso que `close` y `pause` rechazarían.
  // Se evalúa sobre el texto ya editado: así el número de línea es el que tendrá el archivo escrito.
  const edited = [...edits].sort((a, b) => b.start - a.start || b.end - a.end).reduce((acc, e) => acc.slice(0, e.start) + e.text + acc.slice(e.end), text);
  let planNotices: string[] = [];
  if (location.place === "in-progress") {
    const reparsed = parseHandoff(edited);
    const lang = detectLanguage([handoff.parsed.inProgress.task!.label, ...headerLabels(docs)]).lang;
    planNotices = [
      ...invalidPlanLineMessages(invalidPlanLines(edited, reparsed.inProgress.subsections), lang),
      ...structureProblems(edited, reparsed, lang).map(structureProblemMessage),
    ];
  }
  const notices = [names.notice(), ...planNotices].filter((part) => part !== null);
  return { doc: handoff, edits, task: { number: location.number, title: given.title ?? title }, place: location.place, notices };
}

function planTeam(ctx: CommandContext, query: string, given: Given): Plan {
  // El operador «solo team-backlog» también puede editar acá.
  ctx.workspace({ allowFolderless: true });
  const docs = ctx.docs({ allowFolderless: true });
  const team = docs.teamBacklog;
  if (!team?.exists) {
    throw new CliError(`«${query}» no es un número de tarea y no hay team-backlog.md donde buscar un título${team ? "" : " (el repo es plano)"}.`);
  }
  const found = findTeamTasks(docs, query);
  if (!found.length) throw new CliError(`Ninguna tarea del team-backlog.md tiene «${query}» en su título.`);
  const titles = [...new Set(found.map((l) => l.title))];
  if (titles.length > 1) {
    throw new CliError(`«${query}» coincide con ${titles.length} tareas del team-backlog.md; sé más específico:\n${titles.map((t) => `  - ${t}`).join("\n")}`);
  }
  if (found.length > 1) {
    throw new CliError(`El título «${titles[0]}» aparece ${found.length} veces en el team-backlog.md: deberían ser únicos; corrígelo a mano. No se escribió nada.`);
  }
  const location = found[0];
  rejectFlags(given, ["trigger"], "las tareas del team-backlog.md no llevan Disparador (lo completa quien la toma)");
  rejectFlags(given, ["missing", "next"], "«Qué falta» y «Próximo paso concreto» solo existen en una tarea en curso o pausada (handoff.md)");

  const all: TeamTask[] = [...team.parsed.free, ...team.parsed.blocked].filter((candidate) => !candidate.isPlaceholder);
  const task = all.find((candidate) => candidate.range?.start === location.range.start);
  if (!task) throw new CliError(`No pude ubicar «${location.title}» en team-backlog.md. No se escribió nada.`);
  if (given.title !== undefined) {
    const wanted = normalizeTitle(given.title);
    const repeated = all.find((candidate) => candidate !== task && normalizeTitle(candidate.title) === wanted);
    if (repeated) {
      throw new CliError(`Ya hay una tarea con el título «${repeated.title}» en team-backlog.md: el título identifica la tarea y debe ser único. No se escribió nada.`);
    }
  }

  const text = team.text;
  const block = location.range;
  const values = backlogValues(text, task, location.place, given, true);
  const names = labelFor(all.map((candidate) => candidate.fields), [...all.flatMap((candidate) => candidate.fields.map((field) => field.label)), ...headerLabels(docs)]);
  const edits = fieldEdits(text, task.fields, values, names.label, backlogPlacement(text, block, task.fields));
  if (given.title !== undefined) edits.unshift(titleEdit(text, block, "team", task.title, given.title));
  // El título es la identidad de la tarea del team-backlog: lo que la nombre por título queda huérfano.
  const renamed = given.title !== undefined && given.title !== task.title ? `el título cambió de «${task.title}» a «${given.title}»: revisa las referencias por título (en otras tareas, handoff o history), que ya no apuntan a esta tarea.` : null;
  const notices = [names.notice(), renamed].filter((part) => part !== null);
  return { doc: team, edits, task: { number: null, title: given.title ?? task.title }, place: location.place, notices };
}
