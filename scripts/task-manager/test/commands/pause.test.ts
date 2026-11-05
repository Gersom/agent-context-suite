// `pause` y `resume`: pasan la tarea en curso a «Tareas pausadas» y de vuelta. Contra proyectos
// temporales: nunca se tocan los docs reales.

import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { APPLY_NOTICE } from "../../src/cli/dispatch.ts";
import {
  BACKLOG_EN,
  BACKLOG_RICH,
  HANDOFF_EMPTY,
  HANDOFF_IDLE,
  HANDOFF_IDLE_EN,
  HISTORY_EN,
  HISTORY_RICH,
  TEAM_RICH,
} from "../fixtures.ts";
import { exec, makeProject, type Project, readIn, snapshot } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

const IDLE = { contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };
const handoff = (p: Project) => readIn(p, "gersom", "handoff.md");
const PAUSE = ["pause", "--reason", "Prioridad más alta.", "--waiting-for", "Que termine la Tarea 2."];

/** Proyecto con la Tarea 1 en curso, con plan y el paso 1 hecho. */
async function started(extra: string[] = []): Promise<Project> {
  const p = project({ folders: ["gersom"], ...IDLE });
  await exec(["start", "1", "--plan", "-", "--mode", "uno a la vez", ...extra, "--apply"], p, { stdin: "Paso 1 — Escribir\nPaso 2 — Probar" });
  await exec(["step", "1", "--apply"], p);
  return p;
}

