// `list --label`: filtro por etiqueta (AND, sin distinguir mayúsculas, `#` y comas opcionales, flag
// repetible), las etiquetas al final de cada línea y en el JSON. Solo lectura: cada ejecución
// comprueba que no escribió nada.

import { afterAll, describe, expect, test } from "bun:test";
import { run } from "../../src/cli/dispatch.ts";
import { BACKLOG_LABELED, HANDOFF_LABELED, HISTORY_LABELED, TEAM_LABELED } from "../fixtures-labels.ts";
import { BACKLOG_DATED, HANDOFF_CURRENT, HISTORY_RICH, TEAM_TWO } from "../fixtures.ts";
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

const LABELED = { contents: { "handoff.md": HANDOFF_LABELED, "backlog.md": BACKLOG_LABELED, "history.md": HISTORY_LABELED }, teamBacklogText: TEAM_LABELED };
const NUMBERS = (lines: string[]) => lines.slice(1).map((line) => line.split(" · ")[0]);

describe("list --label: filtro", () => {
  test("una etiqueta: tareas de cada estado y de history, sin distinguir mayúsculas", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const { code, lines } = await exec(["list", "--label", "TRABAJO"], p);
    expect(code).toBe(0);
    expect(lines).toEqual([
      "10 tareas (--label TRABAJO)",
      "T-12 · in-progress · — · Implementar el parser #empresa1 #trabajo",
      "T-8 · paused · — · Migrar la documentación vieja #Trabajo #ideas",
      "T-23 · free · 2026-10-08 · Ajustar los colores [Pulir el sitio] #empresa1 #trabajo #ideas",
      "T-11 · done · 2026-10-07 · Escribir el parser #empresa1 #trabajo",
      "T-21 · free · 2026-10-06 · Reescribir la guía #empresa1 #trabajo",
      "T-22 · free · 2026-10-05 · Ordenar los scripts #TRABAJO",
      "team · postponed · 2026-10-04 · Cambiar de proveedor #trabajo",
      "T-26 · blocked · 2026-10-03 · Publicar el sitio #empresa1 #trabajo",
      "team · free · 2026-10-03 · Migrar el CI #empresa1 #trabajo",
      "T-27 · postponed · 2026-10-02 · Cambiar el logo #trabajo",
    ]);
  });

  test("varias etiquetas: AND (todas a la vez)", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const { lines } = await exec(["list", "--label", "trabajo,ideas"], p);
    expect(NUMBERS(lines)).toEqual(["T-8", "T-23"]);
    expect((await exec(["list", "--label", "empresa1,ideas"], p)).lines).toEqual([
      "1 tarea (--label empresa1,ideas)",
      "T-23 · free · 2026-10-08 · Ajustar los colores [Pulir el sitio] #empresa1 #trabajo #ideas",
    ]);
  });

  test("`#` inicial opcional, comas con espacios y el flag repetido dan lo mismo", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const base = (await exec(["list", "--label", "trabajo,ideas"], p)).lines;
    for (const argv of [
      ["list", "--label", "#trabajo,#ideas"],
      ["list", "--label", "trabajo", "--label", "ideas"],
      ["list", "--label", "#Trabajo", "--label", "IDEAS,#ideas"],
      ["list", "--label=trabajo, #ideas"],
    ]) {
      const { code, lines } = await exec(argv, p);
      expect(code).toBe(0);
      expect(NUMBERS(lines)).toEqual(NUMBERS(base));
    }
  });

  test("combina con --status, --search, --group y --last", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    expect(NUMBERS((await exec(["list", "--label", "trabajo", "--status", "done,discarded"], p)).lines)).toEqual(["T-11"]);
    expect(NUMBERS((await exec(["list", "--label", "trabajo", "--status", "postponed"], p)).lines)).toEqual(["team", "T-27"]);
    expect((await exec(["list", "--label", "trabajo", "--search", "logo"], p)).lines).toEqual([
      "1 tarea (--search «logo» --label trabajo)",
      "T-27 · postponed · 2026-10-02 · Cambiar el logo #trabajo",
    ]);
    expect(NUMBERS((await exec(["list", "--label", "ideas", "--group", "pulir"], p)).lines)).toEqual(["T-23", "T-24"]);
    const last = await exec(["list", "--label", "trabajo", "--last", "2"], p);
    expect(last.lines[0]).toBe("2 de 10 tareas (--label trabajo --last 2)");
    expect(NUMBERS(last.lines)).toEqual(["T-12", "T-8"]);
  });

  test("tareas de cada estado: en curso, pausada, libre, agrupada, bloqueada, postergada, history y team", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const { lines } = await exec(["list", "--label", "trabajo", "--last", "50"], p);
    const statuses = lines.slice(1).map((line) => line.split(" · ")[1]);
    expect(new Set(statuses)).toEqual(new Set(["in-progress", "paused", "free", "done", "postponed", "blocked"]));
    expect(lines.some((line) => line.startsWith("team ·"))).toBe(true);
    expect(lines.some((line) => line.includes("[Pulir el sitio]"))).toBe(true);
    // La entrada descartada solo menciona la etiqueta en una viñeta del resumen: no la tiene.
    expect(lines.some((line) => line.startsWith("T-10 "))).toBe(false);
  });

  test("sin coincidencias: «Ninguna tarea coincide.» y código 0", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const { code, out } = await exec(["list", "--label", "inexistente"], p);
    expect(code).toBe(0);
    expect(out).toBe("Ninguna tarea coincide.");
  });

  test("en el team-backlog de un operador «solo team-backlog»", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const { code, lines } = await exec(["list", "--label", "empresa1"], p, "luis@mail.com");
    expect(code).toBe(0);
    expect(lines).toEqual(["1 tarea (--label empresa1)", "team · free · 2026-10-03 · Migrar el CI #empresa1 #trabajo"]);
  });
});

