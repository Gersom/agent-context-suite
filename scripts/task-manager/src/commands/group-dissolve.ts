// `group-dissolve <N>`: deshace el grupo de tu `backlog.md` que contiene la tarea N (cualquiera de las suyas).
// Todas sus tareas pasan de `#### Tarea N` en «Tareas agrupadas» a `### Tarea N` al final de «Tareas libres», en el
// orden del contenedor, y se eliminan la referencia y el contenedor. Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { findSinglePlace, parseTarget } from "../query/find.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { dissolveGroup, findGroupOf, NOT_GROUPED } from "../write/group.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { headerLabels } from "../write/samples.ts";

export const groupDissolve: Command = {
  name: "group-dissolve",
  summary: "Deshace un grupo: todas sus tareas vuelven a «Tareas libres» y se eliminan su referencia y su contenedor; escribe con --apply",
  usage: "group-dissolve <N> [--json] [--apply]",
  writes: true,
  flags: { json: JSON_FLAG },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1 || !ctx.args[0].trim()) throw new UsageError("Indica una tarea del grupo que deshaces: `group-dissolve <N>`.");
    const target = parseTarget(ctx.args[0]);
    if (target.kind === "title") throw new UsageError(`«${ctx.args[0]}» no es un número de tarea: \`group-dissolve <N>\`.`);
    if (target.operator) throw new CliError(`group-dissolve solo deshace grupos de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);

    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const backlog = requireDoc(docs.backlog, "backlog.md");

    const place = findSinglePlace(docs, target.number);
    if (place !== "grouped") {
      throw new CliError(`La Tarea ${target.number} ${NOT_GROUPED[place]}: indica una tarea que ya pertenezca al grupo. No se escribió nada.`);
    }

    const { container } = findGroupOf(backlog, target.number)!;
    const returned = container.tasks.map((task) => task.number);

    const { lang, notice } = detectLanguage(headerLabels(docs), docs.rulesText);
    const edits = dissolveGroup(backlog, target.number, STRINGS[lang]);
    const result = ctx.commit([{ doc: backlog, edits }], { quiet: flags.json === true });

    if (flags.json === true) {
      emitWriteJson(ctx, "group-dissolve", result, { group: { title: container.title, tasks: returned }, returned, notice });
      return;
    }
    if (result.files.some((file) => file.written)) {
      io.out(`Grupo «${container.title}» deshecho: las Tareas ${returned.join(", ")} volvieron a «Tareas libres».`);
    }
    if (notice) io.out(`Aviso: ${notice}`);
  },
};
