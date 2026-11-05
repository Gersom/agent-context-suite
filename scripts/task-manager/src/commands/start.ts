// `start <N>` / `start --team "<título>"`: empieza una tarea. En una sola operación (todos los
// archivos o ninguno): saca su bloque de `backlog.md` (o de `team-backlog.md`) y escribe «Tarea en
// progreso» de `handoff.md` según la plantilla. Con `--team` la tarea recibe el siguiente número de
// «Próximo número de tarea» (que pasa a N+1) y el handoff lleva `Origen: team-backlog`. Exige que no
// haya otra tarea en curso y que la elegida esté libre. Sin `--apply` solo muestra el diff. La rama y
// el commit no son asunto del script.

import type { Field, Range } from "../../../_shared/types.ts";
import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { CliError, UsageError } from "../cli/errors.ts";
import type { Command, CommandContext } from "../cli/types.ts";
import type { FileChange } from "../edit/changes.ts";
import { insertBlock, removeBlock } from "../edit/layout.ts";
import {
  describeKnownNumbers,
  findTask,
  findTeamTasks,
  parseTarget,
  type Place,
  type TaskLocation,
  type TeamLocation,
} from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { type Doc, requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { singleLine, textFlag } from "../write/flags.ts";
import { EXECUTION_MODES, parseExecutionMode, requireFreeInProgress } from "../write/handoff.ts";
import { detectLanguage, findFieldOfKind, STRINGS } from "../write/language.ts";
import { reserveNextNumber } from "../write/numbering.ts";
import { carriedFields, fieldBody, meaningfulField, parsePlan, renderInProgress } from "../write/render.ts";
import { headerLabels } from "../write/samples.ts";

const PLACE_LABEL: Partial<Record<Place, string>> = {
  "in-progress": "ya es la tarea en curso",
  paused: "está pausada (retómala con `resume` en vez de empezarla)",
  history: "ya está cerrada (figura en history.md)",
};

/** Lo que `start` necesita saber de la tarea elegida, venga de donde venga. */
interface Source {
  title: string;
  /** Número que ya tiene la tarea; `null` si viene del team-backlog (recibe el siguiente). */
  number: number | null;
  fields: Field[];
  doc: Doc<unknown>;
  /** Su bloque, sin las líneas en blanco de los extremos. */
  range: Range;
  blocked: boolean;
  /** La sección tiene más bloques además de este. */
  othersExist: boolean;
  /** Palabra del header (`Tarea`, `Task`) si la tarea la trae (las del team-backlog no). */
  label: string | null;
  /** Dónde estaba, para el mensaje final. */
  from: string;
}

export const start: Command = {
  name: "start",
  summary: "Empieza una tarea: la saca del backlog y arma «Tarea en progreso» en el handoff; escribe con --apply",
  usage: `start <N | T-N> [--plan -] [--mode <${EXECUTION_MODES.join("|")}> [--confirm]] [--force] [--apply]   |   start --team "<título>" [--plan -] [--mode <modo> [--confirm]] [--force] [--apply]`,
  writes: true,
  flags: {
    team: { type: "boolean", description: "Tomar la tarea del team-backlog.md (por título): recibe el siguiente número y el handoff lleva `Origen: team-backlog`." },
    plan: {
      type: "string",
      valueName: "pasos",
      stdin: true,
      description: "Plan: un paso por línea (con `-`, de la entrada estándar). Se agrega siempre el paso final «Documentar cierre de tarea». Sin plan, no se escribe esa subsección.",
    },
    mode: { type: "string", valueName: "modo", description: `Modo de ejecución acordado del plan (solo con --plan): ${EXECUTION_MODES.join(", ")}.` },
    confirm: { type: "boolean", description: "Obligatorio con `--mode extreme`: el agente ya lo confirmó con el operador en el chat (la herramienta no puede comprobarlo). Con los demás modos se ignora." },
    force: { type: "boolean", description: "Empezar una tarea aunque esté en «bloqueadas / pospuestas» (queda constancia en la salida)." },
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1 || !ctx.args[0].trim()) {
      throw new UsageError("Indica la tarea: `start <N>` o `start --team \"<título>\"`.");
    }
    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const team = flags.team === true;

    const planText = textFlag(flags, "plan");
    const plan = planText ? parsePlan(planText) : null;
    if (planText && !plan?.length) throw new UsageError("--plan no trae ningún paso: escribe uno por línea.");
    const modeText = textFlag(flags, "mode");
    if (modeText && !plan) throw new UsageError("--mode solo tiene sentido con --plan.");
    if (modeText) singleLine("mode", modeText);
    const mode = modeText ? parseExecutionMode(modeText, flags.confirm === true) : undefined;

    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");
    const backlog = requireDoc(docs.backlog, "backlog.md");

    const section = requireFreeInProgress(handoff, "empezar otra");

    const source = team ? findInTeam(ctx, ctx.args[0]) : findInBacklog(ctx, ctx.args[0]);
    if (source.blocked && flags.force !== true) {
      const block = blockInfo({ fields: source.fields });
      throw new CliError(
        `«${source.title}» está en «bloqueadas / pospuestas»${block.tag ? ` (${block.tag}${block.reason ? `: ${block.reason}` : ""})` : ""}: resuelve el bloqueo antes de empezarla o repite con --force. No se escribió nada.`,
      );
    }

    // Número: el de la tarea, o el siguiente de la secuencia si viene del team-backlog.
    const reserved = team ? reserveNextNumber(docs) : null;
    const number = (reserved?.number ?? source.number)!;

    // Idioma: el de la tarea o, si no lo dice, el de los archivos.
    const labels = [...(source.label ? [source.label] : []), ...headerLabels(docs), ...source.fields.map((field) => field.label)];
    const { lang, notice } = detectLanguage(labels);
    const S = STRINGS[lang];

    const text = source.doc.text;
    const descriptionField = findFieldOfKind(source.fields, "description");
    const extras = carriedFields(text, source.fields);
    if (team) extras.unshift(`- **${S.origin}:** team-backlog`);
    const body = renderInProgress({
      strings: S,
      label: source.label ?? headerLabels(docs)[0] ?? S.task,
      number,
      title: source.title,
      description: descriptionField && !descriptionField.isPlaceholder ? fieldBody(text, descriptionField) || null : null,
      extras,
      decisions: meaningfulField(text, source.fields, "decisions"),
      plan,
      mode: mode ?? null,
    });

    const removal = removeBlock(text, source.range, S.emptySection, source.othersExist);
    const changes: FileChange[] = [
      { doc: handoff, edits: [insertBlock(handoff.text, section.bodyRange, body, { hasBlocks: false })] },
      ...(team ? [{ doc: backlog, edits: [reserved!.edit] }, { doc: source.doc, edits: [removal] }] : [{ doc: source.doc, edits: [removal] }]),
    ];
    const result = ctx.commit(changes);

    if (result.files.some((file) => file.written)) {
      io.out(
        team
          ? `«${source.title}» tomada de ${source.from} como Tarea ${number} (próximo número: ${number + 1}) y puesta en «Tarea en progreso» de ${relFile(ws, handoff.path)}.`
          : `Tarea ${number} empezada: sacada de ${source.from} y puesta en «Tarea en progreso» de ${relFile(ws, handoff.path)}.`,
      );
    }
    if (source.blocked) io.out(`Aviso: se empezó una tarea bloqueada por --force; su bloqueo era: ${blockInfo({ fields: source.fields }).reason ?? "(sin motivo)"}.`);
    if (notice) io.out(`Aviso: ${notice}`);
  },
};