describe("pause", () => {
  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, out } = await exec(PAUSE, p);
    expect(code).toBe(0);
    expect(out).toContain("+### Tarea 1 — Probar el flujo completo");
    expect(out).toContain("+Sin tarea en curso");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("mueve la tarea a «Tareas pausadas» con el formato de la plantilla y deja «Sin tarea en curso»", async () => {
    const p = await started();
    const { code, out } = await exec([...PAUSE, "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe("Tarea 1 pausada: pasó de «Tarea en progreso» a «Tareas pausadas» de docs/agents/gersom/handoff.md.");
    const text = handoff(p);
    expect(text).toContain("<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nSin tarea en curso\n\n<!-- agent-context-skill:section=paused -->\n## Tareas pausadas");
    expect(text).toContain(
      [
        "### Tarea 8 — Migrar la documentación vieja",
        "",
        "- **Plan:**",
        "  - [x] Paso 1 — Copiar",
        "  - [ ] Paso 2 — Revisar",
        "- **Qué falta:** revisar `setup.md`.",
        "",
        "### Tarea 1 — Probar el flujo completo",
        "",
        "- **Descripción:** CUERPO-1",
        "- **Plan:**",
        "  - [x] Paso 1 — Escribir",
        "  - [ ] Paso 2 — Probar",
        "  - [ ] Documentar cierre de tarea",
        "- **Modo de ejecución acordado:** uno a la vez",
        "- **Qué falta:** Pasos pendientes:",
        "  - Paso 2 — Probar",
        "  - Documentar cierre de tarea",
        "- **Decisiones a medio camino:** Ninguna.",
        "- **Próximo paso concreto:** Paso 2 — Probar",
        "- **Por qué se pausó:** Prioridad más alta.",
        "- **Qué espera para retomarse:** Que termine la Tarea 2.",
        "",
      ].join("\n"),
    );
    const state = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(state.current).toBeNull();
    expect(state.paused.map((t: { number: number }) => t.number)).toEqual([8, 1]);
    expect(state.paused[1].plan).toEqual({ done: 1, total: 3, nextStep: "Paso 2 — Probar" });
    expect(readIn(p, "gersom", "backlog.md")).toBe(BACKLOG_RICH.replace(/### Tarea 1 — [^]*?\n\n(?=### Grupo)/, ""));
  });

  test("--missing, --decisions y --next reemplazan lo que se guarda en el bloque", async () => {
    const p = await started();
    await exec([...PAUSE, "--missing", "Casi todo.", "--decisions", "Usar A.", "--next", "Llamar a Ana.", "--apply"], p);
    const text = handoff(p);
    expect(text).toContain("- **Qué falta:** Casi todo.\n- **Decisiones a medio camino:** Usar A.\n- **Próximo paso concreto:** Llamar a Ana.\n- **Por qué se pausó:**");
  });

  test("con la sección «Tareas pausadas» en «Ninguna.», el bloque la reemplaza", async () => {
    const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "handoff.md": HANDOFF_EMPTY } });
    await exec(["start", "1", "--apply"], p);
    await exec(PAUSE.concat("--apply"), p);
    const text = handoff(p);
    expect(text).toContain("## Tareas pausadas\n\n### Tarea 1 — Probar el flujo completo\n\n- **Descripción:** CUERPO-1\n- **Qué falta:** Toda la tarea.");
    expect(text).not.toContain("## Tareas pausadas\n\nNinguna.");
    expect(text.endsWith("retomarse:** Que termine la Tarea 2.\n")).toBe(true);
  });

  test("conserva los comentarios que hay antes de la tarea en la sección y las anclas", async () => {
    const p = await started();
    const original = handoff(p).replace("## Tarea en progreso\n\n", "## Tarea en progreso\n\n<!-- La única tarea que se trabaja ahora. -->\n\n");
    writeFileSync(join(p.agents, "gersom", "handoff.md"), original);
    await exec([...PAUSE, "--apply"], p);
    expect(handoff(p)).toContain("## Tarea en progreso\n\n<!-- La única tarea que se trabaja ahora. -->\n\nSin tarea en curso\n\n<!-- agent-context-skill:section=paused -->");
  });

  test("lleva `Origen`, `Detalles` y una descripción de varios párrafos", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "--team", "Migrar el CI", "--apply"], p);
    const original = handoff(p).replace("CUERPO-TEAM-2\n", "CUERPO-TEAM-2\n\nSegundo párrafo.\n");
    writeFileSync(join(p.agents, "gersom", "handoff.md"), original);
    await exec([...PAUSE, "--apply"], p);
    expect(handoff(p)).toContain("- **Descripción:** CUERPO-TEAM-2\n\n  Segundo párrafo.\n- **Origen:** team-backlog\n- **Qué falta:** Toda la tarea.");
  });

  describe("errores: no se escribe nada", () => {
    test("faltan --reason o --waiting-for, o se pasan argumentos", async () => {
      const p = await started();
      const before = snapshot(p.root);
      expect((await exec(["pause", "--waiting-for", "x", "--apply"], p)).code).toBe(2);
      expect((await exec(["pause", "--reason", "x", "--apply"], p)).code).toBe(2);
      expect((await exec([...PAUSE, "1", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });

    test("sin tarea en curso", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      const { code, err } = await exec([...PAUSE, "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("No hay tarea en curso");
    });

    test("contenido que no reconozco: subsección con otro título, texto suelto en el plan o checkboxes fuera del plan", async () => {
      const cases: Array<[string, string]> = [
        ["### Próximo paso concreto", "### Cosa que hacer al retomar"],
        ["**Modo de ejecución acordado:** uno a la vez", "Una nota suelta en el plan."],
        ["### Próximo paso concreto\n\n", "### Próximo paso concreto\n\n- [ ] Paso suelto\n"],
      ];
      for (const [from, to] of cases) {
        const p = await started();
        writeFileSync(join(p.agents, "gersom", "handoff.md"), handoff(p).replace(from, to));
        const before = snapshot(p.root);
        const { code, err } = await exec([...PAUSE, "--apply"], p);
        expect(code).toBe(1);
        expect(err).toContain("No puedo pausar la Tarea 1");
        expect(err).toContain("a mano");
        expect(snapshot(p.root)).toEqual(before);
      }
    });

    test("texto suelto en el plan: el error cita la línea y el formato válido", async () => {
      const p = await started();
      writeFileSync(join(p.agents, "gersom", "handoff.md"), handoff(p).replace("**Modo de ejecución acordado:** uno a la vez", "Una nota suelta en el plan."));
      const { code, err } = await exec([...PAUSE, "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("«Una nota suelta en el plan.»");
      expect(err).toContain("formato válido: pasos `- [ ] Paso N — texto` o `- [x] Paso N — texto`, y la línea de modo `**Modo de ejecución acordado:** <texto>`");
    });

    test("carpeta de otro operador: se niega", async () => {
      const p = project({ folders: ["gersom", "ana"], ...IDLE, folderContents: { ana: IDLE.contents } });
      expect((await exec([...PAUSE, "--operator", "ana", "--apply"], p)).err).toContain("«ana» no es la tuya");
    });
  });

  test("--json", async () => {
    const p = await started();
    const pending = JSON.parse((await exec([...PAUSE, "--json"], p)).out);
    expect(pending).toMatchObject({ command: "pause", applied: false, pending: true, task: { number: 1 }, why: "Prioridad más alta." });
    const applied = JSON.parse((await exec([...PAUSE, "--json", "--apply"], p)).out);
    expect(applied).toMatchObject({ applied: true, pending: false });
  });
});

describe("resume", () => {
  test("pause + resume devuelve «Tarea en progreso» tal como estaba", async () => {
    const p = await started();
    const before = handoff(p);
    await exec([...PAUSE, "--apply"], p);
    const { code, out } = await exec(["resume", "1", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe("Tarea 1 retomada: pasó de «Tareas pausadas» a «Tarea en progreso» de docs/agents/gersom/handoff.md.");
    expect(handoff(p)).toBe(before);
  });

  test("la evidencia al final de la línea de un paso (checks y commit) sobrevive a pause, resume y step", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const evidence = "Paso 1 — Escribir · bun test 779 pass · commit abc1234";
    await exec(["start", "1", "--plan", "-", "--mode", "uno a la vez", "--apply"], p, { stdin: `${evidence}\nPaso 2 — Probar` });
    await exec(["step", "escribir", "--apply"], p);
    expect(handoff(p)).toContain(`- [x] ${evidence}`);
    const before = handoff(p);
    await exec([...PAUSE, "--apply"], p);
    expect(handoff(p)).toContain(`  - [x] ${evidence}`);
    await exec(["resume", "1", "--apply"], p);
    expect(handoff(p)).toBe(before);
    await exec(["step", "1", "--undo", "--apply"], p);
    expect(handoff(p)).toContain(`- [ ] ${evidence}`);
  });

  test("ida y vuelta con `Origen`, textos propios y la tarea en medio de varias pausadas", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "--team", "Migrar el CI", "--plan", "-", "--apply"], p, { stdin: "Paso 1 — a\nPaso 2 — b" });
    await exec(["step", "2", "--apply"], p);
    expect((await exec(["edit", "20", "--decisions=- Uno.\n- Dos.", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain("- Uno.");
    const before = handoff(p);
    await exec([...PAUSE, "--apply"], p);
    const mid = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(mid.paused.map((t: { number: number }) => t.number)).toEqual([8, 20]);
    expect((await exec(["resume", "T-20", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toBe(before);
    // La otra pausada sigue donde estaba.
    expect(handoff(p)).toContain("### Tarea 8 — Migrar la documentación vieja");
  });

  test("retoma la única pausada: la sección queda en «Ninguna.»", async () => {
    const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "handoff.md": HANDOFF_EMPTY } });
    await exec(["start", "1", "--apply"], p);
    const before = handoff(p);
    await exec([...PAUSE, "--apply"], p);
    await exec(["resume", "1", "--apply"], p);
    expect(handoff(p)).toBe(before);
  });

  test("retoma una pausada escrita a mano (sin Descripción ni modo): usa los textos por defecto que le faltan", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { out } = await exec(["resume", "8", "--apply"], p);
    expect(out).toContain("Tarea 8 retomada");
    const text = handoff(p);
    expect(text).toContain(
      "Tarea 8 — Migrar la documentación vieja\n\n### Plan\n\n- [x] Paso 1 — Copiar\n- [ ] Paso 2 — Revisar\n\n### Qué falta\n\nrevisar `setup.md`.\n\n### Decisiones a medio camino\n\nNinguna.\n\n### Próximo paso concreto\n\nEmpezar la tarea.",
    );
    expect(text).toContain("## Tareas pausadas\n\nNinguna.");
    const state = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(state.current).toMatchObject({ number: 8, plan: { done: 1, total: 2, nextStep: "Paso 2 — Revisar" } });
  });

  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { out } = await exec(["resume", "8"], p);
    expect(out).toContain("-### Tarea 8 — Migrar la documentación vieja");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("ya hay una tarea en curso: sugiere pausarla", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, err } = await exec(["resume", "8", "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("Ya hay una tarea en curso (Tarea 1 — Probar el flujo completo)");
    expect(err).toContain("`pause`");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("no pausada, inexistente, mal formada o de otro operador", async () => {
    const p = project({ folders: ["gersom", "ana"], ...IDLE });
    const before = snapshot(p.root);
    expect((await exec(["resume", "1", "--apply"], p)).err).toContain("La Tarea 1 no está pausada (está en: free)");
    expect((await exec(["resume", "99", "--apply"], p)).err).toContain("No existe la Tarea 99");
    expect((await exec(["resume", "--apply"], p)).code).toBe(2);
    expect((await exec(["resume", "una tarea", "--apply"], p)).code).toBe(2);
    expect((await exec(["resume", "8@ana", "--apply"], p)).err).toContain("de otro operador");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--json", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const out = JSON.parse((await exec(["resume", "8", "--json", "--apply"], p)).out);
    expect(out).toMatchObject({ command: "resume", applied: true, task: { number: 8, title: "Migrar la documentación vieja" } });
  });

  test("un proyecto en inglés: ida y vuelta", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
    await exec(["start", "4", "--plan", "-", "--apply"], p, { stdin: "Step 1 — write" });
    const before = handoff(p);
    await exec(["pause", "--reason", "Blocked by review.", "--waiting-for", "The review.", "--apply"], p);
    expect(handoff(p)).toContain("- **Why it was paused:** Blocked by review.\n- **What it is waiting for:** The review.");
    expect(handoff(p)).toContain("## Paused tasks\n\n### Task 4 — Translate the glossary");
    expect((await exec(["resume", "4", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toBe(before);
  });

  test("archivos CRLF siguen siendo CRLF", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE), "backlog.md": crlf(BACKLOG_RICH), "history.md": crlf(HISTORY_RICH) } });
    await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: "Paso 1 — a" });
    const before = handoff(p);
    expect((await exec([...PAUSE, "--apply"], p)).code).toBe(0);
    expect(handoff(p).replace(/\r\n/g, "")).not.toContain("\n");
    expect((await exec(["resume", "1", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toBe(before);
  });
});

describe("flags en español", () => {
  test("--motivo, --espera, --falta, --decisiones y --proximo son desconocidos: código 2 y no se escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    for (const old of ["--motivo", "--espera", "--falta", "--decisiones", "--proximo"]) {
      const { code, err } = await exec([...PAUSE, old, "x", "--apply"], p);
      expect(code).toBe(2);
      expect(err).toContain(`Flag desconocido: ${old}.`);
    }
    expect((await exec(["pause", "--motivo", "x", "--espera", "y", "--apply"], p)).code).toBe(2);
    expect(snapshot(p.root)).toEqual(before);
  });
});
