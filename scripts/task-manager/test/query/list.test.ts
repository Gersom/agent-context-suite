// Consulta de `list`: las etiquetas de cada tarea en `collectTasks`, el filtro de `filterTasks` y la
// interpretación de `--label` (`parseLabelFilter`) y `hasLabels`. Contra proyectos temporales.

import { afterAll, describe, expect, test } from "bun:test";
import { UsageError } from "../../src/cli/errors.ts";
import { hasLabels, hashLabels, parseLabelFilter } from "../../src/query/labels.ts";
import { collectTasks, filterTasks, type ListedTask, type ListFilters } from "../../src/query/list.ts";
import { BACKLOG_LABELED, HANDOFF_LABELED, HISTORY_LABELED, TEAM_LABELED } from "../fixtures-labels.ts";
import { loadDocs, makeProject, type Project } from "../helpers.ts";

const projects: Project[] = [];
afterAll(() => projects.forEach((p) => p.cleanup()));

function tasksOf(): ListedTask[] {
  const p = makeProject({
    folders: ["gersom"],
    contents: { "handoff.md": HANDOFF_LABELED, "backlog.md": BACKLOG_LABELED, "history.md": HISTORY_LABELED },
    teamBacklogText: TEAM_LABELED,
  });
  projects.push(p);
  return collectTasks(loadDocs(p, "gersom", true));
}

const NO_FILTERS: ListFilters = { statuses: null, search: null, group: null, labels: null };
/** `T-12`, o el título en las del team (no tienen número). */
const ids = (tasks: ListedTask[]) => tasks.map((task) => (task.number === null ? task.title : `T-${task.number}`));

describe("collectTasks: etiquetas de cada tarea", () => {
  const tasks = tasksOf();
  const labelsOf = (number: number | null, title?: string) => tasks.find((t) => t.number === number && (!title || t.title === title))?.labels;

  test("en curso: el campo entre su línea y la primera subsección", () => {
    expect(labelsOf(12)).toEqual(["empresa1", "trabajo"]);
  });

  test("pausadas: con y sin etiquetas (se conservan las mayúsculas)", () => {
    expect(labelsOf(8)).toEqual(["Trabajo", "ideas"]);
    expect(labelsOf(9, "Otra pausada")).toEqual([]);
  });

  test("libres, agrupadas y bloqueadas (sin el # inicial)", () => {
    expect(labelsOf(21)).toEqual(["empresa1", "trabajo"]);
    expect(labelsOf(22)).toEqual(["TRABAJO"]);
    expect(labelsOf(25)).toEqual([]);
    expect(labelsOf(23)).toEqual(["empresa1", "trabajo", "ideas"]);
    expect(labelsOf(24)).toEqual(["ideas"]);
    expect(labelsOf(26)).toEqual(["empresa1", "trabajo"]);
    expect(labelsOf(27)).toEqual(["trabajo"]);
  });

  test("history: solo el primer bloque de campos de la entrada", () => {
    expect(labelsOf(11)).toEqual(["empresa1", "trabajo"]);
    expect(labelsOf(10)).toEqual([]); // la viñeta del resumen no cuenta
    expect(labelsOf(9, "Preparar fixtures")).toEqual([]);
  });

  test("team-backlog: libres y postergadas", () => {
    expect(labelsOf(null, "Migrar el CI")).toEqual(["empresa1", "trabajo"]);
    expect(labelsOf(null, "Revisar el copy del onboarding")).toEqual([]);
    expect(labelsOf(null, "Cambiar de proveedor")).toEqual(["trabajo"]);
  });
});

