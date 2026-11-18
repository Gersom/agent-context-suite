// Tests del script entero (index.ts) corriéndolo como proceso aparte con Bun.spawn.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { FIXTURES, requireFixture } from "../../../_shared/test/helpers.ts";

const INDEX = join(import.meta.dir, "..", "..", "index.ts");

// Carpeta de config por defecto de todas las corridas: temporal y vacía, nunca la real (~/.acsuite).
const sharedHome = mkdtempSync(join(tmpdir(), "board-home-"));
afterAll(() => rmSync(sharedHome, { recursive: true, force: true }));

/**
 * Corre index.ts con los argumentos dados (desde `cwd`, si se indica), sin datos de entrada y sin colores.
 * `home`: carpeta de config del usuario (`ACSUITE_HOME`).
 */
async function run(args: string[], cwd?: string, home = sharedHome): Promise<{ stdout: string; stderr: string; code: number }> {
  // Sin variables de `bun run` heredadas: las rutas relativas no deben depender de quién lanzó los tests.
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1", ACSUITE_HOME: home };
  delete env.INIT_CWD;
  delete env.npm_config_local_prefix;

  const proc = Bun.spawn([process.execPath, INDEX, ...args], {
    env,
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

describe("index.ts", () => {
  test("--once contra un fixture: pinta los recuadros de los tres archivos y sale con código 0, sin atajos", async () => {
    const { stdout, code } = await run([join(FIXTURES, "es-anchors"), "--once"]);
    expect(code).toBe(0);
    const [title, location] = stdout.split("\n");
    expect(title).toBe("▣ TAREAS");
    expect(location).toBe(`  ES ANCHORS   ${join(FIXTURES, "es-anchors")}`);
    for (const box of ["─ history.md ─╮", "╭─ EN PROGRESO", "╭─ LIBRES", "╭─ BLOQUEADAS"]) expect(stdout).toContain(box);
    expect(stdout).toContain("T-11: Escribir el parser de secciones");
    expect(stdout).toContain("Tarea 12 — Implementar el parser de anclas");
    expect(stdout).toContain("T-4: Deploy en skills.sh [dependencia]");
    expect(stdout).not.toContain("Ctrl+C");
    expect(stdout).not.toMatch(/\x1b\[/);
  });

  test("set mínimo con --once: sin recuadros de backlog ni history", async () => {
    const { stdout, code } = await run([join(FIXTURES, "minimal"), "--once"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Sin tarea en curso");
    expect(stdout).not.toContain("LIBRES");
    expect(stdout).not.toContain("history.md ─╮");
  });

  test("ruta inexistente por argumento: código 1 sin preguntar", async () => {
    const { stdout, stderr, code } = await run([join(FIXTURES, "no-existe"), "--once"]);
    expect(code).toBe(1);
    expect(stderr).toContain("No existe la carpeta");
    expect(stdout).not.toContain("Ruta del proyecto");
  });

  test("flag quitado (--operator): código 2 con el mensaje en stderr y nada en stdout", async () => {
    const { stdout, stderr, code } = await run(["--operator", "ana", "--once"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Ya no existe el flag --operator del board: pásalo como segundo argumento tras la ruta: acsuite board <ruta> <operador>");
    expect(stdout).toBe("");
  });

});

describe("index.ts sin ruta: el proyecto de la carpeta donde se lanza", () => {
  const created: string[] = [];
  afterAll(() => created.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  /** Un proyecto temporal con la documentación del fixture `es-anchors` en docs/agents (y, si se pide, un repo git). */
  function tempProject({ git, docs = true }: { git: boolean; docs?: boolean }): string {
    const root = mkdtempSync(join(tmpdir(), "board-cwd-"));
    created.push(root);
    mkdirSync(join(root, "src", "app"), { recursive: true });
    if (docs) {
      mkdirSync(join(root, "docs", "agents"), { recursive: true });
      for (const file of ["handoff.md", "backlog.md", "history.md"]) {
        writeFileSync(join(root, "docs", "agents", file), requireFixture("es-anchors", file));
      }
    }
    if (git) expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    return root;
  }

  test("desde la raíz del proyecto: pinta el tablero y sale con 0", async () => {
    const root = tempProject({ git: true });
    const { stdout, stderr, code } = await run(["--once"], root);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout.startsWith("▣ TAREAS\n  ")).toBe(true);
    expect(stdout).toContain("T-11: Escribir el parser de secciones");
  });

  test("desde una subcarpeta: sube hasta la raíz del repo git", async () => {
    const root = tempProject({ git: true });
    const { stdout, code } = await run(["--once"], join(root, "src", "app"));
    expect(code).toBe(0);
    expect(stdout).toContain("T-11: Escribir el parser de secciones");
  });

  test("sin repo git: usa la carpeta misma", async () => {
    const root = tempProject({ git: false });
    const { stdout, code } = await run(["--once"], root);
    expect(code).toBe(0);
    expect(stdout).toContain("T-11: Escribir el parser de secciones");
  });

  test("fuera de un proyecto (sin documentación): abre la lista de proyectos, vacía y con el mensaje de cómo abrir uno", async () => {
    const root = tempProject({ git: false, docs: false });
    const { stdout, stderr, code } = await run(["--once"], root);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout.startsWith("▣ PROYECTOS\n  Última actualización")).toBe(true);
    expect(stdout).toContain("╭─ PROYECTOS (0)");
    expect(stdout).toContain("No hay proyectos para mostrar.");
    expect(stdout).toContain("acsuite board <ruta>");
    expect(stdout).not.toContain("Ctrl+C");
    expect(stdout).not.toMatch(/\x1b\[/);
  });

  test("carpeta de agentes rota (operadores sin operators.md): sigue siendo un error, no una lista vacía", async () => {
    const root = tempProject({ git: false, docs: false });
    mkdirSync(join(root, "docs", "agents", "ana"), { recursive: true });
    writeFileSync(join(root, "docs", "agents", "ana", "handoff.md"), "# Handoff\n");
    const { stdout, stderr, code } = await run(["--once"], root);
    expect(code).toBe(1);
    expect(stderr).toContain("No se pudo abrir el proyecto de la carpeta actual");
    expect(stderr).toContain("operators.md");
    expect(stderr).toContain("acsuite board <ruta>");
    expect(stdout).toBe("");
  });

  test("con una ruta inexistente no se abre la lista: código 1", async () => {
    const root = tempProject({ git: false, docs: false });
    const { stdout, stderr, code } = await run([join(root, "no-existe"), "--once"], root);
    expect(code).toBe(1);
    expect(stderr).toContain("No existe la carpeta");
    expect(stdout).toBe("");
  });

  test("con una ruta a una carpeta sin la skill: abre la lista de proyectos con el aviso, sin escribir en la config", async () => {
    const root = tempProject({ git: false, docs: false });
    const home = join(mkdtempSync(join(tmpdir(), "board-home-")), "acsuite");
    created.push(join(home, ".."));
    const { stdout, stderr, code } = await run([root, "--once"], undefined, home);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout.startsWith("▣ PROYECTOS\n")).toBe(true);
    expect(stdout).toContain("╭─ PROYECTOS (0)");
    // El aviso se recorta al ancho de la terminal (100 columnas sin TTY): según el largo de la ruta, solo se ve el comienzo.
    expect(stdout).toContain("! La carpeta ");
    expect(stdout).toContain("no tiene la skill");
    expect(existsSync(home)).toBe(false);
  });

  test("sin ruta, la lista de proyectos de una carpeta sin la skill no lleva el aviso", async () => {
    const root = tempProject({ git: false, docs: false });
    const { stdout, code } = await run(["--once"], root);
    expect(code).toBe(0);
    expect(stdout).not.toContain("no tiene la skill");
  });

  test("con una ruta a una carpeta con documentación mal formada (operadores sin operators.md): código 1 con el detalle", async () => {
    const root = tempProject({ git: false, docs: false });
    mkdirSync(join(root, "docs", "agents", "ana"), { recursive: true });
    writeFileSync(join(root, "docs", "agents", "ana", "handoff.md"), "# Handoff\n");
    const { stdout, stderr, code } = await run([root, "--once"], undefined);
    expect(code).toBe(1);
    expect(stderr).toContain("operators.md");
    expect(stdout).toBe("");
  });

  test("con una ruta a una carpeta de agentes sin handoff.md: código 1 con el detalle", async () => {
    const root = tempProject({ git: false, docs: false });
    mkdirSync(join(root, "docs", "agents"), { recursive: true });
    const { stdout, stderr, code } = await run([root, "--once"], undefined);
    expect(code).toBe(1);
    expect(stderr).toContain("No se encontró handoff.md");
    expect(stdout).toBe("");
  });

  test("con una ruta a una carpeta con la skill bien iniciada: abre el tablero, sin aviso", async () => {
    const root = tempProject({ git: false });
    const { stdout, stderr, code } = await run([root, "--once"], undefined);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout.startsWith("▣ TAREAS\n")).toBe(true);
    expect(stdout).not.toContain("no tiene la skill");
  });

  test("--once en un repo con docs no escribe nada en la carpeta de config", async () => {
    const root = tempProject({ git: true });
    const home = join(mkdtempSync(join(tmpdir(), "board-home-")), "acsuite");
    created.push(join(home, ".."));
    for (const args of [["--once"], [root, "--once"]]) {
      const { code } = await run(args, root, home);
      expect(code).toBe(0);
    }
    expect(existsSync(join(home, "projects.json"))).toBe(false);
    expect(existsSync(home)).toBe(false);
  });

  test("sin --once, abrir el board en una subcarpeta de un repo registra la raíz del repo en projects.json", async () => {
    const root = tempProject({ git: true });
    const home = mkdtempSync(join(tmpdir(), "board-home-"));
    created.push(home);
    const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1", ACSUITE_HOME: home };
    delete env.INIT_CWD;
    delete env.npm_config_local_prefix;
    const proc = Bun.spawn([process.execPath, INDEX], { env, cwd: join(root, "src", "app"), stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    try {
      const file = join(home, "projects.json");
      for (let i = 0; i < 100 && !existsSync(file); i++) await Bun.sleep(100);
      expect(existsSync(file)).toBe(true);
      const saved = JSON.parse(readFileSync(file, "utf8")) as { version: number; projects: string[] };
      expect(saved.version).toBe(1);
      expect(saved.projects).toHaveLength(1);
      expect(basename(saved.projects[0])).toBe(basename(root));
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test("fuera de un proyecto: la lista de proyectos muestra los repos de projects.json de ACSUITE_HOME", async () => {
    const saved = tempProject({ git: true });
    const outside = tempProject({ git: false, docs: false });
    const home = mkdtempSync(join(tmpdir(), "board-home-"));
    created.push(home);
    writeFileSync(join(home, "projects.json"), JSON.stringify({ version: 1, projects: [saved] }));
    const { stdout, stderr, code } = await run(["--once"], outside, home);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain("╭─ PROYECTOS (1)");
    expect(stdout).toContain(basename(saved));
    expect(stdout).not.toContain("No hay proyectos para mostrar.");
  });

  test("projects.json corrupto: la lista sale vacía con el aviso, no es un error", async () => {
    const outside = tempProject({ git: false, docs: false });
    const home = mkdtempSync(join(tmpdir(), "board-home-"));
    created.push(home);
    writeFileSync(join(home, "projects.json"), "{ roto");
    const { stdout, code } = await run(["--once"], outside, home);
    expect(code).toBe(0);
    expect(stdout).toContain("╭─ PROYECTOS (0)");
    expect(stdout).toContain("projects.json no es un JSON válido");
  });

  test("con ruta, la carpeta de lanzamiento no importa", async () => {
    const other = tempProject({ git: false, docs: false });
    const { stdout, code } = await run([join(FIXTURES, "es-anchors"), "--once"], other);
    expect(code).toBe(0);
    expect(stdout.startsWith("▣ TAREAS\n  ES ANCHORS   ")).toBe(true);
  });
});

describe("settings.json: compacto, flechas y modo observador recordados", () => {
  const fixture = join(FIXTURES, "es-anchors");
  const created: string[] = [];
  afterAll(() => created.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  /** Una carpeta de config temporal con este `settings.json` (texto tal cual). */
  function homeWith(text: string): string {
    const home = mkdtempSync(join(tmpdir(), "board-home-"));
    created.push(home);
    writeFileSync(join(home, "settings.json"), text);
    return home;
  }
  const saved = JSON.stringify({ version: 1, board: { compact: true, arrows: false } });

  test("--once arranca con lo guardado: compacto y sin flechas", async () => {
    const { stdout, code } = await run([fixture, "--once"], undefined, homeWith(saved));
    expect(code).toBe(0);
    expect(stdout).toContain("más");
    expect(stdout).not.toContain("↓ ");
  });

  test("sin settings.json: los defectos (completo y con flechas)", async () => {
    const { stdout } = await run([fixture, "--once"]);
    expect(stdout).not.toContain("más");
    expect(stdout).toContain("↓ ");
  });

  test("settings.json corrupto: avisa, arranca con los defectos y --once no lo toca", async () => {
    const home = homeWith("{ roto");
    const { stdout, code } = await run([fixture, "--once"], undefined, home);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^! /m);
    expect(stdout).not.toContain("más");
    expect(readFileSync(join(home, "settings.json"), "utf8")).toBe("{ roto");
  });

  test("sin TTY y sin --once, con follow guardado: no entra al observador y no escribe settings.json", async () => {
    const text = JSON.stringify({ version: 1, board: { follow: true } });
    const home = homeWith(text);
    const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1", ACSUITE_HOME: home };
    delete env.INIT_CWD;
    delete env.npm_config_local_prefix;
    // Sin --once el proceso sigue vigilando: se lee hasta que pinta el tablero y se mata.
    const proc = Bun.spawn([process.execPath, INDEX, fixture], { env, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    let stdout = "";
    try {
      const decoder = new TextDecoder();
      const deadline = Date.now() + 10_000;
      for await (const chunk of proc.stdout) {
        stdout += decoder.decode(chunk);
        if (stdout.includes("ES ANCHORS") || Date.now() > deadline) break;
      }
    } finally {
      proc.kill();
      await proc.exited;
    }
    expect(stdout).toContain("ES ANCHORS");
    expect(stdout).not.toContain("Esperando");
    expect(readFileSync(join(home, "settings.json"), "utf8")).toBe(text);
    expect(readdirSync(home).filter((name) => name.startsWith("settings.json"))).toEqual(["settings.json"]);
  });
});
