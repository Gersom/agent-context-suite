// `list`: todas las tareas del operador en una lista, de la más reciente a la más antigua, con
// filtros por estado, texto y grupo. Solo lectura: cada ejecución comprueba que no escribió nada.

import { afterAll, describe, expect, test } from "bun:test";
import { run } from "../../src/cli/dispatch.ts";
import { BACKLOG_DATED, BACKLOG_EMPTY, HANDOFF_CURRENT, HANDOFF_EMPTY, HISTORY_RICH, TEAM_TWO } from "../fixtures.ts";
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

const DATED = { contents: { "handoff.md": HANDOFF_CURRENT, "backlog.md": BACKLOG_DATED, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_TWO };

/** history.md con las entradas dadas, la primera arriba (como en el archivo real). */
function historyOf(entries: Array<{ date: string; mark?: "✅" | "❌"; number: number; title: string; body?: string }>): string {
  const blocks = entries.map((e) => `## ${e.date} — ${e.mark ?? "✅"} Tarea ${e.number} — ${e.title}\n\n- ${e.body ?? `CUERPO-${e.number}.`}\n`);
  return `# History\n\n---\n\n${blocks.join("\n")}`;
}

const NUMBERS = (lines: string[]) => lines.slice(1).map((line) => line.split(" · ")[0]);

describe("list: orden y formato", () => {
  test("por defecto: en curso, pausadas, luego por fecha descendente y al final las sin fecha", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { code, lines } = await exec(["list"], p);
    expect(code).toBe(0);
    expect(lines).toEqual([
      "20 tareas (sin filtros)",
      "T-12 · in-progress · — · Implementar el parser",
      "T-8 · paused · — · Migrar la documentación vieja",
      "T-9 · paused · — · Otra pausada",
      "T-23 · free · 2026-10-08 · Ajustar los colores [Pulir el sitio]",
      "T-11 · done · 2026-10-07 · Escribir el parser",
      // Misma fecha: primero history (orden del archivo) y luego el backlog por número descendente.
      "T-10 · discarded · 2026-10-06 · Usar YAML",
      "T-22 · free · 2026-10-06 · Ordenar los scripts",
      "T-21 · free · 2026-10-06 · Reescribir la guía",
      "T-9 · done · 2026-10-05 · Preparar fixtures",
      "T-26 · blocked · 2026-10-05 · Publicar el sitio",
      "— · done · 2026-10-04 · Agregar la sección «Qué es»",
      "T-27 · postponed · 2026-10-04 · Cambiar el logo",
      "team · postponed · 2026-10-04 · Cambiar de proveedor",
      "T-2 · done · 2026-10-03 · La más vieja",
      "T-24 · free · 2026-10-03 · Revisar la tipografía [Pulir el sitio]",
      "team · free · 2026-10-03 · Migrar el CI",
      "team · free · 2026-10-02 · Revisar el copy del onboarding",
      "T-28 · blocked · 2026-10-01 · Revisar el contrato",
      "T-29 · blocked · 2026-09-30 · Esperar al legal",
      "T-25 · free · — · Sin fecha",
    ]);
  });

  test("sin tarea en curso las pausadas abren la lista; una fecha mal escrita en history cuenta como sin fecha", async () => {
    const history = historyOf([
      { date: "2026-10-09", number: 31, title: "Con fecha" },
      { date: "ayer", number: 30, title: "Fecha rota" },
    ]);
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_CURRENT.replace("Tarea 12 — Implementar el parser", "Sin tarea en curso"), "backlog.md": BACKLOG_EMPTY, "history.md": history } });
    const { lines } = await exec(["list"], p);
    expect(lines.slice(1)).toEqual([
      "T-8 · paused · — · Migrar la documentación vieja",
      "T-9 · paused · — · Otra pausada",
      "T-31 · done · 2026-10-09 · Con fecha",
      "T-30 · done · — · Fecha rota",
    ]);
  });

  test("las tareas del team salen sin número, con la fecha de «Agregada» sin el «por <operador>»", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { lines } = await exec(["list", "--status", "free", "--last", "50"], p);
    expect(lines).toContain("team · free · 2026-10-02 · Revisar el copy del onboarding");
    expect(lines).toContain("team · free · 2026-10-03 · Migrar el CI");
  });

  test("bloqueadas: dependencia y otro tag o sin tag son `blocked`; postergada, `postponed`", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const blocked = await exec(["list", "--status", "blocked"], p);
    expect(NUMBERS(blocked.lines)).toEqual(["T-26", "T-28", "T-29"]);
    const postponed = await exec(["list", "--status", "postponed"], p);
    expect(NUMBERS(postponed.lines)).toEqual(["T-27", "team"]);
  });

  test("no repite las tareas de un grupo: salen una vez, con su grupo", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { lines } = await exec(["list", "--last", "50"], p);
    expect(lines.filter((l) => l.includes("T-23 ·"))).toHaveLength(1);
    expect(lines.filter((l) => l.includes("T-24 ·"))).toHaveLength(1);
    expect(lines).toContain("T-23 · free · 2026-10-08 · Ajustar los colores [Pulir el sitio]");
  });
});

