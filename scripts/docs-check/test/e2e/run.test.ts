// Tests de `run` de punta a punta: proyectos reales en un directorio temporal, el correo de git
// inyectado por `email` y la salida capturada.

import { afterAll, describe, expect, test } from "bun:test";
import { basename, dirname, join, resolve } from "node:path";
import { run } from "../../src/run.ts";
import type { Finding } from "../../src/types.ts";
import { ANCHOR, BACKLOG, HANDOFF, HISTORY, lineOf, TEMPLATE_RULES } from "../fixtures.ts";
import { captureIo, flatTree, multiTree, snapshot, type TempProject, type Tree, writeProject } from "../helpers.ts";

const created: TempProject[] = [];
afterAll(() => created.forEach((p) => p.cleanup()));

/** Crea un proyecto temporal que se borra al terminar la suite. */
function project(tree: Tree): TempProject {
  const p = writeProject(tree);
  created.push(p);
  return p;
}

const toCrlf = (tree: Tree): Tree => Object.fromEntries(Object.entries(tree).map(([path, text]) => [path, text.replace(/\n/g, "\r\n")]));

interface Outcome {
  code: number;
  out: string;
  err: string;
}

async function check(argv: string[], options: { baseDir?: string; email?: string | null } = {}): Promise<Outcome> {
  const cap = captureIo();
  const code = await run(argv, { io: cap.io, baseDir: options.baseDir, email: options.email });
  return { code, out: cap.text(), err: cap.err.join("\n") };
}

interface JsonReport {
  ok: boolean;
  strict: boolean;
  project: string;
  mode: "flat" | "multi" | null;
  agentsDir: string | null;
  operator: string | null;
  errors: number;
  warnings: number;
  findings: Finding[];
}

async function checkJson(argv: string[], options: { baseDir?: string; email?: string | null } = {}): Promise<JsonReport & { code: number }> {
  const { code, out } = await check([...argv, "--json"], options);
  return { code, ...(JSON.parse(out) as JsonReport) };
}

