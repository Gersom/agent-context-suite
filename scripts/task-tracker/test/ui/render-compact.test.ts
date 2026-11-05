import { describe, expect, test } from "bun:test";
import { buildModel } from "../../src/model/model.ts";
import type { RenderMeta, TeamBacklogModel, TeamModel, TeamRenderMeta } from "../../src/shared/types.ts";
import { visibleLength } from "../../src/ui/format.ts";
import { render, renderTeam } from "../../src/ui/render.ts";
import { fixture } from "../../../_shared/test/helpers.ts";

const meta: RenderMeta = {
  projectName: "demo-app",
  projectDir: "/proyectos/demo-app",
  updatedAt: new Date(2026, 9, 7, 12, 0, 0),
  trigger: { kind: "start" },
  color: false,
  width: 100,
};

const model = buildModel({
  handoffText: fixture("es-anchors", "handoff.md"),
  backlogText: fixture("es-anchors", "backlog.md"),
  historyText: fixture("es-anchors", "history.md"),
});

/** Filas de contenido del recuadro cuyo título empieza con `title`, sin los bordes ni el relleno. */
function rowsOf(out: string, title: string): string[] {
  const lines = out.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`╭─ ${title}`));
  if (start < 0) throw new Error(`no se encontró el recuadro "${title}"`);
  const rows: string[] = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("╰"); i++) rows.push(lines[i].slice(2, -2).trimEnd());
  return rows;
}

const arrowLines = (out: string) => out.split("\n").filter((l) => /^ {3}[↑↓]/.test(l)).map((l) => l.trim());

describe("modo compacto del panel", () => {
  const compact = render(model, { ...meta, compact: true });
  const expanded = render(model, meta);

  test("bloqueadas, libres y completadas muestran una sola tarea y cuántas más hay; el título conserva el total", () => {
    expect(rowsOf(compact, "BLOQUEADAS (2)")).toEqual(["T-5: Rehacer el README [postergada] · +1 más"]);
    expect(rowsOf(compact, "LIBRES (4)")).toEqual(["T-3: Exportar como skill · +3 más"]);
    expect(rowsOf(compact, "TAREAS COMPLETADAS (últimas 5)")).toEqual(["T-11: Escribir el parser de secciones · 2026-10-05 · +4 más"]);
  });

  test("la tarea que se muestra es la última: la última de la lista, o la más reciente en completadas", () => {
    const blocked = rowsOf(expanded, "BLOQUEADAS (2)").filter((r) => r.startsWith("T-"));
    expect(blocked.at(-1)).toContain("T-5: Rehacer el README");
    expect(rowsOf(expanded, "TAREAS COMPLETADAS (últimas 5)")[0]).toContain("T-11");
  });

  test("en progreso y pausadas no se compactan", () => {
    expect(rowsOf(compact, "EN PROGRESO")).toEqual(rowsOf(expanded, "EN PROGRESO"));
    expect(rowsOf(compact, "PAUSADAS (1)")).toEqual(rowsOf(expanded, "PAUSADAS (1)"));
  });

  test("en progreso muestra el modo de ejecución también en compacto, antes del estado", () => {
    const withMode = buildModel({ handoffText: (fixture("es-anchors", "handoff.md") ?? "").replace("todos los pasos seguidos.", "auto"), backlogText: fixture("es-anchors", "backlog.md"), historyText: fixture("es-anchors", "history.md") });
    const rows = rowsOf(render(withMode, { ...meta, compact: true }), "EN PROGRESO");
    expect(rows.slice(0, 3)).toEqual(["Tarea 12 — Implementar el parser de anclas", "Modo  🤖 Auto", "Estado: Paso 3 de 5 [█████░░░░░░░]"]);
    expect(rowsOf(render(withMode, meta), "EN PROGRESO")).toEqual(rows);
  });

  test("en progreso y pausadas muestran en compacto el mismo diseño: estado, descripción y campos propios, sin «Qué falta» ni «Próximo paso»", () => {
    const rows = rowsOf(compact, "EN PROGRESO");
    expect(rows).toContain("Estado: Paso 3 de 5 [█████░░░░░░░]");
    expect(rows.slice(-2)).toEqual(["Descripción:", "  Descripción breve que menciona la Tarea 13 a mitad de línea."]);
    const paused = rowsOf(compact, "PAUSADAS (1)");
    expect(paused).toContain("    Por qué se pausó:");
    expect(paused).toContain("    Qué espera para retomarse:");
    for (const hidden of ["Qué falta", "Próximo paso", "Plan ["]) expect([...rows, ...paused].join("\n")).not.toContain(hidden);
  });

  test("ocupa menos pantalla que expandido y todos los recuadros siguen del ancho de la terminal", () => {
    expect(compact.split("\n").length).toBeLessThan(expanded.split("\n").length);
    for (const width of [40, 70, 120]) {
      const lines = render(model, { ...meta, compact: true, width }).split("\n").filter((l) => /^[╭│╰]/.test(l));
      for (const line of lines) expect(visibleLength(line)).toBe(width);
    }
  });

  test("con poco ancho se recorta el nombre de la tarea, no el contador de las que faltan", () => {
    const narrow = render(model, { ...meta, compact: true, width: 40 });
    expect(rowsOf(narrow, "LIBRES (4)")[0].endsWith("· +3 más")).toBe(true);
    expect(rowsOf(narrow, "TAREAS COMPLETADAS")[0].endsWith("· +4 más")).toBe(true); // el título del recuadro también se recorta
  });

  test("con una sola tarea no hay contador", () => {
    const one = buildModel({
      handoffText: "# H\n",
      backlogText: "<!-- agent-context-skill:section=free -->\n## Tareas libres\n\n### Tarea 7 — Única\n\n- **Bloqueos:** Ninguno.\n\n<!-- agent-context-skill:section=blocked -->\n## Tareas bloqueadas\n\n<!-- agent-context-skill:section=grouped -->\n## Tareas agrupadas\n",
      historyText: null,
    });
    expect(rowsOf(render(one, { ...meta, compact: true }), "LIBRES (1)")).toEqual(["T-7: Única"]);
  });

  test("sin tareas sigue diciendo «Ninguna»", () => {
    const empty = buildModel({
      handoffText: "# H\n",
      backlogText: "<!-- agent-context-skill:section=free -->\n## Tareas libres\n\n<!-- agent-context-skill:section=blocked -->\n## Tareas bloqueadas\n\n<!-- agent-context-skill:section=grouped -->\n## Tareas agrupadas\n",
      historyText: null,
    });
    expect(rowsOf(render(empty, { ...meta, compact: true }), "LIBRES (0)")).toEqual(["Ninguna"]);
  });
});