function findInBacklog(ctx: CommandContext, arg: string): Source {
  const docs = ctx.docs();
  const target = parseTarget(arg);
  if (target.kind === "title") {
    throw new UsageError(`«${arg}» no es un número de tarea. Para tomar una tarea del team-backlog.md usa \`start --team "<título>"\`.`);
  }
  if (target.operator) {
    throw new CliError(`start solo empieza tareas de tu propia carpeta; «${arg}» es de otro operador (solo lectura). No se escribió nada.`);
  }
  const found = findTask(docs, target.number);
  if (!found.length) throw new CliError(`No existe la Tarea ${target.number}. ${describeKnownNumbers(docs)}`);
  if (found.length > 1) {
    throw new CliError(`La Tarea ${target.number} aparece en ${found.length} lugares (${found.map((l) => l.place).join(", ")}): una tarea vive en un solo lugar; corrígelo a mano antes de empezarla. No se escribió nada.`);
  }
  const location: TaskLocation = found[0];
  const reason = PLACE_LABEL[location.place];
  if (reason) throw new CliError(`La Tarea ${target.number} ${reason}. No se escribió nada.`);
  if (location.place === "grouped") {
    throw new CliError(
      `La Tarea ${target.number} es una tarea agrupada (grupo «${location.group}»): para empezarla hay que sacarla del grupo: \`acsuite task group-eject ${target.number}\` la pasa a «Tareas libres»; vuelve a intentarlo después. No se escribió nada.`,
    );
  }
  const { free, blocked } = docs.backlog.parsed;
  const blocks = location.place === "blocked" ? blocked : [...free.tasks, ...free.groups];
  const task = (location.place === "blocked" ? blocked : free.tasks).find((candidate) => candidate.number === target.number);
  if (!task) throw new Error(`La Tarea ${target.number} está en ${location.place} pero el parser no la devolvió.`);
  return {
    title: task.title,
    number: task.number,
    fields: task.fields,
    doc: docs.backlog,
    range: location.range,
    blocked: location.place === "blocked",
    othersExist: blocks.length > 1,
    label: task.label,
    from: location.place === "blocked" ? "«Tareas bloqueadas / pospuestas»" : "«Tareas libres»",
  };
}

function findInTeam(ctx: CommandContext, query: string): Source {
  const docs = ctx.docs();
  const team = docs.teamBacklog;
  if (!team?.exists) {
    throw new CliError(`No hay team-backlog.md donde buscar «${query}»${team ? "" : " (el repo es plano)"}.`);
  }
  const found: TeamLocation[] = findTeamTasks(docs, query);
  if (!found.length) throw new CliError(`Ninguna tarea del team-backlog.md tiene «${query}» en su título.`);
  const titles = [...new Set(found.map((location) => location.title))];
  if (titles.length > 1) {
    throw new CliError(`«${query}» coincide con ${titles.length} tareas del team-backlog.md; sé más específico:\n${titles.map((t) => `  - ${t}`).join("\n")}`);
  }
  if (found.length > 1) throw new CliError(`El título «${titles[0]}» aparece ${found.length} veces en team-backlog.md: deberían ser únicos; corrígelo a mano antes de tomarla. No se escribió nada.`);
  const location = found[0];
  const blocked = location.place === "team-blocked";
  const list = blocked ? team.parsed.blocked : team.parsed.free;
  const task = list.find((candidate) => candidate.title === location.title);
  if (!task) throw new Error(`«${location.title}» está en ${location.place} pero el parser no la devolvió.`);
  return {
    title: task.title,
    number: null,
    fields: task.fields,
    doc: team,
    range: location.range,
    blocked,
    othersExist: list.filter((candidate) => !candidate.isPlaceholder).length > 1,
    label: null,
    from: blocked ? "«Tareas bloqueadas / pospuestas» del team-backlog.md" : "«Tareas libres» del team-backlog.md",
  };
}