describe("list: --last y el límite por defecto", () => {
  test("las últimas N en general", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { lines } = await exec(["list", "--last", "5"], p);
    expect(lines).toEqual([
      "5 de 20 tareas (--last 5)",
      "T-12 · in-progress · — · Implementar el parser",
      "T-8 · paused · — · Migrar la documentación vieja",
      "T-9 · paused · — · Otra pausada",
      "T-23 · free · 2026-10-08 · Ajustar los colores [Pulir el sitio]",
      "T-11 · done · 2026-10-07 · Escribir el parser",
    ]);
  });

  test("las N últimas descartadas: se filtra primero y se corta después", async () => {
    const history = historyOf([
      { date: "2026-11-16", mark: "✅", number: 45, title: "Hecha reciente" },
      { date: "2026-11-15", mark: "❌", number: 44, title: "Cuarta descartada" },
      { date: "2026-11-14", mark: "❌", number: 43, title: "Tercera descartada" },
      { date: "2026-11-13", mark: "✅", number: 42, title: "Hecha" },
      { date: "2026-11-12", mark: "❌", number: 41, title: "Segunda descartada" },
      { date: "2026-11-11", mark: "❌", number: 40, title: "Primera descartada" },
    ]);
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY, "history.md": history } });
    const { lines } = await exec(["list", "--status", "discarded", "--last", "3"], p);
    expect(lines).toEqual([
      "3 de 4 tareas (--status discarded --last 3)",
      "T-44 · discarded · 2026-11-15 · Cuarta descartada",
      "T-43 · discarded · 2026-11-14 · Tercera descartada",
      "T-41 · discarded · 2026-11-12 · Segunda descartada",
    ]);
  });

  test("sin --last muestra 20 y avisa cuántas más hay", async () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({ date: `2026-11-${String(25 - i).padStart(2, "0")}`, number: 25 - i, title: `Tarea número ${25 - i}` }));
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY, "history.md": historyOf(entries) } });
    const { lines } = await exec(["list"], p);
    expect(lines).toHaveLength(22);
    expect(lines[0]).toBe("20 de 25 tareas (sin filtros)");
    expect(lines[1]).toBe("T-25 · done · 2026-11-25 · Tarea número 25");
    expect(lines[20]).toBe("T-6 · done · 2026-11-06 · Tarea número 6");
    expect(lines[21]).toBe("Hay 5 más: usa --last <N> o filtra con --status/--search.");
    // Con --last explícito no hay nota, aunque queden tareas fuera.
    const explicit = await exec(["list", "--last", "24"], p);
    expect(explicit.lines).toHaveLength(25);
    expect(explicit.out).not.toContain("Hay ");
    expect((await exec(["list", "--last", "100"], p)).lines[0]).toBe("25 tareas (--last 100)");
  });

  test("--last inválido: mal uso, código 2", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    for (const argv of [["list", "--last", "0"], ["list", "--last", "abc"], ["list", "--last", "2.5"], ["list", "--last=-1"]]) {
      const { code, err, out } = await exec(argv, p);
      expect(code).toBe(2);
      expect(out).toBe("");
      expect(err).toContain("--last");
    }
    expect((await exec(["list", "--last"], p)).code).toBe(2);
  });
});

