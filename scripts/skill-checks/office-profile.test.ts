import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { VERSION_MARKER_RE } from "../_shared/markers.ts";
import { hasSuiteBlock, SUITE_BLOCK_END, SUITE_BLOCK_START } from "../_shared/rules-block.ts";
import { hasSkill, readSkill, SKILL_DIR } from "./skill-dir.ts";

// Perfil no técnico de la skill: `template/office/` (rules, AGENTS, gitignore) y los flujos `docs/office-*.md`.
// Se protege la estructura, el tamaño, la ausencia de jerga de código y, con git real, la lista blanca del .gitignore.

const bytes = (text: string) => Buffer.byteLength(text, "utf8");
const withoutComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, "");
const exists = (rel: string) => existsSync(join(SKILL_DIR, rel));

const OFFICE_FILES = ["template/office/rules.md", "template/office/AGENTS.md", "template/office/gitignore.txt"];
const OFFICE_DOCS = ["docs/office-profile.md", "docs/office-git.md"];

describe.skipIf(!hasSkill)("perfil no técnico: estructura", () => {
  test("existen template/office/{rules.md,AGENTS.md,gitignore.txt} y docs/{office-profile.md,office-git.md}", () => {
    for (const file of [...OFFICE_FILES, ...OFFICE_DOCS]) expect(exists(file), `falta ${file} en la skill`).toBe(true);
  });

  test("office-profile.md enlaza office-git.md", () => {
    expect(readSkill("docs/office-profile.md")).toContain("](./office-git.md)");
  });

  test("office-profile.md nombra los destinos que usa y todos existen en la skill", () => {
    const profile = readSkill("docs/office-profile.md");
    expect(profile).toContain("agents/{handoff,backlog,history}.md");
    for (const name of ["handoff", "backlog", "history"]) expect(exists(`template/agents/${name}.md`), `falta template/agents/${name}.md`).toBe(true);
    for (const file of ["office/rules.md", "office/AGENTS.md", "office/gitignore.txt", "template/CLAUDE.md"]) {
      expect(profile, `office-profile.md no menciona ${file}`).toContain(`\`${file}\``);
      expect(exists(file.startsWith("template/") ? file : `template/${file}`), `falta ${file} en la skill`).toBe(true);
    }
  });
});

describe.skipIf(!hasSkill)("perfil no técnico: tamaños en bytes", () => {
  const limits: [file: string, max: number, measured: (text: string) => string][] = [
    ["docs/office-git.md", 1500, (t) => t],
    ["docs/office-profile.md", 2000, (t) => t],
    ["template/office/AGENTS.md", 1500, withoutComments],
    ["template/office/rules.md", 5500, (t) => t],
  ];
  // SKILL.md ≤ 4500 ya lo mide reading-policy.test.ts.

  for (const [file, max, measured] of limits) {
    test(`${file} no pasa de ${max} bytes`, () => {
      const size = bytes(measured(readSkill(file)));
      expect(size, `${file} ocupa ${size} bytes y el tope es ${max}`).toBeLessThanOrEqual(max);
    });
  }
});

