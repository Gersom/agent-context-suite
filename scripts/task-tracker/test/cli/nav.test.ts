import { describe, expect, test } from "bun:test";
import { compactApplies, initialNav, labelApplies, type NavRow, type NavState, navReduce, reconcileNav, selectable } from "../../src/cli/nav.ts";

const ROWS: NavRow[] = [
  { folder: "ana", folderless: false },
  { folder: "luis", folderless: true },
  { folder: "gersom", folderless: false },
];

const team = (selected: string | null): NavState => ({ view: { kind: "team" }, selected });

describe("selectable", () => {
  test("solo los operadores con carpeta", () => {
    expect(selectable(ROWS)).toEqual(["ana", "gersom"]);
  });
});

describe("initialNav", () => {
  test("sin operador pedido: abre las tareas del operador activo (el preferido)", () => {
    expect(initialNav({ preferred: "gersom" }, ROWS)).toEqual({ view: { kind: "operator", folder: "gersom" }, selected: "gersom" });
  });

  test("preferido que no figura, sin carpeta o sin preferido: vista de equipo con el primero abrible; sin ninguno, null", () => {
    expect(initialNav({ preferred: "otro" }, ROWS)).toEqual(team("ana"));
    expect(initialNav({ preferred: "luis" }, ROWS)).toEqual(team("ana"));
    expect(initialNav({ preferred: null }, ROWS)).toEqual(team("ana"));
    expect(initialNav({ preferred: null }, [{ folder: "luis", folderless: true }])).toEqual(team(null));
  });

  test("con operador pedido: abre su panel de frente", () => {
    expect(initialNav({ operator: "ana", preferred: "gersom" }, ROWS)).toEqual({ view: { kind: "operator", folder: "ana" }, selected: "ana" });
  });
});

describe("navReduce en la vista de equipo", () => {
  test("↓ y ↑ recorren los operadores abribles, saltando los que no tienen carpeta, y dan la vuelta", () => {
    expect(navReduce(team("ana"), "down", ROWS)).toEqual(team("gersom"));
    expect(navReduce(team("gersom"), "down", ROWS)).toEqual(team("ana"));
    expect(navReduce(team("ana"), "up", ROWS)).toEqual(team("gersom"));
    expect(navReduce(team("gersom"), "up", ROWS)).toEqual(team("ana"));
  });

  test("sin elegido, ↓ va al primero y ↑ al último", () => {
    expect(navReduce(team(null), "down", ROWS)).toEqual(team("ana"));
    expect(navReduce(team(null), "up", ROWS)).toEqual(team("gersom"));
  });

  test("Enter abre el panel del elegido; sin elegido o con uno inválido no hace nada", () => {
    expect(navReduce(team("gersom"), "enter", ROWS)).toEqual({ view: { kind: "operator", folder: "gersom" }, selected: "gersom" });
    expect(navReduce(team(null), "enter", ROWS)).toEqual(team(null));
    expect(navReduce(team("luis"), "enter", ROWS)).toEqual(team("luis"));
  });

  test("equipo, salir y redibujar no cambian la vista de equipo; sin operadores abribles ↑/↓ no hacen nada", () => {
    const state = team("ana");
    expect(navReduce(state, "team", ROWS)).toBe(state);
    expect(navReduce(team("ana"), "redraw", ROWS)).toEqual(team("ana"));
    expect(navReduce(team(null), "down", [{ folder: "luis", folderless: true }])).toEqual(team(null));
  });
});

describe("navReduce en el panel de un operador", () => {
  const panel: NavState = { view: { kind: "operator", folder: "gersom" }, selected: "gersom" };

  test("equipo regresa a la vista de equipo con ese operador elegido", () => {
    expect(navReduce(panel, "team", ROWS)).toEqual(team("gersom"));
  });

  test("las flechas y Enter no hacen nada dentro del panel", () => {
    for (const key of ["up", "down", "enter"] as const) expect(navReduce(panel, key, ROWS)).toBe(panel);
  });

  test("compactar y las flechas del flujo no cambian la navegación, en ninguna vista", () => {
    for (const key of ["compact", "flow"] as const) {
      expect(navReduce(panel, key, ROWS)).toBe(panel);
      expect(navReduce(team("ana"), key, ROWS)).toEqual(team("ana"));
    }
  });

  test("filtrar por etiqueta no cambia la navegación, en ninguna vista", () => {
    expect(navReduce(panel, "label", ROWS)).toBe(panel);
    expect(navReduce(team("ana"), "label", ROWS)).toEqual(team("ana"));
  });
});

describe("labelApplies", () => {
  test("en la vista de equipo (un resumen) la tecla `t` no hace nada", () => {
    expect(labelApplies(team("ana"))).toBe(false);
    expect(labelApplies(team(null))).toBe(false);
  });

  test("en el panel de un operador y en un repo plano (sin navegación) sí aplica", () => {
    expect(labelApplies({ view: { kind: "operator", folder: "ana" }, selected: "ana" })).toBe(true);
    expect(labelApplies(null)).toBe(true);
  });
});

describe("compactApplies", () => {
  test("en la vista de equipo la tecla `c` no hace nada", () => {
    expect(compactApplies(team("ana"))).toBe(false);
    expect(compactApplies(team(null))).toBe(false);
  });

  test("en el panel de un operador y fuera del modo multi-operador (sin navegación) sí aplica", () => {
    expect(compactApplies({ view: { kind: "operator", folder: "ana" }, selected: "ana" })).toBe(true);
    expect(compactApplies(null)).toBe(true);
  });
});

describe("reconcileNav", () => {
  test("estado vigente: sin cambios", () => {
    expect(reconcileNav(team("ana"), ROWS)).toEqual({ state: team("ana"), lost: null });
  });

  test("el operador que se mira ya no figura: vuelve al equipo y lo informa", () => {
    const panel: NavState = { view: { kind: "operator", folder: "mia" }, selected: "mia" };
    expect(reconcileNav(panel, ROWS)).toEqual({ state: team("ana"), lost: "mia" });
  });

  test("el elegido desapareció o pasó a no tener carpeta: elige el primero abrible", () => {
    expect(reconcileNav(team("mia"), ROWS).state).toEqual(team("ana"));
    expect(reconcileNav(team("luis"), ROWS).state).toEqual(team("ana"));
  });
});
