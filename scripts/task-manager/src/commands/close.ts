// `close`: cierra una tarea, hecha (`--done --summary`) o descartada (`--discarded --reason`), con las
// Reglas 6 a 9 de rules.md en una sola operación sobre todos los archivos (o ninguno):
// - `history.md`: la entrada `## <fecha> — ✅|❌ Tarea N — título` con el resumen o el motivo,
//   arriba de las demás. Si la tarea traía `Origen: team-backlog` o `Etiquetas`, la entrada los
//   conserva (las líneas `- **Origen:** ...` y `- **Etiquetas:** ...` tal cual, antes de las viñetas).
// - `handoff.md`: la tarea en curso (o, con `close <N>`, una pausada) sale y «Tarea en progreso»
//   queda en «Sin tarea en curso».
//   Con `close <N> --discarded` sobre una tarea que ni se empezó (está en «libres» o «bloqueadas» de
//   backlog.md; las agrupadas no: antes `group-eject N`), `handoff.md` no se toca (la tarea en curso, si hay, sigue igual):
//   solo se escribe la entrada ❌ y se saca su bloque del backlog. Una tarea sin empezar no se da por
//   hecha: con `--done` es un error que manda a `start N`.
// - `backlog.md`: si la tarea aún figura ahí (siempre, si es una tarea sin empezar), se saca; `--new "<título>"` (repetible) agrega tareas
//   nuevas con los números de «Próximo número de tarea»; y se revisan las bloqueadas (Regla 8): las
//   que dependían de tareas ya cerradas (contando esta) pasan a «Tareas libres» con `Bloqueos` →
//   `[Resuelto el <fecha>] — <motivo original>`; las de texto libre
//   se listan para revisar a mano solo con `--verbose` (el `--json` las trae siempre en `manualReview`).
// Con `--done --commits <h1,h2,...|auto>` la entrada ✅ termina con la viñeta `- Commit: h1.` o
// `- Commits: h1, h2.`; `auto` toma los commits del repo cuyo asunto lleva el scope `(T-N)` de la tarea.
// Imprime el reporte de cierre (Regla 9). No cierra nada ambiguo: contenido ajeno en «Tarea en
// progreso» es un error, como en `pause`. Sin `--apply` solo muestra el diff.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { Field, ParsedBacklog, ParsedHandoff } from "../../../_shared/types.ts";
import { CliError, UsageError } from "../cli/errors.ts";
import type { Command, FlagValue } from "../cli/types.ts";
import { type Edit, replaceRange } from "../edit/edits.ts";
import { blockSeparator, removeBlock } from "../edit/layout.ts";
import { describeKnownNumbers, findTask, parseTarget, type TaskLocation } from "../query/find.ts";
import { blockedText, relFile, shorten } from "../query/format.ts";
import { trimRange } from "../query/lines.ts";
import { buildState } from "../query/state.ts";
import { type Doc, type Docs, requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { requiredFlag, singleLine, textFlag } from "../write/flags.ts";
import { inspectCurrent } from "../write/handoff.ts";
import { insertHistoryEntry, type Outcome, renderHistoryEntry } from "../write/history.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, type FieldKind, findFieldOfKind, STRINGS, type Strings } from "../write/language.ts";
import { renderBacklogTask } from "../write/new-task.ts";
import { reserveNextNumbers } from "../write/numbering.ts";
import { closingStepRe, fieldBody, formatLocalDate } from "../write/render.ts";
import { headerLabels } from "../write/samples.ts";
import { isCommitHash } from "../write/suffix.ts";
import { insertIntoFree, planUnblock, reviewBlocked } from "../write/unblocking.ts";

/** Tras la que se corta la última línea de un motivo en el reporte («motivo breve»). */
const REASON_MAX = 140;
/** Desde cuántas «Tareas libres» se avisa que conviene agrupar (Agrupamiento en backlog.md). */
const GROUPING_LIMIT = 15;

const ORIGIN_LINE_RE = /^[-*]\s+\*\*(?:origen|origin)(?::\*\*|\*\*:)/i;
const ORIGIN_LABEL_RE = /^(origen|origin)$/i;
const LABELS_LINE_RE = /^[-*]\s+\*\*(?:etiquetas|tags)(?::\*\*|\*\*:)/i;
const STEP_RE = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
/** Una línea del resumen que ya lista commits (`Commit: ...`, `- Commits: ...`, `**Commits:** ...`, `Commits (skill): ...`). */
const COMMITS_LINE_RE = /^\s*(?:[-*]\s+)?(?:\*\*commits?(?:\s*\([^)]*\))?(?::\*\*|\*\*:)|commits?(?:\s*\([^)]*\))?:)/i;
/** El valor de `--commits` que pide los commits de la tarea en vez de una lista de hashes. */
const AUTO = "auto";
/** Tiempo máximo de `git log` sobre el historial del proyecto. */
const GIT_LOG_TIMEOUT = 30000;