describe("list: --status", () => {
  test("se repite y se separa por comas, sin distinguir mayúsculas", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const repeated = await exec(["list", "--status", "in-progress", "--status", "paused"], p);
    expect(repeated.lines).toEqual([
      "3 tareas (--status in-progress,paused)",
      "T-12 · in-progress · — · Implementar el parser",
      "T-8 · paused · — · Migrar la documentación vieja",
      "T-9 · paused · — · Otra pausada",
    ]);
    const commas = await exec(["list", "--status", "In-Progress, paused"], p);
    expect(commas.lines).toEqual(repeated.lines);
    const mixed = await exec(["list", "--status", "done,discarded", "--status", "done"], p);
    expect(mixed.lines[0]).toBe("5 tareas (--status done,discarded)");
  });

  test("valor desconocido: mal uso (2) con los estados válidos", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    for (const argv of [["list", "--status", "hecha"], ["list", "--status", "done,nada"], ["list", "--status", "done,"], ["list", "--status", "dependencia"]]) {
      const { code, err, out } = await exec(argv, p);
      expect(code).toBe(2);
      expect(out).toBe("");
      expect(err).toContain("Estados válidos: free, blocked, postponed, in-progress, paused, done, discarded.");
    }
    expect((await exec(["list", "--status", "hecha"], p)).err).toContain("«hecha»");
  });
});

describe("list: --search", () => {
  test("en el título, sin distinguir mayúsculas ni acentos", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    for (const text of ["guía", "GUIA", "reescribir la GUÍA"]) {
      const { lines } = await exec(["list", "--search", text], p);
      expect(lines).toEqual([`1 tarea (--search «${text}»)`, "T-21 · free · 2026-10-06 · Reescribir la guía"]);
    }
  });

  test("en la descripción y demás campos de backlog, de un grupo y del team", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    expect(NUMBERS((await exec(["list", "--search", "INSTALADOR"], p)).lines)).toEqual(["T-21"]);
    // «ÁCIDA» está escrito con tilde y mayúsculas en el archivo; se busca sin ellas.
    expect(NUMBERS((await exec(["list", "--search", "acida"], p)).lines)).toEqual(["T-23"]);
    // Campo «Decisiones…» del team y «Detalles».
    expect(NUMBERS((await exec(["list", "--search", "¿se migra"], p)).lines)).toEqual(["team"]);
    expect(NUMBERS((await exec(["list", "--search", "T-3@ana"], p)).lines)).toEqual(["team"]);
    // El motivo del bloqueo también es un campo.
    expect(NUMBERS((await exec(["list", "--search", "revisión"], p)).lines)).toEqual(["T-29"]);
  });

  test("en el cuerpo de una cerrada (con y sin acentos), pero no en su cabecera", async () => {
    const history = historyOf([
      { date: "2026-11-02", number: 51, title: "Cerrada con tilde", body: "Se decidió la migración incremental." },
      { date: "2026-11-01", number: 50, title: "Otra", body: "Nada que ver." },
    ]);
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY, "history.md": history } });
    for (const text of ["migración incremental", "MIGRACION INCREMENTAL", "decidio"]) {
      expect((await exec(["list", "--search", text], p)).lines).toEqual([`1 tarea (--search «${text}»)`, "T-51 · done · 2026-11-02 · Cerrada con tilde"]);
    }
    // La fecha y la marca de la cabecera no son parte del cuerpo.
    expect((await exec(["list", "--search", "2026-11-02"], p)).out).toBe("Ninguna tarea coincide.");

    const rich = project({ folders: ["gersom"], ...DATED });
    expect((await exec(["list", "--search", "detalle largo"], rich)).lines).toEqual(["1 tarea (--search «detalle largo»)", "T-11 · done · 2026-10-07 · Escribir el parser"]);
  });

  test("en el cuerpo de la tarea en curso y de las pausadas", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    expect((await exec(["list", "--search", "CORRER LOS TESTS"], p)).lines).toEqual(["1 tarea (--search «CORRER LOS TESTS»)", "T-12 · in-progress · — · Implementar el parser"]);
    expect(NUMBERS((await exec(["list", "--search", "setup.md"], p)).lines)).toEqual(["T-8"]);
  });

  test("se combina con --status y --last: las N últimas con la palabra", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { lines } = await exec(["list", "--search", "el", "--status", "free", "--last", "2"], p);
    // Con «el»: T-21 (su descripción dice «del»), «Migrar el CI» y «Revisar el copy…».
    expect(lines).toEqual(["2 de 3 tareas (--status free --search «el» --last 2)", "T-21 · free · 2026-10-06 · Reescribir la guía", "team · free · 2026-10-03 · Migrar el CI"]);
    expect((await exec(["list", "--search", "zzz-nada"], p)).lines).toEqual(["Ninguna tarea coincide."]);
  });

  test("un texto vacío o un argumento suelto: mal uso", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const blank = await exec(["list", "--search", "  "], p);
    expect(blank.code).toBe(2);
    expect(blank.err).toContain("--search necesita un texto");
    const stray = await exec(["list", "guía"], p);
    expect(stray.code).toBe(2);
    expect(stray.err).toContain("no recibe argumentos");
  });

  test("un texto que queda vacío al normalizarlo (solo marcas combinantes) es mal uso, como el en blanco", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    for (const value of ["́", " ́̀ "]) {
      const { code, err, out } = await exec(["list", "--search", value], p);
      expect(code).toBe(2);
      expect(out).toBe("");
      expect(err).toContain("--search necesita un texto");
    }
  });

  test("un flag repetido usa el último valor", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { lines } = await exec(["list", "--search", "zzz-nada", "--search", "guía"], p);
    expect(lines).toEqual(["1 tarea (--search «guía»)", "T-21 · free · 2026-10-06 · Reescribir la guía"]);
    expect((await exec(["list", "--last", "1", "--last", "2"], p)).lines[0]).toBe("2 de 20 tareas (--last 2)");
    expect((await exec(["list", "--group", "otro", "--group", "pulir"], p)).lines[0]).toBe("2 tareas (--group «pulir»)");
  });
});

