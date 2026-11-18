// `group-create --tasks <N,M,...> --title <título> --summary <frase>`: forma un grupo con tareas libres
// de tu `backlog.md`. Las saca de «Tareas libres», deja allí la referencia del grupo (`### Grupo — título
// (Tareas N, M)` con su `Resumen`) y pone el contenedor con las tareas (`#### Tarea N`, mismo contenido) al
// final de «Tareas agrupadas». Sin `--apply` solo muestra el diff.

import { UsageError } from "../cli/errors.ts";
import type { Command } from "../cli/types.ts";
import { relFile } from "../query/format.ts";
import { requireDoc } from "../workspace/docs.ts";
import { requireOwnFolder } from "../workspace/ownership.ts";
import { requiredFlag, singleLine } from "../write/flags.ts";
import { createGroup } from "../write/group.ts";
import { emitWriteJson, JSON_FLAG } from "../write/json.ts";
import { detectLanguage, STRINGS } from "../write/language.ts";
import { headerLabels } from "../write/samples.ts";

/** Los números de `--tasks` (`12,23,32` o `12, 23, 32`), en el orden en que vienen. @throws UsageError si algún elemento no es un número */
function parseTaskList(value: string): number[] {
  return value.split(",").map((item) => {
    if (!/^\d+$/.test(item.trim())) throw new UsageError(`--tasks es una lista de números de tarea separados por comas (ej. «12,23,32»); «${item.trim()}» no lo es.`);
    return Number(item.trim());
  });
}

export const groupCreate: Command = {
  name: "group-create",
  summary: "Forma un grupo con tareas libres del backlog (referencia en «libres» y contenedor en «agrupadas»); escribe con --apply",
  usage: "group-create --tasks <N,M,...> --title <título> --summary <frase> [--json] [--apply]",
  writes: true,
  flags: {
    tasks: { type: "string", valueName: "N,M,...", description: "Números de las tareas libres que forman el grupo, separados por comas y en el orden en que quedan (mínimo 2). Obligatorio." },
    title: { type: "string", valueName: "título", stdin: true, description: "Título del grupo (una línea, distinto al de los demás grupos). Obligatorio." },
    summary: { type: "string", valueName: "frase", stdin: true, description: "Resumen del grupo (una frase), que queda en su referencia de «Tareas libres». Obligatorio." },
    json: JSON_FLAG,
  },
  run(ctx) {
    const { flags, io } = ctx;
    if (ctx.args.length) throw new UsageError("`group-create` no recibe argumentos: `group-create --tasks <N,M,...> --title <título> --summary <frase>`.");
    const numbers = parseTaskList(requiredFlag(flags, "tasks"));
    const title = singleLine("title", requiredFlag(flags, "title"));
    const summary = singleLine("summary", requiredFlag(flags, "summary"));

    const ws = ctx.workspace();
    requireOwnFolder(ws);
    const docs = ctx.docs();
    const backlog = requireDoc(docs.backlog, "backlog.md");

    const { lang, notice } = detectLanguage(headerLabels(docs), docs.rulesText);
    const edits = createGroup(backlog, numbers, title, summary, STRINGS[lang]);
    const result = ctx.commit([{ doc: backlog, edits }], { quiet: flags.json === true });

    if (flags.json === true) {
      emitWriteJson(ctx, "group-create", result, { group: { title, summary, tasks: numbers }, notice });
      return;
    }
    if (result.files.some((file) => file.written)) {
      io.out(`Grupo «${title}» creado con las Tareas ${numbers.join(", ")}: pasaron de «Tareas libres» a «Tareas agrupadas» de ${relFile(ws, backlog.path)}.`);
    }
    if (notice) io.out(`Aviso: ${notice}`);
  },
};