/** Lo que `close` necesita de la tarea que cierra, venga de «Tarea en progreso» o de «Tareas pausadas». */
interface Closing {
  kind: "current" | "paused" | "backlog";
  label: string;
  number: number;
  title: string;
  /** Su línea `- **Origen:** ...` tal como está escrita, si la traía. */
  origin: string | null;
  /** Su línea `- **Etiquetas:** ...` tal como está escrita, si la traía. */
  labels: string | null;
  /** Textos de los pasos del plan que quedaban sin marcar (sin el de «Documentar cierre de tarea»). */
  pendingSteps: string[];
  /** Cómo sale del handoff, dado el texto de «Sin tarea en curso» y el de una sección vacía; `null` si no vive en handoff.md (tarea sin empezar). */
  remove: ((noTask: string, emptySection: string) => Edit) | null;
}

export const close: Command = {
  name: "close",
  summary: "Cierra la tarea en curso, una pausada o (solo --discarded) una sin empezar del backlog: entrada en history.md, «Sin tarea en curso», bloqueadas y reporte de cierre; escribe con --apply",
  usage:
    "close [<N | T-N>] --done --summary <texto> [--commits <h1,h2,... | auto>]   |   close [<N | T-N>] --discarded --reason <texto>   (N puede ser una tarea libre o bloqueada, sin empezarla)   [--new <título>]... [--verbose] [--json] [--apply]",
  writes: true,
  flags: {
    done: { type: "boolean", description: "La tarea se hizo (entrada ✅ Hecha). Exactamente uno de --done y --discarded." },
    discarded: { type: "boolean", description: "La tarea se descarta (entrada ❌ Descartada)." },
    summary: {
      type: "string",
      valueName: "texto",
      stdin: true,
      description: "Con --done, obligatorio: qué se hizo y por qué. Cada línea pasa a ser una viñeta de la entrada (las que ya empiezan con `- ` se conservan).",
    },
    reason: {
      type: "string",
      valueName: "texto",
      stdin: true,
      description: "Con --discarded, obligatorio: por qué se descarta (queda para que no se vuelva a proponer sin verlo).",
    },
    commits: {
      type: "string",
      valueName: "hashes",
      description:
        "Solo con --done: los commits de la tarea, hashes de 7 a 40 hex separados por comas, o `auto` (los commits del repo cuyo asunto lleva `(T-N)` de esta tarea, del más antiguo al más nuevo). La entrada termina con la viñeta `- Commit: h1.` o `- Commits: h1, h2.`; si el resumen ya trae una línea `Commit:`/`Commits:`, no se agrega otra.",
    },
    new: {
      type: "string",
      valueName: "título",
      multiple: true,
      description: "Agrega una tarea nueva a «Tareas libres» (surgió al cerrar esta); recibe el siguiente número. Para detallarla, `add`.",
    },
    verbose: { type: "boolean", description: "Imprime también «Para revisar a mano»: las bloqueadas cuyo motivo no nombra una tarea (sin relación con la que se cierra). Por defecto no se imprime; --json las trae siempre en `manualReview`." },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length > 1) throw new UsageError("`close` recibe a lo sumo una tarea: `close` (la en curso) o `close <N>` (una pausada, o una sin empezar con --discarded).");
    const done = flags.done === true;
    const discarded = flags.discarded === true;
    if (done === discarded) throw new UsageError("Indica cómo se cierra: `--done` (hecha) o `--discarded` (descartada), exactamente uno.");
    const outcome: Outcome = done ? "done" : "discarded";
    if (done && textFlag(flags, "reason")) throw new UsageError("--reason es de --discarded; con --done el texto va en --summary.");
    if (discarded && textFlag(flags, "summary")) throw new UsageError("--summary es de --done; con --discarded el texto va en --reason.");
    const text = requiredFlag(flags, done ? "summary" : "reason");
    const commitsArg = commitsFlag(flags, done);
    const newTitles = (Array.isArray(flags.new) ? flags.new : []).map((title) => {
      const clean = singleLine("new", title.trim());
      if (!clean) throw new UsageError("--new necesita un título.");
      return clean;
    });
    const wanted = ctx.args.length ? parseTarget(ctx.args[0]) : null;
    if (wanted?.kind === "title") throw new UsageError(`«${ctx.args[0]}» no es un número de tarea: \`close <N>\`.`);
    if (wanted?.operator) throw new CliError(`close solo cierra tareas de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);

    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const handoff = requireDoc(docs.handoff, "handoff.md");
    const history = requireDoc(docs.history, "history.md");
    const backlog = docs.backlog;
    if (newTitles.length) requireDoc(backlog, "backlog.md");

    // La tarea que se cierra.
    const current = handoff.parsed.inProgress.task;
    const pausedTasks = handoff.parsed.paused;
    let kind: Closing["kind"] | null = !wanted || wanted.number === current?.number ? "current" : pausedTasks.some((task) => task.number === wanted.number) ? "paused" : null;
    // Ni en curso ni pausada: solo se puede descartar, y solo si vive una vez en «libres» o «bloqueadas».
    let source: TaskLocation | null = null;
    if (!kind && wanted) {
      const places = findTask(docs, wanted.number);
      source = places.length === 1 && ["free", "blocked"].includes(places[0].place) ? places[0] : null;
      if (!source) throw new CliError(notClosable(docs, wanted.number, places));
      if (!discarded) throw new CliError(notDoneable(wanted.number, source));
      kind = "backlog";
    }
    if (kind === "current" && !current) {
      const hint = pausedTasks.length ? ` Para cerrar una pausada indica su número: \`close <N>\` (pausadas: ${pausedTasks.map((task) => task.number).join(", ")}).` : "";
      throw new CliError(`No hay tarea en curso que cerrar: «Tarea en progreso» dice «Sin tarea en curso».${hint} No se escribió nada.`);
    }
    const closing = kind === "current" ? closingCurrent(handoff) : kind === "paused" ? closingPaused(handoff, wanted!.number) : closingBacklog(backlog, source!);
    const { number } = closing;

    // Dónde más figura: en history.md no se duplica; en backlog.md se saca (Regla 6); lo demás es una anomalía.
    const places = findTask(docs, number);
    const own = closing.kind === "backlog" ? [source!] : places.filter((place) => place.place === (closing.kind === "current" ? "in-progress" : "paused"));
    if (own.length > 1) throw new CliError(`La Tarea ${number} aparece ${own.length} veces en handoff.md: una tarea vive en un solo lugar; corrígelo a mano. No se escribió nada.`);
    const elsewhere = places.filter((place) => !own.includes(place));
    const closed = elsewhere.find((place) => place.place === "history");
    if (closed) throw new CliError(`La Tarea ${number} ya figura cerrada en history.md (${closed.outcome === "discarded" ? "descartada" : "hecha"}): no duplico su entrada. Si sigue en handoff.md, sácala a mano. No se escribió nada.`);
    const odd = elsewhere.find((place) => !["free", "blocked"].includes(place.place));
    if (odd) throw new CliError(`La Tarea ${number} figura además en ${odd.place === "grouped" ? `«Tareas agrupadas» (grupo «${odd.group}»)` : odd.place}: una tarea vive en un solo lugar; corrígelo a mano antes de cerrarla. No se escribió nada.`);
    // Una tarea sin empezar no sale de handoff.md: su propio bloque del backlog es lo que se saca.
    const leftoverFree = closing.kind === "backlog" ? (source!.place === "free" ? source! : undefined) : elsewhere.find((place) => place.place === "free");
    const leftoverBlocked = closing.kind === "backlog" ? source!.place === "blocked" : elsewhere.some((place) => place.place === "blocked");

    const { lang, notice } = detectLanguage([closing.label, ...headerLabels(docs)], docs.rulesText);
    const S = STRINGS[lang];
    const date = formatLocalDate(ctx.now());

    // Regla 8: las bloqueadas que dependían de esta (y de otras ya cerradas).
    const state = buildState(docs);
    const review = reviewBlocked(state.blocked.filter((info) => info.number !== number), [number]);
    const withVerdict = (...verdicts: string[]) => review.infos.filter((info) => verdicts.includes(review.verdicts.get(info.number)!));
    const unblocked = withVerdict("auto", "stale");

    const backlogEdits: Edit[] = [];
    const moved: string[] = [];
    if (unblocked.length || leftoverBlocked) {
      const extra = backlog.parsed.blocked.filter((task) => task.number === number);
      const plan = planUnblock(backlog, unblocked, date, S, extra);
      backlogEdits.push(...plan.removals);
      moved.push(...plan.blocks);
    }
    const created: Array<{ number: number; title: string }> = [];
    if (newTitles.length) {
      const reserved = reserveNextNumbers(docs, newTitles.length);
      newTitles.forEach((title, i) => {
        created.push({ number: reserved.numbers[i], title });
        moved.push(
          renderBacklogTask(docs, S, backlog.parsed.free.tasks, {
            number: reserved.numbers[i],
            title,
            description: S.raisedWhenClosing(closing.label, number),
            date,
          }),
        );
      });
      backlogEdits.push(reserved.edit);
    }
    let insertedInFree = false;
    if (leftoverFree) {
      if (moved.length && closing.kind !== "backlog") {
        throw new CliError(
          `La Tarea ${number} sigue en «Tareas libres» de backlog.md y a esa misma sección hay que agregar tareas (desbloqueadas o nuevas): sácala de «libres» a mano y vuelve a intentarlo. No se escribió nada.`,
        );
      }
      const blocks = [...backlog.parsed.free.tasks, ...backlog.parsed.free.groups];
      const mine = trimRange(backlog.text, leftoverFree.range);
      if (!moved.length) {
        backlogEdits.push(removeBlock(backlog.text, mine, S.emptySection, blocks.length > 1));
      } else {
        // Sacar la tarea y agregar otras en la misma sección sin que las ediciones se pisen: si era el
        // último bloque, las nuevas ocupan su lugar (borrar e insertar tocarían el mismo punto); si no,
        // se borra (termina donde empieza el bloque siguiente) y se agrega al final, más adelante.
        const ranges = blocks.flatMap((block) => (block.range ? [trimRange(backlog.text, block.range)] : []));
        if (mine.end >= Math.max(...ranges.map((range) => range.end))) {
          backlogEdits.push(replaceRange(mine, moved.join(blockSeparator(backlog.text, ranges))));
        } else {
          backlogEdits.push(removeBlock(backlog.text, mine, S.emptySection, true), insertIntoFree(backlog, moved));
        }
        insertedInFree = true;
      }
    }
    if (moved.length && !insertedInFree) backlogEdits.push(insertIntoFree(backlog, moved));

    // `--commits auto` se resuelve con la tarea ya validada: si git falla no se escribe nada.
    const commits = commitsArg === AUTO ? taskCommits(ws.projectDir, number) : commitsArg;
    const notes: string[] = [];
    let entryText = text;
    if (commits) {
      if (text.split("\n").some((line) => COMMITS_LINE_RE.test(line))) notes.push("El resumen ya trae commits; no se agregó la línea.");
      else entryText = `${text}\n${commits.length === 1 ? S.commit : S.commits}: ${commits.join(", ")}.`;
    }

    const handoffEdit = closing.remove ? closing.remove(S.noTask, S.emptySection) : null;
    const entry = renderHistoryEntry({ date, outcome, label: closing.label, number, title: closing.title, text: entryText, origin: closing.origin, labels: closing.labels });
    const result = ctx.commit(
      [
        ...(handoffEdit ? [{ doc: handoff, edits: [handoffEdit] }] : []),
        { doc: history, edits: [insertHistoryEntry(history, entry)] },
        ...(backlogEdits.length ? [{ doc: backlog, edits: backlogEdits }] : []),
      ],
      { quiet: flags.json === true },
    );

    // Avisos que no impiden cerrar.
    const warnings: string[] = [];
    if (closing.pendingSteps.length) {
      warnings.push(`El plan de la Tarea ${number} tenía ${closing.pendingSteps.length} paso(s) sin marcar: ${closing.pendingSteps.map((step) => `«${step}»`).join(", ")}.`);
    }
    const freeAfter = state.free.length - (leftoverFree ? 1 : 0) + unblocked.length + created.length;
    if (freeAfter > GROUPING_LIMIT) {
      warnings.push(`«Tareas libres» queda con ${freeAfter} tareas (más de ${GROUPING_LIMIT}): evalúa agruparlas (Agrupamiento en backlog.md, Regla 8). No agrupo automáticamente.`);
    }
    if (notice) warnings.push(notice);

    const report = {
      resolved: outcome === "done" ? [{ number, title: closing.title }] : [],
      discarded: outcome === "discarded" ? [{ number, title: closing.title, reason: shortReason(text) }] : [],
      unblocked: unblocked.map((info) => ({ number: info.number, title: info.title })),
      created,
    };
    const manual = withVerdict("manual");
    const waiting = withVerdict("waiting");

    if (flags.json === true) {
      const row = (info: (typeof review.infos)[number]) => ({ number: info.number, title: info.title, tag: info.tag, reason: info.reason, refs: info.refs });
      emitWriteJson(ctx, "close", result, {
        task: { number, title: closing.title, outcome, date, from: closing.kind, origin: closing.origin },
        report,
        unblocked: unblocked.map((info) => ({ ...row(info), noActiveBlock: !info.tag })),
        manualReview: manual.map(row),
        stillBlocked: waiting.map(row),
        freeTasks: freeAfter,
        warnings,
        ...(commits ? { commits, notes } : {}),
      });
      return;
    }

    if (result.files.some((file) => file.written)) {
      io.out(
        closing.kind === "backlog"
          ? `Tarea ${number} descartada sin empezarla: entrada en ${relFile(ws, history.path)}, sacada de ${relFile(ws, backlog.path)}; ${relFile(ws, handoff.path)} no se toca.`
          : `Tarea ${number} cerrada (${outcome === "done" ? "hecha" : "descartada"}): entrada en ${relFile(ws, history.path)}, «${S.noTask}» en ${relFile(ws, handoff.path)}${backlogEdits.length ? `, backlog actualizado en ${relFile(ws, backlog.path)}` : ""}.`,
      );
      io.out();
      for (const line of renderReport(S, report)) io.out(line);
    }
    if (flags.verbose === true && manual.length) {
      io.out(`Para revisar a mano (el motivo no nombra una tarea propia): si ya no aplica, \`unblock <N>\`:`);
      for (const info of manual) io.out(`  ${blockedText(info)}`);
    }
    for (const note of notes) io.out(`Aviso: ${note}`);
    for (const warning of warnings) io.out(`Aviso: ${warning}`);
  },
};

