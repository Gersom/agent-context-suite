import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/cli/dispatch.ts";
import { COMMANDS } from "../../src/commands/index.ts";
import { captureIo, makeProject, type Project } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

/** Todos los archivos del proyecto con su contenido: para comprobar que un comando no escribió nada. */
function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    try {
      result[name] = readFileSync(join(root, name), "utf8");
    } catch {
      // carpetas
    }
  }
  return result;
}

async function exec(argv: string[], p: Project, email: string | null = "gersom@mail.com") {
  const cap = captureIo();
  const code = await run(argv, { io: cap.io, email, baseDir: p.root });
  return { code, out: cap.text(), err: cap.err.join("\n") };
}

describe("registro", () => {
  test("el registro trae los comandos de lectura y los de escritura (`writes`)", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual(["whoami", "anchors", "status", "next", "show", "add", "start", "step", "mode", "pause", "resume", "block", "unblock", "close", "edit", "group-create", "group-eject", "group-add", "group-edit", "group-dissolve"]);
  });
});

describe("whoami", () => {
  test("multi-operador: operador, cómo se resolvió, carpeta propia y archivos", async () => {
    const p = project({ folders: ["gersom"], teamBacklog: true, omit: ["history.md"] });
    const before = snapshot(p.root);
    const { code, out } = await exec(["whoami"], p);
    expect(code).toBe(0);
    expect(out).toContain("Modo: multi-operador");
    expect(out).toContain("Operador: gersom (resuelto por el correo de `git config user.email`");
    expect(out).toContain("Correo de git: gersom@mail.com");
    expect(out).toContain("Carpeta propia: sí");
    expect(out).toContain(`Carpeta de trabajo: ${join(p.agents, "gersom")}`);
    expect(out).toMatch(/handoff\.md\s+existe/);
    expect(out).toMatch(/history\.md\s+no existe/);
    expect(out).toMatch(/team-backlog\.md\s+existe/);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--operator de otro: avisa que es de solo lectura", async () => {
    const p = project({ folders: ["gersom", "ana"] });
    const { out } = await exec(["whoami", "--operator", "ana"], p);
    expect(out).toContain("Operador: ana (resuelto por el flag --operator)");
    expect(out).toContain("Carpeta propia: no: es la carpeta de otro operador");
  });

  test("repo plano", async () => {
    const p = project({ flat: true });
    const { code, out } = await exec(["whoami"], p, null);
    expect(code).toBe(0);
    expect(out).toContain("Modo: plano");
    expect(out).not.toContain("Operador:");
    expect(out).toContain("team-backlog.md: no aplica");
  });

  test("correo no registrado: error claro, código 1 y nada escrito", async () => {
    const p = project({ folders: ["gersom"] });
    const before = snapshot(p.root);
    const { code, err } = await exec(["whoami"], p, "otra@mail.com");
    expect(code).toBe(1);
    expect(err).toContain("otra@mail.com no figura en operators.md");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("operators.md ausente con carpetas de operador", async () => {
    const p = project({ folders: ["gersom"], operators: null });
    const { code, err } = await exec(["whoami"], p);
    expect(code).toBe(1);
    expect(err).toContain("falta operators.md");
  });

  test("operador «solo team-backlog»", async () => {
    const p = project({ folders: ["gersom"] });
    const { code, err } = await exec(["whoami"], p, "luis@mail.com");
    expect(code).toBe(1);
    expect(err).toContain("solo team-backlog");
  });
});

describe("anchors", () => {
  test("todo en orden: código 0 y cada ancla con su línea", async () => {
    const p = project({ folders: ["gersom"], teamBacklog: true });
    const before = snapshot(p.root);
    const { code, out } = await exec(["anchors"], p);
    expect(code).toBe(0);
    expect(out).toMatch(/in-progress\s+ok \(ancla en la línea \d+\)/);
    expect(out).toMatch(/grouped\s+ok/);
    expect(out).toContain("history.md");
    expect(out).toContain("no usa anclas");
    expect(out).toContain("Todas las anclas están en su lugar.");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("archivo sin anclas (plan B): lo marca y sale con código 1, sin escribir", async () => {
    const p = project({ folders: ["gersom"] });
    const path = join(p.agents, "gersom", "backlog.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(/<!-- agent-context-skill:section=[a-z-]+ -->\n/g, ""));
    const before = snapshot(p.root);
    const { code, out } = await exec(["anchors"], p);
    expect(code).toBe(1);
    expect(out).toMatch(/free\s+SIN ANCLA/);
    expect(out).toMatch(/handoff\.md[^]*in-progress\s+ok/);
    expect(out).toContain("3 problema(s)");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("sección que falta", async () => {
    const p = project({ folders: ["gersom"] });
    const path = join(p.agents, "gersom", "handoff.md");
    writeFileSync(path, "# Handoff\n\n<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nSin tarea en curso\n");
    const { code, out } = await exec(["anchors"], p);
    expect(code).toBe(1);
    expect(out).toMatch(/paused\s+NO SE ENCONTRÓ/);
  });

  test("archivos que no existen (set mínimo): informa, no es un error", async () => {
    const p = project({ flat: true, omit: ["backlog.md", "history.md"] });
    const { code, out } = await exec(["anchors"], p, null);
    expect(code).toBe(0);
    expect(out).toContain("backlog.md");
    expect(out).toContain("no existe (opcional");
  });
});