describe("list: --group", () => {
  test("filtra por el título del grupo, por subcadena y sin acentos", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { lines } = await exec(["list", "--group", "PULIR"], p);
    expect(lines).toEqual([
      "2 tareas (--group «PULIR»)",
      "T-23 · free · 2026-10-08 · Ajustar los colores [Pulir el sitio]",
      "T-24 · free · 2026-10-03 · Revisar la tipografía [Pulir el sitio]",
    ]);
    expect((await exec(["list", "--group", "sitio", "--status", "done"], p)).out).toBe("Ninguna tarea coincide.");
    expect((await exec(["list", "--group", "otro"], p)).out).toBe("Ninguna tarea coincide.");
    expect((await exec(["list", "--group", " "], p)).code).toBe(2);
  });

  test("un grupo que queda vacío al normalizarlo (solo marcas combinantes): mal uso, no coincide con todo", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { code, err, out } = await exec(["list", "--group", "́"], p);
    expect(code).toBe(2);
    expect(out).toBe("");
    expect(err).toContain("--group necesita un texto");
  });

  test("una tarea agrupada que se encuentra por búsqueda conserva su grupo en la línea", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    expect((await exec(["list", "--search", "tipografía"], p)).lines[1]).toBe("T-24 · free · 2026-10-03 · Revisar la tipografía [Pulir el sitio]");
  });
});

describe("list: títulos largos en texto", () => {
  const NOTE = "Títulos recortados a 100 caracteres: `show <N>` muestra la tarea completa.";
  const long = "abcdefghij".repeat(15);
  const exact = "abcdefghij".repeat(10);
  const only = (title: string) =>
    project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY, "history.md": historyOf([{ date: "2026-11-20", number: 60, title }]) } });

  test("un título de 150 caracteres se recorta a 100 con «…» y avisa en una sola línea", async () => {
    const p = project({
      folders: ["gersom"],
      contents: {
        "handoff.md": HANDOFF_EMPTY,
        "backlog.md": BACKLOG_EMPTY,
        "history.md": historyOf([
          { date: "2026-11-20", number: 61, title: long },
          { date: "2026-11-19", number: 60, title: `${long}Z` },
        ]),
      },
    });
    const { lines } = await exec(["list"], p);
    expect(lines).toEqual(["2 tareas (sin filtros)", `T-61 · done · 2026-11-20 · ${exact}…`, `T-60 · done · 2026-11-19 · ${exact}…`, NOTE]);
  });

  test("un título de exactamente 100 caracteres no se recorta y no hay nota", async () => {
    const { lines, out } = await exec(["list"], only(exact));
    expect(lines).toEqual(["1 tarea (sin filtros)", `T-60 · done · 2026-11-20 · ${exact}`]);
    expect(out).not.toContain("Títulos recortados");
  });

  test("la nota sale una sola vez aunque se recorten varios, y la de «Hay M más» va antes", async () => {
    const entries = Array.from({ length: 22 }, (_, i) => ({ date: `2026-11-${String(25 - i).padStart(2, "0")}`, number: 25 - i, title: long }));
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY, "history.md": historyOf(entries) } });
    const { lines } = await exec(["list"], p);
    expect(lines.filter((l) => l === NOTE)).toHaveLength(1);
    expect(lines.at(-2)).toBe("Hay 2 más: usa --last <N> o filtra con --status/--search.");
    expect(lines.at(-1)).toBe(NOTE);
  });

  test("cuenta caracteres, no unidades UTF-16: no parte un emoji", async () => {
    const title = `${"a".repeat(99)}😀${"b".repeat(10)}`;
    const { lines } = await exec(["list"], only(title));
    expect(lines[1]).toBe(`T-60 · done · 2026-11-20 · ${"a".repeat(99)}😀…`);
    // Con 100 caracteres justos (el último, un emoji de dos unidades) tampoco se recorta.
    const edge = await exec(["list"], only(`${"a".repeat(99)}😀`));
    expect(edge.lines[1]).toBe(`T-60 · done · 2026-11-20 · ${"a".repeat(99)}😀`);
    expect(edge.out).not.toContain("Títulos recortados");
  });

  test("--json lleva el título completo y sin nota", async () => {
    const p = only(long);
    const { out } = await exec(["list", "--json"], p);
    expect(JSON.parse(out).tasks[0].title).toBe(long);
    expect(out).not.toContain("Títulos recortados");
  });
});