/**
 * `--commits`: solo con `--done`; `auto` o una lista de hashes (7 a 40 hex) separados por comas, que se
 * guardan en minúsculas, recortados y sin repetir (en su orden). `undefined` si no se pasó. @throws UsageError
 */
function commitsFlag(flags: Record<string, FlagValue>, done: boolean): string[] | typeof AUTO | undefined {
  if (typeof flags.commits !== "string") return undefined;
  if (!done) throw new UsageError("--commits es de --done: los commits de una tarea descartada no van en su entrada.");
  const value = textFlag(flags, "commits");
  if (!value) throw new UsageError("--commits está vacío: pasa los hashes separados por comas (`--commits abc1234,def5678`) o `auto`.");
  singleLine("commits", value);
  if (value.toLowerCase() === AUTO) return AUTO;
  const hashes = value
    .split(",")
    .map((hash) => hash.trim())
    .filter(Boolean);
  if (!hashes.length) throw new UsageError("--commits está vacío: pasa los hashes separados por comas (`--commits abc1234,def5678`) o `auto`.");
  const invalid = hashes.find((hash) => !isCommitHash(hash));
  if (invalid !== undefined) throw new UsageError(`--commits «${invalid}» no es un hash: pasa de 7 a 40 caracteres hexadecimales separados por comas, o \`auto\` solo.`);
  return [...new Set(hashes.map((hash) => hash.toLowerCase()))];
}

