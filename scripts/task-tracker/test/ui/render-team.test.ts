import { describe, expect, test } from "bun:test";
import { buildModel } from "../../src/model/model.ts";
import type { TeamBacklogModel, TeamModel, TeamRenderMeta } from "../../src/shared/types.ts";
import { render, renderTeam } from "../../src/ui/render.ts";
import { fixture } from "../../../_shared/test/helpers.ts";

const meta: TeamRenderMeta = {
  projectName: "demo-app",
  projectDir: "/proyectos/demo-app",
  updatedAt: new Date(2026, 9, 6, 12, 0, 0),
  trigger: { kind: "start" },
  color: false,
  width: 100,
  selected: "gersom",
  preferred: "ana",
};

const teamBacklog: TeamBacklogModel = {
  present: true,
  free: [{ title: "Revisar el copy del onboarding", labels: [], block: { tag: null, reason: null } }],
  blocked: [{ title: "Integrar la pasarela", labels: [], block: { tag: "dependencia", reason: "espera la cuenta del cliente" } }],
  warnings: [],
};

const team: TeamModel = {
  rows: [
    {
      folder: "ana",
      folderless: false,
      missing: false,
      current: { label: "Tarea", number: 12, title: "Implementar el parser", done: 3, total: 5 },
      counts: { free: 2, blocked: 1 },
      lastCompleted: { date: "2026-10-04", status: "done", number: 5, label: "Tarea", title: "Escribir el README", labels: [] },
    },
    { folder: "gersom", folderless: false, missing: false, current: null, counts: { free: 0, blocked: 0 }, lastCompleted: null },
    { folder: "luis", folderless: true, missing: false, current: null, counts: { free: 0, blocked: 0 }, lastCompleted: null },
    { folder: "mia", folderless: false, missing: true, current: null, counts: { free: 0, blocked: 0 }, lastCompleted: null },
  ],
  teamBacklog,
  warnings: ["[mia] handoff.md no existe (¿se está reescribiendo?)."],
};