/** Un repo plano con problemas de todo tipo a la vez. */
function brokenTree(): Tree {
  const tree = flatTree();
  delete tree["AGENTS.md"];
  tree["CLAUDE.md"] = "# Notas sueltas\n";
  tree["docs/agents/handoff.md"] = HANDOFF.replace(`${ANCHOR("paused")}\n`, "").replace(/### Plan[\s\S]*?### Qué falta/, "### Qué falta");
  tree["docs/agents/backlog.md"] = BACKLOG.replace("**Próximo número de tarea:** 10", "**Próximo número de tarea:** 5")
    .replace("### Tarea 9 — Revisar", "### Tarea 8 — Revisar")
    .replace("### Tarea 6 — Publicar la versión 2", "### Tarea 6: Publicar la versión 2")
    .replace("unificar el tono.", "[Placeholder]")
    .replace("- **Bloqueos:** Ninguno.\n- **Disparador:**", "- **Bloqueos:** `[dependencia]` falta algo.\n- **Disparador:**");
  tree["docs/agents/history.md"] = HISTORY.replace("❌ Tarea 2", "Tarea 2");
  tree["docs/agents/rules.md"] = "# Reglas del proyecto\n";
  return tree;
}

const BROKEN_CODES = [
  "anchor-missing",
  "block-tag",
  "history-entry",
  "next-number",
  "placeholder",
  "root-file",
  "suite-rules",
  "task-duplicate",
  "task-heading",
];

describe("repo plano válido", () => {
  const p = project(flatTree());

  test("sin hallazgos: código 0 y «Listo para trabajar…»", async () => {
    const { code, out, err } = await check([p.root]);
    expect(code).toBe(0);
    expect(err).toBe("");
    expect(out).toContain(`Proyecto:  ${resolve(p.root)}`);
    expect(out).toContain("Modo:      plano");
    expect(out).toContain("Agentes:   docs/agents");
    expect(out).toContain("0 errores, 0 avisos");
    expect(out).toContain("Listo para trabajar");
  });

  test("--json: un único objeto parseable con ok y sin hallazgos", async () => {
    const { code, out } = await check([p.root, "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual({
      ok: true,
      strict: false,
      project: resolve(p.root),
      mode: "flat",
      agentsDir: "docs/agents",
      operator: null,
      errors: 0,
      warnings: 0,
      findings: [],
    });
  });

  test("--strict sin avisos: también código 0", async () => {
    expect((await check([p.root, "--strict"])).code).toBe(0);
  });

  test("la carpeta de agentes como ruta da el mismo resultado", async () => {
    const report = await checkJson([join(p.root, "docs", "agents")]);
    expect(report).toMatchObject({ code: 0, ok: true, mode: "flat", project: resolve(p.root), agentsDir: "docs/agents" });
  });

  test("--operator en un repo plano: hallazgo workspace, código 1", async () => {
    const report = await checkJson([p.root, "--operator", "ana"]);
    expect(report.code).toBe(1);
    expect(report.findings.map((f) => f.code)).toEqual(["workspace"]);
    expect(report.findings[0].message).toContain("este repo es plano");
  });
});

describe("repo multi-operador válido", () => {
  const p = project(multiTree());

  test("el operador sale del correo inyectado", async () => {
    const report = await checkJson([p.root], { email: "G@Work.com" });
    expect(report).toMatchObject({ code: 0, ok: true, mode: "multi", operator: "gersom", agentsDir: "docs/agents", findings: [] });
  });

  test("el texto muestra el operador", async () => {
    const { code, out } = await check([p.root], { email: "ana@mail.com" });
    expect(code).toBe(0);
    expect(out).toContain("Modo:      multi");
    expect(out).toContain("Operador:  ana");
  });

  test("--operator gana sobre el correo, incluso sin correo", async () => {
    const report = await checkJson([p.root, "--operator", "ana"], { email: null });
    expect(report).toMatchObject({ code: 0, mode: "multi", operator: "ana", findings: [] });
  });

  test("la carpeta de un operador como ruta", async () => {
    const report = await checkJson([join(p.root, "docs", "agents", "ana")], { email: null });
    expect(report).toMatchObject({ code: 0, mode: "multi", operator: "ana", agentsDir: "docs/agents", findings: [] });
  });

  test("sin correo ni --operator: hallazgo workspace, código 1", async () => {
    const report = await checkJson([p.root], { email: null });
    expect(report).toMatchObject({ code: 1, ok: false, mode: "multi", operator: null, errors: 1 });
    expect(report.findings[0]).toMatchObject({ severity: "error", code: "workspace", file: ".", line: null });
    expect(report.findings[0].message).toContain("--operator");
  });

  test("correo no registrado: hallazgo workspace", async () => {
    const report = await checkJson([p.root], { email: "otro@mail.com" });
    expect(report.findings.map((f) => f.code)).toEqual(["workspace"]);
    expect(report.findings[0].message).toContain("otro@mail.com");
  });

  test("operador «solo team-backlog»: hallazgo workspace", async () => {
    const report = await checkJson([p.root, "--operator", "luis"]);
    expect(report.findings.map((f) => f.code)).toEqual(["workspace"]);
    expect(report.findings[0].message).toContain("solo team-backlog");
  });

  test("un team-backlog.md ausente es un aviso: código 0, pero 1 con --strict", async () => {
    const tree = multiTree();
    delete tree["docs/agents/team-backlog.md"];
    const q = project(tree);
    const report = await checkJson([q.root], { email: "ana@mail.com" });
    expect(report).toMatchObject({ code: 0, ok: true, warnings: 1, errors: 0 });
    expect(report.findings[0]).toMatchObject({ severity: "warning", code: "file-missing", file: "docs/agents/team-backlog.md" });
    expect((await check([q.root, "--strict"], { email: "ana@mail.com" })).code).toBe(1);
  });

  test("una línea ilegible en operators.md es un aviso operators-unreadable", async () => {
    const tree = multiTree();
    tree["docs/agents/operators.md"] += "- esto no tiene el formato\n";
    const q = project(tree);
    const report = await checkJson([q.root], { email: "ana@mail.com" });
    expect(report.code).toBe(0);
    expect(report.findings.map((f) => [f.severity, f.code, f.file])).toEqual([["warning", "operators-unreadable", "docs/agents/operators.md"]]);
  });

  test("los hallazgos de la carpeta de otro operador no aparecen", async () => {
    const tree = multiTree();
    tree["docs/agents/ana/backlog.md"] = BACKLOG.replace("**Próximo número de tarea:** 10", "**Próximo número de tarea:** 1");
    const q = project(tree);
    expect((await checkJson([q.root], { email: "gersom@mail.com" })).findings).toEqual([]);
    const ana = await checkJson([q.root], { email: "ana@mail.com" });
    expect(ana.code).toBe(1);
    expect(ana.findings.map((f) => [f.code, f.file])).toEqual([["next-number", "docs/agents/ana/backlog.md"]]);
  });
});

describe("sección de la suite en rules.md", () => {
  const RULES_FILE = "docs/agents/rules.md";
  const withoutBlock = (tree: Tree): Tree => ({ ...tree, [RULES_FILE]: TEMPLATE_RULES });

  test("repo plano sin la sección: aviso suite-rules, código 0 y 1 con --strict", async () => {
    const q = project(withoutBlock(flatTree()));
    const report = await checkJson([q.root]);
    expect(report).toMatchObject({ code: 0, ok: true, errors: 0, warnings: 1 });
    expect(report.findings).toMatchObject([{ severity: "warning", code: "suite-rules", file: RULES_FILE, line: null }]);
    expect(report.findings[0].message).toContain("acsuite init");
    expect((await check([q.root, "--strict"])).code).toBe(1);
  });

  test("multi-operador: se revisa el rules.md compartido", async () => {
    const report = await checkJson([project(withoutBlock(multiTree())).root], { email: "ana@mail.com" });
    expect(report.findings).toMatchObject([{ severity: "warning", code: "suite-rules", file: RULES_FILE }]);
  });

  test("sin rules.md no se reporta (lo dice el check de archivos)", async () => {
    const tree = flatTree();
    delete tree[RULES_FILE];
    expect((await checkJson([project(tree).root])).findings.map((f) => f.code)).not.toContain("suite-rules");
  });
});

describe("repo roto con varios problemas a la vez", () => {
  const p = project(brokenTree());

  test("código 1 con un hallazgo de cada familia", async () => {
    const report = await checkJson([p.root]);
    expect(report.code).toBe(1);
    expect(report.ok).toBe(false);
    expect([...new Set(report.findings.map((f) => f.code))].sort()).toEqual(BROKEN_CODES);
    expect(report.errors).toBe(report.findings.filter((f) => f.severity === "error").length);
    expect(report.warnings).toBe(report.findings.length - report.errors);
    expect(report.errors).toBeGreaterThanOrEqual(3);
  });

  test("severidad, archivo y línea de cada hallazgo", async () => {
    const { findings } = await checkJson([p.root]);
    const backlog = brokenTree()["docs/agents/backlog.md"];
    const find = (code: string) => findings.filter((f) => f.code === code);
    expect(find("next-number")).toMatchObject([{ severity: "error", file: "docs/agents/backlog.md", line: lineOf(backlog, "**Próximo número de tarea:**") }]);
    expect(find("task-duplicate")).toMatchObject([{ severity: "error", file: "docs/agents/backlog.md", line: lineOf(backlog, "### Tarea 8 — Revisar") }]);
    expect(find("task-heading")).toMatchObject([{ severity: "warning", line: lineOf(backlog, "### Tarea 6:") }]);
    expect(find("placeholder")).toMatchObject([{ severity: "warning", line: lineOf(backlog, "[Placeholder]") }]);
    expect(find("anchor-missing")).toMatchObject([{ severity: "error", file: "docs/agents/handoff.md", line: null }]);
    expect(find("root-file").map((f) => [f.severity, f.file])).toEqual([
      ["warning", "AGENTS.md"],
      ["warning", "CLAUDE.md"],
    ]);
  });

  test("el texto agrupa por archivo y termina pidiendo corregir", async () => {
    const { code, out } = await check([p.root]);
    expect(code).toBe(1);
    expect(out).toContain("error  docs/agents/backlog.md:");
    expect(out).toContain("aviso  AGENTS.md  [root-file]");
    expect(out).toMatch(/\d+ errores, \d+ avisos/);
    expect(out).toContain("Corrige los errores");
    expect(out).not.toContain("Listo para trabajar");
  });

  test("--strict no cambia el código (ya es 1) pero queda en el JSON", async () => {
    const report = await checkJson([p.root, "--strict"]);
    expect(report).toMatchObject({ code: 1, strict: true, ok: false });
  });
});

describe("CLAUDE.md opcional y tarea en curso sin plan", () => {
  test("con AGENTS.md y sin CLAUDE.md: sin hallazgos", async () => {
    const tree = flatTree();
    delete tree["CLAUDE.md"];
    const report = await checkJson([project(tree).root]);
    expect(report).toMatchObject({ code: 0, ok: true, errors: 0, warnings: 0 });
    expect(report.findings).toEqual([]);
  });

  test("sin AGENTS.md ni CLAUDE.md: un solo aviso, el de AGENTS.md", async () => {
    const tree = flatTree();
    delete tree["AGENTS.md"];
    delete tree["CLAUDE.md"];
    const report = await checkJson([project(tree).root]);
    expect(report.findings.map((f) => [f.severity, f.code, f.file])).toEqual([["warning", "root-file", "AGENTS.md"]]);
  });

  test("con CLAUDE.md sin marcador: aviso por CLAUDE.md", async () => {
    const tree = flatTree();
    tree["CLAUDE.md"] = "# Notas sueltas\n";
    const report = await checkJson([project(tree).root]);
    expect(report.findings.map((f) => [f.severity, f.code, f.file])).toEqual([["warning", "root-file", "CLAUDE.md"]]);
  });

  test("tarea en curso sin plan: sin hallazgos", async () => {
    const tree = flatTree();
    tree["docs/agents/handoff.md"] = HANDOFF.replace(/### Plan[\s\S]*?### Qué falta/, "### Qué falta");
    const report = await checkJson([project(tree).root]);
    expect(report.findings).toEqual([]);
  });
});

describe("--strict con solo avisos", () => {
  const tree = flatTree();
  delete tree["AGENTS.md"];
  const p = project(tree);

  test("sin --strict: código 0 y la nota de revisar los avisos", async () => {
    const { code, out } = await check([p.root]);
    expect(code).toBe(0);
    expect(out).toContain("0 errores, 1 aviso");
    expect(out).toContain("Listo para trabajar");
    expect(out).toContain("Revisa los avisos");
  });

  test("con --strict: código 1 y la nota de --strict", async () => {
    const { code, out } = await check([p.root, "--strict"]);
    expect(code).toBe(1);
    expect(out).toContain("Con --strict los avisos también hacen fallar");
  });

  test("--json --strict: ok falso con errors en 0", async () => {
    const report = await checkJson([p.root, "--strict"]);
    expect(report).toMatchObject({ code: 1, ok: false, strict: true, errors: 0, warnings: 1 });
  });
});

describe("mal uso: código 2", () => {
  test("flag desconocido", async () => {
    const { code, err } = await check(["algo", "--nada"]);
    expect(code).toBe(2);
    expect(err).toContain("Flag desconocido: --nada.");
    expect(err).toContain("acsuite check --help");
  });

  test("sin ruta y con un flag desconocido: sigue siendo mal uso", async () => {
    expect((await check(["--nada"], { baseDir: project(flatTree()).root })).code).toBe(2);
  });

  test("--operator sin valor", async () => {
    expect((await check(["algo", "--operator"])).code).toBe(2);
  });

  test("dos rutas", async () => {
    expect((await check(["a", "b"])).code).toBe(2);
  });

  test("--help: imprime la ayuda por la salida estándar, código 0", async () => {
    for (const flag of ["--help", "-h"]) {
      const { code, out, err } = await check([flag]);
      expect(code).toBe(0);
      expect(err).toBe("");
      expect(out).toContain("Uso: acsuite check [ruta]");
    }
  });

  test("--help gana aunque falte la ruta o haya otros flags", async () => {
    expect((await check(["--help", "--json"])).code).toBe(0);
  });
});

describe("sin ruta: el proyecto de la carpeta de invocación (baseDir)", () => {
  test("baseDir con un proyecto válido (sin git): se revisa esa carpeta", async () => {
    const p = project(flatTree());
    const report = await checkJson([], { baseDir: p.root });
    expect(report).toMatchObject({ code: 0, ok: true, mode: "flat", project: resolve(p.root), findings: [] });
  });

  test("baseDir con un proyecto multi-operador: se resuelve el operador del correo de git", async () => {
    const p = project(multiTree());
    const report = await checkJson([], { baseDir: p.root, email: "ana@mail.com" });
    expect(report).toMatchObject({ code: 0, mode: "multi", operator: "ana", project: resolve(p.root) });
  });

  test("las demás opciones siguen valiendo sin ruta", async () => {
    const p = project(multiTree());
    const report = await checkJson(["--operator", "gersom"], { baseDir: p.root, email: null });
    expect(report).toMatchObject({ code: 0, operator: "gersom" });
  });

  test("baseDir sin documentación: hallazgo workspace comprensible, código 1 y la carpeta revisada en el informe", async () => {
    const p = project({ "README.md": "# Hola\n" });
    const { code, out } = await check([], { baseDir: p.root });
    expect(code).toBe(1);
    expect(out).toContain("[workspace]");
    expect(out).toContain("No se encontró la documentación de agentes");
    expect(out).toContain(join(p.root, "docs", "agents"));
    expect(out).toContain("Indica la raíz del proyecto o su carpeta de agentes.");
  });

  test("una ruta explícita gana sobre baseDir", async () => {
    const good = project(flatTree());
    const empty = project({ "README.md": "# Hola\n" });
    const report = await checkJson([good.root], { baseDir: empty.root });
    expect(report).toMatchObject({ code: 0, project: resolve(good.root) });
  });
});

describe("ruta que no existe o sin documentación", () => {
  test("ruta inexistente: hallazgo workspace, código 1, sin hablar de --agents", async () => {
    const missing = join(project({}).root, "no-existe");
    const report = await checkJson([missing]);
    expect(report).toMatchObject({ code: 1, ok: false, mode: null, agentsDir: null, operator: null, errors: 1, warnings: 0 });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ severity: "error", code: "workspace", file: ".", line: null });
    expect(report.findings[0].message).toContain("No existe la carpeta indicada");
    expect(report.findings[0].message).not.toContain("--agents");
    expect(report.project).toBe(resolve(missing));
  });

  test("ruta inexistente en texto: cabecera sin ubicar", async () => {
    const { code, out } = await check([join(project({}).root, "no-existe")]);
    expect(code).toBe(1);
    expect(out).toContain("Modo:      (sin ubicar)");
    expect(out).toContain("[workspace]");
  });

  test("carpeta sin docs/agents: el hallazgo workspace y la revisión de AGENTS.md y CLAUDE.md de esa carpeta", async () => {
    const p = project({ "README.md": "# Hola\n" });
    const report = await checkJson([p.root]);
    expect(report).toMatchObject({ code: 1, mode: null, agentsDir: null, project: resolve(p.root), errors: 1, warnings: 1 });
    expect(report.findings.map((f) => [f.severity, f.code, f.file])).toEqual([
      ["error", "workspace", "."],
      ["warning", "root-file", "AGENTS.md"],
    ]);
    expect(report.findings[0].message).toContain("Indica la raíz del proyecto o su carpeta de agentes.");
    expect(report.findings[0].message).not.toContain("--agents");
  });

  test("carpeta sin docs/agents pero con AGENTS.md y CLAUDE.md correctos: solo workspace", async () => {
    const p = project({
      "AGENTS.md": "Lee docs/agents/rules.md\n",
      "CLAUDE.md": "Antes de cualquier tarea, lee AGENTS.md\n",
    });
    const report = await checkJson([p.root]);
    expect(report.findings.map((f) => [f.severity, f.code, f.file])).toEqual([["error", "workspace", "."]]);
  });

  test("carpeta de agentes vacía: AGENTS.md y CLAUDE.md se buscan en la raíz del repo, no dentro de ella", async () => {
    const p = project({ "docs/agents/.gitkeep": "" });
    const report = await checkJson([join(p.root, "docs", "agents")]);
    expect(report.project).toBe(resolve(p.root));
    expect(report.findings.map((f) => [f.code, f.file])).toEqual([
      ["workspace", "."],
      ["root-file", "AGENTS.md"],
    ]);
  });

  test("si la documentación se ubica pero el operador no se resuelve, igual se revisan AGENTS.md y CLAUDE.md", async () => {
    const tree = multiTree();
    delete tree["AGENTS.md"];
    tree["CLAUDE.md"] = "# Notas sueltas\n";
    const report = await checkJson([project(tree).root], { email: null });
    expect(report).toMatchObject({ code: 1, mode: "multi", agentsDir: "docs/agents", operator: null });
    expect(report.findings.map((f) => [f.severity, f.code, f.file])).toEqual([
      ["error", "workspace", "."],
      ["warning", "root-file", "AGENTS.md"],
      ["warning", "root-file", "CLAUDE.md"],
    ]);
  });

  test("carpetas de operador sin operators.md: workspace, no se asume repo plano", async () => {
    const tree = multiTree();
    delete tree["docs/agents/operators.md"];
    const p = project(tree);
    const report = await checkJson([p.root]);
    expect(report.findings.map((f) => f.code)).toEqual(["workspace"]);
    expect(report.findings[0].message).toContain("falta operators.md");
  });

  test("ruta vacía: hallazgo workspace", async () => {
    const report = await checkJson(["  "], { baseDir: project({}).root });
    expect(report.code).toBe(1);
    expect(report.findings[0].code).toBe("workspace");
  });

  test("la ruta puede traer comillas, como al arrastrar una carpeta a la terminal", async () => {
    const p = project(flatTree());
    expect((await check([`"${p.root}"`])).code).toBe(0);
  });
});