/**
 * Los commits alcanzables desde HEAD en la raíz del proyecto cuyo asunto lleva `(T-N)` (N exacto: `(T-1)` no
 * coincide con `(T-12)`), sin merges, con hash de 7 caracteres y del más antiguo al más nuevo (por ancestría). @throws CliError si no es un repo git o falla git, o no hay ninguno
 */
function taskCommits(projectDir: string, number: number): string[] {
  const fail = (why: string) => new CliError(`--commits auto: no se pudo leer el historial de git en ${projectDir} (${why}). Pasa los hashes con --commits <h1,h2>. No se escribió nada.`);
  let out: SpawnSyncReturns<string>;
  try {
    // `--abbrev=7` fija el largo del hash corto (si no, manda `core.abbrev` del usuario); `--topo-order --reverse`
    // da un orden por ancestría (el más antiguo primero) aunque las fechas de los commits estén desordenadas.
    out = spawnSync("git", ["-C", projectDir, "log", "--no-show-signature", "--no-merges", "--topo-order", "--reverse", "--abbrev=7", "--format=%h%x09%s", "HEAD", "--"], { encoding: "utf8", timeout: GIT_LOG_TIMEOUT, maxBuffer: 256 * 1024 * 1024 });
  } catch {
    throw fail("no se pudo ejecutar git");
  }
  if (out.error) throw fail("no se pudo ejecutar git");
  if (out.status !== 0) throw fail("¿es un repo git con al menos un commit?");
  const scope = new RegExp(`\\(T-${number}\\)`);
  const hashes = out.stdout.split("\n").flatMap((line) => {
    const [hash, ...subject] = line.replace(/\r$/, "").split("\t");
    return isCommitHash(hash) && scope.test(subject.join("\t")) ? [hash.toLowerCase()] : [];
  });
  if (!hashes.length) throw new CliError(`--commits auto: ningún commit de ${projectDir} lleva «(T-${number})» en su asunto. Pasa los hashes con --commits <h1,h2> o cierra sin --commits. No se escribió nada.`);
  return [...new Set(hashes)];
}

