// Comandos de lectura (`status`, `next`, `show`): salida de texto y `--json` contra proyectos
// temporales, con y sin tarea en curso, repo plano y multi-operador. Ninguno escribe nada.

import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/cli/dispatch.ts";
import {
  BACKLOG_EMPTY,
  BACKLOG_RICH,
  HANDOFF_CURRENT,
  HANDOFF_EMPTY,
  HANDOFF_IDLE,
  HISTORY_RICH,
  TEAM_RICH,
} from "../fixtures.ts";
import { captureIo, makeProject, type Project } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

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

/** Corre un comando y comprueba que no escribió nada en el proyecto. */
async function exec(argv: string[], p: Project, email: string | null = "gersom@mail.com") {
  const before = snapshot(p.root);
  const cap = captureIo();
  const code = await run(argv, { io: cap.io, email, baseDir: p.root });
  expect(snapshot(p.root)).toEqual(before);
  return { code, out: cap.text(), err: cap.err.join("\n"), lines: cap.out };
}

const RICH = { contents: { "handoff.md": HANDOFF_CURRENT, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };
const IDLE = { contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };

describe("status", () => {
  test("con tarea en curso: plan, próximo paso concreto y todas las secciones", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code, out } = await exec(["status"], p);
    expect(code).toBe(0);
    expect(out).toContain("Operador: gersom");
    expect(out).toContain("En curso: Tarea 12 — Implementar el parser  (docs/agents/gersom/handoff.md:6)");
    expect(out).toContain("Plan 2/4 — siguiente: Paso 3 — Probar");
    expect(out).toContain("Cosa que hacer al retomar: Paso 3 — correr los tests.\n    Segunda línea del paso.");
    expect(out).toContain("Pausadas (2):\n  - Tarea 8 — Migrar la documentación vieja\n  - Tarea 9 — Otra pausada");
    expect(out).toContain("Libres (5):");
    expect(out).toContain("  - Tarea 14 — Redactar `costs.md`  [grupo: Documentar los planes]");
    expect(out).toContain("Bloqueadas (4):");
    expect(out).toContain("Próximo número de tarea: 20");
    expect(out).toContain("Team-backlog: 2 libres, 1 bloqueadas");
    expect(out).toContain("  - Migrar el CI");
    expect(out).toContain("  - Cambiar de proveedor [postergada] (bloqueada)");
  });

  test("bloqueadas: tag, tareas que menciona (con su estado) y candidatas a desbloquear", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { out } = await exec(["status"], p);
    expect(out).toContain("  - Tarea 6 — Publicar el sitio [dependencia] → Tarea 11 (cerrada) ⇒ candidata a desbloquear (Regla 8)");
    expect(out).toContain("  - Tarea 7 — Rehacer el README [postergada] → Tarea 11 (cerrada), Tarea 3 (libre)\n");
    expect(out).toContain("  - Tarea 16 — Revisar la licencia ⇒ candidata a desbloquear (Regla 8)");
    expect(out).toContain("  - Tarea 17 — Migrar a otro host [postergada] → hasta nuevo aviso del operador.\n");
  });

  test("las últimas 3 cerradas salen solo con su cabecera: nunca el cuerpo de la entrada", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { out } = await exec(["status"], p);
    expect(out).toContain("Últimas cerradas (history, 3):");
    expect(out).toContain("  - 2026-10-07 ✅ Tarea 11 — Escribir el parser");
    expect(out).toContain("  - 2026-10-06 ❌ Tarea 10 — Usar YAML");
    expect(out).toContain("  - 2026-10-05 ✅ Tarea 9 — Preparar fixtures");
    expect(out).not.toContain("CUERPO-HISTORY");
    expect(out).not.toContain("La más vieja");
    expect(out).not.toContain("Agregar la sección");
  });

  test("las entradas de history sin número salen sin él", async () => {
    const history = "# History\n\n## 2026-10-04 — ✅ Agregar la sección «Qué es»\n\n- CUERPO-X\n";
    const p = project({ folders: ["gersom"], contents: { ...RICH.contents, "history.md": history } });
    const { out } = await exec(["status"], p);
    expect(out).toContain("  - 2026-10-04 ✅ Agregar la sección «Qué es»");
  });

  test("sin tarea en curso: lo dice y sigue con las pausadas", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { out } = await exec(["status"], p);
    expect(out).toContain("En curso: Sin tarea en curso");
    expect(out).toContain("Pausadas (1):\n  - Tarea 8 — Migrar la documentación vieja");
  });

  test("las secciones vacías no se imprimen; solo «Sin tarea en curso»", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY }, omit: ["history.md"] });
    const { out, lines } = await exec(["status"], p);
    expect(lines).toEqual(["Operador: gersom", "En curso: Sin tarea en curso", "Próximo número de tarea: 5"]);
    for (const section of ["Pausadas", "Libres", "Bloqueadas", "Últimas cerradas", "Team-backlog"]) expect(out).not.toContain(section);
  });

  test("sin team-backlog.md o con uno vacío: no imprime la sección", async () => {
    const without = await exec(["status"], project({ folders: ["gersom"], ...RICH, teamBacklogText: undefined }));
    expect(without.out).not.toContain("Team-backlog");
    const empty = project({ folders: ["gersom"], ...RICH, teamBacklogText: "# Equipo\n\n<!-- agent-context-skill:section=free -->\n## Libres\n\nNinguna.\n\n<!-- agent-context-skill:section=blocked -->\n## Bloqueadas\n\nNinguna.\n" });
    expect((await exec(["status"], empty)).out).not.toContain("Team-backlog");
  });

  test("repo plano: sin línea de operador ni team-backlog", async () => {
    const p = project({ flat: true, ...RICH });
    const { code, out } = await exec(["status"], p, null);
    expect(code).toBe(0);
    expect(out).not.toContain("Operador:");
    expect(out).toContain("En curso: Tarea 12 — Implementar el parser  (docs/agents/handoff.md:6)");
    expect(out).not.toContain("Team-backlog");
  });

  test("--operator de otro operador: avisa que es solo lectura", async () => {
    const p = project({ folders: ["gersom", "ana"], ...RICH });
    const { out } = await exec(["status", "--operator", "ana"], p);
    expect(out).toContain("Operador: ana");
    expect(out).toContain("Aviso: Es la carpeta de otro operador: solo lectura.");
  });

  test("avisos de los archivos: número de tarea bajo", async () => {
    const backlog = BACKLOG_RICH.replace("**Próximo número de tarea:** 20", "**Próximo número de tarea:** 3");
    const p = project({ folders: ["gersom"], contents: { ...RICH.contents, "backlog.md": backlog } });
    const { out } = await exec(["status"], p);
    expect(out).toContain("Aviso: «Próximo número de tarea» (3) no es mayor que la tarea más alta (18).");
  });

  test("sin handoff.md: error claro, código 1", async () => {
    const p = project({ folders: ["gersom"], omit: ["handoff.md"] });
    const { code, err } = await exec(["status"], p);
    expect(code).toBe(1);
    expect(err).toContain("handoff.md");
  });

  test("--json: esquema estable", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code, out } = await exec(["status", "--json"], p);
    expect(code).toBe(0);
    const json = JSON.parse(out);
    expect(Object.keys(json)).toEqual(["schema", "command", "operator", "mode", "current", "paused", "free", "blocked", "nextTaskNumber", "recentHistory", "team", "warnings"]);
    expect(json).toMatchObject({ schema: 1, command: "status", operator: "gersom", mode: "multi", nextTaskNumber: 20 });
    expect(json.current).toEqual({
      number: 12,
      title: "Implementar el parser",
      line: 6,
      plan: { done: 2, total: 4, nextStep: "Paso 3 — Probar" },
      nextConcreteStep: { title: "Cosa que hacer al retomar", text: "Paso 3 — correr los tests.\nSegunda línea del paso." },
      file: "docs/agents/gersom/handoff.md",
    });
    expect(json.paused[0]).toEqual({ number: 8, title: "Migrar la documentación vieja", plan: { done: 1, total: 2, nextStep: "Paso 2 — Revisar" } });
    expect(json.free[1]).toEqual({ number: 14, title: "Redactar `costs.md`", group: "Documentar los planes", trigger: "cuando se cierre el diseño." });
    expect(json.blocked[0]).toEqual({
      number: 6,
      title: "Publicar el sitio",
      tag: "dependencia",
      reason: "depende de la Tarea 11.",
      refs: [{ number: 11, title: "Escribir el parser", state: "closed" }],
      unblockCandidate: true,
    });
    expect(json.recentHistory).toHaveLength(3);
    expect(json.recentHistory[1]).toEqual({ date: "2026-10-06", status: "discarded", number: 10, title: "Usar YAML" });
    expect(json.team.free[0]).toEqual({ title: "Revisar el copy del onboarding", tag: null, trigger: "cuando salga el rediseño." });
    expect(out).not.toContain("CUERPO");
  });

  test("--json sin tarea en curso, sin backlog ni team: nulos y listas vacías", async () => {
    const p = project({ flat: true, contents: { "handoff.md": HANDOFF_EMPTY }, omit: ["backlog.md", "history.md"] });
    const json = JSON.parse((await exec(["status", "--json"], p, null)).out);
    expect(json).toMatchObject({ operator: null, mode: "flat", current: null, paused: [], free: [], blocked: [], nextTaskNumber: null, recentHistory: [], team: null, warnings: [] });
  });
});

