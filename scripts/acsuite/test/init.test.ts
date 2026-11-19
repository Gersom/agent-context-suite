import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toEol } from "../../_shared/parse/positions.ts";
import { SUITE_BLOCK, upsertSuiteBlock } from "../../_shared/rules-block.ts";
import { TEMPLATE_RULES } from "../../docs-check/test/fixtures.ts";
import { captureIo, makeProject, type Project, snapshot } from "../../task-manager/test/helpers.ts";
import { init } from "../init.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

/** Proyecto temporal con su rules.md (el de la plantilla de la skill, salvo que se indique otro). */
function project(options: { multi?: boolean; rules?: string | null } = {}): Project {
  const p = options.multi ? makeProject({ folders: ["gersom"] }) : makeProject({ flat: true });
  cleanups.push(p.cleanup);
  if (options.rules !== null) writeFileSync(join(p.agents, "rules.md"), options.rules ?? TEMPLATE_RULES);
  return p;
}

async function exec(argv: string[], baseDir: string) {
  const cap = captureIo();
  const code = await init(argv, { io: cap.io, baseDir });
  return { code, out: cap.text(), err: cap.err.join("\n") };
}

const rulesOf = (p: Project) => readFileSync(join(p.agents, "rules.md"), "utf8");
const INSERTED = upsertSuiteBlock(TEMPLATE_RULES).text;

