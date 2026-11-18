import { describe, expect, test } from "bun:test";
import { checkFilesExist, checkOperatorsReadable, checkRootFiles, ROOT_MARKER } from "../../src/checks/files.ts";
import { runChecks } from "../../src/checks/index.ts";
import { ROOT_AGENTS, ROOT_CLAUDE } from "../fixtures.ts";
import { brief, makeCtx, PATHS } from "../helpers.ts";

describe("file-missing", () => {
  test("todos los archivos presentes: sin hallazgos", () => {
    expect(checkFilesExist(makeCtx())).toEqual([]);
    expect(checkFilesExist(makeCtx({ mode: "multi" }))).toEqual([]);
  });

  test("falta handoff.md: error sobre el archivo entero", () => {
    const findings = checkFilesExist(makeCtx({ handoff: null }));
    expect(findings.map(brief)).toEqual([{ severity: "error", code: "file-missing", file: `${PATHS.flat}/handoff.md`, line: null }]);
    expect(findings[0].message).toContain("Falta handoff.md");
    expect(findings[0].message).toContain("el script no lo crea");
  });

  test("falta backlog.md: error", () => {
    const findings = checkFilesExist(makeCtx({ backlog: null }));
    expect(findings.map(brief)).toEqual([{ severity: "error", code: "file-missing", file: `${PATHS.flat}/backlog.md`, line: null }]);
  });

  test("falta history.md: aviso, no error", () => {
    const findings = checkFilesExist(makeCtx({ history: null }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "file-missing", file: `${PATHS.flat}/history.md`, line: null }]);
  });

  test("falta team-backlog.md en multi-operador: aviso", () => {
    const findings = checkFilesExist(makeCtx({ mode: "multi", teamBacklog: null }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "file-missing", file: PATHS.teamBacklog, line: null }]);
  });

  test("en multi-operador usa las rutas de la carpeta del operador", () => {
    const findings = checkFilesExist(makeCtx({ mode: "multi", handoff: null }));
    expect(findings.map((f) => f.file)).toEqual([`${PATHS.multi}/handoff.md`]);
  });

  test("en el repo plano no se espera team-backlog.md", () => {
    expect(checkFilesExist(makeCtx())).toEqual([]);
  });

  test("varios archivos faltantes: un hallazgo por archivo", () => {
    const findings = checkFilesExist(makeCtx({ mode: "multi", handoff: null, backlog: null, history: null, teamBacklog: null }));
    expect(findings.map((f) => [f.severity, f.file.split("/").pop()])).toEqual([
      ["error", "handoff.md"],
      ["error", "backlog.md"],
      ["warning", "history.md"],
      ["warning", "team-backlog.md"],
    ]);
  });

  test("con todos los archivos ausentes el resto de los checks no falla", () => {
    const ctx = makeCtx({ mode: "multi", handoff: null, backlog: null, history: null, teamBacklog: null });
    const codes = new Set(runChecks(ctx).map((f) => f.code));
    expect(codes).toEqual(new Set(["file-missing"]));
  });
});

describe("operators-unreadable", () => {
  test("sin avisos de lectura: sin hallazgos", () => {
    expect(checkOperatorsReadable(makeCtx({ mode: "multi" }))).toEqual([]);
  });

  test("cada línea sin leer es un aviso sobre operators.md", () => {
    const ctx = makeCtx({
      mode: "multi",
      operatorWarnings: ["operators.md: línea sin leer: - ana ana@mail.com", "operators.md: línea sin leer: - ???"],
    });
    const findings = checkOperatorsReadable(ctx);
    expect(findings.map(brief)).toEqual([
      { severity: "warning", code: "operators-unreadable", file: PATHS.operators, line: null },
      { severity: "warning", code: "operators-unreadable", file: PATHS.operators, line: null },
    ]);
    expect(findings[0].message).toContain("- ana ana@mail.com");
    expect(findings[0].message).toContain("- <carpeta>: <correo>");
  });

  test("en el repo plano no hay operators.md: se ignoran los avisos", () => {
    expect(checkOperatorsReadable(makeCtx({ operatorWarnings: ["x"] }))).toEqual([]);
  });
});

describe("root-file", () => {
  test("AGENTS.md y CLAUDE.md con el bloque de la skill: sin hallazgos", () => {
    expect(checkRootFiles(makeCtx())).toEqual([]);
  });

  test("falta AGENTS.md: aviso", () => {
    const findings = checkRootFiles(makeCtx({ agentsMd: null }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "root-file", file: "AGENTS.md", line: null }]);
    expect(findings[0].message).toContain("Falta AGENTS.md");
  });

  test("falta CLAUDE.md pero existe AGENTS.md: sin hallazgos (CLAUDE.md es opcional)", () => {
    expect(checkRootFiles(makeCtx({ claudeMd: null }))).toEqual([]);
  });

  test("faltan los dos: un solo aviso, el de AGENTS.md", () => {
    const findings = checkRootFiles(makeCtx({ agentsMd: null, claudeMd: null }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "root-file", file: "AGENTS.md", line: null }]);
  });

  test("falta AGENTS.md pero existe CLAUDE.md: avisa por AGENTS.md y sigue validando CLAUDE.md", () => {
    expect(checkRootFiles(makeCtx({ agentsMd: null })).map((f) => f.file)).toEqual(["AGENTS.md"]);
    const findings = checkRootFiles(makeCtx({ agentsMd: null, claudeMd: "# Notas sueltas\n" }));
    expect(findings.map((f) => f.file)).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(findings[1].message).toContain(ROOT_MARKER);
  });

  test("CLAUDE.md sin marcador ni mención de AGENTS.md o docs/agents: aviso", () => {
    const findings = checkRootFiles(makeCtx({ claudeMd: "# Notas sueltas\n" }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "root-file", file: "CLAUDE.md", line: null }]);
    expect(findings[0].message).toContain(ROOT_MARKER);
  });

  test("existe pero no tiene el marcador ni menciona docs/agents: aviso", () => {
    const findings = checkRootFiles(makeCtx({ agentsMd: "# Mi proyecto\n\nCosas sueltas.\n" }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "root-file", file: "AGENTS.md", line: null }]);
    expect(findings[0].message).toContain(ROOT_MARKER);
  });

  test("con el marcador de la skill no avisa, aunque no mencione docs/agents", () => {
    const text = `# X\n\n<!-- ${ROOT_MARKER} -->\nHola\n`;
    expect(checkRootFiles(makeCtx({ agentsMd: text }))).toEqual([]);
  });

  test("sin marcador pero con una mención de docs/agents: no avisa", () => {
    expect(checkRootFiles(makeCtx({ agentsMd: "Lee docs/agents/rules.md antes de empezar.\n" }))).toEqual([]);
  });

  test("CLAUDE.md que solo redirige a AGENTS.md: no avisa", () => {
    expect(checkRootFiles(makeCtx({ claudeMd: "Antes de cualquier tarea, lee [`AGENTS.md`](./AGENTS.md).\n" }))).toEqual([]);
  });

  test("el bloque de la plantilla trae el marcador", () => {
    expect(ROOT_AGENTS).toContain(ROOT_MARKER);
    expect(ROOT_CLAUDE).toContain(ROOT_MARKER);
  });

  test("checkRootFiles solo necesita los archivos de la raíz", () => {
    const { rootFiles } = makeCtx({ agentsMd: null });
    expect(checkRootFiles({ rootFiles }).map((f) => f.file)).toEqual(["AGENTS.md"]);
  });
});
