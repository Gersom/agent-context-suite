import { describe, expect, test } from "bun:test";
import { buildModel } from "../../src/model/model.ts";
import { fixture } from "../../../_shared/test/helpers.ts";

const load = (name: string) =>
  buildModel({
    handoffText: fixture(name, "handoff.md"),
    backlogText: fixture(name, "backlog.md"),
    historyText: fixture(name, "history.md"),
  });

describe("buildModel", () => {
  test("tarea en curso con progreso del plan y sus subsecciones de detalle (sin la del plan)", () => {
    const { current } = load("es-anchors");
    if (!current) throw new Error("se esperaba una tarea en curso");
    expect(current.number).toBe(12);
    expect(current.plan).toMatchObject({ done: 2, total: 5 });
    expect(current.plan.currentStep?.text).toBe("Paso 3 — Escribir el modelo");
    expect(current.details).toMatchObject([
      { title: "Qué falta", body: "Pasos 3 y 4." },
      { title: "Próximo paso concreto", body: "Paso 3 — escribir `model.js`.\nSegunda línea del próximo paso." },
    ]);
  });

  describe("modo de ejecución de la tarea en curso", () => {
    // El fixture trae la línea de modo con texto legado: se cambia solo el valor.
    const modeOf = (edit: (handoff: string) => string) =>
      buildModel({ handoffText: edit(fixture("es-anchors", "handoff.md") ?? ""), backlogText: null }).current?.mode;
    const withValue = (value: string) => (handoff: string) => handoff.replace("todos los pasos seguidos.", value);

    test("los cuatro modos válidos", () => {
      for (const mode of ["guided", "step-by-step", "auto", "extreme"] as const) expect(modeOf(withValue(mode))).toBe(mode);
    });

    test("la etiqueta en inglés también", () => {
      expect(modeOf((h) => h.replace("**Modo de ejecución acordado:** todos los pasos seguidos.", "**Agreed execution mode:** auto"))).toBe("auto");
    });

    test("texto legado o distinto de los cuatro valores (incluso con otra mayúscula): null", () => {
      expect(load("es-anchors").current?.mode).toBeNull();
      expect(modeOf(withValue("Auto"))).toBeNull();
      expect(modeOf(withValue("auto, sin parar"))).toBeNull();
    });

    test("línea de modo vacía o ausente: null", () => {
      expect(modeOf((h) => h.replace("**Modo de ejecución acordado:** todos los pasos seguidos.", "**Modo de ejecución acordado:**"))).toBeNull();
      expect(modeOf((h) => h.replace("**Modo de ejecución acordado:** todos los pasos seguidos.\n", ""))).toBeNull();
    });

    test("una línea de modo dentro de un comentario HTML no cuenta", () => {
      expect(modeOf((h) => h.replace("**Modo de ejecución acordado:** todos los pasos seguidos.", "<!-- **Modo de ejecución acordado:** auto -->"))).toBeNull();
    });

    test("con varias líneas de modo vale la última, como en `close` y `pause`", () => {
      const twice = (h: string) => h.replace("**Modo de ejecución acordado:** todos los pasos seguidos.", "**Modo de ejecución acordado:** guided\n**Modo de ejecución acordado:** extreme");
      expect(modeOf(twice)).toBe("extreme");
    });

    test("la subsección del plan no se repite en los detalles, ni siquiera sin checkboxes", () => {
      const noSteps = (h: string) =>
        h
          .replace(/^- \[[ xX]\] .*\n/gm, "")
          .replace("### Plan\n\n", "### Plan\n\nNinguno.\n\n")
          .replace("todos los pasos seguidos.", "guided");
      const current = buildModel({ handoffText: noSteps(fixture("es-anchors", "handoff.md") ?? ""), backlogText: null }).current;
      expect(current?.mode).toBe("guided");
      expect(current?.details.some((d) => d.body.includes("Modo de ejecución acordado"))).toBe(false);
    });

    test("sin tarea en curso no hay modo que calcular", () => {
      expect(load("minimal").current).toBeNull();
    });
  });

  test("pausadas con el avance de su plan", () => {
    const [paused] = load("es-anchors").paused;
    if (!paused) throw new Error("no hay pausadas en el fixture");
    expect(paused.plan.done).toBe(1);
    expect(paused.plan.total).toBe(3);
    expect(paused.plan.currentStep?.text).toBe("Paso 2 — Revisar los links");
  });

  test("completadas: las 5 primeras entradas de history.md", () => {
    const model = load("es-anchors");
    expect(model.hasHistory).toBe(true);
    expect(model.completed.map((e) => e.number)).toEqual([11, 10, null, 9, 7]);
  });

  test("sin history.md no hay completadas, ni aviso ni nota extra", () => {
    const model = load("minimal");
    expect(model.hasHistory).toBe(false);
    expect(model.completed).toEqual([]);
  });

  test("bloqueadas: tareas de las que dependen, con su título", () => {
    const model = load("es-anchors");
    expect(model.blocked.map((t) => t.dependsOn)).toEqual([
      [{ number: 3, title: "Exportar como skill", closed: false }],
      [{ number: 4, title: "Deploy en skills.sh", closed: false }],
    ]);
  });

  test("bloqueadas: marca la dependencia que ya está cerrada en history.md", () => {
    const backlog = [
      "<!-- agent-context-skill:section=free -->",
      "## Libres",
      "<!-- agent-context-skill:section=blocked -->",
      "## Bloqueadas",
      "",
      "### Tarea 8 — Esperando una ya cerrada",
      "",
      "- **Bloqueos:** `[dependencia]` espera la Tarea 9 y la T-2.",
    ].join("\n");
    const model = buildModel({
      handoffText: fixture("minimal", "handoff.md"),
      backlogText: backlog,
      historyText: fixture("es-anchors", "history.md"),
    });
    expect(model.blocked[0].dependsOn).toEqual([
      { number: 9, title: "Preparar fixtures", closed: true },
      { number: 2, title: null, closed: false },
    ]);
  });

  test("libres con grupo enlazado a sus tareas agrupadas, y conteos", () => {
    const model = load("es-anchors");
    expect(model.free.groups[0].tasks.map((t) => t.title)).toEqual(["Redactar `costs.md`", "Redactar `limits.md`"]);
    expect(model.counts).toEqual({ paused: 1, free: 4, blocked: 2 });
  });

  test("bloqueadas con su tag, independiente de la etiqueta del campo", () => {
    const model = load("es-anchors");
    expect(model.blocked.map((t) => t.block.tag)).toEqual(["dependencia", "postergada"]);
    expect(model.blocked[0].block.reason).toBe("depende de la Tarea 3.");
    const en = load("en-no-anchors");
    expect(en.blocked[0].block.tag).toBe("dependency");
  });

  test("sin avisos cuando todo tiene anclas", () => {
    expect(load("es-anchors").warnings).toEqual([]);
  });

  test("avisa el plan B en ambos archivos", () => {
    const { warnings } = load("en-no-anchors");
    expect(warnings.some((w) => w.startsWith("handoff.md no tiene anclas"))).toBe(true);
    expect(warnings.some((w) => w.startsWith("backlog.md no tiene anclas"))).toBe(true);
  });

  test("set mínimo: sin backlog.md es una nota, no un error", () => {
    const model = load("minimal");
    expect(model.hasBacklog).toBe(false);
    expect(model.current).toBeNull();
    expect(model.warnings).toEqual([]);
    expect(model.notes).toHaveLength(1);
  });

  test("handoff ausente o vacío se avisa sin romper", () => {
    expect(buildModel({ handoffText: null, backlogText: null }).warnings[0]).toContain("no existe");
    expect(buildModel({ handoffText: "  \n", backlogText: null }).warnings[0]).toContain("vacío");
  });

  test("avisa una tarea en bloqueadas sin bloqueo vigente", () => {
    const backlog = [
      "<!-- agent-context-skill:section=free -->",
      "## Libres",
      "<!-- agent-context-skill:section=blocked -->",
      "## Bloqueadas",
      "",
      "### Tarea 8 — Ya desbloqueada",
      "",
      // Un `[algo]` en medio de otro campo no cuenta como bloqueo ni oculta el aviso.
      "- **Descripción:** revisar el caso [algo] del diseño.",
      "- **Bloqueos:** `[Resuelto el 2026-10-05]` — era `[dependencia]` esperaba la Tarea 7.",
      "",
      "<!-- agent-context-skill:section=grouped -->",
      "## Agrupadas",
    ].join("\n");
    const model = buildModel({ handoffText: fixture("minimal", "handoff.md"), backlogText: backlog });
    expect(model.blocked[0].block.tag).toBeNull();
    expect(model.warnings).toEqual(['Tarea 8 está en "bloqueadas" sin bloqueo vigente: ¿moverla a libres? (Regla 8)']);
  });

  test("avisa placeholders sin completar", () => {
    const handoff =
      "<!-- agent-context-skill:section=in-progress -->\n## X\n\n**Tarea:** [Placeholder]\n\n<!-- agent-context-skill:section=paused -->\n## Y\n";
    expect(buildModel({ handoffText: handoff, backlogText: null }).warnings).toEqual(["handoff.md tiene placeholders sin completar."]);
  });
});
