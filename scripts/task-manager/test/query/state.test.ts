import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "../../src/cli/errors.ts";
import { buildState, knownNumbers, nextConcreteStep, planProgress } from "../../src/query/state.ts";
import { BACKLOG_EMPTY, BACKLOG_RICH, HANDOFF_CURRENT, HANDOFF_EMPTY, HANDOFF_IDLE, HISTORY_RICH, TEAM_RICH } from "../fixtures.ts";
import { loadDocs, makeProject, type Project } from "../helpers.ts";

const projects: Project[] = [];
function stateOf(options: Parameters<typeof makeProject>[0]) {
  const p = makeProject({ folders: ["gersom"], ...options });
  projects.push(p);
  return buildState(loadDocs(p, "gersom", true));
}
afterAll(() => projects.forEach((p) => p.cleanup()));

const RICH = { contents: { "handoff.md": HANDOFF_CURRENT, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };
/** Como RICH pero con otro backlog. */
const withBacklog = (backlog: string) => ({ ...RICH, contents: { ...RICH.contents, "backlog.md": backlog } });

describe("tarea en curso", () => {
  test("número, título, línea, avance del plan y primer paso pendiente", () => {
    const { current } = stateOf(RICH);
    expect(current).toMatchObject({ number: 12, title: "Implementar el parser", line: 6 });
    expect(current?.plan).toEqual({ done: 2, total: 4, nextStep: "Paso 3 — Probar" });
  });

  test("el próximo paso concreto es la última subsección de detalle, sin depender de su título", () => {
    const { current } = stateOf(RICH);
    expect(current?.nextConcreteStep).toEqual({
      title: "Cosa que hacer al retomar",
      text: "Paso 3 — correr los tests.\nSegunda línea del paso.",
    });
  });

  test("el plan completo no tiene siguiente paso", () => {
    expect(planProgress([{ text: "a", done: true }])).toEqual({ done: 1, total: 1, nextStep: null });
    expect(planProgress([])).toBeNull();
  });

  test("sin subsecciones de detalle (solo plan o placeholders): sin próximo paso concreto", () => {
    expect(nextConcreteStep({ task: null, steps: [], planSteps: [], subsections: [] })).toBeNull();
    expect(
      nextConcreteStep({
        task: null,
        steps: [],
        planSteps: [],
        subsections: [
          { title: "Plan", body: "- [ ] Paso 1 — a" },
          { title: "Próximo paso", body: "[Placeholder]" },
        ],
      }),
    ).toBeNull();
  });

  test("sin tarea en curso: null", () => {
    expect(stateOf({ contents: { "handoff.md": HANDOFF_EMPTY } }).current).toBeNull();
  });
});

describe("pausadas, libres y bloqueadas", () => {
  test("pausadas con el avance de su plan (null si no trae)", () => {
    const { paused } = stateOf(RICH);
    expect(paused.map((t) => [t.number, t.title, t.plan])).toEqual([
      [8, "Migrar la documentación vieja", { done: 1, total: 2, nextStep: "Paso 2 — Revisar" }],
      [9, "Otra pausada", null],
    ]);
  });

  test("libres en el orden del archivo: las del grupo van donde está el grupo", () => {
    const { free } = stateOf(RICH);
    expect(free.map((t) => [t.number, t.group])).toEqual([
      [1, null],
      [14, "Documentar los planes"],
      [15, "Documentar los planes"],
      [3, null],
      [18, null],
    ]);
    expect(free[1].title).toBe("Redactar `costs.md`");
  });

  test("disparador: primera línea del campo; sin campo, null", () => {
    const { free } = stateOf(RICH);
    expect(free.find((t) => t.number === 18)?.trigger).toBe("antes del release.");
    expect(free.find((t) => t.number === 14)?.trigger).toBe("cuando se cierre el diseño.");
    expect(free.find((t) => t.number === 15)?.trigger).toBeNull();
  });

  test("un grupo cuya tarea no tiene detalle en «Tareas agrupadas» se avisa", () => {
    const backlog = BACKLOG_RICH.replace("#### Tarea 15 — Redactar `limits.md`\n\n- **Descripción:** límites.\n", "");
    const { free, warnings } = stateOf(withBacklog(backlog));
    expect(free.find((t) => t.number === 15)?.title).toContain("sin detalle");
    expect(warnings.some((w) => w.includes("Tarea 15") && w.includes("Tareas agrupadas"))).toBe(true);
  });

  test("bloqueadas: tag, motivo y tareas que menciona, con su estado", () => {
    const { blocked } = stateOf(RICH);
    const byNumber = Object.fromEntries(blocked.map((t) => [t.number, t]));
    expect(byNumber[6]).toMatchObject({ tag: "dependencia", unblockCandidate: true });
    expect(byNumber[6].refs).toEqual([{ number: 11, title: "Escribir el parser", state: "closed" }]);
    expect(byNumber[7].tag).toBe("postergada");
    expect(byNumber[7].refs.map((r) => [r.number, r.state])).toEqual([
      [11, "closed"],
      [3, "free"],
    ]);
  });

  test("candidata a desbloquear: todas sus referencias cerradas, o sin bloqueo vigente; no con alguna abierta ni sin referencias", () => {
    const { blocked } = stateOf(RICH);
    const candidate = Object.fromEntries(blocked.map((t) => [t.number, t.unblockCandidate]));
    expect(candidate).toEqual({ 6: true, 7: false, 16: true, 17: false });
    expect(blocked.find((t) => t.number === 16)?.tag).toBeNull();
    expect(blocked.find((t) => t.number === 17)?.reason).toBe("hasta nuevo aviso del operador.");
  });

  test("una tarea mencionada que no existe en ningún archivo queda como desconocida", () => {
    const { blocked } = stateOf(withBacklog(BACKLOG_RICH.replace("depende de la Tarea 11.", "depende de la Tarea 77.")));
    expect(blocked.find((t) => t.number === 6)?.refs).toEqual([{ number: 77, title: null, state: "unknown" }]);
    expect(blocked.find((t) => t.number === 6)?.unblockCandidate).toBe(false);
  });
});

describe("history, número, team y avisos", () => {
  test("últimas 3 entradas, solo cabecera: fecha, estado, número y título", () => {
    const { recentHistory } = stateOf(RICH);
    expect(recentHistory).toEqual([
      { date: "2026-10-07", status: "done", number: 11, title: "Escribir el parser" },
      { date: "2026-10-06", status: "discarded", number: 10, title: "Usar YAML" },
      { date: "2026-10-05", status: "done", number: 9, title: "Preparar fixtures" },
    ]);
    expect(JSON.stringify(recentHistory)).not.toContain("CUERPO");
  });

  test("sin history.md: vacío, sin error", () => {
    expect(stateOf({ ...RICH, omit: ["history.md"] }).recentHistory).toEqual([]);
  });

  test("«Próximo número de tarea»", () => {
    expect(stateOf(RICH).nextTaskNumber).toEqual({ value: 20, line: 3 });
    expect(stateOf({ ...RICH, omit: ["backlog.md"] }).nextTaskNumber).toBeNull();
  });

  test("team-backlog: libres y bloqueadas con tag y disparador; null si no existe", () => {
    const { team } = stateOf(RICH);
    expect(team?.free).toEqual([
      { title: "Revisar el copy del onboarding", tag: null, trigger: "cuando salga el rediseño." },
      { title: "Migrar el CI", tag: null, trigger: null },
    ]);
    expect(team?.blocked).toEqual([{ title: "Cambiar de proveedor", tag: "postergada", trigger: null }]);
    const p = makeProject({ folders: ["gersom"] });
    projects.push(p);
    expect(buildState(loadDocs(p, "gersom")).team).toBeNull();
  });

  test("sin backlog.md (set mínimo): solo handoff, sin avisos de número", () => {
    const state = stateOf({ contents: { "handoff.md": HANDOFF_IDLE }, omit: ["backlog.md", "history.md"] });
    expect(state.free).toEqual([]);
    expect(state.blocked).toEqual([]);
    expect(state.warnings).toEqual([]);
    expect(state.paused.map((t) => t.number)).toEqual([8]);
  });

  test("backlog sin tareas: todo vacío", () => {
    const state = stateOf({ contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_EMPTY } });
    expect([state.free, state.blocked, state.paused]).toEqual([[], [], []]);
    expect(state.nextTaskNumber?.value).toBe(5);
  });

  test("avisos: número bajo, repetido, ya cerrada y sin bloqueo vigente", () => {
    const backlog = BACKLOG_RICH.replace("**Próximo número de tarea:** 20", "**Próximo número de tarea:** 12").replace(
      "### Tarea 18 — Revisar los links",
      "### Tarea 11 — Duplicada y cerrada\n\n### Tarea 1 — Repetida",
    );
    const { warnings } = stateOf(withBacklog(backlog));
    expect(warnings).toContain("«Próximo número de tarea» (12) no es mayor que la tarea más alta (17).");
    expect(warnings.some((w) => w.includes("Tarea 1 aparece 2 veces"))).toBe(true);
    expect(warnings.some((w) => w.includes("Tarea 11 figura cerrada en history.md"))).toBe(true);
    expect(warnings.some((w) => w.includes("Tarea 16") && w.includes("sin bloqueo vigente"))).toBe(true);
  });

  test("anclas que faltan en el backlog: avisa (plan B)", () => {
    const backlog = BACKLOG_RICH.replace(/<!-- agent-context-skill:section=[a-z-]+ -->\n/g, "");
    expect(stateOf(withBacklog(backlog)).warnings.some((w) => w.includes("no tiene anclas"))).toBe(true);
  });

  test("sin handoff.md: error claro", () => {
    const p = makeProject({ folders: ["gersom"], omit: ["handoff.md"] });
    projects.push(p);
    expect(() => buildState(loadDocs(p, "gersom"))).toThrow(CliError);
    writeFileSync(join(p.agents, "gersom", "handoff.md"), HANDOFF_EMPTY);
    expect(buildState(loadDocs(p, "gersom")).current).toBeNull();
  });

  test("knownNumbers junta handoff, backlog (con grupos) e history, ordenados y sin repetir", () => {
    const p = makeProject({ folders: ["gersom"], ...RICH });
    projects.push(p);
    expect(knownNumbers(loadDocs(p, "gersom"))).toEqual([1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18]);
  });
});