describe("flechas del flujo", () => {
  test("por defecto están y con arrows: false desaparecen sin tocar los recuadros", () => {
    const withArrows = render(model, meta);
    const without = render(model, { ...meta, arrows: false });
    expect(arrowLines(withArrows)).toHaveLength(4);
    expect(arrowLines(without)).toEqual([]);
    expect(without.split("\n").filter((l) => l.startsWith("╭")).map((l) => l.slice(0, 20))).toEqual(
      withArrows.split("\n").filter((l) => l.startsWith("╭")).map((l) => l.slice(0, 20)),
    );
    expect(withArrows.split("\n").length - without.split("\n").length).toBe(4);
  });

  test("compacto y sin flechas se combinan", () => {
    const out = render(model, { ...meta, compact: true, arrows: false });
    expect(arrowLines(out)).toEqual([]);
    expect(rowsOf(out, "LIBRES (4)")).toHaveLength(1);
  });
});

describe("modo compacto de SIN DUEÑO", () => {
  const backlog: TeamBacklogModel = {
    present: true,
    free: [
      { title: "Revisar el copy del onboarding", block: { tag: null, reason: null } },
      { title: "Armar el checklist de lanzamiento", block: { tag: null, reason: null } },
    ],
    blocked: [{ title: "Integrar la pasarela", block: { tag: "dependencia", reason: "espera la cuenta" } }],
    warnings: [],
  };
  const team: TeamModel = {
    rows: [{ folder: "ana", folderless: false, missing: false, current: null, counts: { free: 0, blocked: 0 }, lastCompleted: null }],
    teamBacklog: backlog,
    warnings: [],
  };
  const teamMeta: TeamRenderMeta = { ...meta, selected: "ana", preferred: "ana" };

  test("en la vista de equipo: una sola tarea (la última, con su tag) y el contador", () => {
    const out = renderTeam(team, { ...teamMeta, compact: true });
    expect(rowsOf(out, "SIN DUEÑO (3)")).toEqual(["• Integrar la pasarela [dependencia] · +2 más"]);
    expect(rowsOf(renderTeam(team, teamMeta), "SIN DUEÑO (3)").length).toBeGreaterThan(3);
  });

  test("en el panel de un operador también, y la lista de EQUIPO no se compacta", () => {
    const panel = render(model, { ...meta, compact: true, operator: "ana", teamBacklog: backlog });
    expect(rowsOf(panel, "SIN DUEÑO (3)")).toEqual(["• Integrar la pasarela [dependencia] · +2 más"]);
    const out = renderTeam(
      { ...team, rows: [...team.rows, { ...team.rows[0], folder: "gersom" }] },
      { ...teamMeta, compact: true },
    );
    expect(rowsOf(out, "EQUIPO (2)").filter((r) => /^[› ] (ana|gersom)/.test(r))).toHaveLength(2);
  });
});