describe("filterTasks: labels", () => {
  const tasks = tasksOf();
  const pick = (labels: string[] | null, extra: Partial<ListFilters> = {}) => ids(filterTasks(tasks, { ...NO_FILTERS, ...extra, labels })).sort();

  test("sin filtro (null) no descarta nada", () => {
    expect(filterTasks(tasks, NO_FILTERS)).toHaveLength(tasks.length);
  });

  test("una etiqueta: todas las que la traen, sin distinguir mayúsculas", () => {
    expect(pick(["ideas"])).toEqual(["T-23", "T-24", "T-8"]);
    expect(pick(["TRABAJO"])).toEqual(pick(["trabajo"]));
    expect(pick(["trabajo"])).toContain("T-22"); // escrita `#TRABAJO` en el archivo
    expect(pick(["trabajo"])).toContain("T-8"); // escrita `Trabajo`
  });

  test("varias etiquetas: AND, todas a la vez", () => {
    expect(pick(["empresa1", "trabajo"])).toEqual(["Migrar el CI", "T-11", "T-12", "T-21", "T-23", "T-26"]);
    expect(pick(["trabajo", "ideas"])).toEqual(["T-23", "T-8"]);
    expect(pick(["empresa1", "ideas"])).toEqual(["T-23"]);
  });

  test("una etiqueta que nadie trae: lista vacía", () => {
    expect(pick(["inexistente"])).toEqual([]);
  });

  test("combina con estado, búsqueda y grupo", () => {
    expect(pick(["trabajo"], { statuses: ["free"] })).toEqual(["Migrar el CI", "T-21", "T-22", "T-23"]);
    expect(pick(["trabajo"], { statuses: ["done", "discarded"] })).toEqual(["T-11"]);
    expect(pick(["trabajo"], { search: "logo" })).toEqual(["T-27"]);
    expect(pick(["ideas"], { group: "pulir" })).toEqual(["T-23", "T-24"]);
  });
});

describe("parseLabelFilter", () => {
  test("sin flag: null", () => {
    expect(parseLabelFilter(undefined)).toBeNull();
  });

  test("comas, `#` inicial opcional y espacios alrededor", () => {
    expect(parseLabelFilter(["a,#b, c "])).toEqual(["a", "b", "c"]);
    expect(parseLabelFilter("trabajo")).toEqual(["trabajo"]);
  });

  test("el flag repetido suma; sin repetidos (sin distinguir mayúsculas) y en el orden pedido", () => {
    expect(parseLabelFilter(["b", "#A,a", "B"])).toEqual(["b", "A"]);
  });

  test("una etiqueta inválida: UsageError con el motivo", () => {
    expect(() => parseLabelFilter(["a,b c"])).toThrow(UsageError);
    expect(() => parseLabelFilter(["año"])).toThrow(/«año» no es válida \(tiene «ñ»\)/);
    expect(() => parseLabelFilter(["a-b"])).toThrow(/solo admite letras ASCII y números/);
    expect(() => parseLabelFilter(["##x"])).toThrow(/«##x» no es válida \(tiene «#»\)/);
  });

  test("un valor vacío, una coma de más o un `#` solo: UsageError", () => {
    expect(() => parseLabelFilter([""])).toThrow(/valor vacío/);
    expect(() => parseLabelFilter(["  "])).toThrow(/valor vacío/);
    expect(() => parseLabelFilter(["a,,b"])).toThrow(/valor vacío/);
    expect(() => parseLabelFilter(["a,"])).toThrow(UsageError);
    expect(() => parseLabelFilter(["#"])).toThrow(/«#» está vacía/);
  });
});

describe("hasLabels y hashLabels", () => {
  test("todas las pedidas, sin distinguir mayúsculas; sin filtro, siempre", () => {
    expect(hasLabels(["Trabajo", "ideas"], ["trabajo"])).toBe(true);
    expect(hasLabels(["Trabajo", "ideas"], ["TRABAJO", "IDEAS"])).toBe(true);
    expect(hasLabels(["trabajo"], ["trabajo", "ideas"])).toBe(false);
    expect(hasLabels([], ["trabajo"])).toBe(false);
    expect(hasLabels([], null)).toBe(true);
    expect(hasLabels([], [])).toBe(true);
  });

  test("hashLabels pone el # a cada una", () => {
    expect(hashLabels(["a", "B"])).toBe("#a #B");
    expect(hashLabels([])).toBe("");
  });
});
