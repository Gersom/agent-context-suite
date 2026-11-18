// `next --label`: la próxima tarea a tomar considerando solo las que traen todas las etiquetas
// (pausadas, libres con las de un grupo, bloqueadas candidatas a desbloquear y team-backlog). Solo
// lectura: cada ejecución comprueba que no escribió nada.

import { afterAll, describe, expect, test } from "bun:test";
import { run } from "../../src/cli/dispatch.ts";
import { BACKLOG_LABELED, HANDOFF_LABELED, HANDOFF_LABELED_IDLE, HISTORY_LABELED, TEAM_LABELED } from "../fixtures-labels.ts";
import { BACKLOG_RICH, HANDOFF_CURRENT, HISTORY_RICH, TEAM_RICH } from "../fixtures.ts";
import { captureIo, makeProject, type Project, snapshot } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

/** Corre un comando y comprueba que no escribió nada en el proyecto. */
async function exec(argv: string[], p: Project, email: string | null = "gersom@mail.com") {
  const before = snapshot(p.root);
  const cap = captureIo();
  const code = await run(argv, { io: cap.io, email, baseDir: p.root });
  expect(snapshot(p.root)).toEqual(before);
  return { code, out: cap.text(), err: cap.err.join("\n"), lines: cap.out };
}

const IDLE = { contents: { "handoff.md": HANDOFF_LABELED_IDLE, "backlog.md": BACKLOG_LABELED, "history.md": HISTORY_LABELED }, teamBacklogText: TEAM_LABELED };
const BUSY = { ...IDLE, contents: { ...IDLE.contents, "handoff.md": HANDOFF_LABELED } };

describe("next --label: sin tarea en curso", () => {
  test("sin --label: todo lo que se puede tomar (sin cambios)", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { lines } = await exec(["next"], p);
    expect(lines).toEqual([
      "Sin tarea en curso.",
      "Pausadas (retomables):",
      "  - Tarea 8 — Migrar la documentación vieja (plan 1/2)",
      "  - Tarea 9 — Otra pausada",
      "Libres (en el orden del archivo):",
      "  - Tarea 21 — Reescribir la guía  (Disparador: cuando se cierre el diseño.)",
      "  - Tarea 22 — Ordenar los scripts",
      "  - Tarea 23 — Ajustar los colores  [grupo: Pulir el sitio]  (Disparador: cuando haya diseño.)",
      "  - Tarea 24 — Revisar la tipografía  [grupo: Pulir el sitio]",
      "  - Tarea 25 — Sin etiquetas",
      "Libres del team-backlog (se toman por título):",
      "  - Revisar el copy del onboarding",
      "  - Migrar el CI  (Disparador: cuando se estabilice el repo.)",
      "Bloqueadas que podrían desbloquearse (Regla 8):",
      "  - Tarea 26 — Publicar el sitio [dependencia] → Tarea 11 (cerrada) ⇒ candidata a desbloquear (Regla 8)",
      "Sugerencia: retomar una pausada o tomar una libre; la elige el operador.",
    ]);
  });

  test("una etiqueta: pausadas, libres (con las de un grupo), team y candidatas con esa etiqueta, en el mismo orden", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, lines } = await exec(["next", "--label", "trabajo"], p);
    expect(code).toBe(0);
    expect(lines).toEqual([
      "Sin tarea en curso.",
      "Pausadas (retomables):",
      "  - Tarea 8 — Migrar la documentación vieja (plan 1/2)",
      "Libres (en el orden del archivo):",
      "  - Tarea 21 — Reescribir la guía  (Disparador: cuando se cierre el diseño.)",
      "  - Tarea 22 — Ordenar los scripts",
      "  - Tarea 23 — Ajustar los colores  [grupo: Pulir el sitio]  (Disparador: cuando haya diseño.)",
      "Libres del team-backlog (se toman por título):",
      "  - Migrar el CI  (Disparador: cuando se estabilice el repo.)",
      "Bloqueadas que podrían desbloquearse (Regla 8):",
      "  - Tarea 26 — Publicar el sitio [dependencia] → Tarea 11 (cerrada) ⇒ candidata a desbloquear (Regla 8)",
      "Sugerencia: retomar una pausada o tomar una libre; la elige el operador.",
    ]);
  });

  test("varias etiquetas: AND; sin distinguir mayúsculas, con `#` y con el flag repetido", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const expected = [
      "Sin tarea en curso.",
      "Libres (en el orden del archivo):",
      "  - Tarea 23 — Ajustar los colores  [grupo: Pulir el sitio]  (Disparador: cuando haya diseño.)",
      "Sugerencia: tomar una libre; la elige el operador.",
    ];
    for (const argv of [
      ["next", "--label", "empresa1,ideas"],
      ["next", "--label", "#Empresa1", "--label", "IDEAS"],
      ["next", "--label", "#empresa1,#ideas"],
    ]) {
      expect((await exec(argv, p)).lines).toEqual(expected);
    }
  });

  test("solo las libres de un grupo cuentan con la etiqueta de su tarea", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { lines } = await exec(["next", "--label", "ideas"], p);
    expect(lines).toEqual([
      "Sin tarea en curso.",
      "Pausadas (retomables):",
      "  - Tarea 8 — Migrar la documentación vieja (plan 1/2)",
      "Libres (en el orden del archivo):",
      "  - Tarea 23 — Ajustar los colores  [grupo: Pulir el sitio]  (Disparador: cuando haya diseño.)",
      "  - Tarea 24 — Revisar la tipografía  [grupo: Pulir el sitio]",
      "Sugerencia: retomar una pausada o tomar una libre; la elige el operador.",
    ]);
  });

  test("sin tareas con esa etiqueta: mensaje claro y código 0", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, lines, err } = await exec(["next", "--label", "inexistente"], p);
    expect(code).toBe(0);
    expect(err).toBe("");
    expect(lines).toEqual(["Sin tarea en curso.", "No hay tareas libres con la etiqueta #inexistente."]);
  });

  test("sin tareas con todas esas etiquetas: el mensaje las lista con `#`", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, lines } = await exec(["next", "--label", "ideas,empresa1,nadie"], p);
    expect(code).toBe(0);
    expect(lines).toEqual(["Sin tarea en curso.", "No hay tareas libres con las etiquetas #ideas #empresa1 #nadie."]);
  });

  test("una combinación que ninguna tarea cumple: no hay nada que tomar", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    // Hay tareas con `trabajo`, pero ninguna trae además `nadie`.
    const { lines } = await exec(["next", "--label", "trabajo,nadie"], p);
    expect(lines).toEqual(["Sin tarea en curso.", "No hay tareas libres con las etiquetas #trabajo #nadie."]);
  });
});