describe("next", () => {
  test("con tarea en curso: su primer paso pendiente y el próximo paso concreto, nada más", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code, lines } = await exec(["next"], p);
    expect(code).toBe(0);
    expect(lines).toEqual([
      "En curso: Tarea 12 — Implementar el parser",
      "  Siguiente paso (2/4 hechos): Paso 3 — Probar",
      "  Cosa que hacer al retomar: Paso 3 — correr los tests.",
      "    Segunda línea del paso.",
    ]);
  });

  test("el siguiente paso de `status` y `next` es el texto base: sin los sufijos de reabierto, evidencia ni commit", async () => {
    const handoff = HANDOFF_CURRENT.replace("- [ ] Paso 3 — Probar", "- [ ] Paso 3 — Probar · bun test 779 pass · commit abc1234 (reabierto: falló)");
    const p = project({ folders: ["gersom"], ...RICH, contents: { ...RICH.contents, "handoff.md": handoff } });
    expect((await exec(["status"], p)).out).toContain("Plan 2/4 — siguiente: Paso 3 — Probar\n");
    expect((await exec(["next"], p)).lines[1]).toBe("  Siguiente paso (2/4 hechos): Paso 3 — Probar");
    expect(JSON.parse((await exec(["next", "--json"], p)).out).current.plan.nextStep).toBe("Paso 3 — Probar");
    expect(JSON.parse((await exec(["status", "--json"], p)).out).current.plan.nextStep).toBe("Paso 3 — Probar");
  });

  test("con el plan completo: dice que falta cerrar", async () => {
    const handoff = HANDOFF_CURRENT.replace("- [ ] Paso 3 — Probar", "- [x] Paso 3 — Probar").replace("- [ ] Cerrar", "- [x] Cerrar");
    const p = project({ folders: ["gersom"], ...RICH, contents: { ...RICH.contents, "handoff.md": handoff } });
    const { lines } = await exec(["next"], p);
    expect(lines[1]).toBe("  Plan completo (4/4): falta cerrar la tarea");
  });

  test("sin tarea en curso: pausadas, libres en el orden del archivo, team y bloqueadas por desbloquear", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { out, lines } = await exec(["next"], p);
    expect(lines[0]).toBe("Sin tarea en curso.");
    expect(out).toContain("Pausadas (retomables):\n  - Tarea 8 — Migrar la documentación vieja (plan 1/2)");
    const free = lines.slice(lines.indexOf("Libres (en el orden del archivo):") + 1, lines.indexOf("Libres del team-backlog (se toman por título):"));
    expect(free.map((l) => l.match(/Tarea (\d+)/)?.[1])).toEqual(["1", "14", "15", "3", "18"]);
    expect(out).toContain("Bloqueadas que podrían desbloquearse (Regla 8):");
    expect(out).toContain("Tarea 6 — Publicar el sitio [dependencia] → Tarea 11 (cerrada) ⇒ candidata");
    expect(out).toContain("Tarea 16 — Revisar la licencia");
    expect(out).not.toContain("Tarea 7 —");
    expect(out).not.toContain("Tarea 17 —");
    expect(lines.at(-1)).toBe("Sugerencia: retomar una pausada o tomar una libre; la elige el operador.");
  });

  test("el disparador se muestra solo si es corto y no se repite (el genérico no ayuda a elegir)", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { out } = await exec(["next"], p);
    expect(out).toContain("Tarea 18 — Revisar los links  (Disparador: antes del release.)");
    expect(out).toContain("Tarea 14 — Redactar `costs.md`  [grupo: Documentar los planes]  (Disparador: cuando se cierre el diseño.)");
    expect(out).toContain("- Revisar el copy del onboarding  (Disparador: cuando salga el rediseño.)");
    // Tareas 1 y 3 tienen el mismo disparador genérico.
    expect(out).not.toContain("cuando el operador pregunte por tareas pendientes");
    expect(out).toContain("  - Migrar el CI\n");
  });

  test("un disparador largo no se imprime", async () => {
    const backlog = BACKLOG_RICH.replace("antes del release.", `${"muy largo ".repeat(15)}fin.`);
    const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "backlog.md": backlog } });
    expect((await exec(["next"], p)).out).not.toContain("muy largo");
  });

  test("sin pausadas: sugiere solo tomar una libre; sin libres de backlog, lista las del team", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY }, teamBacklogText: TEAM_RICH });
    const { out, lines } = await exec(["next"], p);
    expect(out).not.toContain("Pausadas");
    expect(out).not.toContain("Libres (en el orden");
    expect(out).toContain("Libres del team-backlog (se toman por título):");
    expect(lines.at(-1)).toBe("Sugerencia: tomar una libre; la elige el operador.");
  });

  test("sin nada pendiente: lo dice", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY }, omit: ["history.md"] });
    const { lines } = await exec(["next"], p);
    expect(lines).toEqual(["Sin tarea en curso.", "No hay tareas pendientes: agrega una al backlog o al team-backlog."]);
  });

  test("repo plano sin backlog (set mínimo)", async () => {
    const p = project({ flat: true, contents: { "handoff.md": HANDOFF_IDLE }, omit: ["backlog.md", "history.md"] });
    const { code, out } = await exec(["next"], p, null);
    expect(code).toBe(0);
    expect(out).toContain("Pausadas (retomables):");
    expect(out).not.toContain("Libres");
  });

  test("--json con tarea en curso", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const json = JSON.parse((await exec(["next", "--json"], p)).out);
    expect(Object.keys(json)).toEqual(["schema", "command", "mode", "current", "paused", "free", "team", "unblockCandidates", "suggestion"]);
    expect(json).toMatchObject({ schema: 1, command: "next", mode: "current", paused: [], free: [], team: [], unblockCandidates: [], suggestion: null });
    expect(json.current.plan.nextStep).toBe("Paso 3 — Probar");
    expect(json.current.file).toBe("docs/agents/gersom/handoff.md");
  });

  test("--json sin tarea en curso: todo lo que se puede tomar, con disparadores en crudo", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const json = JSON.parse((await exec(["next", "--json"], p)).out);
    expect(json.mode).toBe("pick");
    expect(json.current).toBeNull();
    expect(json.paused.map((t: { number: number }) => t.number)).toEqual([8]);
    expect(json.free.map((t: { number: number }) => t.number)).toEqual([1, 14, 15, 3, 18]);
    expect(json.free[0].trigger).toBe("cuando el operador pregunte por tareas pendientes.");
    expect(json.team.map((t: { title: string }) => t.title)).toEqual(["Revisar el copy del onboarding", "Migrar el CI"]);
    expect(json.unblockCandidates.map((t: { number: number }) => t.number)).toEqual([6, 16]);
    expect(json.suggestion).toContain("retomar una pausada");
  });

  test("--json sin nada pendiente: modo empty", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY } });
    const json = JSON.parse((await exec(["next", "--json"], p)).out);
    expect(json.mode).toBe("empty");
    expect(json.suggestion).toContain("No hay tareas pendientes");
  });
});

