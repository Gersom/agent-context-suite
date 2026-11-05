// `mode`: registra el modo de ejecución acordado del plan de la tarea en curso. Contra proyectos
// temporales: nunca se tocan los docs reales.

import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
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
const handoff = (p: Project) => readIn(p, "gersom", "handoff.md");
const write = (p: Project, text: string) => writeFileSync(join(p.agents, "gersom", "handoff.md"), text);

/** Proyecto con la Tarea 1 en curso y plan (sin modo), en español. */
async function started(startArgs: string[] = []): Promise<Project> {
  const p = project({ folders: ["gersom"], ...IDLE });
  await exec(["start", "1", "--plan", "-", ...startArgs, "--apply"], p, { stdin: "Paso 1 — Escribir\nPaso 2 — Probar" });
  return p;
}

const PLAN_END = "- [ ] Documentar cierre de tarea\n";
const MODE_ES = (value: string) => `**Modo de ejecución acordado:** ${value}`;

describe("mode", () => {
  test("sin línea de modo: la agrega al final del plan, con la etiqueta del idioma", async () => {
    const p = await started();
    expect(handoff(p)).not.toContain("Modo de ejecución");
    const { code, out } = await exec(["mode", "guided", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe("Tarea 1: modo de ejecución fijado en «guided» (docs/agents/gersom/handoff.md).");
    expect(handoff(p)).toContain(`- [ ] Paso 2 — Probar\n${PLAN_END}\n${MODE_ES("guided")}\n\n### Qué falta`);
  });

  test("el resultado es igual al de `start --mode`", async () => {
    const withFlag = await started(["--mode", "auto"]);
    const later = await started();
    await exec(["mode", "auto", "--apply"], later);
    expect(handoff(later)).toBe(handoff(withFlag));
  });

  test("reemplaza el texto libre de antes (legado), sin duplicar la línea", async () => {
    const p = await started(["--mode", "auto"]);
    write(p, handoff(p).replace(MODE_ES("auto"), MODE_ES("uno a la vez con confirmación")));
    const { out } = await exec(["mode", "step-by-step", "--apply"], p);
    expect(out).toContain("cambiado de «uno a la vez con confirmación» a «step-by-step»");
    expect(handoff(p)).toContain(`${PLAN_END}\n${MODE_ES("step-by-step")}\n\n### Qué falta`);
    expect(handoff(p).match(/Modo de ejecución acordado/g)).toHaveLength(1);
    expect(handoff(p)).not.toContain("uno a la vez");
  });

  test("reemplaza una línea con la etiqueta de otro idioma, también la que está antes de los pasos", async () => {
    const p = await started(["--mode", "auto"]);
    write(p, handoff(p).replace(`${MODE_ES("auto")}\n\n`, "").replace("### Plan\n\n", "### Plan\n\n**Agreed execution mode:** all in a row\n"));
    await exec(["mode", "guided", "--apply"], p);
    const text = handoff(p);
    expect(text).toContain(`### Plan\n\n${MODE_ES("guided")}\n- [ ] Paso 1`);
    expect(text).not.toContain("Agreed execution mode");
    expect(text.match(/Modo de ejecución acordado/g)).toHaveLength(1);
  });

  test("proyecto en inglés: etiqueta en inglés, y una etiqueta en español se reemplaza sin duplicar", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
    await exec(["start", "4", "--plan", "-", "--apply"], p, { stdin: "Step 1 — write" });
    expect((await exec(["mode", "extreme", "--confirm", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain(`- [ ] Document task closure\n\n**Agreed execution mode:** extreme\n\n### What's left`);

    write(p, handoff(p).replace("**Agreed execution mode:** extreme", MODE_ES("seguidos")));
    await exec(["mode", "auto", "--apply"], p);
    expect(handoff(p)).toContain("**Agreed execution mode:** auto\n");
    expect(handoff(p)).not.toContain("Modo de ejecución");
  });

  test("mismo valor: nada que cambiar, avisa y no escribe", async () => {
    const p = await started(["--mode", "auto"]);
    const before = snapshot(p.root);
    const { code, out } = await exec(["mode", "auto", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe("Aviso: la Tarea 1 ya tiene el modo de ejecución «auto»: no hay nada que cambiar.");
    expect(snapshot(p.root)).toEqual(before);
    const json = JSON.parse((await exec(["mode", "auto", "--json", "--apply"], p)).out);
    expect(json).toMatchObject({ command: "mode", applied: false, pending: false, unchanged: true, mode: "auto", previous: "auto" });
  });

  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, out } = await exec(["mode", "guided"], p);
    expect(code).toBe(0);
    expect(out).toContain(`+${MODE_ES("guided")}`);
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("conserva los comentarios y lo que no toca", async () => {
    const p = await started(["--mode", "auto"]);
    write(p, handoff(p).replace(MODE_ES("auto"), `<!-- nota -->\n${MODE_ES("seguidos")} <!-- viejo -->`));
    await exec(["mode", "guided", "--apply"], p);
    expect(handoff(p)).toContain(`<!-- nota -->\n${MODE_ES("guided")} <!-- viejo -->\n`);
  });

  test("archivos CRLF siguen siendo CRLF", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE), "backlog.md": crlf(BACKLOG_RICH), "history.md": crlf(HISTORY_RICH) } });
    await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: "Paso 1 — a" });
    expect((await exec(["mode", "guided", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain(`- [ ] Documentar cierre de tarea\r\n\r\n${MODE_ES("guided")}\r\n\r\n### Qué falta`);
    expect(handoff(p).replace(/\r\n/g, "")).not.toContain("\n");
    expect((await exec(["mode", "auto", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain(`${MODE_ES("auto")}\r\n`);
    expect(handoff(p).replace(/\r\n/g, "")).not.toContain("\n");
  });

  describe("extreme", () => {
    test("sin --confirm: error de uso que explica que el agente debe confirmarlo con el operador; no escribe", async () => {
      const p = await started();
      const before = snapshot(p.root);
      const { code, err } = await exec(["mode", "extreme", "--apply"], p);
      expect(code).toBe(2);
      expect(err).toContain("exige --confirm");
      expect(err).toContain("confirmar con el operador en el chat");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("con --confirm se registra", async () => {
      const p = await started();
      expect((await exec(["mode", "extreme", "--confirm", "--apply"], p)).code).toBe(0);
      expect(handoff(p)).toContain(`${MODE_ES("extreme")}\n`);
    });

    test("--confirm con los otros modos se ignora sin error", async () => {
      const p = await started();
      expect((await exec(["mode", "guided", "--confirm", "--apply"], p)).code).toBe(0);
      expect(handoff(p)).toContain(`${MODE_ES("guided")}\n`);
    });
  });

  describe("errores: no se escribe nada", () => {
    test("modo ausente, de más o que no es uno de los cuatro", async () => {
      const p = await started();
      const before = snapshot(p.root);
      expect((await exec(["mode", "--apply"], p)).code).toBe(2);
      expect((await exec(["mode", "auto", "guided", "--apply"], p)).code).toBe(2);
      const bad = await exec(["mode", "uno a la vez", "--apply"], p);
      expect(bad.code).toBe(2);
      expect(bad.err).toContain("«uno a la vez» no es un modo de ejecución válido");
      expect(bad.err).toContain("`guided`, `step-by-step`, `auto`, `extreme`");
      expect((await exec(["mode", "Auto", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });

    test("sin tarea en curso", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      const before = snapshot(p.root);
      const { code, err } = await exec(["mode", "auto", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("No hay tarea en curso");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("tarea en curso sin plan", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      await exec(["start", "1", "--apply"], p);
      const before = snapshot(p.root);
      const { code, err } = await exec(["mode", "auto", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("La Tarea 1 no tiene plan");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("contenido que no reconozco en «Tarea en progreso»", async () => {
      const p = await started();
      write(p, handoff(p).replace("### Qué falta", "### Cosa rara"));
      const before = snapshot(p.root);
      const { code, err } = await exec(["mode", "auto", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("No puedo fijar el modo de ejecución de la Tarea 1");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("carpeta de otro operador: se niega", async () => {
      const p = project({ folders: ["gersom", "ana"], ...IDLE, folderContents: { ana: IDLE.contents } });
      expect((await exec(["mode", "auto", "--operator", "ana", "--apply"], p)).err).toContain("«ana» no es la tuya");
    });
  });

  test("--json", async () => {
    const p = await started();
    const pending = JSON.parse((await exec(["mode", "auto", "--json"], p)).out);
    expect(pending).toMatchObject({ command: "mode", applied: false, pending: true, unchanged: false, mode: "auto", previous: null, task: { number: 1 } });
    expect(handoff(p)).not.toContain("Modo de ejecución");
    const applied = JSON.parse((await exec(["mode", "guided", "--json", "--apply"], p)).out);
    expect(applied).toMatchObject({ applied: true, pending: false, mode: "guided" });
    const replaced = JSON.parse((await exec(["mode", "step-by-step", "--json", "--apply"], p)).out);
    expect(replaced).toMatchObject({ applied: true, mode: "step-by-step", previous: "guided" });
  });

  test("aparece en la ayuda", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    expect((await exec(["--help"], p)).out).toContain("mode");
    const help = await exec(["mode", "--help"], p);
    expect(help.out).toContain("mode <guided|step-by-step|auto|extreme> [--confirm] [--json] [--apply]");
    expect(help.out).toContain("--confirm");
  });
});