describe("next --label: con tarea en curso", () => {
  test("la tarea en curso se muestra igual; si trae las etiquetas no hay nota", async () => {
    const p = project({ folders: ["gersom"], ...BUSY });
    const plain = (await exec(["next"], p)).lines;
    expect((await exec(["next", "--label", "trabajo"], p)).lines).toEqual(plain);
    expect(plain[0]).toBe("En curso: Tarea 12 — Implementar el parser");
  });

  test("si no trae las etiquetas pedidas, avisa en una nota al final y no cambia nada más", async () => {
    const p = project({ folders: ["gersom"], ...BUSY });
    const plain = (await exec(["next"], p)).lines;
    const { code, lines } = await exec(["next", "--label", "trabajo,ideas"], p);
    expect(code).toBe(0);
    expect(lines).toEqual([...plain, "Nota: la tarea en curso no tiene las etiquetas #trabajo #ideas; --label solo filtra las tareas por tomar."]);
  });
});

describe("next --label: errores de uso", () => {
  test("una etiqueta inválida, un valor vacío o un `#` solo: código 2 con el motivo", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    for (const [value, reason] of [
      ["año", "«ñ»"],
      ["a-b", "«-»"],
      ["", "vacío"],
      ["a,,b", "vacío"],
      ["#", "vacía"],
    ]) {
      const { code, out, err } = await exec(["next", "--label", value], p);
      expect(code).toBe(2);
      expect(out).toBe("");
      expect(err).toContain("--label");
      expect(err).toContain(reason);
    }
  });
});

describe("next --label: --json", () => {
  test("con etiquetas: solo las tareas que las traen, `filters.labels` y la sugerencia", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const json = JSON.parse((await exec(["next", "--json", "--label", "empresa1,trabajo"], p)).out);
    expect(Object.keys(json)).toEqual(["schema", "command", "mode", "current", "paused", "free", "team", "unblockCandidates", "suggestion", "filters"]);
    expect(json).toMatchObject({ mode: "pick", current: null, paused: [], filters: { labels: ["empresa1", "trabajo"] } });
    expect(json.free.map((t: { number: number }) => t.number)).toEqual([21, 23]);
    expect(json.team.map((t: { title: string }) => t.title)).toEqual(["Migrar el CI"]);
    expect(json.unblockCandidates.map((t: { number: number }) => t.number)).toEqual([26]);
    expect(json.suggestion).toBe("Sugerencia: tomar una libre; la elige el operador.");
  });

  test("sin coincidencias: modo `empty` y el mensaje en `suggestion`", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const json = JSON.parse((await exec(["next", "--json", "--label", "#nadie"], p)).out);
    expect(json).toMatchObject({ mode: "empty", paused: [], free: [], team: [], unblockCandidates: [], suggestion: "No hay tareas libres con la etiqueta #nadie.", filters: { labels: ["nadie"] } });
  });

  test("sin --label el JSON no cambia (sin la clave `filters`)", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const json = JSON.parse((await exec(["next", "--json"], p)).out);
    expect(Object.keys(json)).toEqual(["schema", "command", "mode", "current", "paused", "free", "team", "unblockCandidates", "suggestion"]);
  });
});

describe("next --label: otros proyectos", () => {
  test("sin etiquetas en ningún lado, `next` sin --label sigue igual y con --label no encuentra nada", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_CURRENT, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH });
    const plain = await exec(["next"], p);
    expect(plain.lines[0]).toBe("En curso: Tarea 12 — Implementar el parser");
    expect(plain.out).not.toContain("Nota:");
    expect((await exec(["next", "--label", "trabajo"], p)).lines.at(-1)).toContain("Nota: la tarea en curso no tiene la etiqueta #trabajo");
  });

  test("`next --help` documenta el flag con un ejemplo", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, out } = await exec(["next", "--help"], p);
    expect(code).toBe(0);
    expect(out).toContain("next [--label <etiquetas>]");
    expect(out).toContain("(repetible)");
    expect(out).toContain("Ej.: --label trabajo,#empresa1");
  });

  test("`status` no lleva --label", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, err } = await exec(["status", "--label", "trabajo"], p);
    expect(code).not.toBe(0);
    expect(err).toContain("label");
  });
});