describe("renderTeam", () => {
  const out = renderTeam(team, meta);
  const lines = out.split("\n");

  test("encabezado EQUIPO, con el nombre del proyecto y su ruta (sin operador), y recuadro EQUIPO con operators.md", () => {
    expect(lines.slice(0, 3)).toEqual([
      "▣ EQUIPO",
      "  DEMO APP   /proyectos/demo-app",
      "  Última actualización 12:00:00 · al iniciar",
    ]);
    expect(out).toMatch(/╭─ EQUIPO \(4\) ─+ operators\.md ─╮/);
  });

  test("encabezado: el título lleva el sufijo · MODO OBSERVADOR solo con el observador activo", () => {
    expect(out).not.toContain("MODO OBSERVADOR");
    const on = renderTeam(team, { ...meta, observer: { notice: null } }).split("\n");
    expect(on.slice(0, 2)).toEqual(["▣ EQUIPO · MODO OBSERVADOR", "  DEMO APP   /proyectos/demo-app"]);
  });

  test("encabezado en un ancho estrecho: el nombre no se pierde y se recorta la ruta", () => {
    const projectDir = "/proyectos/un/camino/bastante/largo/hasta/demo-app";
    for (const width of [60, 40]) {
      const location = renderTeam(team, { ...meta, projectDir, width }).split("\n")[1];
      expect(location.startsWith("  DEMO APP   /proyectos/")).toBe(true);
      expect(location.endsWith("…")).toBe(true);
      expect([...location]).toHaveLength(width);
    }
  });

  test("una fila por operador: tarea en curso con su plan, sin tarea, solo team-backlog y sin handoff", () => {
    expect(out).toContain("  ana (tú)  Tarea 12 — Implementar el parser · plan 3/5");
    expect(out).toContain("› gersom    Sin tarea en curso");
    expect(out).toContain("  luis      (solo team-backlog)");
    expect(out).toContain("  mia       (sin handoff.md)");
  });

  test("el elegido lleva «›» y los operadores sin carpeta nunca", () => {
    expect(out).toContain("› gersom");
    expect(renderTeam(team, { ...meta, selected: "luis" })).not.toContain("› luis");
  });

  test("segunda línea con los conteos y la última tarea completada", () => {
    expect(out).toContain("libres 2 · bloqueadas 1 · último cierre: T-5: Escribir el README (2026-10-04)");
  });

  test("recuadro SIN DUEÑO con team-backlog.md: libres y bloqueadas con su tag y motivo", () => {
    expect(out).toMatch(/╭─ SIN DUEÑO \(2\) ─+ team-backlog\.md ─╮/);
    expect(out).toContain("• Revisar el copy del onboarding");
    expect(out).toContain("• Integrar la pasarela [dependencia]");
    expect(out).toContain("→ espera la cuenta del cliente");
  });

  test("avisos y pie con las teclas del selector", () => {
    expect(out).toContain("! [mia] handoff.md no existe (¿se está reescribiendo?).");
    expect(renderTeam(team, { ...meta, controls: "keys", multiView: "team" })).toContain("[↑/↓] elegir - [Enter] abrir - [p] proyectos - [r] redibujar - [o] observar - [Ctrl+C o q] salir");
    expect(renderTeam(team, { ...meta, controls: "none" })).not.toContain("↑/↓");
  });

  test("el pie de equipo no anuncia [e], compactar/expandir ni volver a proyectos, tampoco con compact activo", () => {
    for (const compact of [false, true]) {
      const out = renderTeam(team, { ...meta, controls: "keys", multiView: "team", compact });
      expect(out).not.toContain("[e]");
      expect(out).not.toContain("[c]");
      expect(out).not.toContain("compactar");
      expect(out).not.toContain("expandir");
      expect(out).not.toContain("volver a proyectos");
      expect(out).toContain("[p] proyectos");
    }
  });

  test("sin team-backlog.md no hay recuadro; sin operadores lo dice", () => {
    const bare = renderTeam({ rows: [], teamBacklog: { present: false, free: [], blocked: [], warnings: [] }, warnings: [] }, meta);
    expect(bare).not.toContain("SIN DUEÑO");
    expect(bare).toContain("Ningún operador registrado en operators.md");
  });

  test("SIN DUEÑO: título y viñeta en azul pálido, texto en el gris de las completadas y el tag de bloqueo en rojo", () => {
    const colored = renderTeam(team, { ...meta, color: true });
    const box = colored.slice(colored.indexOf("SIN DUEÑO"));
    expect(colored).toContain("\x1b[38;2;143;179;217mSIN DUEÑO"); // azul pálido #8FB3D9
    expect(box).toContain("\x1b[38;2;143;179;217m• \x1b[39m");
    expect(box).toContain("\x1b[38;5;245mRevisar el copy del onboarding\x1b[39m"); // gris de las completadas
    expect(box).toContain("\x1b[31m [dependencia]"); // el tag de bloqueo sigue en rojo
    expect(box).not.toContain("\x1b[38;2;109;176;123m"); // ya no usa el verde de completadas
    expect(box).not.toContain("\x1b[34m"); // ni el azul básico del terminal
  });

  test("sin colores no hay códigos ANSI y todo cabe en el ancho", () => {
    expect(out).not.toMatch(/\x1b\[/);
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(100);
  });
});

describe("renderTeam recortado al alto de la terminal", () => {
  const folders = Array.from({ length: 12 }, (_, i) => `op${String(i).padStart(2, "0")}`);
  const many: TeamModel = {
    ...team,
    rows: folders.map((folder) => ({ folder, folderless: false, missing: false, current: null, counts: { free: 1, blocked: 0 }, lastCompleted: null })),
  };
  const keys = { ...meta, controls: "keys" as const, multiView: "team" as const, width: 140 };
  const footer = "[↑/↓] elegir - [Enter] abrir - [p] proyectos - [r] redibujar - [o] observar - [Ctrl+C o q] salir";
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

  test("sin `rows` no cambia nada, y con `rows` de sobra tampoco", () => {
    const full = renderTeam(many, { ...keys, selected: "op05" });
    expect(full.split("\n").length).toBeGreaterThan(25);
    expect(renderTeam(many, { ...keys, selected: "op05", rows: 200 })).toBe(full);
  });

  test("la salida mide a lo sumo rows - 1 líneas (el salto final deja el cursor en la última) y el pie sigue", () => {
    for (const selected of folders) {
      const out = renderTeam(many, { ...keys, selected, rows: 14 });
      expect(out.endsWith("\n")).toBe(true);
      expect(out.split("\n")).toHaveLength(14); // 13 líneas + el vacío tras el último salto
      expect(out).toContain(footer);
      expect(out).toContain(`› ${selected}`);
      expect(out).toContain(`${" ".repeat(4)}libres 1`);
    }
  });

  test("indicadores: solo abajo con la primera fila, arriba y abajo en medio, solo arriba con la última", () => {
    // Sin SIN DUEÑO ni avisos debajo del recuadro, la última fila no deja nada oculto abajo.
    const bare: TeamModel = { ...many, teamBacklog: { present: false, free: [], blocked: [], warnings: [] }, warnings: [] };
    const at = (selected: string) => renderTeam(bare, { ...keys, selected, rows: 14 });
    expect(at("op00")).not.toMatch(/↑ \d+ más/);
    expect(at("op00")).toMatch(/↓ \d+ más/);
    expect(at("op05")).toMatch(/↑ \d+ más/);
    expect(at("op05")).toMatch(/↓ \d+ más/);
    expect(at("op11")).toMatch(/↑ \d+ más/);
    expect(at("op11")).not.toMatch(/↓ \d+ más/);
    // Con ellos, la última fila se ve y lo de abajo queda tras el indicador.
    expect(renderTeam(many, { ...keys, selected: "op11", rows: 14 })).toMatch(/↓ \d+ más/);
  });

  test("los indicadores van en el gris secundario y sin color no hay ANSI", () => {
    const colored = renderTeam(many, { ...keys, selected: "op05", rows: 14, color: true });
    expect(colored).toMatch(/\x1b\[38;5;250m↑ \d+ más\x1b\[39m/);
    expect(strip(colored)).toMatch(/↑ \d+ más/);
    expect(renderTeam(many, { ...keys, selected: "op05", rows: 14 })).not.toMatch(/\x1b\[/);
  });

  test("ninguna línea supera el ancho, con el recorte puesto", () => {
    for (const width of [100, 60, 40]) {
      for (const line of renderTeam(many, { ...keys, selected: "op05", rows: 14, width }).split("\n")) expect([...line].length).toBeLessThanOrEqual(width);
    }
  });

  test("si el pie se parte en varias líneas (ancho chico), se conservan todas", () => {
    const out = renderTeam(many, { ...keys, selected: "op05", rows: 16, width: 40 });
    expect(out).toContain("[Ctrl+C o q] salir");
    expect(out).toContain("› op05");
  });
});

describe("render del panel de un operador en modo multi", () => {
  const model = buildModel({
    handoffText: fixture("es-anchors", "handoff.md"),
    backlogText: fixture("es-anchors", "backlog.md"),
    historyText: fixture("es-anchors", "history.md"),
  });
  const panel = (extra: Partial<TeamRenderMeta> = {}) => render(model, { ...meta, operator: "ana", teamBacklog, multiView: "operator", ...extra });

  test("el recuadro SIN DUEÑO abre el flujo: va encima de BLOQUEADAS, con la flecha «se toma»", () => {
    const out = panel();
    expect(out.indexOf("╭─ BLOQUEADAS")).toBeGreaterThan(-1);
    expect(out.indexOf("╭─ SIN DUEÑO (2)")).toBeGreaterThan(-1);
    expect(out.indexOf("╭─ SIN DUEÑO (2)")).toBeLessThan(out.indexOf("╭─ BLOQUEADAS"));
    expect(out).toContain("   ↓ se toma");
    expect(out.split("\n").slice(0, 2)).toEqual(["▣ TAREAS", "  DEMO APP · ana   /proyectos/demo-app"]);
  });

  test("sin team-backlog (modo plano) no aparece el recuadro", () => {
    expect(render(model, { ...meta, operator: undefined })).not.toContain("SIN DUEÑO");
    expect(panel({ teamBacklog: { ...teamBacklog, present: false } })).not.toContain("SIN DUEÑO");
  });

  test("pie del panel: cómo ir al equipo", () => {
    const out = panel({ controls: "keys", width: 140 });
    expect(out).toContain("[e] equipo - [p] proyectos - [c] compactar - [f] ocultar flechas - [r] redibujar - [o] observar - [Ctrl+C o q] salir");
    expect(out).not.toContain("volver");
  });

  test("los avisos del team-backlog salen con los del panel", () => {
    expect(panel({ teamBacklog: { ...teamBacklog, warnings: ["team-backlog.md tiene placeholders sin completar."] } })).toContain(
      "! team-backlog.md tiene placeholders sin completar.",
    );
  });

  test("tarea sin bloqueo vigente: sin tag ni motivo", () => {
    const out = panel({ teamBacklog: { ...teamBacklog, blocked: [{ title: "Suelta", labels: [], block: { tag: null, reason: null } }] } });
    expect(out).toContain("• Suelta");
    expect(out).not.toContain("• Suelta [");
  });

  test("etiquetas de las tareas sin dueño: al final del título, también en la vista de equipo y con el tag de bloqueo antes", () => {
    const labeled: TeamBacklogModel = {
      ...teamBacklog,
      free: [{ title: "Revisar el copy del onboarding", labels: ["empresa1", "trabajo"], block: { tag: null, reason: null } }],
      blocked: [{ title: "Integrar la pasarela", labels: ["empresa1"], block: { tag: "dependencia", reason: "espera la cuenta del cliente" } }],
    };
    const view = renderTeam({ ...team, teamBacklog: labeled }, meta);
    expect(view).toContain("• Revisar el copy del onboarding  #empresa1 #trabajo");
    expect(view).toContain("• Integrar la pasarela [dependencia]  #empresa1");
    expect(panel({ teamBacklog: labeled, width: 40 })).toContain("• Revisar el co…  #empresa1 #trabajo");
  });
});
