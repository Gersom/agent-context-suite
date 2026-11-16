// `plan`: agrega, quita, renombra, mueve o reemplaza los pasos del plan de la tarea en curso y pone
// al día «Qué falta» y «Próximo paso concreto». Contra proyectos temporales: nunca se tocan los docs reales.

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

/** Los pasos del plan tal como están escritos en handoff.md, uno por línea. */
function steps(p: Project): string[] {
  return handoff(p)
    .split("\n")
    .filter((line) => /^- \[[ x]\] /.test(line));
}

/** Proyecto con la Tarea 1 empezada con un plan de 3 pasos (más el de cierre). */
async function started(plan = PLAN, extra: string[] = []): Promise<Project> {
  const p = project({ folders: ["gersom"], ...IDLE });
  expect((await exec(["start", "1", "--plan", "-", ...extra, "--apply"], p, { stdin: plan })).code).toBe(0);
  return p;
}

const FIRST = ["- [ ] Paso 1 — Escribir", "- [ ] Paso 2 — Probar", "- [ ] Paso 3 — Cerrar el hilo", "- [ ] Documentar cierre de tarea"];

describe("plan", () => {
  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, out } = await exec(["plan", "--add", "Paso extra"], p);
    expect(code).toBe(0);
    expect(out).toContain("+- [ ] Paso extra");
    expect(out).toContain("Plan resultante (0/5):");
    expect(out).toContain("  4. [ ] Paso extra");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("la ayuda del comando lista las operaciones", async () => {
    const p = await started();
    const { code, out } = await exec(["plan", "--help"], p);
    expect(code).toBe(0);
    for (const flag of ["--add", "--at", "--remove", "--rename", "--move", "--to", "--set", "--json", "--apply"]) expect(out).toContain(flag);
  });

  describe("--add", () => {
    test("por defecto va justo antes del paso de cierre y pone al día «Qué falta» (el siguiente paso no cambia)", async () => {
      const p = await started();
      const { code, out } = await exec(["plan", "--add", "Paso extra", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Tarea 1: paso agregado en la posición 4: «Paso extra» (docs/agents/gersom/handoff.md).");
      expect(out).toContain("Plan resultante (0/5):");
      expect(out).toContain("  5. [ ] Documentar cierre de tarea");
      expect(out).toContain("Actualizado: Qué falta.");
      expect(steps(p)).toEqual([...FIRST.slice(0, 3), "- [ ] Paso extra", FIRST[3]]);
      const text = handoff(p);
      expect(text).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 1 — Escribir\n- Paso 2 — Probar\n- Paso 3 — Cerrar el hilo\n- Paso extra\n- Documentar cierre de tarea\n\n### Decisiones a medio camino");
      expect(text).toContain("### Próximo paso concreto\n\nPaso 1 — Escribir\n");
    });

    test("--at 1 lo pone primero y entonces es el próximo paso", async () => {
      const p = await started();
      const { out } = await exec(["plan", "--add", "Preparar", "--at", "1", "--apply"], p);
      expect(out).toContain("Actualizado: Qué falta, Próximo paso concreto.");
      expect(steps(p)).toEqual(["- [ ] Preparar", ...FIRST]);
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nPreparar\n");
    });

    test("--at 2 lo pone en medio", async () => {
      const p = await started();
      await exec(["plan", "--add", "Medio", "--at", "2", "--apply"], p);
      expect(steps(p)).toEqual([FIRST[0], "- [ ] Medio", ...FIRST.slice(1)]);
    });

    test("--at justo en el lugar del cierre, o después de él, lo deja antes del cierre", async () => {
      const p = await started();
      await exec(["plan", "--add", "Uno", "--at", "4", "--apply"], p);
      const far = await exec(["plan", "--add", "Dos", "--at", "99", "--apply"], p);
      expect(far.out).toContain("Aviso: --at 99 cae después del paso de cierre");
      expect(steps(p)).toEqual([...FIRST.slice(0, 3), "- [ ] Uno", "- [ ] Dos", FIRST[3]]);
    });

    test("--add acepta el prefijo de lista o checkbox, y rechaza varias líneas", async () => {
      const p = await started();
      await exec(["plan", "--add=- [ ] Con prefijo", "--apply"], p);
      expect(steps(p)).toContain("- [ ] Con prefijo");
      const many = await exec(["plan", "--add", "uno\ndos", "--apply"], p);
      expect(many.code).toBe(2);
      expect(many.err).toContain("es un solo paso");
    });

    test("un plan sin paso de cierre: va al final", async () => {
      const p = await started();
      write(p, handoff(p).replace("- [ ] Documentar cierre de tarea\n", "").replace("- Documentar cierre de tarea\n", ""));
      await exec(["plan", "--add", "Final", "--apply"], p);
      expect(steps(p)).toEqual([...FIRST.slice(0, 3), "- [ ] Final"]);
      expect(handoff(p)).toContain("- [ ] Final\n\n### Qué falta");
    });

    test("un texto que es el del paso de cierre: error si el plan ya lo tiene, y no escribe", async () => {
      const p = await started();
      const before = snapshot(p.root);
      for (const text of ["Documentar cierre de tarea", "documentar cierre de la fase 2"]) {
        const { code, err } = await exec(["plan", "--add", text, "--apply"], p);
        expect(code).toBe(1);
        expect(err).toContain("ese texto es el del paso de cierre, que ya existe");
      }
      expect(snapshot(p.root)).toEqual(before);
    });

    test("un plan sin paso de cierre acepta ese texto como un paso más", async () => {
      const p = await started();
      write(p, handoff(p).replace("- [ ] Documentar cierre de tarea\n", "").replace("- Documentar cierre de tarea\n", ""));
      expect((await exec(["plan", "--add", "Documentar cierre de tarea", "--apply"], p)).code).toBe(0);
      expect(steps(p)).toEqual([...FIRST.slice(0, 3), FIRST[3]]);
    });

    test("con el paso de cierre ya hecho: lo agrega pendiente antes de él y avisa", async () => {
      const p = await started();
      await exec(["step", "Documentar cierre", "--apply"], p);
      const { code, out } = await exec(["plan", "--add", "Paso extra", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Aviso: el paso de cierre ya estaba hecho; se agregó un paso pendiente antes de él");
      expect(steps(p)).toEqual([...FIRST.slice(0, 3), "- [ ] Paso extra", "- [x] Documentar cierre de tarea"]);
      const json = JSON.parse((await exec(["plan", "--add", "Otro", "--json"], p)).out);
      expect(json.notes.some((note: string) => note.includes("el paso de cierre ya estaba hecho"))).toBe(true);
    });

    test("--at inválido: error de uso", async () => {
      const p = await started();
      const before = snapshot(p.root);
      for (const at of ["0", "-1", "abc", "1.5"]) expect((await exec(["plan", "--add", "x", `--at=${at}`, "--apply"], p)).code).toBe(2);
      expect((await exec(["plan", "--add", "", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });
  });

  describe("--remove", () => {
    test("por número: sale de la lista y «Qué falta» se pone al día", async () => {
      const p = await started();
      const { code, out } = await exec(["plan", "--remove", "2", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("paso 2 quitado: «Paso 2 — Probar»");
      expect(out).toContain("Plan resultante (0/3):");
      expect(steps(p)).toEqual([FIRST[0], FIRST[2], FIRST[3]]);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 1 — Escribir\n- Paso 3 — Cerrar el hilo\n- Documentar cierre de tarea\n");
    });

    test("por texto, y al quitar el primero pendiente el próximo paso pasa al siguiente", async () => {
      const p = await started();
      await exec(["plan", "--remove", "paso 1", "--apply"], p);
      expect(steps(p)).toEqual(FIRST.slice(1));
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nPaso 2 — Probar\n");
    });

    test("un paso ya hecho también se quita; nada que poner al día si los pendientes no cambian", async () => {
      const p = await started();
      await exec(["step", "1", "--apply"], p);
      const { out } = await exec(["plan", "--remove", "1", "--apply"], p);
      expect(out).toContain("(ya estaba hecho)");
      expect(out).not.toContain("Actualizado:");
      expect(steps(p)).toEqual(FIRST.slice(1));
    });

    test("el paso de cierre no se quita, ni por número ni por texto", async () => {
      const p = await started();
      const before = snapshot(p.root);
      for (const arg of ["4", "Documentar cierre"]) {
        const { code, err } = await exec(["plan", "--remove", arg, "--apply"], p);
        expect(code).toBe(1);
        expect(err).toContain("No se puede quitar el paso de cierre «Documentar cierre de tarea»");
      }
      expect(snapshot(p.root)).toEqual(before);
    });

    test("paso inexistente o ambiguo: los mismos errores que `step`", async () => {
      const p = await started();
      expect((await exec(["plan", "--remove", "9", "--apply"], p)).err).toContain("El plan tiene 4 pasos: no existe el paso 9");
      expect((await exec(["plan", "--remove", "nada de eso", "--apply"], p)).err).toContain("Ningún paso del plan");
      expect((await exec(["plan", "--remove", "Paso", "--apply"], p)).err).toContain("coincide con 3 pasos");
    });
  });

  describe("--rename", () => {
    test("cambia el texto y conserva que esté pendiente", async () => {
      const p = await started();
      const { code, out } = await exec(["plan", "--rename", "2", "Probar a fondo", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("paso 2 renombrado de «Paso 2 — Probar» a «Probar a fondo»");
      expect(steps(p)).toEqual([FIRST[0], "- [ ] Probar a fondo", FIRST[2], FIRST[3]]);
      expect(handoff(p)).toContain("- Probar a fondo\n- Paso 3 — Cerrar el hilo");
    });

    test("conserva que esté hecho, y reemplaza también cualquier sufijo", async () => {
      const p = await started();
      write(p, handoff(p).replace(/Paso 2 — Probar/g, "Paso 2 — Probar (nota vieja)"));
      await exec(["step", "2", "--apply"], p);
      await exec(["plan", "--rename", "Paso 2", "Probar bien", "--apply"], p);
      expect(steps(p)).toEqual([FIRST[0], "- [x] Probar bien", FIRST[2], FIRST[3]]);
      expect(handoff(p)).not.toContain("nota vieja");
    });

    test("acepta la tarea delante: `plan 1 --rename 2 texto`", async () => {
      const p = await started();
      expect((await exec(["plan", "1", "--rename", "2", "Otro", "--apply"], p)).code).toBe(0);
      expect(steps(p)[1]).toBe("- [ ] Otro");
      expect((await exec(["plan", "2", "--rename", "1", "x", "--apply"], p)).err).toContain("no es la tarea en curso");
    });

    test("el paso de cierre no se renombra; falta el texto: error de uso", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const closing = await exec(["plan", "--rename", "4", "Otro cierre", "--apply"], p);
      expect(closing.code).toBe(1);
      expect(closing.err).toContain("No se puede renombrar el paso de cierre");
      expect((await exec(["plan", "--rename", "2", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });

    test("un texto nuevo que es el del paso de cierre: error y no escribe", async () => {
      const p = await started();
      const before = snapshot(p.root);
      for (const text of ["Documentar cierre de tarea", "Documentar cierre de la fase 2"]) {
        const { code, err } = await exec(["plan", "--rename", "2", text, "--apply"], p);
        expect(code).toBe(1);
        expect(err).toContain("ese texto es el del paso de cierre, que va siempre al final");
      }
      expect(snapshot(p.root)).toEqual(before);
    });

    test("el mismo texto: sin cambios", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const { code, out } = await exec(["plan", "--rename", "1", "Paso 1 — Escribir", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Sin cambios");
      expect(snapshot(p.root)).toEqual(before);
    });
  });

  describe("--move", () => {
    test("hacia arriba: cambia el orden y el próximo paso", async () => {
      const p = await started();
      const { code, out } = await exec(["plan", "--move", "3", "--to", "1", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("paso «Paso 3 — Cerrar el hilo» movido de la posición 3 a la 1");
      expect(steps(p)).toEqual([FIRST[2], FIRST[0], FIRST[1], FIRST[3]]);
      const text = handoff(p);
      expect(text).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 3 — Cerrar el hilo\n- Paso 1 — Escribir\n- Paso 2 — Probar\n- Documentar cierre de tarea\n");
      expect(text).toContain("### Próximo paso concreto\n\nPaso 3 — Cerrar el hilo\n");
    });

    test("hacia abajo, y conserva si está hecho", async () => {
      const p = await started();
      await exec(["step", "1", "--apply"], p);
      await exec(["plan", "--move", "1", "--to", "2", "--apply"], p);
      expect(steps(p)).toEqual([FIRST[1], "- [x] Paso 1 — Escribir", FIRST[2], FIRST[3]]);
    });

    test("nada pasa después del paso de cierre: --to en su lugar o más allá lo deja justo antes", async () => {
      const p = await started();
      const far = await exec(["plan", "--move", "1", "--to", "99", "--apply"], p);
      expect(far.out).toContain("Aviso: --to 99 cae después del paso de cierre");
      expect(steps(p)).toEqual([FIRST[1], FIRST[2], FIRST[0], FIRST[3]]);
      await exec(["plan", "--move", "Paso 2", "--to", "4", "--apply"], p);
      expect(steps(p)).toEqual([FIRST[2], FIRST[0], FIRST[1], FIRST[3]]);
      expect(steps(p).at(-1)).toBe(FIRST[3]);
    });

    test("el paso de cierre no se mueve", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const { code, err } = await exec(["plan", "--move", "Documentar cierre", "--to", "1", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("No se puede mover el paso de cierre");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("a donde ya está: sin cambios; sin --to o con --to inválido: error de uso", async () => {
      const p = await started();
      const before = snapshot(p.root);
      expect((await exec(["plan", "--move", "2", "--to", "2", "--apply"], p)).out).toContain("Sin cambios");
      expect((await exec(["plan", "--move", "2", "--apply"], p)).code).toBe(2);
      expect((await exec(["plan", "--move", "2", "--to", "0", "--apply"], p)).code).toBe(2);
      expect((await exec(["plan", "--add", "x", "--to", "1", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });
  });

  describe("--set -", () => {
    test("reemplaza la lista: conserva el estado por texto (sin importar mayúsculas), el resto queda pendiente y el cierre va al final con su estado", async () => {
      const p = await started(PLAN, ["--mode", "auto"]);
      await exec(["step", "2", "Documentar cierre", "--apply"], p);
      const { code, out } = await exec(["plan", "--set", "-", "--apply"], p, { stdin: "- [ ] paso 2 — probar\nNuevo paso\n* Paso 1 — Escribir\n" });
      expect(code).toBe(0);
      expect(out).toContain("plan reemplazado: 4 pasos");
      expect(steps(p)).toEqual(["- [x] Paso 2 — Probar", "- [ ] Nuevo paso", "- [ ] Paso 1 — Escribir", "- [x] Documentar cierre de tarea"]);
      expect(handoff(p)).toContain("- [x] Documentar cierre de tarea\n\n**Modo de ejecución acordado:** auto\n\n### Qué falta");
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Nuevo paso\n- Paso 1 — Escribir\n");
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nNuevo paso\n");
    });

    test("si la lista trae el cierre en medio, se mueve al final; si no lo trae y el plan no lo tenía, se agrega", async () => {
      const p = await started();
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Documentar cierre de tarea\nPaso A\nPaso B" });
      expect(steps(p)).toEqual(["- [ ] Paso A", "- [ ] Paso B", FIRST[3]]);

      write(p, handoff(p).replace("- [ ] Documentar cierre de tarea\n", "").replace("- Documentar cierre de tarea\n", ""));
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Solo uno" });
      expect(steps(p)).toEqual(["- [ ] Solo uno", FIRST[3]]);
    });

    test("avisa de cada línea que parece el paso de cierre y se descarta (con y sin cierre en el plan)", async () => {
      const stdin = "Paso A\nDocumentar cierre de tarea\nDocumentar cierre de la fase 2\nPaso B\n- [ ] documentar cierre del hito";
      const p = await started();
      const { code, out } = await exec(["plan", "--set", "-", "--apply"], p, { stdin });
      expect(code).toBe(0);
      expect(out).toContain("Aviso:");
      expect(out).toContain("«Documentar cierre de la fase 2»");
      expect(out).toContain("«documentar cierre del hito»");
      expect(out).not.toContain("«Documentar cierre de tarea»");
      expect(steps(p)).toEqual(["- [ ] Paso A", "- [ ] Paso B", FIRST[3]]);

      write(p, handoff(p).replace("- [ ] Documentar cierre de tarea\n", "").replace("- Documentar cierre de tarea\n", ""));
      const json = JSON.parse((await exec(["plan", "--set", "-", "--json"], p, { stdin })).out);
      expect(json.notes).toHaveLength(2);
      expect(json.notes[0]).toContain("«Documentar cierre de la fase 2»");
      expect(json.notes[1]).toContain("«documentar cierre del hito»");
    });

    test("una sola línea de cierre en la entrada no avisa", async () => {
      const p = await started();
      const { out } = await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Paso A\nDocumentar cierre de tarea" });
      expect(out).not.toContain("Aviso:");
    });

    test("conserva lo que hay entre los pasos y alrededor (modo, comentarios, resto del handoff)", async () => {
      const p = await started(PLAN, ["--mode", "guided"]);
      const before = handoff(p);
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Único paso" });
      const after = handoff(p);
      expect(after).toContain("**Modo de ejecución acordado:** guided");
      expect(after.replace(/### Plan[^]*?\n\n\*\*Modo/, "###X\n\n**Modo")).toContain("<!-- agent-context-skill:section=paused -->");
      expect(before.split("### Plan")[0]).toBe(after.split("### Plan")[0]);
      expect(readIn(p, "gersom", "backlog.md")).not.toContain("Único paso");
    });

    test("sin pasos: error de uso y no escribe", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const { code, err } = await exec(["plan", "--set", "-", "--apply"], p, { stdin: "\n\n" });
      expect(code).toBe(2);
      expect(err).toContain("--set no trae ningún paso");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("la misma lista: sin cambios", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const { out } = await exec(["plan", "--set", "-", "--apply"], p, { stdin: `${PLAN}\nDocumentar cierre de tarea` });
      expect(out).toContain("Sin cambios");
      expect(snapshot(p.root)).toEqual(before);
    });
  });

  describe("«Qué falta» y «Próximo paso concreto»", () => {
    test("un texto propio (con `edit`) no se pisa: avisa y cita `edit` con --missing / --next", async () => {
      const p = await started();
      await exec(["edit", "1", "--missing", "Texto propio.", "--next", "Otro texto propio.", "--apply"], p);
      const { code, out } = await exec(["plan", "--add", "Primero", "--at", "1", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Aviso: «Qué falta» tiene un texto propio y no lo toqué");
      expect(out).toContain("Aviso: «Próximo paso concreto» tiene un texto propio y no lo toqué");
      expect(out).toContain("`edit 1 --missing`");
      expect(out).toContain("`edit 1 --next`");
      expect(out).not.toContain("Actualizado:");
      expect(steps(p)[0]).toBe("- [ ] Primero");
      expect(handoff(p)).toContain("### Qué falta\n\nTexto propio.\n");
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nOtro texto propio.\n");
    });

    test("--json: con texto propio, `updated` queda vacío y `notes` cita `edit`", async () => {
      const p = await started();
      await exec(["edit", "1", "--missing", "Texto propio.", "--next", "Otro texto propio.", "--apply"], p);
      const json = JSON.parse((await exec(["plan", "--remove", "1", "--json", "--apply"], p)).out);
      expect(json.updated).toEqual([]);
      expect(json.notes).toHaveLength(2);
      expect(json.notes[0]).toContain("`edit 1 --missing`");
      expect(json.notes[1]).toContain("`edit 1 --next`");
    });

    test("si lo pendiente no cambia (renombrar un paso hecho), un texto propio no avisa", async () => {
      const p = await started();
      await exec(["step", "1", "--apply"], p);
      await exec(["edit", "1", "--missing", "Texto propio.", "--apply"], p);
      const { out } = await exec(["plan", "--rename", "1", "Escribir otra vez", "--apply"], p);
      expect(out).not.toContain("texto propio");
    });

    test("al quedar todo hecho, el texto de «plan completo»", async () => {
      const p = await started("Paso 1 — Escribir");
      await exec(["step", "1", "--apply"], p);
      await exec(["step", "Documentar cierre", "--apply"], p);
      await exec(["plan", "--rename", "1", "Escribir ya", "--apply"], p);
      await exec(["plan", "--add", "Paso nuevo", "--apply"], p);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso nuevo\n");
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nPaso nuevo\n");
      await exec(["plan", "--remove", "Paso nuevo", "--apply"], p);
      expect(handoff(p)).toContain("### Qué falta\n\nTodos los pasos del plan están hechos; falta cerrar la tarea.\n");
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nPlan completo: falta cerrar la tarea.\n");
    });
  });

  describe("pasos reabiertos (`(reabierto: motivo)`): el sufijo no cuenta para buscar ni para los textos generados", () => {
    /** Proyecto con el paso 1 reabierto con un motivo. */
    async function reopened(): Promise<Project> {
      const p = await started();
      await exec(["step", "1", "--apply"], p);
      await exec(["step", "1", "--undo", "--reason", "falló la prueba", "--apply"], p);
      expect(steps(p)[0]).toBe("- [ ] Paso 1 — Escribir (reabierto: falló la prueba)");
      return p;
    }

    test("un paso se encuentra por su texto sin el sufijo, en plan igual que en step", async () => {
      const p = await reopened();
      expect((await exec(["plan", "--rename", "falló la prueba", "x", "--apply"], p)).err).toContain("Ningún paso del plan");
      const { code } = await exec(["plan", "--move", "Paso 1 — Escribir", "--to", "2", "--apply"], p);
      expect(code).toBe(0);
      expect(steps(p)[1]).toBe("- [ ] Paso 1 — Escribir (reabierto: falló la prueba)");
    });

    test("«Qué falta» y «Próximo paso concreto» salen sin el sufijo", async () => {
      const p = await reopened();
      await exec(["plan", "--add", "Paso nuevo", "--at", "1", "--apply"], p);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso nuevo\n- Paso 1 — Escribir\n- Paso 2 — Probar\n");
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nPaso nuevo\n");
      expect(handoff(p)).not.toContain("- Paso 1 — Escribir (reabierto");
    });

    test("--set - conserva el estado y la línea (con su sufijo) comparando sin el sufijo, venga o no en la entrada", async () => {
      const p = await reopened();
      await exec(["step", "2", "--apply"], p);
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Paso 2 — Probar (reabierto: otro)\nPaso 1 — Escribir\nNuevo" });
      expect(steps(p)).toEqual(["- [x] Paso 2 — Probar", "- [ ] Paso 1 — Escribir (reabierto: falló la prueba)", "- [ ] Nuevo", FIRST[3]]);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso 1 — Escribir\n- Nuevo\n");
    });

    test("--rename reemplaza todo el texto, también el sufijo", async () => {
      const p = await reopened();
      await exec(["plan", "--rename", "1", "Escribir de nuevo", "--apply"], p);
      expect(steps(p)[0]).toBe("- [ ] Escribir de nuevo");
      expect(handoff(p)).not.toContain("reabierto");
    });
  });

  describe("pasos con evidencia y commit (`· evidencia · commit hash`): no cuentan para buscar ni para los textos generados", () => {
    const LINE_1 = "- [x] Paso 1 — Escribir · bun test 779 pass · commit abc1234";
    /** Proyecto con el paso 1 hecho con evidencia y commit. */
    async function proven(): Promise<Project> {
      const p = await started();
      await exec(["step", "1", "--evidence", "bun test 779 pass", "--commit", "abc1234", "--apply"], p);
      expect(steps(p)[0]).toBe(LINE_1);
      return p;
    }

    test("un paso se encuentra por su texto sin la evidencia, y --move conserva la línea completa", async () => {
      const p = await proven();
      expect((await exec(["plan", "--rename", "bun test", "x", "--apply"], p)).err).toContain("Ningún paso del plan");
      expect((await exec(["plan", "--move", "Paso 1 — Escribir", "--to", "2", "--apply"], p)).code).toBe(0);
      expect(steps(p)[1]).toBe(LINE_1);
    });

    test("--set - conserva el estado y la línea (con evidencia y commit) comparando por el texto base, venga o no en la entrada", async () => {
      const p = await proven();
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Paso 2 — Probar\nPaso 1 — Escribir\nNuevo" });
      expect(steps(p)).toEqual(["- [ ] Paso 2 — Probar", LINE_1, "- [ ] Nuevo", FIRST[3]]);
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Paso 1 — Escribir · bun test 779 pass · commit abc1234\nPaso 2 — Probar" });
      expect(steps(p)).toEqual([LINE_1, "- [ ] Paso 2 — Probar", FIRST[3]]);
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Paso 1 — Escribir · bun test 779 pass\nPaso 2 — Probar" });
      expect(steps(p)).toEqual([LINE_1, "- [ ] Paso 2 — Probar", FIRST[3]]);
    });

    test("--set - no confunde un paso pendiente con ` · ` en el texto: se conserva igual", async () => {
      const p = await started("Paso 1 — Escribir · con detalle\nPaso 2 — Probar");
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Paso 2 — Probar\nPaso 1 — Escribir · con detalle" });
      expect(steps(p)).toEqual(["- [ ] Paso 2 — Probar", "- [ ] Paso 1 — Escribir · con detalle", FIRST[3]]);
    });

    test("--set - empareja primero por el texto completo leído como pendiente: `Fix X · Y` no le roba la línea a un paso hecho `Fix X · ok`", async () => {
      const p = await started("Fix X\nPaso 2");
      await exec(["step", "1", "--evidence", "ok", "--apply"], p);
      expect(steps(p)[0]).toBe("- [x] Fix X · ok");
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Fix X · Y\nFix X\nPaso 2" });
      expect(steps(p)).toEqual(["- [ ] Fix X · Y", "- [x] Fix X · ok", "- [ ] Paso 2", FIRST[3]]);
    });

    test("--set - sin coincidencia por el texto completo, la lectura «hecha» solo vale contra pasos hechos", async () => {
      const p = await started("Fix X\nPaso 2");
      // Un paso pendiente `Fix X` no se empareja con `Fix X · Y` (el tramo no es evidencia en un paso pendiente).
      await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Fix X · Y\nPaso 2" });
      expect(steps(p)).toEqual(["- [ ] Fix X · Y", "- [ ] Paso 2", FIRST[3]]);
      // Con el paso hecho, `Fix X · Y` (sin otro candidato) sí lo conserva con su línea.
      const q = await started("Fix X\nPaso 2");
      await exec(["step", "1", "--evidence", "ok", "--apply"], q);
      await exec(["plan", "--set", "-", "--apply"], q, { stdin: "Fix X · Y\nPaso 2" });
      expect(steps(q)).toEqual(["- [x] Fix X · ok", "- [ ] Paso 2", FIRST[3]]);
    });

    test("--rename reemplaza todo el texto: borra la evidencia y el commit, salvo que vayan en el texto nuevo", async () => {
      const p = await proven();
      await exec(["plan", "--rename", "1", "Escribir de nuevo", "--apply"], p);
      expect(steps(p)[0]).toBe("- [x] Escribir de nuevo");
      await exec(["plan", "--rename", "1", "Escribir otra vez · bun test 780 pass · commit def5678", "--apply"], p);
      expect(steps(p)[0]).toBe("- [x] Escribir otra vez · bun test 780 pass · commit def5678");
    });

    test("«Qué falta» sale sin la evidencia ni el commit (también de un paso pendiente que ya trae un commit)", async () => {
      const p = await started("Paso 1 — Escribir · bun test 779 pass · commit abc1234\nPaso 2 — Probar");
      await exec(["plan", "--add", "Paso nuevo", "--at", "1", "--apply"], p);
      expect(handoff(p)).toContain("### Qué falta\n\nPasos pendientes:\n- Paso nuevo\n- Paso 1 — Escribir\n- Paso 2 — Probar\n");
      expect(handoff(p)).not.toContain("- Paso 1 — Escribir ·");
    });

    test("--json: `text` va sin sufijos y `evidence` / `commit` aparte, solo si el paso los trae", async () => {
      const p = await proven();
      const json = JSON.parse((await exec(["plan", "--add", "Paso extra", "--json"], p)).out);
      expect(json.steps[0]).toEqual({ index: 1, text: "Paso 1 — Escribir", done: true, evidence: "bun test 779 pass", commit: "abc1234" });
      expect(json.steps[1]).toEqual({ index: 2, text: "Paso 2 — Probar", done: false });
      await exec(["step", "2", "--commit", "def5678", "--apply"], p);
      await exec(["step", "2", "--undo", "--reason", "falló", "--apply"], p);
      const later = JSON.parse((await exec(["plan", "--add", "Paso extra", "--json"], p)).out);
      expect(later.steps[1]).toEqual({ index: 2, text: "Paso 2 — Probar", done: false, reopened: "falló" });
      expect(later.plan.nextStep).toBe("Paso 2 — Probar");
    });
  });

  test("--json: dice qué cambió y no imprime el diff", async () => {
    const p = await started();
    const pending = JSON.parse((await exec(["plan", "--add", "Paso extra", "--json"], p)).out);
    expect(pending).toMatchObject({ command: "plan", operation: "add", applied: false, pending: true, plan: { done: 0, total: 5, nextStep: "Paso 1 — Escribir" } });
    expect(pending.steps[3]).toEqual({ index: 4, text: "Paso extra", done: false });
    expect(steps(p)).toEqual(FIRST);
    const applied = JSON.parse((await exec(["plan", "--add", "Paso extra", "--json", "--apply"], p)).out);
    expect(applied).toMatchObject({ applied: true, pending: false, files: [{ file: "docs/agents/gersom/handoff.md", changed: true, written: true }], updated: ["Qué falta"] });
  });

  describe("avisos del plan (sin bloquear)", () => {
    test("una línea suelta entre los pasos avisa, y la operación se hace igual", async () => {
      const p = await started();
      write(p, handoff(p).replace("- [ ] Paso 2 — Probar", "Una nota suelta.\n- [ ] Paso 2 — Probar"));
      const { code, out } = await exec(["plan", "--remove", "1", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Aviso: El plan tiene una línea que no es un paso ni el modo de ejecución");
      expect(handoff(p)).not.toContain("Paso 1 — Escribir\n");
    });
  });

  describe("errores: no se escribe nada", () => {
    test("sin operación, o con más de una: error de uso", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const none = await exec(["plan", "--apply"], p);
      expect(none.code).toBe(2);
      expect(none.err).toContain("Indica exactamente una operación");
      const two = await exec(["plan", "--add", "x", "--remove", "1", "--apply"], p);
      expect(two.code).toBe(2);
      expect(two.err).toContain("--add y --remove");
      expect((await exec(["plan", "1", "2", "--add", "x", "--apply"], p)).code).toBe(2);
      expect((await exec(["plan", "--remove", "1", "--at", "1", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });

    test("sin tarea en curso, o una tarea sin plan", async () => {
      const idle = project({ folders: ["gersom"], ...IDLE });
      expect((await exec(["plan", "--add", "x", "--apply"], idle)).err).toContain("No hay tarea en curso");
      const noPlan = project({ folders: ["gersom"], ...IDLE });
      await exec(["start", "1", "--apply"], noPlan);
      expect((await exec(["plan", "--add", "x", "--apply"], noPlan)).err).toContain("no tiene plan");
    });

    test("<N> que no es la tarea en curso, un título o una tarea de otro operador", async () => {
      const p = await started();
      const before = snapshot(p.root);
      expect((await exec(["plan", "2", "--add", "x", "--apply"], p)).err).toContain("La Tarea 2 no es la tarea en curso (es la 1)");
      expect((await exec(["plan", "algo", "--add", "x", "--apply"], p)).code).toBe(2);
      expect((await exec(["plan", "1@ana", "--add", "x", "--apply"], p)).err).toContain("de otro operador");
      expect(snapshot(p.root)).toEqual(before);
      expect((await exec(["plan", "T-1", "--add", "x", "--apply"], p)).code).toBe(0);
      expect((await exec(["plan", "1", "--add", "y", "--apply"], p)).code).toBe(0);
    });

    test("carpeta de otro operador: se niega", async () => {
      const p = project({ folders: ["gersom", "ana"], ...IDLE, folderContents: { ana: IDLE.contents } });
      const { code, err } = await exec(["plan", "--add", "x", "--operator", "ana", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("«ana» no es la tuya");
    });
  });

  test("un proyecto en inglés: el paso de cierre se reconoce y los textos generados van en inglés", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
    await exec(["start", "4", "--plan", "-", "--apply"], p, { stdin: "Step 1 — write\nStep 2 — test" });
    await exec(["plan", "--add", "Step 3 — ship", "--apply"], p);
    expect(steps(p)).toEqual(["- [ ] Step 1 — write", "- [ ] Step 2 — test", "- [ ] Step 3 — ship", "- [ ] Document task closure"]);
    expect(handoff(p)).toContain("### What's left\n\nPending steps:\n- Step 1 — write\n- Step 2 — test\n- Step 3 — ship\n- Document task closure\n");
    expect((await exec(["plan", "--remove", "Document task closure", "--apply"], p)).err).toContain("No se puede quitar el paso de cierre");
  });

  test("archivos CRLF siguen siendo CRLF", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE), "backlog.md": crlf(BACKLOG_RICH), "history.md": crlf(HISTORY_RICH) } });
    await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: PLAN });
    for (const argv of [["--add", "Paso extra"], ["--remove", "2"], ["--rename", "1", "Escribir más"], ["--move", "3", "--to", "1"]]) {
      expect((await exec(["plan", ...argv, "--apply"], p)).code).toBe(0);
    }
    expect((await exec(["plan", "--set", "-", "--apply"], p, { stdin: "Escribir más\nOtro" })).code).toBe(0);
    const text = handoff(p);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("- [ ] Escribir más\r\n- [ ] Otro\r\n- [ ] Documentar cierre de tarea\r\n");
    expect(text).toContain("### Qué falta\r\n\r\nPasos pendientes:\r\n- Escribir más\r\n- Otro\r\n- Documentar cierre de tarea\r\n");
  });
});