describe("list: --json", () => {
  test("esquema completo, con `matched` al buscar", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const json = JSON.parse((await exec(["list", "--json", "--search", "parser", "--status", "in-progress,done", "--last", "5"], p)).out);
    expect(Object.keys(json)).toEqual(["schema", "command", "operator", "filters", "total", "shown", "tasks"]);
    expect(json).toMatchObject({
      schema: 1,
      command: "list",
      operator: "gersom",
      filters: { status: ["in-progress", "done"], search: "parser", last: 5, group: null },
      total: 2,
      shown: 2,
    });
    expect(json.tasks).toEqual([
      { number: 12, title: "Implementar el parser", status: "in-progress", date: null, group: null, team: false, file: "docs/agents/gersom/handoff.md", startLine: 6, matched: ["title"] },
      { number: 11, title: "Escribir el parser", status: "done", date: "2026-10-07", group: null, team: false, file: "docs/agents/gersom/history.md", startLine: 5, matched: ["title"] },
    ]);
  });

  test("matched lista todos los lugares donde coincidió", async () => {
    const backlog = BACKLOG_DATED.replace("Mejorar la documentación del instalador CUERPO-21.", "Mejorar la guía del instalador.");
    const p = project({ folders: ["gersom"], ...DATED, contents: { ...DATED.contents, "backlog.md": backlog } });
    const json = JSON.parse((await exec(["list", "--json", "--search", "GUIA"], p)).out);
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0]).toMatchObject({ number: 21, matched: ["title", "fields"] });
    const body = JSON.parse((await exec(["list", "--json", "--search", "setup.md"], p)).out);
    expect(body.tasks[0]).toMatchObject({ number: 8, status: "paused", matched: ["body"] });
  });

  test("sin búsqueda no trae `matched`; con filtros ausentes van en null; las del team y de grupo", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const json = JSON.parse((await exec(["list", "--json", "--last", "40"], p)).out);
    expect(json.filters).toEqual({ status: null, search: null, last: 40, group: null });
    expect(json).toMatchObject({ total: 20, shown: 20 });
    for (const task of json.tasks) expect("matched" in task).toBe(false);
    expect(json.tasks.find((t: { title: string }) => t.title === "Migrar el CI")).toMatchObject({
      number: null,
      status: "free",
      date: "2026-10-03",
      group: null,
      team: true,
      file: "docs/agents/team-backlog.md",
    });
    expect(json.tasks.find((t: { number: number }) => t.number === 24)).toMatchObject({ group: "Pulir el sitio", file: "docs/agents/gersom/backlog.md", date: "2026-10-03" });
    // El límite por defecto también se aplica en JSON: total cuenta todo, shown lo mostrado.
    const entries = Array.from({ length: 25 }, (_, i) => ({ date: `2026-11-${String(25 - i).padStart(2, "0")}`, number: 25 - i, title: `Tarea ${25 - i}` }));
    const many = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY, "history.md": historyOf(entries) } });
    const limited = JSON.parse((await exec(["list", "--json"], many)).out);
    expect(limited).toMatchObject({ total: 25, shown: 20, filters: { last: null } });
    expect(limited.tasks).toHaveLength(20);
  });

  test("sin resultados: JSON con la lista vacía y código 0", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { code, out } = await exec(["list", "--json", "--search", "zzz"], p);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ total: 0, shown: 0, tasks: [] });
  });
});