describe("rutas relativas", () => {
  const p = project(flatTree());

  test("se resuelven contra baseDir", async () => {
    const report = await checkJson([basename(p.root)], { baseDir: dirname(p.root) });
    expect(report).toMatchObject({ code: 0, mode: "flat", project: resolve(p.root), findings: [] });
  });

  test("`.` es el propio baseDir", async () => {
    const report = await checkJson(["."], { baseDir: p.root });
    expect(report).toMatchObject({ code: 0, project: resolve(p.root) });
  });

  test("una ruta relativa inexistente se informa resuelta contra baseDir", async () => {
    const report = await checkJson(["nada"], { baseDir: p.root });
    expect(report.code).toBe(1);
    expect(report.project).toBe(resolve(p.root, "nada"));
  });

  test("`..` sube desde baseDir", async () => {
    const report = await checkJson([".."], { baseDir: join(p.root, "docs") });
    expect(report).toMatchObject({ code: 0, project: resolve(p.root) });
  });
});

describe("finales de línea CRLF", () => {
  test("el repo plano válido escrito con \\r\\n no da hallazgos", async () => {
    const p = project(toCrlf(flatTree()));
    const report = await checkJson([p.root]);
    expect(report).toMatchObject({ code: 0, ok: true, findings: [] });
  });

  test("el repo multi-operador válido escrito con \\r\\n no da hallazgos", async () => {
    const p = project(toCrlf(multiTree()));
    const report = await checkJson([p.root], { email: "gersom@mail.com" });
    expect(report).toMatchObject({ code: 0, ok: true, operator: "gersom", findings: [] });
  });

  test("el repo roto da los mismos hallazgos (código, archivo y línea) con \\r\\n que con \\n", async () => {
    const lf = await checkJson([project(brokenTree()).root]);
    const crlf = await checkJson([project(toCrlf(brokenTree())).root]);
    const shape = (r: JsonReport) => r.findings.map((f) => [f.severity, f.code, f.file, f.line]);
    expect(shape(crlf)).toEqual(shape(lf));
    expect(crlf.findings.length).toBeGreaterThan(0);
  });

  test("los mensajes no arrastran \\r", async () => {
    const { out } = await check([project(toCrlf(brokenTree())).root]);
    expect(out).not.toContain("\r");
  });
});

