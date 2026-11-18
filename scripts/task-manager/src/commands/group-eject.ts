// `group-eject <N>`: saca la tarea agrupada N de su grupo en tu `backlog.md`. Su bloque pasa de
// `#### Tarea N` en «Tareas agrupadas» a `### Tarea N` al final de «Tareas libres» y su número sale de la
// referencia del grupo. Si el grupo queda con menos de `MIN_GROUP_TASKS` tareas se desarma: la que quedaba
// también vuelve a «Tareas libres» y se eliminan la referencia y el contenedor. Sin `--apply` solo muestra el diff.

import { CliError, UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { findSinglePlace, parseTarget } from "../query/find.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { ejectTask, findGroupOf, MIN_GROUP_TASKS, NOT_GROUPED } from "../write/group.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { headerLabels } from "../write/samples.ts";

export const groupEject: Command = {
  name: "group-eject",
  summary: "Saca una tarea agrupada de su grupo y la deja en «Tareas libres» (si el grupo queda con menos de 2 tareas, se desarma); escribe con --apply",
  usage: "group-eject <N> [--json] [--apply]",
  writes: true,
  flags: { json: JSON_FLAG },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length !== 1 || !ctx.args[0].trim()) throw new UsageError("Indica la tarea agrupada que sacas de su grupo: `group-eject <N>`.");
    const target = parseTarget(ctx.args[0]);
    if (target.kind === "title") throw new UsageError(`«${ctx.args[0]}» no es un número de tarea: \`group-eject <N>\`.`);
    if (target.operator) throw new CliError(`group-eject solo saca tareas de tu propia carpeta; «${ctx.args[0]}» es de otro operador (solo lectura). No se escribió nada.`);

    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const backlog = requireDoc(docs.backlog, "backlog.md");

    const place = findSinglePlace(docs, target.number);
    if (place !== "grouped") {
      throw new CliError(`La Tarea ${target.number} ${NOT_GROUPED[place]}: solo se sacan de su grupo las tareas agrupadas. No se escribió nada.`);
    }

    // Se calcula antes de editar: el grupo se desarma si tras sacar la tarea queda con menos de MIN_GROUP_TASKS.
    const { container } = findGroupOf(backlog, target.number)!;
    const rest = container.tasks.filter((task) => task.number !== target.number).map((task) => task.number);
    const dissolved = rest.length < MIN_GROUP_TASKS;

    const { lang, notice } = detectLanguage(headerLabels(docs), docs.rulesText);
    const edits = ejectTask(backlog, target.number, STRINGS[lang]);
    const result = ctx.commit([{ doc: backlog, edits }], { quiet: flags.json === true });

    if (flags.json === true) {
      emitWriteJson(ctx, "group-eject", result, {
        ejected: target.number,
        dissolved,
        returned: dissolved ? rest : [],
        group: { title: container.title, tasks: dissolved ? [] : rest },
        notice,
      });
      return;
    }
    if (result.files.some((file) => file.written)) {
      let message = `Tarea ${target.number} sacada del grupo «${container.title}»: pasó a «Tareas libres» de ${relFile(ws, backlog.path)}.`;
      if (dissolved) {
        const back = rest.length === 1 ? `la Tarea ${rest[0]} también volvió` : `las Tareas ${rest.join(", ")} también volvieron`;
        message += ` El grupo quedó con menos de ${MIN_GROUP_TASKS} tareas y se desarmó: ${rest.length ? `${back} a «Tareas libres» y se ` : "se "}eliminaron su referencia y su contenedor.`;
      }
      io.out(message);
    }
    if (notice) io.out(`Aviso: ${notice}`);
  },
};