describe("list --label: errores de uso", () => {
  test("una etiqueta inválida: código 2 con el motivo", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    for (const [value, reason] of [
      ["año", "«ñ»"],
      ["a-b", "«-»"],
      ["trabajo,mi etiqueta", "«mi etiqueta»"],
      ["##x", "«#»"],
    ]) {
      const { code, out, err } = await exec(["list", "--label", value], p);
      expect(code).toBe(2);
      expect(out).toBe("");
      expect(err).toContain("--label");
      expect(err).toContain(reason);
    }
  });

  test("un valor vacío, una coma de más o un `#` solo: código 2", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    for (const value of ["", "  ", "a,,b", "trabajo,", "#"]) {
      const { code, err } = await exec(["list", "--label", value], p);
      expect(code).toBe(2);
      expect(err).toContain("--label");
    }
  });

  test("un valor inválido se rechaza antes de leer nada, aunque otros flags estén bien", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    expect((await exec(["list", "--status", "free", "--label", "ñ"], p)).code).toBe(2);
  });
});

describe("list --label: formato", () => {
  test("las tareas sin etiquetas salen idénticas a antes (sin espacio ni # al final)", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_CURRENT, "backlog.md": BACKLOG_DATED, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_TWO });
    const { lines } = await exec(["list"], p);
    expect(lines.slice(0, 5)).toEqual([
      "20 tareas (sin filtros)",
      "T-12 · in-progress · — · Implementar el parser",
      "T-8 · paused · — · Migrar la documentación vieja",
      "T-9 · paused · — · Otra pausada",
      "T-23 · free · 2026-10-08 · Ajustar los colores [Pulir el sitio]",
    ]);
    for (const line of lines) expect(line).not.toContain("#");
  });

  test("sin filtro, solo las tareas que tienen etiquetas las muestran", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const { lines } = await exec(["list", "--status", "free"], p);
    expect(lines).toContain("T-25 · free · 2026-10-04 · Sin etiquetas");
    expect(lines).toContain("T-24 · free · 2026-10-03 · Revisar la tipografía [Pulir el sitio] #ideas");
    expect(lines).toContain("team · free · 2026-10-02 · Revisar el copy del onboarding");
  });

  test("el título largo se recorta pero las etiquetas quedan al final", async () => {
    const long = "x".repeat(150);
    const backlog = BACKLOG_LABELED.replace("Reescribir la guía", long);
    const p = project({ folders: ["gersom"], ...LABELED, contents: { ...LABELED.contents, "backlog.md": backlog } });
    const { lines } = await exec(["list", "--label", "empresa1", "--status", "free"], p);
    expect(lines).toContain(`T-21 · free · 2026-10-06 · ${"x".repeat(100)}… #empresa1 #trabajo`);
  });
});

describe("list --label: --json", () => {
  test("cada tarea trae `labels`, los filtros traen `labels` y las claves existentes siguen", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const json = JSON.parse((await exec(["list", "--json", "--label", "empresa1,#IDEAS"], p)).out);
    expect(Object.keys(json)).toEqual(["schema", "command", "operator", "filters", "total", "shown", "tasks"]);
    expect(json.filters).toEqual({ status: null, search: null, last: null, group: null, labels: ["empresa1", "IDEAS"] });
    expect(json.tasks).toEqual([
      {
        number: 23,
        title: "Ajustar los colores",
        status: "free",
        date: "2026-10-08",
        group: "Pulir el sitio",
        team: false,
        file: "docs/agents/gersom/backlog.md",
        startLine: 54,
        labels: ["empresa1", "trabajo", "ideas"],
      },
    ]);
  });

  test("sin --label: `labels` null en los filtros y `[]` en las tareas sin etiquetas", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const json = JSON.parse((await exec(["list", "--json", "--last", "40"], p)).out);
    expect(json.filters.labels).toBeNull();
    const byTitle = (title: string) => json.tasks.find((t: { title: string }) => t.title === title);
    expect(byTitle("Sin etiquetas").labels).toEqual([]);
    expect(byTitle("Otra pausada").labels).toEqual([]);
    expect(byTitle("Migrar el CI")).toMatchObject({ team: true, labels: ["empresa1", "trabajo"] });
    expect(byTitle("Escribir el parser").labels).toEqual(["empresa1", "trabajo"]);
  });

  test("con --search siguen `matched` y `labels`", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const json = JSON.parse((await exec(["list", "--json", "--label", "trabajo", "--search", "logo"], p)).out);
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0]).toMatchObject({ number: 27, labels: ["trabajo"], matched: ["title", "fields"] });
  });
});

describe("list --label: ayuda", () => {
  test("`list --help` documenta el flag con un ejemplo", async () => {
    const p = project({ folders: ["gersom"], ...LABELED });
    const { code, out } = await exec(["list", "--help"], p);
    expect(code).toBe(0);
    expect(out).toContain("--label <etiquetas>");
    expect(out).toContain("(repetible)");
    expect(out).toContain("Ej.: --label trabajo,#empresa1");
  });
});