describe.skipIf(!hasSkill)("perfil no técnico: sin jerga ni enlaces del modelo general", () => {
  for (const file of ["template/office/rules.md", "template/office/AGENTS.md"]) {
    test(`${file} no enlaza project/, docs/README.md ni ./README.md`, () => {
      const text = withoutComments(readSkill(file));
      for (const forbidden of ["project/", "docs/README.md", "./README.md"]) {
        expect(text, `${file} menciona «${forbidden}»`).not.toContain(forbidden);
      }
    });

    test(`${file} no menciona modo de ejecución, plan como sección, checks pendientes, evidencia ni multi-operador`, () => {
      const text = withoutComments(readSkill(file));
      for (const forbidden of ["modo de ejecución", "Checks pendientes", "multi-operador", "T-N@operador"]) {
        expect(text, `${file} menciona «${forbidden}»`).not.toContain(forbidden);
      }
      expect(text, `${file} tiene una sección «Plan»`).not.toMatch(/^#{1,6}\s*plan\b/im);
      // La regla 10 de rules.md cita «plan» y «evidencia» solo para decir que aquí no aplican.
      const rest = text.split("\n").filter((line) => !line.startsWith("10. **Los encabezados")).join("\n");
      expect(rest, `${file} menciona «evidencia»`).not.toMatch(/evidencia/i);
      // «sin plan ni modo» (regla 2) y «sin `--plan`» (regla 3: las tareas del perfil se inician sin plan) son las únicas menciones válidas.
      expect(rest.replace(/sin plan ni modo/g, "").replace(/sin `--plan`/g, ""), `${file} menciona «plan»`).not.toMatch(/\bplan\b/i);
    });
  }
});

describe.skipIf(!hasSkill)("perfil no técnico: contenido imprescindible de office/rules.md", () => {
  const rules = () => readSkill("template/office/rules.md");

  test("la línea 1 lleva el marcador de versión", () => {
    expect(rules().split("\n")[0], "template/office/rules.md no lleva el marcador de versión en la línea 1").toMatch(VERSION_MARKER_RE);
  });

  test("lleva el bloque de la suite entre sus marcas", () => {
    const text = rules();
    expect(hasSuiteBlock(text), `template/office/rules.md no tiene el bloque ${SUITE_BLOCK_START} … ${SUITE_BLOCK_END}`).toBe(true);
  });

  test("la regla 2 es «sin plan ni modo», en minúsculas", () => {
    expect(rules()).toContain("sin plan ni modo");
  });

  test("la copia de seguridad usa backups/ y el patrón *_backup_T<N>_*", () => {
    const text = rules();
    expect(text).toContain("`backups/`");
    expect(text).toContain("*_backup_T<N>_*");
  });

  test("lleva la línea «**Idioma de la documentación:**»", () => {
    expect(rules()).toMatch(/^[ \t]*\*\*Idioma de la documentación:\*\*/m);
  });

  test("las frases se traducen a los comandos pause, resume y close, siempre con --apply", () => {
    const text = rules();
    expect(text).toContain("--apply");
    expect(text).toContain("`pause --reason");
    expect(text).toContain("`resume <N>`");
    expect(text).toContain("`close --done");
    expect(text).toContain("`close --discarded");
  });

  test("las etiquetas usan --labels", () => {
    expect(rules()).toContain("`--labels`");
  });

  test("git solo si está instalado", () => {
    const text = rules();
    expect(text).toContain("Git, solo si está instalado");
    expect(text).toContain("`git --version`");
  });
});

describe.skipIf(!hasSkill)("perfil no técnico: office/AGENTS.md", () => {
  const agents = () => readSkill("template/office/AGENTS.md");

  test("lleva las marcas start y end de la skill", () => {
    const text = agents();
    const start = text.indexOf("<!-- agent-context-skill:start -->");
    const end = text.indexOf("<!-- agent-context-skill:end -->");
    expect(start, "template/office/AGENTS.md no tiene la marca start").toBeGreaterThanOrEqual(0);
    expect(end, "template/office/AGENTS.md no tiene la marca end después de start").toBeGreaterThan(start);
  });

  test("lee rules.md antes que handoff.md", () => {
    const text = withoutComments(agents());
    const rules = text.indexOf("docs/agents/rules.md");
    const handoff = text.indexOf("docs/agents/handoff.md");
    expect(rules).toBeGreaterThanOrEqual(0);
    expect(handoff).toBeGreaterThan(rules);
  });

  test("backlog.md no es lectura obligatoria (no está en la lista numerada)", () => {
    const numbered = withoutComments(agents()).split("\n").filter((line) => /^\d+\. /.test(line));
    expect(numbered.length).toBeGreaterThan(0);
    for (const line of numbered) expect(line, "backlog.md aparece entre las lecturas obligatorias").not.toContain("backlog.md");
  });
});

describe.skipIf(!hasSkill)("perfil no técnico: enlaces desde los flujos generales", () => {
  test("questions-flow.md tiene la «Ronda 0» antes de «Rama de trabajo» y enlaza office-profile.md", () => {
    const flow = readSkill("docs/questions-flow.md");
    const round0 = flow.indexOf("\n## Ronda 0");
    const branch = flow.indexOf("\n## Rama de trabajo");
    expect(round0, "questions-flow.md no tiene la sección «Ronda 0»").toBeGreaterThanOrEqual(0);
    expect(branch, "questions-flow.md no tiene la sección «Rama de trabajo»").toBeGreaterThanOrEqual(0);
    expect(round0, "la «Ronda 0» debe ir antes de «Rama de trabajo»").toBeLessThan(branch);
    expect(flow).toContain("](./office-profile.md)");
  });

  test("template-architecture.md menciona office/", () => {
    expect(readSkill("docs/template-architecture.md")).toContain("office/");
  });
});

describe.skipIf(!hasSkill)("perfil no técnico: contenido de gitignore.txt", () => {
  test("son exactamente las 6 líneas esperadas, sin comentarios", () => {
    const lines = readSkill("template/office/gitignore.txt").split("\n").filter((line) => line !== "");
    expect(lines).toEqual(["*", "!*/", "!.gitignore", "!AGENTS.md", "!CLAUDE.md", "!docs/**/*.md"]);
    // Un `<!--` o un `#` dentro de un .gitignore no sería un comentario HTML: sería un patrón (o un comentario de git).
    expect(lines.filter((line) => line.includes("<!--") || line.startsWith("#"))).toEqual([]);
  });
});

// --- gitignore.txt con git real ---------------------------------------------------------------

const gitVersion = spawnSync("git", ["--version"], { encoding: "utf8" });
const hasGit = !gitVersion.error && gitVersion.status === 0;

describe.skipIf(!hasSkill || !hasGit)("perfil no técnico: gitignore.txt con git real", () => {
  let base = "";
  let repo = "";
  let ready = false;

  /** Ejecuta git en `repo`, aislado de la configuración global, del sistema y del archivo de ignorados del usuario. */
  const git = (...args: string[]) =>
    spawnSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: join(base, "empty.gitconfig"),
        GIT_CONFIG_SYSTEM: join(base, "empty.gitconfig"),
        GIT_CONFIG_NOSYSTEM: "1",
        XDG_CONFIG_HOME: join(base, "xdg"),
      },
    });

  const write = (rel: string, content = "x\n") => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), content);
  };

  const NOT_IGNORED = ["docs/agents/handoff.md", "docs/README.md", "AGENTS.md", "CLAUDE.md", ".gitignore"];
  const IGNORED = ["docs/imagen.png", "docs/agents/tabla.xlsx", "ventas.xlsx", "Acme/foto.png", "backups/x_backup_T1_2026-11-18_1530.xlsx"];

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "office-gitignore-"));
    repo = join(base, "repo");
    mkdirSync(repo);
    writeFileSync(join(base, "empty.gitconfig"), "");
    ready = git("init").status === 0;
    if (!ready) return; // git no puede crear el repo aquí: no hay nada que comprobar
    write(".gitignore", readSkill("template/office/gitignore.txt"));
    for (const file of [...NOT_IGNORED.filter((f) => f !== ".gitignore"), ...IGNORED]) write(file);
  });

  afterAll(() => {
    if (base) rmSync(base, { recursive: true, force: true });
  });

  test("no ignora docs/**/*.md, AGENTS.md, CLAUDE.md ni el propio .gitignore (exit 1)", () => {
    if (!ready) return;
    for (const file of NOT_IGNORED) {
      expect(git("check-ignore", "-q", "--", file).status, `${file} debería versionarse y el .gitignore lo ignora`).toBe(1);
    }
  });

  test("ignora imágenes, hojas de cálculo, carpetas de cliente y backups/ (exit 0)", () => {
    if (!ready) return;
    for (const file of IGNORED) {
      expect(git("check-ignore", "-q", "--", file).status, `${file} debería ignorarse y el .gitignore lo deja pasar`).toBe(0);
    }
  });

  test("git add de la documentación y git status --short no listan los ignorados", () => {
    if (!ready) return;
    const add = git("add", "--", "docs", "AGENTS.md", "CLAUDE.md", ".gitignore");
    expect(add.status, `git add falló: ${add.stderr}`).toBe(0);
    const status = git("status", "--short");
    expect(status.status).toBe(0);
    const listed = status.stdout;
    for (const file of NOT_IGNORED) expect(listed, `git status no lista ${file}`).toContain(file);
    for (const ignored of ["imagen.png", "tabla.xlsx", "ventas.xlsx", "foto.png", "backups", "Acme"]) {
      expect(listed, `git status lista «${ignored}», que debería estar ignorado`).not.toContain(ignored);
    }
  });
});