describe("list: sin resultados y entornos", () => {
  test("«Ninguna tarea coincide.» con código 0", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { code, lines } = await exec(["list", "--status", "discarded", "--search", "nada"], p);
    expect(code).toBe(0);
    expect(lines).toEqual(["Ninguna tarea coincide."]);
  });

  test("repo plano: sin team-backlog", async () => {
    const p = project({ flat: true, ...DATED });
    const { code, lines } = await exec(["list", "--last", "50"], p, null);
    expect(code).toBe(0);
    expect(lines[0]).toBe("17 tareas (--last 50)");
    expect(lines.some((l) => l.startsWith("team"))).toBe(false);
    const json = JSON.parse((await exec(["list", "--json", "--status", "in-progress"], p, null)).out);
    expect(json.operator).toBeNull();
    expect(json.tasks[0].file).toBe("docs/agents/handoff.md");
  });

  test("--operator de otro operador: lista sus archivos (y el team-backlog compartido)", async () => {
    const ana = { "history.md": "# History\n\n## 2026-10-01 — ✅ Tarea 77 — De Ana\n\n- CUERPO-ANA\n" };
    const p = project({ folders: ["gersom", "ana"], ...DATED, folderContents: { ana } });
    const { lines } = await exec(["list", "--operator", "ana", "--status", "done"], p);
    expect(lines).toEqual(["1 tarea (--status done)", "T-77 · done · 2026-10-01 · De Ana"]);
    const json = JSON.parse((await exec(["list", "--operator", "ana", "--json", "--search", "CUERPO-ANA"], p)).out);
    expect(json.operator).toBe("ana");
    expect(json.tasks[0]).toMatchObject({ number: 77, file: "docs/agents/ana/history.md", matched: ["body"] });
    // El de gersom no sale en la lista de ana.
    expect((await exec(["list", "--operator", "ana", "--search", "Escribir el parser"], p)).out).not.toContain("T-11");
  });

  test("operador «solo team-backlog»: solo las tareas del team, sin número", async () => {
    const p = project({ folders: ["gersom"], ...DATED });
    const { code, lines } = await exec(["list"], p, "luis@mail.com");
    expect(code).toBe(0);
    expect(lines).toEqual([
      "3 tareas (sin filtros)",
      "team · postponed · 2026-10-04 · Cambiar de proveedor",
      "team · free · 2026-10-03 · Migrar el CI",
      "team · free · 2026-10-02 · Revisar el copy del onboarding",
    ]);
    expect(JSON.parse((await exec(["list", "--json"], p, "luis@mail.com")).out).operator).toBe("luis");
  });

  test("sin team-backlog.md: lista solo las del operador", async () => {
    const p = project({ folders: ["gersom"], ...DATED, teamBacklogText: undefined });
    const { lines } = await exec(["list", "--last", "50"], p);
    expect(lines[0]).toBe("17 tareas (--last 50)");
    expect(lines.some((l) => l.startsWith("team"))).toBe(false);
  });

  test("set mínimo (solo handoff.md): no es un error", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_CURRENT }, omit: ["backlog.md", "history.md"] });
    const { code, lines } = await exec(["list"], p);
    expect(code).toBe(0);
    expect(lines).toHaveLength(4);
  });

  test("sin handoff.md: error claro, código 1", async () => {
    const p = project({ folders: ["gersom"], omit: ["handoff.md"] });
    const { code, err } = await exec(["list"], p);
    expect(code).toBe(1);
    expect(err).toContain("handoff.md");
  });

  test("se anuncia en la ayuda, con sus flags", async () => {
    const p = project({ folders: ["gersom"] });
    expect((await exec([], p)).out).toContain("list");
    const help = (await exec(["list", "--help"], p)).out;
    for (const flag of ["--status", "--search", "--last", "--group", "--json"]) expect(help).toContain(flag);
    expect(help).toContain("(repetible)");
    expect(help).not.toContain("--apply *");
  });
});