describe("acsuite init", () => {
  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = project();
    const before = snapshot(p.root);
    const { code, out } = await exec([], p.root);
    expect(code).toBe(0);
    expect(out).toContain("+### Herramientas de la suite");
    expect(out).toContain("No se escribió nada; repite con --apply para aplicar");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--dry-run gana sobre --apply: muestra el diff y no escribe", async () => {
    const p = project();
    const before = snapshot(p.root);
    const { code, out } = await exec(["--apply", "--dry-run"], p.root);
    expect(code).toBe(0);
    expect(out).toContain("+### Herramientas de la suite");
    expect(out).toContain("--dry-run: no se escribió nada.");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--apply inserta el bloque tras el título, antes del primer `##`, y deja el resto igual", async () => {
    const p = project();
    const { code, out } = await exec(["--apply"], p.root);
    expect(code).toBe(0);
    expect(out).toContain("se agregó la sección de la suite");
    const text = rulesOf(p);
    expect(text).toBe(INSERTED);
    expect(text.indexOf(SUITE_BLOCK)).toBeGreaterThan(text.indexOf("\n# "));
    expect(text.indexOf(SUITE_BLOCK)).toBeLessThan(text.indexOf("\n## "));
    expect(text.replace(`${SUITE_BLOCK}\n\n`, "")).toBe(TEMPLATE_RULES);
    // La línea 1 (marcador de versión) y el título quedan idénticos.
    expect(text.split("\n").slice(0, 2)).toEqual(TEMPLATE_RULES.split("\n").slice(0, 2));
  });

  test("un rules.md en otro idioma recibe el bloque igual, antes del primer `##`", async () => {
    const english = "# Rules\n\n## Default rules\n\n1. A rule.\n\n## When closing a task\n\n6. Closing.\n";
    const p = project({ rules: english });
    const { code } = await exec(["--apply"], p.root);
    expect(code).toBe(0);
    expect(rulesOf(p)).toBe(`# Rules\n\n${SUITE_BLOCK}\n\n${english.slice("# Rules\n\n".length)}`);
  });

  test("un rules.md sin ningún `##` recibe el bloque al final", async () => {
    const p = project({ rules: "# Reglas\n\nTexto.\n" });
    const { code } = await exec(["--apply"], p.root);
    expect(code).toBe(0);
    expect(rulesOf(p)).toBe(`# Reglas\n\nTexto.\n\n${SUITE_BLOCK}\n`);
  });

  test("un bloque en otra posición se actualiza ahí mismo", async () => {
    const stale = TEMPLATE_RULES.replace("## Al cerrar", `<!-- agent-context-suite:start -->\nviejo\n<!-- agent-context-suite:end -->\n\n## Al cerrar`);
    const p = project({ rules: stale });
    const { code, out } = await exec(["--apply"], p.root);
    expect(code).toBe(0);
    expect(out).toContain("se actualizó la sección de la suite");
    expect(rulesOf(p)).toBe(TEMPLATE_RULES.replace("## Al cerrar", `${SUITE_BLOCK}\n\n## Al cerrar`));
  });

  test("una segunda ejecución no cambia nada", async () => {
    const p = project();
    await exec(["--apply"], p.root);
    const before = snapshot(p.root);
    const { code, out } = await exec(["--apply"], p.root);
    expect(code).toBe(0);
    expect(out).toBe("Ya está al día: no hay cambios.");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("actualiza un bloque desactualizado", async () => {
    const stale = INSERTED.replace(SUITE_BLOCK, SUITE_BLOCK.replace("usa `acsuite task`", "usa otra cosa"));
    const p = project({ rules: stale });
    const { code, out } = await exec(["--apply"], p.root);
    expect(code).toBe(0);
    expect(out).toContain("se actualizó la sección de la suite");
    expect(rulesOf(p)).toBe(INSERTED);
  });

  test("un bloque de la versión anterior (sin modo ni etiquetas) da «updated» y luego «unchanged»", async () => {
    const old = `<!-- agent-context-suite:start -->\n### Herramientas de la suite\n\nEste proyecto usa [agent-context-suite](https://github.com/Gersom/agent-context-suite). No edites a mano \`handoff.md\`, \`backlog.md\` ni \`history.md\`: usa \`acsuite task\` (el detalle: \`acsuite task --help\`). Para verificar la documentación, \`acsuite check\`; para ver el tablero, \`acsuite board\`.\n<!-- agent-context-suite:end -->`;
    const p = project({ rules: INSERTED.replace(SUITE_BLOCK, old) });
    const first = await exec(["--apply"], p.root);
    expect(first.code).toBe(0);
    expect(first.out).toContain("se actualizó la sección de la suite");
    expect(rulesOf(p)).toBe(INSERTED);
    const second = await exec(["--apply"], p.root);
    expect(second.out).toBe("Ya está al día: no hay cambios.");
    expect(rulesOf(p)).toBe(INSERTED);
  });

  test("conserva el fin de línea CRLF del archivo", async () => {
    const p = project({ rules: toEol(TEMPLATE_RULES, "\r\n") });
    const { code } = await exec(["--apply"], p.root);
    expect(code).toBe(0);
    const text = rulesOf(p);
    expect(text).toBe(toEol(INSERTED, "\r\n"));
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect((await exec(["--apply"], p.root)).out).toBe("Ya está al día: no hay cambios.");
  });

  test("conserva los finales de línea mezclados fuera del bloque", async () => {
    // Antes del primer `##` en CRLF y desde ahí en LF: el bloque se inserta justo en la frontera.
    const cut = TEMPLATE_RULES.indexOf("## ");
    const head = toEol(TEMPLATE_RULES.slice(0, cut), "\r\n");
    const tail = TEMPLATE_RULES.slice(cut);
    const p = project({ rules: `${head}${tail}` });
    await exec(["--apply"], p.root);
    const text = rulesOf(p);
    expect(text.startsWith(head)).toBe(true);
    expect(text.replace(/\r\n/g, "\n")).toContain(SUITE_BLOCK);
    expect(text.endsWith(tail)).toBe(true);
    expect((await exec(["--apply"], p.root)).out).toBe("Ya está al día: no hay cambios.");
  });

  test("modo plano: sin aviso de multi-operador", async () => {
    const p = project();
    const { out } = await exec([], p.root);
    expect(out).not.toContain("rules.md es de todos los operadores");
  });

  test("modo multi-operador: avisa que el cambio es para todo el proyecto y escribe en la raíz de agentes", async () => {
    const p = project({ multi: true });
    const preview = await exec([], p.root);
    expect(preview.code).toBe(0);
    expect(preview.out).toContain("rules.md es de todos los operadores: este cambio se aplicará a todo el proyecto.");
    expect(rulesOf(p)).toBe(TEMPLATE_RULES);
    const applied = await exec(["--apply"], p.root);
    expect(applied.out).toContain("rules.md es de todos los operadores: este cambio se aplicará a todo el proyecto.");
    expect(rulesOf(p)).toBe(INSERTED);
  });

  test("multi-operador: funciona sin operador resuelto (no usa el correo de git)", async () => {
    const p = project({ multi: true });
    // La carpeta de un operador pasada como ruta: igual escribe el rules.md compartido de la raíz de agentes.
    const { code } = await exec(["--agents", join(p.agents, "gersom"), "--apply"], p.root);
    expect(code).toBe(0);
    expect(rulesOf(p)).toBe(INSERTED);
  });

  test("--agents acepta la raíz del proyecto o la carpeta de agentes, y ya al día no avisa del multi", async () => {
    const p = project({ rules: INSERTED, multi: true });
    for (const agents of [p.root, p.agents]) {
      const { code, out } = await exec(["--agents", agents], "/");
      expect(code).toBe(0);
      expect(out).toBe("Ya está al día: no hay cambios.");
    }
  });
});

