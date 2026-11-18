// Tests del script entero (index.ts) como proceso, contra un proyecto temporal con git.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BACKLOG_EMPTY, BACKLOG_RICH, HANDOFF_EMPTY, HANDOFF_IDLE } from "../fixtures.ts";
import { makeProject, type Project } from "../helpers.ts";

const INDEX = join(import.meta.dir, "..", "..", "index.ts");

let project: Project;
let hasGit = true;

beforeAll(() => {
  project = makeProject({ folders: ["gersom", "ana"], teamBacklog: true });
  const init = spawnSync("git", ["init", "-q", project.root]);
  hasGit = init.status === 0;
  if (hasGit) spawnSync("git", ["-C", project.root, "config", "user.email", "ANA@mail.com"]);
});
afterAll(() => project.cleanup());

/** Corre index.ts desde `cwd`, sin colores ni variables de npm/bun que cambien la carpeta de invocación. */
async function runCli(args: string[], options: { cwd?: string } = {}) {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1" };
  delete env.INIT_CWD;
  delete env.npm_config_local_prefix;
  const proc = Bun.spawn([process.execPath, INDEX, ...args], {
    env,
    cwd: options.cwd ?? project.root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}

describe("index.ts", () => {
  test("sin argumentos: la ayuda con los comandos, código 0", async () => {
    const { stdout, code } = await runCli([]);
    expect(code).toBe(0);
    expect(stdout).toContain("whoami");
    expect(stdout).toContain("anchors");
  });

  test("whoami usa el repo actual y el correo de git (sin --agents)", async () => {
    if (!hasGit) return;
    const { stdout, code } = await runCli(["whoami"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Operador: ana");
    expect(stdout).toContain("Carpeta propia: sí");
  });

  test("--agents y --operator, en cualquier posición", async () => {
    const { stdout, code } = await runCli(["--operator", "gersom", "whoami", "--agents", project.root], { cwd: join(project.root, "..") });
    expect(code).toBe(0);
    expect(stdout).toContain("Operador: gersom");
  });

  test("anchors: código 0 con todo en orden", async () => {
    const { stdout, code } = await runCli(["anchors", "--operator", "gersom"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Todas las anclas están en su lugar.");
  });

  test("add --apply escribe en la carpeta propia (la del correo de git)", async () => {
    if (!hasGit) return;
    const backlog = join(project.agents, "ana", "backlog.md");
    const applied = await runCli(["add", "--title", "Probar el e2e", "--description", "Desde el proceso", "--apply"]);
    expect(applied.code).toBe(0);
    expect(applied.stdout).toContain("Tarea 20 agregada");
    const after = readFileSync(backlog, "utf8");
    expect(after).toContain("### Tarea 20 — Probar el e2e");
    expect(after).toContain("**Próximo número de tarea:** 21");

    // la carpeta de otro operador es de solo lectura
    const other = await runCli(["add", "--title", "X", "--description", "Y", "--operator", "gersom", "--apply"]);
    expect(other.code).toBe(1);
    expect(other.stderr).toContain("«gersom» no es la tuya");
  });

  test("--labels: add y edit escriben Etiquetas normalizadas; una inválida sale con código 2", async () => {
    if (!hasGit) return;
    const backlog = join(project.agents, "ana", "backlog.md");
    const added = await runCli(["add", "--title", "Con etiquetas", "--description", "Desde el proceso", "--labels", "#Empresa1, trabajo empresa1", "--apply"]);
    expect(added.code).toBe(0);
    expect(readFileSync(backlog, "utf8")).toContain("- **Etiquetas:** Empresa1 trabajo");

    const edited = await runCli(["edit", "21", "--labels", "otra", "--apply"]);
    expect(edited.code).toBe(0);
    expect(readFileSync(backlog, "utf8")).toContain("- **Etiquetas:** otra");
    expect((await runCli(["edit", "21", "--labels", "", "--apply"])).code).toBe(0);
    expect(readFileSync(backlog, "utf8")).not.toContain("Etiquetas");

    const before = readFileSync(backlog, "utf8");
    const bad = await runCli(["add", "--title", "X", "--description", "Y", "--labels", "café", "--apply"]);
    expect(bad.code).toBe(2);
    expect(bad.stdout).toBe("");
    expect(bad.stderr).toContain("«café»");
    expect(readFileSync(backlog, "utf8")).toBe(before);
  });

  test("la ayuda de add y de edit documenta --labels", async () => {
    for (const command of ["add", "edit"]) {
      const { stdout, code } = await runCli([command, "--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("--labels");
      expect(stdout).toContain("Etiquetas");
    }
  });

  test("--label: list y next filtran por etiqueta; una inválida o vacía sale con código 2; status no lo admite", async () => {
    if (!hasGit) return;
    const added = await runCli(["add", "--title", "Etiquetada del e2e", "--description", "Para filtrar", "--labels", "trabajo empresa1", "--apply"]);
    expect(added.code).toBe(0);

    const listed = await runCli(["list", "--label", "#EMPRESA1", "--label", "trabajo", "--json"]);
    expect(listed.code).toBe(0);
    const json = JSON.parse(listed.stdout);
    expect(json.filters.labels).toEqual(["EMPRESA1", "trabajo"]);
    expect(json.tasks.map((t: { title: string }) => t.title)).toEqual(["Etiquetada del e2e"]);
    expect(json.tasks[0].labels).toEqual(["trabajo", "empresa1"]);
    expect((await runCli(["list", "--label", "empresa1,trabajo"])).stdout).toContain("· Etiquetada del e2e #trabajo #empresa1");

    // El operador del fixture tiene una tarea en curso sin etiquetas: `next` la muestra y avisa del filtro.
    const picked = await runCli(["next", "--label", "empresa1"]);
    expect(picked.code).toBe(0);
    expect(picked.stdout).toContain("En curso: Tarea 12");
    expect(picked.stdout).toContain("Nota: la tarea en curso no tiene la etiqueta #empresa1");

    for (const command of ["list", "next"]) {
      for (const value of ["café", ""]) {
        const bad = await runCli([command, "--label", value]);
        expect(bad.code).toBe(2);
        expect(bad.stdout).toBe("");
        expect(bad.stderr).toContain("--label");
      }
    }
    expect((await runCli(["status", "--label", "trabajo"])).code).not.toBe(0);
  });

  test("la ayuda de list y de next documenta --label con un ejemplo", async () => {
    for (const command of ["list", "next"]) {
      const { stdout, code } = await runCli([command, "--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("--label <etiquetas>");
      expect(stdout).toContain("Ej.: --label trabajo,#empresa1");
    }
  });

  test("la ayuda de un comando de escritura avisa de --apply", async () => {
    const { stdout, code } = await runCli(["start", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("sin --apply solo muestra el diff");
    expect(stdout).toContain("--force");
  });

  test("comando desconocido: código distinto de 0 y mensaje en stderr", async () => {
    const { stderr, code, stdout } = await runCli(["nada"]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("Comando desconocido");
  });

  test("operador que no existe: código 1 con el motivo", async () => {
    const { stderr, code } = await runCli(["whoami", "--operator", "nadie"]);
    expect(code).toBe(1);
    expect(stderr).toContain("«nadie» no figura en operators.md");
  });

  test("add en un proyecto sin tareas: el idioma sale de la línea de rules.md", async () => {
    const rules = (value: string) => `# Reglas\n\n   **Idioma de la documentación:** ${value}\n`;
    const fresh = (value: string) =>
      makeProject({ flat: true, rules: rules(value), contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY, "history.md": "# History\n" } });
    const english = fresh("English");
    const spanish = fresh("Español");
    try {
      const args = (p: Project) => ["add", "--title", "Primera", "--description", "Desde el proceso", "--labels", "uno", "--agents", p.agents, "--apply"];
      const en = await runCli(args(english), { cwd: english.root });
      expect(en.code).toBe(0);
      expect(en.stdout).not.toContain("Aviso");
      const enText = readFileSync(join(english.agents, "backlog.md"), "utf8");
      expect(enText).toContain("### Task 5 — Primera");
      expect(enText).toContain("- **Description:** Desde el proceso");
      expect(enText).toContain("- **Tags:** uno");

      const es = await runCli(args(spanish), { cwd: spanish.root });
      expect(es.code).toBe(0);
      expect(es.stdout).not.toContain("Aviso");
      const esText = readFileSync(join(spanish.agents, "backlog.md"), "utf8");
      expect(esText).toContain("### Tarea 5 — Primera");
      expect(esText).toContain("- **Descripción:** Desde el proceso");
      expect(esText).toContain("- **Etiquetas:** uno");
    } finally {
      english.cleanup();
      spanish.cleanup();
    }
  });

  test("close en un history.md como lo deja el perfil no técnico: la entrada nueva reemplaza al `Ninguna.`", async () => {
    const template = readFileSync(join(import.meta.dir, "..", "..", "..", "..", "skill", "template", "agents", "history.md"), "utf8").replace(/\r\n/g, "\n");
    const installed = template.replace(/## \[Placeholder fecha\][\s\S]*$/, "Ninguna.\n");
    expect(installed).toMatch(/\n\nNinguna\.\n$/);
    const p = makeProject({ flat: true, contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": installed } });
    try {
      const start = await runCli(["start", "1", "--agents", p.agents, "--apply"], { cwd: p.root });
      expect(start.code).toBe(0);
      const close = await runCli(["close", "--done", "--summary", "Se hizo lo pedido.", "--agents", p.agents, "--apply"], { cwd: p.root });
      expect(close.code).toBe(0);
      const text = readFileSync(join(p.agents, "history.md"), "utf8");
      expect(text).not.toContain("Ninguna.");
      expect(text.startsWith(installed.replace(/Ninguna\.\n$/, ""))).toBe(true);
      expect(text).toMatch(/-->\n\n## \d{4}-\d{2}-\d{2} — ✅ Tarea 1 — Probar el flujo completo\n\n- Se hizo lo pedido\.\n$/);
    } finally {
      p.cleanup();
    }
  });
});