describe("show", () => {
  test("en curso: la sección completa, con su origen y líneas", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code, out } = await exec(["show", "12"], p);
    const lines = out.split("\n");
    expect(code).toBe(0);
    expect(lines[0]).toBe("--- Tarea 12 · en curso (handoff) · docs/agents/gersom/handoff.md líneas 6-28 ---");
    expect(lines[1]).toBe("Tarea 12 — Implementar el parser");
    expect(lines.join("\n")).toContain("Segunda línea del paso.");
    expect(lines.join("\n")).not.toContain("Tareas pausadas");
  });

  test("pausada, libre, bloqueada y agrupada", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    expect((await exec(["show", "8"], p)).out).toContain("· pausada (handoff) · docs/agents/gersom/handoff.md líneas");
    const free = await exec(["show", "1"], p);
    expect(free.lines[0]).toMatch(/^--- Tarea 1 · libre \(backlog\) · docs\/agents\/gersom\/backlog\.md líneas \d+-\d+ ---$/);
    expect(free.out).toContain("CUERPO-1");
    expect(free.out).not.toContain("Tarea 3");
    expect((await exec(["show", "6"], p)).lines[0]).toContain("bloqueada (backlog)");
    const grouped = await exec(["show", "14"], p);
    expect(grouped.lines[0]).toContain("agrupada (backlog) · grupo «Documentar los planes»");
    expect(grouped.out).toContain("CUERPO-14");
    expect(grouped.out).not.toContain("limits.md");
  });

  test("history: solo la entrada (con su resultado), nunca el archivo entero", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { lines, out } = await exec(["show", "10"], p);
    expect(lines[0]).toContain("Tarea 10 · history (descartada) ·");
    expect(lines[0]).toContain("docs/agents/gersom/history.md líneas 9-11");
    expect(out).toContain("CUERPO-HISTORY-10");
    expect(out).not.toContain("CUERPO-HISTORY-11");
    expect(out).not.toContain("CUERPO-HISTORY-9");
  });

  test("acepta T-N y no distingue el repo plano", async () => {
    const p = project({ flat: true, ...RICH });
    const { code, lines } = await exec(["show", "T-11"], p, null);
    expect(code).toBe(0);
    expect(lines[0]).toContain("Tarea 11 · history (hecha) · docs/agents/history.md líneas");
  });

  test("número inexistente: error con el rango de números conocidos, código 1", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code, err, out } = await exec(["show", "99"], p);
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("No existe la Tarea 99 en la carpeta de gersom.");
    expect(err).toContain("Números conocidos: 1 a 18 (15 tareas).");
    expect(err).toContain("«Próximo número de tarea»: 20.");
  });

  test("número en más de un lugar: los muestra todos con su origen y avisa", async () => {
    const backlog = BACKLOG_RICH.replace("### Tarea 18 — Revisar los links", "### Tarea 11 — Duplicada\n\n- **Descripción:** CUERPO-DUP\n\n### Tarea 18 — Revisar los links");
    const p = project({ folders: ["gersom"], ...RICH, contents: { ...RICH.contents, "backlog.md": backlog } });
    const { lines, out } = await exec(["show", "11"], p);
    const headers = lines.filter((l) => l.startsWith("--- "));
    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain("libre (backlog)");
    expect(headers[1]).toContain("history (hecha)");
    expect(out).toContain("CUERPO-DUP");
    expect(out).toContain("CUERPO-HISTORY-11");
    expect(out).toContain("Aviso: La Tarea 11 aparece en 2 lugares (libre (backlog), history): una tarea vive en un solo lugar");
  });

  test("T-N@operador: lee la carpeta de otro operador (solo lectura)", async () => {
    const ana = { "history.md": "# History\n\n## 2026-10-01 — ✅ Tarea 77 — De Ana\n\n- CUERPO-ANA\n" };
    const p = project({ folders: ["gersom", "ana"], ...RICH, folderContents: { ana } });
    const { code, out } = await exec(["show", "T-77@ana"], p);
    expect(code).toBe(0);
    expect(out.split("\n")[0]).toBe("--- Tarea 77 · history (hecha) · @ana · docs/agents/ana/history.md líneas 3-5 ---");
    expect(out).toContain("- CUERPO-ANA");
  });

  test("T-N@operador inexistente en esa carpeta y operador desconocido: errores claros", async () => {
    const p = project({ folders: ["gersom", "ana"], ...RICH });
    const missing = await exec(["show", "T-999@ana"], p);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("No existe la Tarea 999 en la carpeta de ana.");
    const unknown = await exec(["show", "T-1@nadie"], p);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain("«nadie» no figura en operators.md");
    const flat = project({ flat: true, ...RICH });
    expect((await exec(["show", "T-1@ana"], flat, null)).err).toContain("repo es plano");
  });

  test("T-N@yo (el propio operador) funciona como T-N", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code, lines } = await exec(["show", "T-12@gersom"], p);
    expect(code).toBe(0);
    expect(lines[0]).toContain("· @gersom ·");
  });

  test("tarea del team-backlog por título, o por una parte única", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const exact = await exec(["show", "Migrar el CI"], p);
    expect(exact.lines[0]).toMatch(/^--- Team-backlog · libre \(team-backlog\) · docs\/agents\/team-backlog\.md líneas \d+-\d+ ---$/);
    expect(exact.out).toContain("CUERPO-TEAM-2");
    expect(exact.out).not.toContain("CUERPO-TEAM-1");
    const part = await exec(["show", "proveedor"], p);
    expect(part.lines[0]).toContain("bloqueada (team-backlog)");
  });

  test("título ambiguo, sin coincidencia o sin team-backlog: error claro", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const ambiguous = await exec(["show", "el"], p);
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.err).toContain("coincide con 2 tareas");
    expect(ambiguous.err).toContain("  - Migrar el CI");
    expect((await exec(["show", "zzz"], p)).err).toContain("Ninguna tarea del team-backlog.md tiene «zzz»");
    const without = project({ folders: ["gersom"], ...RICH, teamBacklogText: undefined });
    expect((await exec(["show", "zzz"], without)).err).toContain("no hay team-backlog.md");
    const flat = project({ flat: true, ...RICH });
    expect((await exec(["show", "zzz"], flat, null)).err).toContain("el repo es plano");
  });

  test("sin argumento o con varios: mal uso, código 2", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    expect((await exec(["show"], p)).code).toBe(2);
    const many = await exec(["show", "1", "2"], p);
    expect(many.code).toBe(2);
    expect(many.err).toContain("Indica la tarea");
  });

  test("respeta --operator y --agents", async () => {
    const p = project({ folders: ["gersom", "ana"], ...RICH });
    const { code, lines } = await exec(["show", "12", "--operator", "ana", "--agents", p.root], p);
    expect(code).toBe(0);
    expect(lines[0]).toContain("docs/agents/ana/handoff.md");
  });

  test("--json: coincidencias con su origen, líneas y texto", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const json = JSON.parse((await exec(["show", "14", "--json"], p)).out);
    expect(Object.keys(json)).toEqual(["schema", "command", "query", "matches", "warnings"]);
    expect(json).toMatchObject({ schema: 1, command: "show", query: "14", warnings: [] });
    expect(json.matches).toHaveLength(1);
    const [match] = json.matches;
    expect(Object.keys(match)).toEqual(["place", "number", "title", "group", "outcome", "operator", "file", "path", "startLine", "endLine", "text"]);
    expect(match).toMatchObject({ place: "grouped", number: 14, title: "Redactar `costs.md`", group: "Documentar los planes", outcome: null, operator: null, file: "docs/agents/gersom/backlog.md" });
    expect(match.path).toBe(join(p.agents, "gersom", "backlog.md"));
    expect(match.text.startsWith("#### Tarea 14")).toBe(true);
    const lines = readFileSync(match.path, "utf8").split("\n");
    expect(lines.slice(match.startLine - 1, match.endLine).join("\n")).toBe(match.text);
  });

  test("--json de una tarea del team-backlog y de una de otro operador", async () => {
    const p = project({ folders: ["gersom", "ana"], ...RICH });
    const team = JSON.parse((await exec(["show", "Migrar el CI", "--json"], p)).out);
    expect(team.matches[0]).toMatchObject({ place: "team-free", number: null, title: "Migrar el CI", operator: null, file: "docs/agents/team-backlog.md" });
    const other = JSON.parse((await exec(["show", "T-12@ana", "--json"], p)).out);
    expect(other.matches[0]).toMatchObject({ place: "in-progress", number: 12, operator: "ana" });
  });

  test("CRLF: los textos salen en LF y las líneas coinciden", async () => {
    const p = project({ folders: ["gersom"], contents: { ...RICH.contents, "history.md": HISTORY_RICH.replace(/\n/g, "\r\n") } });
    const { lines, out } = await exec(["show", "10"], p);
    expect(out).not.toContain("\r");
    expect(lines[0]).toContain("history.md líneas 9-11");
  });
});

describe("registro", () => {
  test("se anuncian en la ayuda", async () => {
    const p = project({ folders: ["gersom"] });
    const { out } = await exec([], p);
    for (const name of ["status", "next", "show"]) expect(out).toContain(name);
    const help = await exec(["show", "--help"], p);
    expect(help.out).toContain("--json");
  });

  test("leer no modifica el archivo aunque esté abierto con otro final de línea", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const path = join(p.agents, "gersom", "handoff.md");
    writeFileSync(path, HANDOFF_CURRENT.replace(/\n/g, "\r\n"));
    expect((await exec(["status"], p)).code).toBe(0);
    expect(readFileSync(path, "utf8")).toContain("\r\n");
  });
});
