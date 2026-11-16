// `step`: marca pasos del plan de la tarea en curso y pone al día «Qué falta» y «Próximo paso
// concreto». Contra proyectos temporales: nunca se tocan los docs reales.

import { spawnSync } from "node:child_process";
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
const write = (p: Project, text: string) => writeFileSync(join(p.agents, "gersom", "handoff.md"), text);

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

    test("una subsección con título desconocido (`### Notas`) avisa con su línea, sin bloquear", async () => {
      const p = await started();
      writeFileSync(join(p.agents, "gersom", "handoff.md"), handoff(p).replace("### Qué falta", "### Notas\n\nalgo\n\n### Qué falta"));
      const line = handoff(p).split("\n").indexOf("### Notas") + 1;
      const { code, out } = await exec(["step", "1", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain(`Aviso: «Tarea en progreso»: la subsección «Notas» no es una de las conocidas`);
      expect(out).toContain(`(línea ${line}); \`close\` y \`pause\` la rechazarían.`);
      expect(handoff(p)).toContain("- [x] Paso 1 — Escribir");
    });

    test("una subsección repetida o un checkbox fuera del plan también avisan, sin bloquear", async () => {
      const p = await started();
      writeFileSync(join(p.agents, "gersom", "handoff.md"), handoff(p).replace("### Qué falta", "### Qué falta\n\nuno\n\n### Qué falta"));
      const repeated = await exec(["step", "1", "--apply"], p);
      expect(repeated.code).toBe(0);
      expect(repeated.out).toContain("la subsección «Qué falta» está repetida");

      const q = await started();
      writeFileSync(join(q.agents, "gersom", "handoff.md"), handoff(q).replace("### Qué falta", "### Qué falta\n\n- [ ] suelto"));
      const outside = await exec(["step", "1", "--apply"], q);
      expect(outside.code).toBe(0);
      expect(outside.out).toContain("hay checkboxes fuera de la subsección del plan");
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

  describe("--undo --reason: el paso reabierto queda con su motivo (Regla 7)", () => {
    const LINE_1 = "- [ ] Paso 1 — Escribir";
    /** Proyecto empezado con los pasos indicados ya hechos. */
    async function withDone(...done: string[]): Promise<Project> {
      const p = await started();
      expect((await exec(["step", ...done, "--apply"], p)).code).toBe(0);
      return p;
    }

    test("añade ` (reabierto: <motivo>)` al final de la línea, y «Qué falta» / «Próximo paso» llevan el texto sin el sufijo", async () => {
      const p = await withDone("1");
      const { code, out } = await exec(["step", "1", "--undo", "--reason", "falló la prueba", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Paso 1 desmarcado: «Paso 1 — Escribir» (reabierto: falló la prueba).");
      expect(out).not.toContain("Aviso");
      const text = handoff(p);
      expect(text).toContain(`${LINE_1} (reabierto: falló la prueba)\n- [ ] Paso 2 — Probar\n`);
      expect(text).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 1 — Escribir\n- Paso 2 — Probar\n");
      expect(text).toContain("### Próximo paso concreto\n\nPaso 1 — Escribir\n");
      expect(text).not.toContain("- Paso 1 — Escribir (reabierto");
    });

    test("sin --reason funciona como antes pero avisa que la Regla 7 pide un motivo (también en --json, en `notes`)", async () => {
      const p = await withDone("1", "2");
      const { code, out } = await exec(["step", "1", "--undo", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Paso 1 desmarcado");
      expect(out).toContain("Aviso: La Regla 7 pide un motivo al reabrir: usa --reason.");
      expect(handoff(p)).toContain(`${LINE_1}\n`);
      expect(handoff(p)).not.toContain("reabierto");

      const json = JSON.parse((await exec(["step", "2", "--undo", "--json", "--apply"], p)).out);
      expect(json.notes).toEqual(["La Regla 7 pide un motivo al reabrir: usa --reason."]);
      expect(json.steps[1]).not.toHaveProperty("reopened");
    });

    test("--reason sin --undo, vacío, de varias líneas o con el marcador del sufijo: error de uso y no escribe nada", async () => {
      const p = await withDone("1");
      const before = snapshot(p.root);
      const noUndo = await exec(["step", "2", "--reason", "porque sí", "--apply"], p);
      expect(noUndo.code).toBe(2);
      expect(noUndo.err).toContain("--reason solo va con --undo");
      expect((await exec(["step", "1", "--undo", "--reason", "", "--apply"], p)).code).toBe(2);
      const lines = await exec(["step", "1", "--undo", "--reason", "uno\ndos", "--apply"], p);
      expect(lines.code).toBe(2);
      expect(lines.err).toContain("--reason debe ser una sola línea");
      expect((await exec(["step", "1", "--undo", "--reason", "ver (reabierto: antes)", "--apply"], p)).code).toBe(2);
      expect((await exec(["step", "1", "--undo", "--reason", "see (reopened: before)", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });

    test("un sufijo previo se reemplaza, no se acumula (también uno en inglés o con paréntesis)", async () => {
      const p = await withDone("1", "2", "3");
      write(p, handoff(p).replace("- [x] Paso 1 — Escribir", "- [x] Paso 1 — Escribir (reabierto: viejo)").replace("- [x] Paso 2 — Probar", "- [x] Paso 2 — Probar (reopened: old)").replace("- [x] Paso 3 — Cerrar el hilo", "- [x] Paso 3 — Cerrar el hilo (reabierto: falla (ver #3))"));
      await exec(["step", "1", "2", "3", "--undo", "--reason", "nuevo", "--apply"], p);
      const text = handoff(p);
      expect(text).toContain("- [ ] Paso 1 — Escribir (reabierto: nuevo)\n- [ ] Paso 2 — Probar (reabierto: nuevo)\n- [ ] Paso 3 — Cerrar el hilo (reabierto: nuevo)\n");
      expect(text).not.toContain("viejo");
      expect(text).not.toContain("old");
      expect(text).not.toContain("falla");
    });

    test("un motivo con paréntesis se escribe tal cual y se reconoce al reemplazarlo", async () => {
      const p = await withDone("1");
      await exec(["step", "1", "--undo", "--reason", "falla (ver #3)", "--apply"], p);
      expect(handoff(p)).toContain(`${LINE_1} (reabierto: falla (ver #3))\n`);
      const json = JSON.parse((await exec(["step", "1", "--json"], p)).out);
      expect(json.steps[0]).toMatchObject({ text: "Paso 1 — Escribir", done: true });
      await exec(["step", "1", "--apply"], p);
      expect(handoff(p)).toContain("- [x] Paso 1 — Escribir\n");
    });

    test("un paso que ya estaba pendiente avisa y no cambia (tampoco recibe el motivo); los demás sí", async () => {
      const p = await withDone("1");
      const before = snapshot(p.root);
      const same = await exec(["step", "2", "--undo", "--reason", "x", "--apply"], p);
      expect(same.code).toBe(0);
      expect(same.out).toContain("Aviso: El paso 2 ya estaba pendiente");
      expect(snapshot(p.root)).toEqual(before);

      const { out } = await exec(["step", "1", "2", "--undo", "--reason", "x", "--apply"], p);
      expect(out).toContain("Aviso: El paso 2 ya estaba pendiente");
      expect(handoff(p)).toContain(`${LINE_1} (reabierto: x)\n- [ ] Paso 2 — Probar\n`);
    });

    test("marcar de nuevo el paso quita el sufijo", async () => {
      const p = await withDone("1");
      await exec(["step", "1", "--undo", "--reason", "falló", "--apply"], p);
      const { out } = await exec(["step", "1", "--apply"], p);
      expect(out).toContain("Paso 1 marcado como hecho: «Paso 1 — Escribir».");
      expect(handoff(p)).toContain("- [x] Paso 1 — Escribir\n- [ ] Paso 2 — Probar\n");
      expect(handoff(p)).not.toContain("reabierto");
    });

    test("la búsqueda por texto ignora el sufijo (y no lo encuentra a él)", async () => {
      const p = await withDone("1", "2");
      await exec(["step", "1", "2", "--undo", "--reason", "falló la prueba", "--apply"], p);
      expect((await exec(["step", "falló la prueba"], p)).err).toContain("Ningún paso del plan");
      expect((await exec(["step", "reabierto"], p)).err).toContain("Ningún paso del plan");
      // El texto completo del paso, tal como se ve sin el sufijo, coincide exacto.
      expect((await exec(["step", "Paso 1 — Escribir", "--apply"], p)).code).toBe(0);
      expect(handoff(p)).toContain("- [x] Paso 1 — Escribir\n- [ ] Paso 2 — Probar (reabierto: falló la prueba)\n");
      // Y la lista de coincidencias ambiguas tampoco lo muestra.
      const ambiguous = await exec(["step", "Paso", "--undo"], p);
      expect(ambiguous.err).toContain("  2. Paso 2 — Probar\n");
    });

    test("varios pasos reabiertos: «Qué falta» los lista sin sufijo", async () => {
      const p = await withDone("1", "2");
      await exec(["step", "1", "2", "--undo", "--reason", "falló", "--apply"], p);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 1 — Escribir\n- Paso 2 — Probar\n- Paso 3 — Cerrar el hilo\n- Documentar cierre de tarea\n\n###");
      await exec(["step", "3", "--apply"], p);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 1 — Escribir\n- Paso 2 — Probar\n- Documentar cierre de tarea\n");
      expect(handoff(p)).not.toContain("- Paso 2 — Probar (reabierto");
    });

    test("--json: `reopened` por paso y el aviso en `notes`", async () => {
      const p = await withDone("1", "2");
      const json = JSON.parse((await exec(["step", "1", "--undo", "--reason", "falló", "--json", "--apply"], p)).out);
      expect(json.notes).toEqual([]);
      expect(json.steps[0]).toEqual({ index: 1, text: "Paso 1 — Escribir", done: false, changed: true, reopened: "falló" });
      expect(json.steps[1]).toEqual({ index: 2, text: "Paso 2 — Probar", done: true, changed: false });
      // Un paso que ya traía el sufijo y no se tocó también lo informa.
      const later = JSON.parse((await exec(["step", "3", "--json"], p)).out);
      expect(later.steps[0]).toMatchObject({ text: "Paso 1 — Escribir", reopened: "falló" });
    });

    test("un proyecto en inglés escribe `(reopened: …)` y reconoce ambas etiquetas", async () => {
      const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
      await exec(["start", "4", "--plan", "-", "--apply"], p, { stdin: "Step 1 — write\nStep 2 — test" });
      await exec(["step", "1", "--apply"], p);
      await exec(["step", "1", "--undo", "--reason", "it failed", "--apply"], p);
      expect(handoff(p)).toContain("- [ ] Step 1 — write (reopened: it failed)\n");
      write(p, handoff(p).replace("(reopened: it failed)", "(reabierto: it failed)"));
      await exec(["step", "write", "--apply"], p);
      await exec(["step", "1", "--undo", "--reason", "again", "--apply"], p);
      expect(handoff(p)).toContain("- [ ] Step 1 — write (reopened: again)\n");
      expect(handoff(p)).not.toContain("reabierto");
    });

    test("archivos CRLF siguen siendo CRLF", async () => {
      const crlf = (text: string) => text.replace(/\n/g, "\r\n");
      const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE), "backlog.md": crlf(BACKLOG_RICH), "history.md": crlf(HISTORY_RICH) } });
      await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: PLAN });
      await exec(["step", "1", "--apply"], p);
      expect((await exec(["step", "1", "--undo", "--reason", "falló", "--apply"], p)).code).toBe(0);
      expect(handoff(p).replace(/\r\n/g, "")).not.toContain("\n");
      expect(handoff(p)).toContain("- [ ] Paso 1 — Escribir (reabierto: falló)\r\n- [ ] Paso 2 — Probar\r\n");
      await exec(["step", "1", "--apply"], p);
      expect(handoff(p)).toContain("- [x] Paso 1 — Escribir\r\n- [ ] Paso 2 — Probar\r\n");
      expect(handoff(p).replace(/\r\n/g, "")).not.toContain("\n");
    });
  });

  describe("--evidence y --commit: `· evidencia · commit hash` al final de la línea del paso (Regla 7)", () => {
    const LINE_1 = "- [x] Paso 1 — Escribir";
    /** Vuelve repo git el proyecto temporal, con un commit; devuelve el hash corto de HEAD. */
    function gitRepo(p: Project, commit = true): string {
      const git = (...args: string[]) => spawnSync("git", ["-C", p.root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
      expect(git("init", "-q").status).toBe(0);
      if (!commit) return "";
      expect(git("commit", "-q", "--allow-empty", "-m", "inicial").status).toBe(0);
      return git("rev-parse", "--short", "HEAD").stdout.trim();
    }

    test("solo evidencia, solo commit y ambos: siempre en el orden `texto · evidencia · commit hash`", async () => {
      const p = await started();
      const only = await exec(["step", "1", "--evidence", "bun test 779 pass", "--apply"], p);
      expect(only.code).toBe(0);
      expect(only.out).toContain("Paso 1 marcado como hecho: «Paso 1 — Escribir» (evidencia: bun test 779 pass).");
      expect(handoff(p)).toContain(`${LINE_1} · bun test 779 pass\n- [ ] Paso 2 — Probar\n`);
      await exec(["step", "2", "--commit", "abc1234", "--apply"], p);
      expect(handoff(p)).toContain("- [x] Paso 2 — Probar · commit abc1234\n");
      const both = await exec(["step", "3", "--commit", "ABCDEF1234", "--evidence", "ok", "--apply"], p);
      expect(both.out).toContain("(evidencia: ok, commit abcdef1234)");
      expect(handoff(p)).toContain("- [x] Paso 3 — Cerrar el hilo · ok · commit abcdef1234\n");
    });

    test("«Qué falta» y «Próximo paso concreto» no llevan la evidencia ni el commit, y el paso se sigue encontrando por su texto", async () => {
      const p = await started();
      await exec(["step", "1", "--evidence", "bun test 779 pass", "--commit", "abc1234", "--apply"], p);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 2 — Probar\n");
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nPaso 2 — Probar\n");
      expect(handoff(p)).not.toContain("- Paso 2 — Probar ·");
      const state = JSON.parse((await exec(["status", "--json"], p)).out);
      expect(state.current.plan.nextStep).toBe("Paso 2 — Probar");
      // Buscar por el texto de la evidencia no encuentra nada; por el texto del paso, sí.
      expect((await exec(["step", "bun test"], p)).err).toContain("Ningún paso del plan");
      expect((await exec(["step", "commit abc1234"], p)).err).toContain("Ningún paso del plan");
      expect((await exec(["step", "Paso 1 — Escribir", "--undo", "--reason", "falló", "--apply"], p)).code).toBe(0);
      expect(handoff(p)).toContain("- [ ] Paso 1 — Escribir (reabierto: falló)\n");
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 1 — Escribir\n- Paso 2 — Probar\n");
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nPaso 1 — Escribir\n");
    });

    test("--commit auto usa `git rev-parse --short HEAD` en la raíz del proyecto", async () => {
      const p = await started();
      const head = gitRepo(p);
      const { code, out } = await exec(["step", "1", "--commit", "auto", "--evidence", "ok", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain(`commit ${head}`);
      expect(handoff(p)).toContain(`${LINE_1} · ok · commit ${head}\n`);
    });

    test("--commit auto fuera de un repo git, o sin commits: error de dominio (exit 1) y no escribe nada", async () => {
      const outside = await started();
      const before = snapshot(outside.root);
      const none = await exec(["step", "1", "--commit", "auto", "--apply"], outside);
      expect(none.code).toBe(1);
      expect(none.err).toContain("--commit auto: no se pudo leer el commit actual");
      expect(none.err).toContain("No se escribió nada");
      expect(snapshot(outside.root)).toEqual(before);

      const empty = await started();
      gitRepo(empty, false);
      const beforeEmpty = snapshot(empty.root);
      expect((await exec(["step", "1", "--commit", "auto", "--apply"], empty)).code).toBe(1);
      expect(snapshot(empty.root)).toEqual(beforeEmpty);
    });

    test("repetir sobre un paso hecho no duplica: reemplaza solo los campos pasados y dice «actualizado»", async () => {
      const p = await started();
      await exec(["step", "1", "--evidence", "viejo", "--commit", "abc1234", "--apply"], p);
      const evidence = await exec(["step", "1", "--evidence", "nuevo", "--apply"], p);
      expect(evidence.out).toContain("Paso 1 actualizado: «Paso 1 — Escribir» (evidencia: nuevo, commit abc1234).");
      expect(evidence.out).not.toContain("ya estaba hecho");
      expect(handoff(p)).toContain(`${LINE_1} · nuevo · commit abc1234\n`);
      await exec(["step", "1", "--commit", "def5678", "--apply"], p);
      expect(handoff(p)).toContain(`${LINE_1} · nuevo · commit def5678\n`);
      expect(handoff(p).match(/commit /g)).toHaveLength(1);
      // El mismo valor otra vez, o sin flags: no cambia nada y avisa.
      for (const argv of [["step", "1", "--commit", "def5678", "--apply"], ["step", "1", "--apply"]]) {
        const before = snapshot(p.root);
        const same = await exec(argv, p);
        expect(same.code).toBe(0);
        expect(same.out).toContain("Aviso: El paso 1 ya estaba hecho");
        expect(snapshot(p.root)).toEqual(before);
      }
      // Un paso hecho a mano, sin sufijos, recibe la evidencia al repetir.
      await exec(["step", "2", "--apply"], p);
      expect((await exec(["step", "2", "--evidence", "tarde", "--apply"], p)).out).toContain("Paso 2 actualizado");
      expect(handoff(p)).toContain("- [x] Paso 2 — Probar · tarde\n");
    });

    test("varios pasos a la vez reciben la misma evidencia; los ya hechos se actualizan y los pendientes se marcan", async () => {
      const p = await started();
      await exec(["step", "1", "--apply"], p);
      const { out } = await exec(["step", "1", "2", "--evidence", "ok", "--apply"], p);
      expect(out).toContain("Paso 1 actualizado");
      expect(out).toContain("Paso 2 marcado como hecho");
      expect(handoff(p)).toContain(`${LINE_1} · ok\n- [x] Paso 2 — Probar · ok\n`);
    });

    test("marcar un paso reabierto quita el sufijo de reabierto y las flags añaden la evidencia", async () => {
      const p = await started();
      await exec(["step", "1", "--apply"], p);
      await exec(["step", "1", "--undo", "--reason", "falló", "--apply"], p);
      await exec(["step", "1", "--evidence", "bun test 780 pass", "--commit", "abc1234", "--apply"], p);
      expect(handoff(p)).toContain(`${LINE_1} · bun test 780 pass · commit abc1234\n`);
      expect(handoff(p)).not.toContain("reabierto");
    });

    test("--undo con --evidence o --commit: error de uso (exit 2) y no escribe nada", async () => {
      const p = await started();
      await exec(["step", "1", "--evidence", "ok", "--apply"], p);
      const before = snapshot(p.root);
      for (const flags of [["--evidence", "x"], ["--commit", "abc1234"], ["--commit", "auto"], ["--evidence", "x", "--commit", "abc1234"]]) {
        const { code, err } = await exec(["step", "1", "--undo", ...flags, "--apply"], p);
        expect(code).toBe(2);
        expect(err).toContain("solo va al marcar un paso como hecho, no con --undo");
      }
      expect(snapshot(p.root)).toEqual(before);
    });

    test("--undo quita la evidencia y el commit del paso (con o sin motivo)", async () => {
      const p = await started();
      await exec(["step", "1", "2", "--evidence", "ok", "--commit", "abc1234", "--apply"], p);
      const withReason = await exec(["step", "1", "--undo", "--reason", "falló", "--apply"], p);
      expect(withReason.out).toContain("Paso 1 desmarcado: «Paso 1 — Escribir» (reabierto: falló).");
      expect(handoff(p)).toContain("- [ ] Paso 1 — Escribir (reabierto: falló)\n");
      const bare = await exec(["step", "2", "--undo", "--apply"], p);
      expect(bare.out).toContain("Paso 2 desmarcado: «Paso 2 — Probar».");
      expect(handoff(p)).toContain("- [ ] Paso 2 — Probar\n");
      expect(handoff(p)).not.toContain("commit");
      expect(handoff(p)).not.toContain("· ok");
    });

    test("hash inválido, evidencia con ` · `, vacío o de varias líneas: error de uso (exit 2) y no escribe nada", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const cases: Array<[string[], string]> = [
        [["--commit", "abc123"], "no es un hash"],
        [["--commit", "a".repeat(41)], "no es un hash"],
        [["--commit", "xyz1234"], "no es un hash"],
        [["--commit", ""], "--commit está vacío"],
        [["--commit", "  "], "--commit está vacío"],
        [["--commit", "abc1234\nabc1235"], "--commit debe ser una sola línea"],
        [["--evidence", "a · b"], "--evidence no puede contener « · »"],
        [["--evidence", ""], "--evidence está vacío"],
        [["--evidence", "uno\ndos"], "--evidence debe ser una sola línea"],
        [["--evidence", "ver (reabierto: antes)"], "--evidence no puede contener"],
        [["--evidence", "commit abc1234"], "--evidence no puede ser `commit <hash>`"],
        [["--evidence", "· foo"], "--evidence no puede empezar ni terminar con «·»"],
        [["--evidence", "   ·foo"], "--evidence no puede empezar ni terminar con «·»"],
        [["--evidence", "·"], "--evidence no puede empezar ni terminar con «·»"],
        [["--evidence", "foo ·"], "--evidence no puede empezar ni terminar con «·»"],
      ];
      for (const [flags, message] of cases) {
        const { code, err } = await exec(["step", "1", ...flags, "--apply"], p);
        expect([code, flags]).toEqual([2, flags]);
        expect(err).toContain(message);
      }
      expect(snapshot(p.root)).toEqual(before);
    });

    test("un texto con ` · ` en un paso pendiente queda intacto: se muestra, se busca y se lista entero", async () => {
      const p = await started();
      write(p, handoff(p).replace("- [ ] Paso 2 — Probar", "- [ ] Paso 2 — Probar · con detalle"));
      await exec(["step", "1", "--evidence", "ok", "--apply"], p);
      expect(handoff(p)).toContain("- [ ] Paso 2 — Probar · con detalle\n");
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 2 — Probar · con detalle\n");
      const json = JSON.parse((await exec(["step", "3", "--json"], p)).out);
      expect(json.steps[1]).toEqual({ index: 2, text: "Paso 2 — Probar · con detalle", done: false, changed: false });
      expect((await exec(["step", "Probar · con detalle", "--evidence", "listo", "--apply"], p)).code).toBe(0);
      // Una vez hecho, el último tramo es la evidencia y el resto sigue siendo el texto del paso.
      expect(handoff(p)).toContain("- [x] Paso 2 — Probar · con detalle · listo\n");
      const done = JSON.parse((await exec(["step", "3", "--json"], p)).out);
      expect(done.steps[1]).toMatchObject({ text: "Paso 2 — Probar · con detalle", done: true, evidence: "listo" });
    });

    test("una evidencia con un `·` en medio (sin espacios alrededor) sigue valiendo y repetir no hace crecer la línea", async () => {
      const p = await started();
      expect((await exec(["step", "1", "--evidence", "a·b", "--apply"], p)).code).toBe(0);
      expect((await exec(["step", "1", "--evidence", "a·b", "--apply"], p)).code).toBe(0);
      expect(handoff(p)).toContain(`${LINE_1} · a·b\n`);
    });

    test("marcar sin evidencia ni commit un paso pendiente con ` · ` en su texto avisa de que el último tramo se leerá como evidencia", async () => {
      const p = await started();
      write(p, handoff(p).replace("- [ ] Paso 2 — Probar", "- [ ] Paso 2 — Probar · con detalle"));
      const { code, out } = await exec(["step", "2"], p);
      expect(code).toBe(0);
      expect(out).toContain("Aviso: El paso 2 lleva « · » en su texto");
      expect(out).toContain("«con detalle») se leerá como evidencia");
      expect(out).toContain("--undo");
      const json = JSON.parse((await exec(["step", "2", "--json"], p)).out);
      expect(json.notes.some((note: string) => note.includes("se leerá como evidencia"))).toBe(true);
      // Sin aviso: con evidencia o commit, sin ` · ` en el texto, o al reabrir.
      for (const argv of [["step", "2", "--evidence", "ok"], ["step", "2", "--commit", "abc1234"], ["step", "1"]]) {
        expect((await exec(argv, p)).out).not.toContain("se leerá como evidencia");
      }
      await exec(["step", "2", "--apply"], p);
      expect((await exec(["step", "2", "--undo", "--reason", "x"], p)).out).not.toContain("se leerá como evidencia");
      // Un paso que ya estaba hecho no vuelve a avisar.
      expect((await exec(["step", "2"], p)).out).not.toContain("se leerá como evidencia");
    });

    test("--json: `evidence` y `commit` por paso, solo si los trae; `changed` también al actualizar", async () => {
      const p = await started();
      const marked = JSON.parse((await exec(["step", "1", "--evidence", "ok", "--commit", "abc1234", "--json", "--apply"], p)).out);
      expect(marked.steps[0]).toEqual({ index: 1, text: "Paso 1 — Escribir", done: true, changed: true, evidence: "ok", commit: "abc1234" });
      expect(marked.steps[1]).toEqual({ index: 2, text: "Paso 2 — Probar", done: false, changed: false });
      const updated = JSON.parse((await exec(["step", "1", "--commit", "def5678", "--json", "--apply"], p)).out);
      expect(updated.steps[0]).toEqual({ index: 1, text: "Paso 1 — Escribir", done: true, changed: true, evidence: "ok", commit: "def5678" });
      expect(updated.notes).toEqual([]);
      const reopened = JSON.parse((await exec(["step", "1", "--undo", "--reason", "x", "--json", "--apply"], p)).out);
      expect(reopened.steps[0]).toEqual({ index: 1, text: "Paso 1 — Escribir", done: false, changed: true, reopened: "x" });
      // Sin --apply informa lo mismo y no escribe.
      const pending = JSON.parse((await exec(["step", "2", "--evidence", "ok", "--json"], p)).out);
      expect(pending).toMatchObject({ applied: false, pending: true });
      expect(pending.steps[1]).toMatchObject({ done: true, evidence: "ok" });
      expect(handoff(p)).toContain("- [ ] Paso 2 — Probar\n");
    });

    test("un proyecto en inglés y archivos CRLF: mismo sufijo (`commit` no se traduce) y los saltos de línea se respetan", async () => {
      const crlf = (text: string) => text.replace(/\n/g, "\r\n");
      const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE_EN), "backlog.md": crlf(BACKLOG_EN), "history.md": crlf(HISTORY_EN) } });
      await exec(["start", "4", "--plan", "-", "--apply"], p, { stdin: "Step 1 — write\nStep 2 — test" });
      expect((await exec(["step", "1", "--evidence", "bun test 779 pass", "--commit", "abc1234", "--apply"], p)).code).toBe(0);
      expect(handoff(p)).toContain("- [x] Step 1 — write · bun test 779 pass · commit abc1234\r\n- [ ] Step 2 — test\r\n");
      expect(handoff(p).replace(/\r\n/g, "")).not.toContain("\n");
      expect(handoff(p)).toContain("### What's left\r\n\r\nPending steps:\r\n- Step 2 — test\r\n");
      await exec(["step", "1", "--undo", "--reason", "it failed", "--apply"], p);
      expect(handoff(p)).toContain("- [ ] Step 1 — write (reopened: it failed)\r\n");
      expect(handoff(p).replace(/\r\n/g, "")).not.toContain("\n");
    });

    test("la ayuda de step documenta --evidence y --commit", async () => {
      const p = await started();
      const { out } = await exec(["help", "step"], p);
      expect(out).toContain("--evidence");
      expect(out).toContain("--commit");
    });
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
