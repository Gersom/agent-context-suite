// Arranque del seguimiento de tareas: interpreta los argumentos, resuelve el proyecto a vigilar
// y lanza la aplicación. Lo llaman `index.ts` y el despachador `acsuite`.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { gitToplevel } from "../../_shared/git.ts";
import { startApp } from "./app.ts";
import { parseArgs, resolveOptions } from "./cli/args.ts";
import { printResolveError } from "./cli/resolve-error.ts";
import { invocationDir, isSkillMissing, resolveAgentsDir } from "./io/paths.ts";
import { loadBoardSettings } from "./io/settings.ts";
import type { ResolveError, ResolveOk } from "./shared/types.ts";

/** Ayuda de `acsuite board`. */
export const HELP: string[] = [
  "Seguimiento de tareas en la terminal: vigila docs/agents/ de un proyecto y se redibuja al cambiar.",
  "Sin ruta y fuera de un proyecto con documentación de la skill, abre la lista de proyectos.",
  "",
  "Uso: acsuite board [ruta] [operador] [--once]",
  "",
  "  [ruta]        Raíz del proyecto, carpeta de agentes (docs/agents) o carpeta de un operador.",
  "                Por defecto, el proyecto de la carpeta actual; si no tiene documentación,",
  "                la lista de proyectos (↑/↓ eligen, Enter abre). Con una ruta a una carpeta que existe",
  "                pero no tiene la skill, también abre la lista, con un aviso.",
  "                Con un proyecto abierto, la tecla p lleva a la lista de proyectos.",
  "  [operador]    Con ruta, abre de frente el panel de ese operador (modo multi-operador).",
  "  --once        Pinta una sola vez y sale.",
  "  -h, --help    Muestra esta ayuda.",
  "",
  "La lista de proyectos se guarda en projects.json dentro de ~/.acsuite (o de la carpeta de la variable",
  "ACSUITE_HOME): los repos abiertos de frente (sin --once) y los agregados con la tecla a. Con la tecla x",
  "se quita de la lista el proyecto elegido, tras confirmar con Enter (no se borra nada del repo).",
  "",
  "Las opciones compacto, flechas y modo observador (espera a que marques un proyecto con el mod de Claude,",
  "acsuite-active-project, y lo abre) se recuerdan: las teclas c, f y o las guardan en settings.json, en esa",
  "misma carpeta, y la próxima vez se arranca con ellas. Con una ruta o con --once no se arranca en modo",
  "observador, aunque esté guardado.",
  "",
  "La tecla t filtra las tareas por etiqueta (#): recorre todas → cada etiqueta del proyecto → todas, y el",
  "encabezado indica el filtro activo. La tarea en progreso siempre se ve. El filtro no se guarda y se",
  "reinicia al cambiar de proyecto. En la lista de proyectos y en la vista de equipo no hace nada.",
];

export function main(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP.join("\n"));
    return;
  }
  const { once, pathArg, operator, error } = parseArgs(argv);
  if (error != null) {
    console.error(error);
    process.exit(2);
  }
  // Cada opción: lo guardado en settings.json o, si no hay, el defecto.
  const saved = loadBoardSettings();
  const { compact, arrows, follow } = resolveOptions({ saved: saved.settings, hasPath: pathArg != null, once });

  // `null`: sin proyecto al que abrir de frente, se muestra la lista de proyectos.
  const { target, notice } = pathArg != null ? resolveFromArg(pathArg, operator) : { target: resolveFromCwd(), notice: null };

  startApp({ target, compact, arrows, follow, once, settingsWarning: saved.warning, projectsNotice: notice });
}

/**
 * `true` si `result` (el de `resolveAgentsDir` sobre `dir`) dice que la carpeta existe pero no tiene
 * documentación de la skill: ni handoff.md ni carpetas de operador ni carpeta de agentes. Con la
 * carpeta de agentes presente (aunque esté vacía o mal) no: eso es un error que se debe informar.
 */
function lacksSkill(dir: string, result: ResolveError): boolean {
  if (!isSkillMissing(result.error)) return false;
  return !["docs/agents", "agent-context/agents"].some((sub) => existsSync(join(dir, sub)));
}

/**
 * Ruta pasada por argumento: si no existe o su documentación está mal, se informa y se sale con
 * código 1. Si la carpeta existe pero no tiene la skill, devuelve `target` `null` (se abre la lista
 * de proyectos) y el `notice` que lo explica.
 */
function resolveFromArg(input: string, operatorArg: string | undefined): { target: ResolveOk | null; notice: string | null } {
  const result = resolveAgentsDir(input, undefined, { operator: operatorArg });
  if (result.ok) return { target: result, notice: null };
  // `tried[0]` es la carpeta pedida, ya resuelta a ruta absoluta.
  const dir = result.tried[0];
  if (lacksSkill(dir, result)) {
    return { target: null, notice: `La carpeta no tiene la skill, se muestra la lista de proyectos: ${dir}` };
  }
  printResolveError(result);
  process.exit(1);
}

/**
 * Sin ruta: el proyecto de la carpeta desde la que se lanzó el comando (la raíz de su repo git,
 * o la carpeta misma si no está en uno). Si no tiene documentación de la skill, devuelve `null`
 * (se abre la lista de proyectos). Si la carpeta de agentes existe pero está mal (ej. falta
 * operators.md), sí es un error: se informa qué falta y cómo indicar otra ruta, y se sale con
 * código 1.
 */
function resolveFromCwd(): ResolveOk | null {
  const dir = gitToplevel(invocationDir());
  const result = resolveAgentsDir(dir);
  if (result.ok) return result;
  // Que la carpeta no tenga docs de la skill no es un error: se mira la lista de proyectos.
  const hasAgentsDir = ["docs/agents", "agent-context/agents"].some((sub) => existsSync(join(dir, sub)));
  if (!hasAgentsDir) return null;
  console.error(`No se pudo abrir el proyecto de la carpeta actual (${dir}):`);
  printResolveError(result);
  console.error("Si el proyecto está en otra carpeta, indícala: acsuite board <ruta>");
  process.exit(1);
}
