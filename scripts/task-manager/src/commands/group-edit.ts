// `group-edit <N> [--title <texto>] [--summary <texto>]`: cambia el título y/o el resumen del grupo de tu
// `backlog.md` que contiene la tarea N (cualquiera de las suyas). El título se reescribe en la referencia de
// «Tareas libres» (que conserva su lista de tareas) y en el contenedor de «Tareas agrupadas»; el resumen, en la
// línea `Resumen` de la referencia. No mueve ninguna tarea. Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { findSinglePlace, parseTarget } from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { singleLine, textFlag } from "../write/flags.ts";
import { editGroup, findGroupOf, groupSummary, NOT_GROUPED } from "../write/group.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { headerLabels } from "../write/samples.ts";

const USAGE = "`group-edit <N> [--title <texto>] [--summary <texto>]`";

/** El texto de `--title` o `--summary`, o `undefined` si no se pasó. @throws UsageError si está vacío o (el título y el resumen) tiene varias líneas */
function givenText(flags: Parameters<typeof textFlag>[0], name: "title" | "summary"): string | undefined {
  if (typeof flags[name] !== "string") return undefined;
  const value = textFlag(flags, name);
  if (!value) throw new UsageError(`--${name} está vacío: group-edit no borra el ${name === "title" ? "título" : "resumen"}; pasa el texto nuevo.`);
  return singleLine(name, value);
}

export const groupEdit: Command = {
  name: "group-edit",
  summary: "Cambia el título y/o el resumen de un grupo (en su referencia y en su contenedor); escribe con --apply",
  usage: "group-edit <N> [--title <texto>] [--summary <texto>] [--json] [--apply]",
  writes: true,
  flags: {
    title: { type: "string", valueName: "título", stdin: true, description: "Nuevo título del grupo (una línea, distinto al de los demás grupos). Se reescribe en su referencia y en su contenedor." },
    summary: { type: "string", valueName: "frase", stdin: true, description: "Nuevo resumen del grupo (una frase); reemplaza el de su referencia de «Tareas libres» o lo agrega si no tenía." },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1 || !ctx.args[0].trim()) throw new UsageError(`Indica una tarea del grupo que editas: ${USAGE}.`);
    const title = givenText(flags, "title");
    const summary = givenText(flags, "summary");
    if (title === undefined && summary === undefined) throw new UsageError(`Indica qué cambiar del grupo: --title, --summary o ambos: ${USAGE}.`);

    const target = parseTarget(ctx.args[0]);
    if (target.kind === "title") throw new UsageError(`«${ctx.args[0]}» no es un número de tarea: ${USAGE}.`);
    if (target.operator) throw new CliError(`group-edit solo edita grupos de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);

    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const backlog = requireDoc(docs.backlog, "backlog.md");

    const place = findSinglePlace(docs, target.number);
    if (place !== "grouped") {
      throw new CliError(`La Tarea ${target.number} ${NOT_GROUPED[place]}: indica una tarea que ya pertenezca al grupo. No se escribió nada.`);
    }

    // Lo que había antes, para decir qué cambió. Solo se detecta el idioma si hay que escribir una línea de `Resumen` nueva.
    const at = findGroupOf(backlog, target.number)!;
    const before = { title: at.reference.title, summary: groupSummary(backlog, at, STRINGS.es) };
    const { lang, notice } = summary !== undefined && before.summary === null ? detectLanguage(headerLabels(docs), docs.rulesText) : { lang: "es" as const, notice: null };
    const edits = editGroup(backlog, target.number, { title, summary }, STRINGS[lang]);
    const changed = [...(title !== undefined && (title !== before.title || title !== at.container.title) ? ["title"] : []), ...(summary !== undefined && summary !== before.summary ? ["summary"] : [])];

    const result = ctx.commit([{ doc: backlog, edits }], { quiet: flags.json === true });

    if (flags.json === true) {
      emitWriteJson(ctx, "group-edit", result, { group: { title: title ?? before.title, tasks: at.container.tasks.map((task) => task.number) }, changed, notice });
      return;
    }
    if (result.files.some((file) => file.written)) {
      const parts = [
        ...(changed.includes("title") ? [`ahora se llama «${title}»`] : []),
        ...(changed.includes("summary") ? [before.summary === null ? `resumen agregado: «${summary}»` : `resumen «${before.summary}» → «${summary}»`] : []),
      ];
      io.out(`Grupo «${before.title}» editado en ${relFile(ws, backlog.path)}: ${parts.join("; ")}.`);
    }
    if (notice) io.out(`Aviso: ${notice}`);
  },
};