/** Primera línea del motivo, sin la viñeta, recortada: es lo que sale en el reporte (el texto completo queda en history.md). */
function shortReason(text: string): string {
  const first = text.split("\n").find((line) => line.trim()) ?? "";
  return shorten(first.replace(/^\s*[-*]\s+/, ""), REASON_MAX);
}

/** El reporte de cierre de la Regla 9: cuatro secciones, las vacías se omiten. */
function renderReport(
  { task: word, report: titles }: Pick<Strings, "task" | "report">,
  report: { resolved: Array<{ number: number; title: string }>; discarded: Array<{ number: number; title: string; reason: string }>; unblocked: Array<{ number: number; title: string }>; created: Array<{ number: number; title: string }> },
): string[] {
  const line = (task: { number: number; title: string }) => `${word} ${task.number} — ${task.title}`;
  const sections: Array<[string, string[]]> = [
    [titles.done, report.resolved.map(line)],
    [titles.discarded, report.discarded.map((task) => `${line(task)} — ${task.reason}`)],
    [titles.unblocked, report.unblocked.map(line)],
    [titles.created, report.created.map(line)],
  ];
  return sections
    .filter(([, items]) => items.length)
    .flatMap(([title, items], i) => [...(i ? [""] : []), `**${title}:**`, ...items.map((item) => `- ${item}`)]);
}

