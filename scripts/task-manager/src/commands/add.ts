// `add`: agrega una tarea al `backlog.md` propio (con el número de «Próximo número de tarea», que
// pasa a N+1 en la misma edición) o, con `--team`, al `team-backlog.md` compartido (sin número, con
// un título único y `Agregada: <fecha> por <operador>`). Va a «libres» o a «bloqueadas» según su
// bloqueo, al final de la sección y con el espaciado del archivo; si la sección solo tenía el texto
// de vacío o un placeholder, la tarea lo reemplaza. Sin `--apply` solo muestra el diff.

import { blockInfo } from "../../../_shared/tasks/block-info.ts";
import { CliError, UsageError } from "../cli/errors.ts";
import type { Command, CommandContext } from "../cli/types.ts";
import { blockSeparator, insertBlock } from "../edit/layout.ts";
import { normalizeTitle } from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { BLOCKING_TAGS, citeBlockingTags } from "../write/blocking.ts";
import { requiredFlag, singleLine, textFlag } from "../write/flags.ts";
import { formatLabels, parseLabels } from "../write/labels.ts";
import { detectLanguage, NONE_RE, STRINGS, type Strings } from "../write/language.ts";
import { renderBacklogTask } from "../write/new-task.ts";
import { reserveNextNumber } from "../write/numbering.ts";
import { formatLocalDate, renderTaskBlock } from "../write/render.ts";
import { headerLabels, labelResolver } from "../write/samples.ts";

/**
 * ¿El texto de `--blocker` bloquea la tarea? Si dice algo pero sin el tag esperado, avisa en vez de adivinar.
 * @param tags tags del idioma del archivo, si se conoce; sin ellos el aviso cita los dos idiomas
 */
export function classifyBlocker(value: string, tags?: Strings["tags"]): { blocked: boolean; warning: string | null } {
  if (!value.trim() || NONE_RE.test(value.trim())) return { blocked: false, warning: null };
  const { tag } = blockInfo({ fields: [{ label: "Bloqueos", value }] });
  if (tag && BLOCKING_TAGS.test(tag)) return { blocked: true, warning: null };
  return {
    blocked: false,
    warning: `--blocker no empieza con ${citeBlockingTags(tags, "ni")}: la tarea va a «libres» (si debe quedar bloqueada, empieza el texto con uno de los dos tags).`,
  };
}

export const add: Command = {
  name: "add",
  summary: "Agrega una tarea a tu backlog.md (o al team-backlog.md con --team); escribe con --apply",
  usage:
    "add --title <título> --description <texto> [--decisions <texto>] [--blocker <texto>] [--trigger <texto>] [--labels <texto>] [--details <texto>] [--team] [--apply]",
  writes: true,
  flags: {
    title: { type: "string", valueName: "título", stdin: true, description: "Título de la tarea (una línea). Obligatorio." },
    description: { type: "string", valueName: "texto", stdin: true, description: "De qué trata (1–3 líneas). Obligatorio." },
    decisions: {
      type: "string",
      valueName: "texto",
      stdin: true,
      description: "Decisiones/temas a definir antes de empezar. Por defecto «Ninguno.».",
    },
    blocker: {
      type: "string",
      valueName: "texto",
      stdin: true,
      description: "Bloqueo: «Ninguno.» (por defecto) o un texto que empiece con `[dependencia]` o `[postergada]` (`[dependency]`/`[postponed]` en un proyecto en inglés; va a «bloqueadas»). El tag se guarda tal cual se escribe: usa el del idioma de la documentación.",
    },
    trigger: {
      type: "string",
      valueName: "texto",
      stdin: true,
      description: "Cuándo corresponde tomarla. Por defecto, el genérico de la plantilla. No aplica con --team.",
    },
    labels: {
      type: "string",
      valueName: "texto",
      stdin: true,
      description:
        "Etiquetas (campo Etiquetas / Tags): separadas por espacios o comas, con un `#` inicial opcional (se quita), solo letras ASCII y números; los duplicados (sin distinguir mayúsculas) se quitan y se conserva el orden. Se guardan separadas por un espacio y sin `#`. Opcional: si no se pasa, el campo se omite. Vale también con --team.",
    },
    details: { type: "string", valueName: "texto", stdin: true, description: "Contexto extendido. Opcional: si no se pasa, el campo se omite." },
    team: {
      type: "boolean",
      description: "Agregarla al team-backlog.md compartido (sin número; título único) en vez de a tu backlog.md. Sirve también al operador «solo team-backlog».",
    },
  },
  run(ctx) {
    const { flags } = ctx;
    const title = singleLine("title", requiredFlag(flags, "title"));
    const labelList = parseLabels("labels", textFlag(flags, "labels") ?? "");
    const input = {
      title,
      description: requiredFlag(flags, "description"),
      decisions: textFlag(flags, "decisions"),
      blocker: textFlag(flags, "blocker"),
      trigger: textFlag(flags, "trigger"),
      labels: labelList.length ? formatLabels(labelList) : undefined,
      details: textFlag(flags, "details"),
    };
    return flags.team === true ? addToTeam(ctx, input) : addToBacklog(ctx, input);
  },
};

interface AddInput {
  title: string;
  description: string;
  decisions?: string;
  blocker?: string;
  trigger?: string;
  /** Etiquetas ya normalizadas (separadas por un espacio, sin `#`); sin ellas el campo se omite. */
  labels?: string;
  details?: string;
}