describe("acsuite init: errores", () => {
  test("fuera de un proyecto con documentación de la skill: error 1 y sugiere --agents", async () => {
    const empty = mkdtempSync(join(tmpdir(), "init-empty-"));
    cleanups.push(() => rmSync(empty, { recursive: true, force: true }));
    const { code, err } = await exec([], empty);
    expect(code).toBe(1);
    expect(err).toContain("Error: No se encontró la documentación de agentes");
    expect(err).toContain("--agents");
  });

  test("sin rules.md: error 1 que sugiere --agents y no crea el archivo", async () => {
    const p = project({ rules: null });
    const before = snapshot(p.root);
    const { code, err } = await exec(["--apply"], p.root);
    expect(code).toBe(1);
    expect(err).toContain("Falta rules.md");
    expect(err).toContain("--agents");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("marcas incompletas: error 1 sin escribir", async () => {
    const p = project({ rules: `<!-- agent-context-suite:start -->\n${TEMPLATE_RULES}` });
    const before = snapshot(p.root);
    const { code, err } = await exec(["--apply"], p.root);
    expect(code).toBe(1);
    expect(err).toContain("Falta la marca de cierre");
    expect(err).toContain("No se escribió nada.");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("flag desconocido o argumento de más: error de uso (2)", async () => {
    const p = project();
    const unknown = await exec(["--forzar"], p.root);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("Flag desconocido: --forzar");
    expect(unknown.err).toContain("acsuite init --help");
    const extra = await exec(["otra"], p.root);
    expect(extra.code).toBe(2);
    expect(extra.err).toContain("Sobran argumentos: otra");
  });

  test("--operator no existe en init: error de uso (2)", async () => {
    expect((await exec(["--operator", "gersom"], project().root)).code).toBe(2);
  });
});

describe("acsuite init --help", () => {
  test("-h y --help muestran la ayuda en español y no tocan nada", async () => {
    const p = project();
    const before = snapshot(p.root);
    for (const flag of ["-h", "--help"]) {
      const { code, out, err } = await exec([flag], p.root);
      expect(code).toBe(0);
      expect(err).toBe("");
      expect(out).toContain("Uso: acsuite init [--agents <ruta>] [--apply] [--dry-run]");
      expect(out).toContain("--apply");
      expect(out).toContain("--dry-run");
    }
    expect(snapshot(p.root)).toEqual(before);
  });

  test("la ayuda no depende de que haya un proyecto", async () => {
    const empty = mkdtempSync(join(tmpdir(), "init-empty-"));
    cleanups.push(() => rmSync(empty, { recursive: true, force: true }));
    expect((await exec(["--help"], empty)).code).toBe(0);
  });
});