/** Por qué `close <N>` no puede cerrar la tarea N (no está en curso, ni pausada, ni una sola vez en «libres» / «bloqueadas»). */
function notClosable(docs: Docs, number: number, found: TaskLocation[] = findTask(docs, number)): string {
  if (!found.length) return `No existe la Tarea ${number}. ${describeKnownNumbers(docs)}`;
  if (found.some((place) => place.place === "history")) return `La Tarea ${number} ya figura cerrada en history.md. No se escribió nada.`;
  const grouped = found.find((place) => place.place === "grouped");
  if (grouped) return `La Tarea ${number} está en «Tareas agrupadas» (grupo «${grouped.group}»): \`close\` no cierra tareas agrupadas; sácala del grupo con \`acsuite task group-eject ${number}\` y vuelve a intentarlo. No se escribió nada.`;
  return `La Tarea ${number} figura en varios lugares (${found.map((place) => place.place).join(", ")}): una tarea vive en un solo lugar; corrígelo a mano antes de cerrarla. No se escribió nada.`;
}

/** `--done` sobre una tarea que ni se empezó: solo se puede descartar. */
function notDoneable(number: number, source: TaskLocation): string {
  const section = source.place === "free" ? "Tareas libres" : "Tareas bloqueadas / pospuestas";
  return `La Tarea ${number} está en «${section}» de backlog.md y nunca se empezó: una tarea sin empezar no se puede dar por hecha; empiézala con \`start ${number}\` y ciérrala después. Para descartarla sin empezarla: \`close ${number} --discarded --reason <texto>\`. No se escribió nada.`;
}

