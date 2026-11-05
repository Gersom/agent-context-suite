// `step`: marca pasos del plan de la tarea en curso y pone al día «Qué falta» y «Próximo paso
// concreto». Contra proyectos temporales: nunca se tocan los docs reales.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { APPLY_NOTICE } from "../../src/cli/dispatch.ts";
import { BACKLOG_EN, BACKLOG_RICH, HANDOFF_IDLE, HANDOFF_IDLE_EN, HISTORY_EN, HISTORY_RICH, TEAM_RICH } from "../fixtures.ts";
import { exec, makeProject, type Project, readIn, snapshot } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

const IDLE = { contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };
const PLAN = "Paso 1 — Escribir\nPaso 2 — Probar\nPaso 3 — Cerrar el hilo";
const handoff = (p: Project) => readIn(p, "gersom", "handoff.md");

/** Proyecto con la Tarea 1 empezada con un plan de 3 pasos (más el de cierre). */
async function started(plan = PLAN): Promise<Project> {
  const p = project({ folders: ["gersom"], ...IDLE });
  expect((await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: plan })).code).toBe(0);
  return p;
}

describe("step", () => {
  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, out } = await exec(["step", "1"], p);
    expect(code).toBe(0);
    expect(out).toContain("-- [ ] Paso 1 — Escribir");
    expect(out).toContain("+- [x] Paso 1 — Escribir");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("numera solo los pasos del plan: un checkbox suelto fuera de él no cuenta (como en el board y en state)", async () => {
    const p = await started();
    const file = join(p.agents, "gersom", "handoff.md");
    writeFileSync(file, handoff(p).replace("### Próximo paso concreto", "- [ ] extra suelto\n\n### Próximo paso concreto"));
    const { out } = await exec(["step", "1", "--apply"], p);
    expect(out).toContain("Plan 1/4");
    expect(handoff(p)).toContain("- [ ] extra suelto");
  });

  test("marca el paso por número y pone al día «Qué falta» y «Próximo paso concreto» (que seguían con el texto de start)", async () => {
    const p = await started();
    const { code, out } = await exec(["step", "1", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("Paso 1 marcado como hecho: «Paso 1 — Escribir».");
    expect(out).toContain("Plan 1/4 — siguiente: Paso 2 — Probar (docs/agents/gersom/handoff.md).");
    expect(out).toContain("Actualizado: Qué falta, Próximo paso concreto.");
    const text = handoff(p);
    expect(text).toContain("- [x] Paso 1 — Escribir\n- [ ] Paso 2 — Probar\n");
    expect(text).toContain(
      "### Qué falta\n\nPasos pendientes:\n- Paso 2 — Probar\n- Paso 3 — Cerrar el hilo\n- Documentar cierre de tarea\n\n### Decisiones a medio camino",
    );
    expect(text).toContain("### Próximo paso concreto\n\nPaso 2 — Probar\n\n<!-- agent-context-skill:section=paused -->");
    expect(readIn(p, "gersom", "backlog.md")).not.toContain("Paso");
  });

  test("lo escrito por un paso anterior también se pone al día; al terminar el plan, «plan completo»", async () => {
    const p = await started("Paso 1 — Escribir");
    await exec(["step", "1", "--apply"], p);
    await exec(["step", "Documentar cierre", "--apply"], p);
    const text = handoff(p);
    expect(text).toContain("### Qué falta\n\nTodos los pasos del plan están hechos; falta cerrar la tarea.\n");
    expect(text).toContain("### Próximo paso concreto\n\nPlan completo: falta cerrar la tarea.\n");
    const state = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(state.current.plan).toEqual({ done: 2, total: 2, nextStep: null });
  });

  test("por texto (sin importar mayúsculas ni acentos) y varios pasos a la vez", async () => {
    const p = await started();
    const { out } = await exec(["step", "paso 2", "cerrar el HILO", "--apply"], p);
    expect(out).toContain("Paso 2 marcado como hecho");
    expect(out).toContain("Paso 3 marcado como hecho");
    expect(handoff(p)).toContain("- [ ] Paso 1 — Escribir\n- [x] Paso 2 — Probar\n- [x] Paso 3 — Cerrar el hilo\n");
    // El primer pendiente no cambió: «Próximo paso concreto» sigue igual.
    expect(handoff(p)).toContain("### Próximo paso concreto\n\nPaso 1 — Escribir\n");
  });

  test("--undo desmarca y el siguiente paso vuelve a ser ese", async () => {
    const p = await started();
    await exec(["step", "1", "--apply"], p);
    const { out } = await exec(["step", "1", "--undo", "--apply"], p);
    expect(out).toContain("Paso 1 desmarcado");
    expect(handoff(p)).toContain("- [ ] Paso 1 — Escribir");
    expect(handoff(p)).toContain("### Próximo paso concreto\n\nPaso 1 — Escribir\n");
  });

  test("un paso que ya estaba en ese estado avisa y no cambia nada", async () => {
    const p = await started();
    await exec(["step", "1", "--apply"], p);
    const before = snapshot(p.root);
    const { code, out } = await exec(["step", "1", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("Aviso: El paso 1 ya estaba hecho");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--falta, --decisiones y --proximo ya no existen: flag desconocido y no se escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    for (const flag of ["--falta", "--decisiones", "--proximo"]) {
      expect((await exec(["step", "1", flag, "x", "--apply"], p)).code).toBe(2);
      expect((await exec(["step", flag, "x", "--apply"], p)).code).toBe(2);
    }
    expect(snapshot(p.root)).toEqual(before);
  });

  test("un texto que alguien escribió (con `edit`) no se pisa solo: avisa y cita `edit` con --missing / --next", async () => {
    const p = await started();
    await exec(["edit", "1", "--missing", "Texto propio.", "--next", "Otro texto propio.", "--apply"], p);
    const auto = await exec(["step", "1", "--apply"], p);
    expect(auto.out).toContain("Aviso: «Qué falta» tiene un texto propio y no lo toqué");
    expect(auto.out).toContain("`edit 1 --missing`");
    expect(auto.out).toContain("`edit 1 --next`");
    expect(auto.out).toContain("(Regla 7)");
    expect(auto.out).not.toContain("--falta");
    expect(auto.out).not.toContain("--proximo");
    expect(handoff(p)).toContain("### Qué falta\n\nTexto propio.\n");
    expect(handoff(p)).toContain("### Próximo paso concreto\n\nOtro texto propio.\n");
    await exec(["step", "2", "--apply"], p);
    expect(handoff(p)).toContain("### Qué falta\n\nTexto propio.\n");
    expect(handoff(p)).toContain("### Próximo paso concreto\n\nOtro texto propio.\n");
  });

  test("--json: con texto propio, `updated` queda vacío y `notes` cita `edit`", async () => {
    const p = await started();
    await exec(["edit", "1", "--missing", "Texto propio.", "--next", "Otro texto propio.", "--apply"], p);
    const json = JSON.parse((await exec(["step", "1", "--json", "--apply"], p)).out);
    expect(json.updated).toEqual([]);
    expect(json.notes).toHaveLength(2);
    expect(json.notes[0]).toContain("`edit 1 --missing`");
    expect(json.notes[1]).toContain("`edit 1 --next`");
  });

  describe("avisa de líneas del plan que `close` rechazaría (sin bloquear)", () => {
    /** Proyecto empezado con una nota suelta entre los pasos del plan. */
    async function withLooseLine(): Promise<Project> {
      const p = await started();
      writeFileSync(join(p.agents, "gersom", "handoff.md"), handoff(p).replace("- [ ] Paso 2 — Probar", "Una nota suelta.\n- [ ] Paso 2 — Probar"));
      return p;
    }

    test("el paso se marca igual, con exit 0, y el aviso cita la línea y el formato válido", async () => {
      const p = await withLooseLine();
      const line = handoff(p).split("\n").indexOf("Una nota suelta.") + 1;
      const { code, out } = await exec(["step", "1", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain(`Aviso: El plan tiene una línea que no es un paso ni el modo de ejecución (línea ${line}): «Una nota suelta.»`);
      expect(out).toContain("Formato válido: pasos `- [ ] Paso N — texto` o `- [x] Paso N — texto`, y la línea de modo `**Modo de ejecución acordado:** <texto>`");
      expect(handoff(p)).toContain("- [x] Paso 1 — Escribir");
    });

    test("--json: aparece en `notes`", async () => {
      const p = await withLooseLine();
      const json = JSON.parse((await exec(["step", "1", "--json", "--apply"], p)).out);
      expect(json.applied).toBe(true);
      expect(json.notes).toHaveLength(1);
      expect(json.notes[0]).toContain("«Una nota suelta.»");
    });

    test("un plan válido no avisa", async () => {
      const p = await started();
      expect((await exec(["step", "1", "--apply"], p)).out).not.toContain("Aviso");
    });
  });

  test("conserva los comentarios HTML del principio de la subsección y el resto del archivo", async () => {
    const p = await started();
    const text = handoff(p).replace("### Qué falta\n\n", "### Qué falta\n\n<!-- Lo que falta de ESTA tarea. -->\n\n");
    writeFileSync(join(p.agents, "gersom", "handoff.md"), text);
    await exec(["step", "1", "--apply"], p);
    const after = handoff(p);
    expect(after).toContain("### Qué falta\n\n<!-- Lo que falta de ESTA tarea. -->\n\nPasos pendientes:\n- Paso 2 — Probar");
    expect(after).toContain("<!-- agent-context-skill:section=in-progress -->");
    expect(after).toContain("<!-- agent-context-skill:section=paused -->\n## Tareas pausadas");
  });

  test("--json: dice qué cambió y no imprime el diff", async () => {
    const p = await started();
    const pending = JSON.parse((await exec(["step", "2", "--json"], p)).out);
    expect(pending).toMatchObject({ command: "step", applied: false, pending: true, plan: { done: 1, total: 4, nextStep: "Paso 1 — Escribir" } });
    expect(handoff(p)).toContain("- [ ] Paso 2 — Probar");
    const applied = JSON.parse((await exec(["step", "2", "--json", "--apply"], p)).out);
    expect(applied).toMatchObject({ applied: true, pending: false, files: [{ file: "docs/agents/gersom/handoff.md", changed: true, written: true }] });
    expect(applied.steps[1]).toEqual({ index: 2, text: "Paso 2 — Probar", done: true, changed: true });
  });

  describe("errores: no se escribe nada", () => {
    test("sin argumentos, o --undo sin paso: error de uso", async () => {
      const p = await started();
      const bare = await exec(["step", "--apply"], p);
      expect(bare.code).toBe(2);
      expect(bare.err).toContain("Indica qué paso marcar: `step <N | texto>`");
      expect((await exec(["step", "--undo", "--apply"], p)).code).toBe(2);
    });

    test("paso inexistente o ambiguo", async () => {
      const p = await started();
      const before = snapshot(p.root);
      expect((await exec(["step", "9", "--apply"], p)).err).toContain("El plan tiene 4 pasos: no existe el paso 9");
      expect((await exec(["step", "nada de eso", "--apply"], p)).err).toContain("Ningún paso del plan");
      const ambiguous = await exec(["step", "Paso", "--apply"], p);
      expect(ambiguous.err).toContain("coincide con 3 pasos");
      expect(ambiguous.err).toContain("1. Paso 1 — Escribir");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("sin tarea en curso, o una tarea sin plan", async () => {
      const idle = project({ folders: ["gersom"], ...IDLE });
      expect((await exec(["step", "1", "--apply"], idle)).err).toContain("No hay tarea en curso");
      const noPlan = project({ folders: ["gersom"], ...IDLE });
      await exec(["start", "1", "--apply"], noPlan);
      expect((await exec(["step", "1", "--apply"], noPlan)).err).toContain("no tiene plan");
    });

    test("carpeta de otro operador: se niega", async () => {
      const p = project({ folders: ["gersom", "ana"], ...IDLE, folderContents: { ana: IDLE.contents } });
      const { code, err } = await exec(["step", "1", "--operator", "ana", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("«ana» no es la tuya");
    });
  });

  test("un proyecto en inglés: textos generados en inglés", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
    await exec(["start", "4", "--plan", "-", "--apply"], p, { stdin: "Step 1 — write\nStep 2 — test" });
    await exec(["step", "1", "--apply"], p);
    const text = handoff(p);
    expect(text).toContain("- [x] Step 1 — write");
    expect(text).toContain("### What's left\n\nPending steps:\n- Step 2 — test\n- Document task closure\n");
    expect(text).toContain("### Next concrete step\n\nStep 2 — test\n");
  });

  test("archivos CRLF siguen siendo CRLF", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE), "backlog.md": crlf(BACKLOG_RICH), "history.md": crlf(HISTORY_RICH) } });
    await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: PLAN });
    expect((await exec(["step", "1", "--apply"], p)).code).toBe(0);
    const text = handoff(p);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("- [x] Paso 1 — Escribir\r\n");
    expect(text).toContain("### Qué falta\r\n\r\nPasos pendientes:\r\n- Paso 2 — Probar\r\n");
  });
});