describe("solo lee: no modifica el proyecto revisado", () => {
  test("repo plano válido, roto, multi y con la ruta inexistente: el contenido no cambia", async () => {
    const cases: { tree: Tree; email?: string }[] = [
      { tree: flatTree() },
      { tree: brokenTree() },
      { tree: toCrlf(brokenTree()) },
      { tree: multiTree(), email: "ana@mail.com" },
    ];
    for (const { tree, email } of cases) {
      const p = project(tree);
      const before = snapshot(p.root);
      for (const flags of [[], ["--json"], ["--strict"], ["--operator", "gersom"]]) {
        await check([p.root, ...flags], { email });
      }
      expect(snapshot(p.root)).toEqual(before);
    }
  });

  test("las rutas de los archivos siguen siendo las mismas (no se crea ninguno)", async () => {
    const tree = flatTree();
    delete tree["docs/agents/history.md"];
    const p = project(tree);
    const before = Object.keys(snapshot(p.root)).sort();
    const report = await checkJson([p.root]);
    expect(report.findings.map((f) => f.code)).toEqual(["file-missing"]);
    expect(Object.keys(snapshot(p.root)).sort()).toEqual(before);
  });
});

describe("decisions-index (proyecto real)", () => {
  const withDecisions = (extra: Tree): Tree => ({ ...flatTree(), ...extra });
  const index = "# Decisiones\n\n## Índice\n\n- [stack.md](./stack.md) — antes de tocar una librería\n";

  test("carpeta con índice completo: sin avisos de decisiones", async () => {
    const p = project(withDecisions({ "docs/project/decisions/README.md": index, "docs/project/decisions/stack.md": "# Stack\n" }));
    const report = await checkJson([p.root]);
    expect(report.findings.filter((f) => f.code.startsWith("decisions"))).toEqual([]);
  });

  test("un tema fuera del índice y un stack.md suelto del formato anterior: dos avisos", async () => {
    const p = project(
      withDecisions({
        "docs/project/decisions/README.md": index,
        "docs/project/decisions/stack.md": "# Stack\n",
        "docs/project/decisions/auth.md": "# Auth\n",
        "docs/project/stack.md": "# Stack viejo\n",
      }),
    );
    const report = await checkJson([p.root]);
    const found = report.findings.filter((f) => f.code.startsWith("decisions")).map((f) => `${f.code} ${f.file}`);
    expect(found.sort()).toEqual(["decisions-index docs/project/decisions/README.md", "decisions-legacy docs/project/stack.md"]);
    expect(report.code).toBe(0);
  });
});