/** La línea `- **Campo:** valor` del campo de ese tipo tal como está escrita, o `null` si falta, es un placeholder o está vacío. */
function fieldLine(text: string, fields: Field[], kind: FieldKind): string | null {
  const field = findFieldOfKind(fields, kind);
  if (!field || field.isPlaceholder) return null;
  const line = (field.range ? text.slice(field.range.start, field.range.end) : `- **${field.label}:** ${field.value}`).replace(/\s+$/, "");
  return fieldBody(text, field) ? line : null;
}

/** Una tarea sin empezar de «libres» o «bloqueadas»: no toca handoff.md ni trae `Origen` (el campo es de la tarea en curso). */
function closingBacklog(backlog: Doc<ParsedBacklog>, source: TaskLocation): Closing {
  const task = [...backlog.parsed.free.tasks, ...backlog.parsed.blocked].find((candidate) => candidate.number === source.number)!;
  return { kind: "backlog", label: task.label, number: source.number, title: source.title, origin: null, labels: fieldLine(backlog.text, task.fields, "labels"), pendingSteps: [], remove: null };
}

/** La tarea en curso, validada (`inspectCurrent` se niega ante contenido que no reconoce). */
function closingCurrent(handoff: Doc<ParsedHandoff>): Closing {
  const current = inspectCurrent(handoff, "cerrar");
  const steps = (current.planLines ?? []).flatMap((line) => {
    const step = line.match(STEP_RE);
    return step ? [{ done: step[1] !== " ", text: step[2].trim() }] : [];
  });
  return {
    kind: "current",
    label: current.label,
    number: current.number,
    title: current.title,
    origin: current.extras.find((line) => ORIGIN_LINE_RE.test(line)) ?? null,
    labels: current.extras.find((line) => LABELS_LINE_RE.test(line)) ?? null,
    pendingSteps: pendingOf(steps),
    remove: (noTask) => replaceRange(current.replace, noTask),
  };
}

/** Una tarea pausada, cuyo bloque sale de «Tareas pausadas». */
function closingPaused(handoff: Doc<ParsedHandoff>, number: number): Closing {
  const matches = handoff.parsed.paused.filter((task) => task.number === number);
  if (matches.length !== 1) throw new CliError(`La Tarea ${number} aparece ${matches.length} veces en «Tareas pausadas»: corrígelo a mano. No se escribió nada.`);
  const task = matches[0];
  const origin = task.fields.find((field) => ORIGIN_LABEL_RE.test(field.label.trim()) && !field.isPlaceholder);
  const text = handoff.text;
  return {
    kind: "paused",
    label: task.label,
    number,
    title: task.title,
    origin: origin ? (origin.range ? text.slice(origin.range.start, origin.range.end) : `- **${origin.label}:** ${origin.value}`).replace(/\s+$/, "") : null,
    labels: fieldLine(text, task.fields, "labels"),
    pendingSteps: pendingOf(task.steps),
    remove: (_noTask, emptySection) => removeBlock(text, trimRange(text, task.range!), emptySection, handoff.parsed.paused.length > 1),
  };
}

/** Pasos sin marcar, sin el de «Documentar cierre de tarea» (ese lo hace este mismo comando). */
function pendingOf(steps: Array<{ done: boolean; text: string }>): string[] {
  const closingStep = closingStepRe(STRINGS.es);
  const closingStepEn = closingStepRe(STRINGS.en);
  return steps.filter((step) => !step.done && !closingStep.test(step.text) && !closingStepEn.test(step.text)).map((step) => step.text);
}