function addToBacklog(ctx: CommandContext, input: AddInput): void {
  const { io } = ctx;
  const ws = ctx.workspace();
  requireOwnFolder(ws);
  const docs = ctx.docs();
  const backlog = requireDoc(docs.backlog, "backlog.md");
  const reserved = reserveNextNumber(docs);

  // Idioma y etiquetas: las de las tareas que el archivo ya tiene; si no hay, la tabla mínima.
  const { lang, notice } = detectLanguage(headerLabels(docs), docs.rulesText);
  const S = STRINGS[lang];
  const kind = classifyBlocker(input.blocker ?? "", notice ? undefined : S.tags);
  const sectionId = kind.blocked ? "blocked" : "free";
  const section = backlog.parsed.sections[sectionId];
  if (!section) {
    throw new CliError(`backlog.md no tiene la sección «${sectionId}» (${kind.blocked ? "tareas bloqueadas / pospuestas" : "tareas libres"}): no sé dónde agregar la tarea. No se escribió nada.`);
  }

  const block = renderBacklogTask(docs, S, kind.blocked ? backlog.parsed.blocked : backlog.parsed.free.tasks, {
    number: reserved.number,
    title: input.title,
    description: input.description,
    decisions: input.decisions,
    blocker: input.blocker,
    trigger: input.trigger,
    labels: input.labels,
    details: input.details,
    date: formatLocalDate(ctx.now()),
  });

  const blocks = kind.blocked ? backlog.parsed.blocked : [...backlog.parsed.free.tasks, ...backlog.parsed.free.groups];
  const insert = insertBlock(backlog.text, section.bodyRange, block, {
    hasBlocks: blocks.length > 0,
    separator: blockSeparator(backlog.text, blocks.flatMap((b) => (b.range ? [b.range] : []))),
  });

  const result = ctx.commit([{ doc: backlog, edits: [insert, reserved.edit] }]);
  if (result.files.some((file) => file.written)) {
    io.out(`Tarea ${reserved.number} agregada a «${kind.blocked ? "Tareas bloqueadas / pospuestas" : "Tareas libres"}» de ${relFile(ws, backlog.path)} (próximo número: ${reserved.number + 1}).`);
  }
  for (const warning of [kind.warning, notice]) if (warning) io.out(`Aviso: ${warning}`);
}

function addToTeam(ctx: CommandContext, input: AddInput): void {
  const { io } = ctx;
  if (input.trigger) {
    throw new UsageError("--trigger no aplica con --team: las tareas del team-backlog.md no llevan Disparador (lo completa quien la toma).");
  }
  // El operador «solo team-backlog» no tiene carpeta, pero sí puede agregar acá.
  const ws = ctx.workspace({ allowFolderless: true });
  if (ws.mode === "flat" || !ws.operator) {
    throw new CliError("--team no aplica: el repo es plano (no hay operators.md ni team-backlog.md compartido).");
  }
  const operator = ws.operator.folder;
  const docs = ctx.docs({ allowFolderless: true });
  const team = requireDoc(docs.teamBacklog, "team-backlog.md");

  const all = [...team.parsed.free, ...team.parsed.blocked].filter((task) => !task.isPlaceholder);
  const wanted = normalizeTitle(input.title);
  const repeated = all.find((task) => normalizeTitle(task.title) === wanted);
  if (repeated) {
    throw new CliError(`Ya hay una tarea con el título «${repeated.title}» en team-backlog.md: el título identifica la tarea y debe ser único. No se escribió nada.`);
  }

  const fieldLists = [...team.parsed.free, ...team.parsed.blocked].map((task) => task.fields);
  const detected = detectLanguage([
    ...fieldLists.flat().map((field) => field.label),
    ...headerLabels(docs),
  ], docs.rulesText);
  const S = STRINGS[detected.lang];
  const kind = classifyBlocker(input.blocker ?? "", detected.notice ? undefined : S.tags);
  const sectionId = kind.blocked ? "blocked" : "free";
  const section = team.parsed.sections[sectionId];
  if (!section) {
    throw new CliError(`team-backlog.md no tiene la sección «${sectionId}» (${kind.blocked ? "tareas bloqueadas / pospuestas" : "tareas libres"}): no sé dónde agregar la tarea. No se escribió nada.`);
  }
  const label = labelResolver(fieldLists, S);

  const fields: Array<[string, string]> = [
    [label("description"), input.description],
    [label("decisions"), input.decisions ?? S.none],
    [label("blockers"), input.blocker ?? S.none],
  ];
  if (input.labels) fields.push([label("labels"), input.labels]);
  if (input.details) fields.push([label("details"), input.details]);
  fields.push([label("added"), `${formatLocalDate(ctx.now())} ${S.by} ${operator}`]);
  const block = renderTaskBlock(`### ${input.title}`, fields);

  const sectionTasks = (kind.blocked ? team.parsed.blocked : team.parsed.free).filter((task) => !task.isPlaceholder);
  const insert = insertBlock(team.text, section.bodyRange, block, {
    hasBlocks: sectionTasks.length > 0,
    separator: blockSeparator(team.text, sectionTasks.flatMap((task) => (task.range ? [task.range] : []))),
  });

  const result = ctx.commit([{ doc: team, edits: [insert] }]);
  if (result.files.some((file) => file.written)) {
    io.out(`Tarea «${input.title}» agregada a «${kind.blocked ? "Tareas bloqueadas / pospuestas" : "Tareas libres"}» de ${relFile(ws, team.path)} (por ${operator}).`);
  }
  for (const warning of [kind.warning, detected.notice]) if (warning) io.out(`Aviso: ${warning}`);
}
