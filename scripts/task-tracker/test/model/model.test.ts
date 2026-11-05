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
  test("tarea en curso con progreso del plan y su descripción; «Qué falta» y «Próximo paso concreto» no se exponen", () => {
    const { current } = load("es-anchors");
    if (!current) throw new Error("se esperaba una tarea en curso");
    expect(current.number).toBe(12);
    expect(current.plan).toMatchObject({ done: 2, total: 5 });
    expect(current.plan.currentStep?.text).toBe("Paso 3 — Escribir el modelo");
    expect(current.description).toBe("Descripción breve que menciona la Tarea 13 a mitad de línea.");
    expect(current.decisions).toBeNull();
    expect(current).not.toHaveProperty("details");
    expect(JSON.stringify({ ...current, subsections: [] })).not.toContain("Pasos 3 y 4");
  });

  describe("descripción y decisiones de la tarea en curso", () => {
    const section = (body: string) =>
      `# Handoff\n\n<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\n${body}\n\n<!-- agent-context-skill:section=paused -->\n## Tareas pausadas\n\nNinguna.\n`;
    const currentOf = (body: string) => buildModel({ handoffText: section(body), backlogText: null }).current;

    test("el texto entre la línea de la tarea y la primera subsección, sin los campos `- **Campo:** valor` ni su continuación", () => {
      const current = currentOf(
        [
          "Tarea 7 — Algo",
          "",
          "Primera línea de la descripción.",
          "",
          "Segunda línea, con `código`.",
          "",
          "- **Origen:** team-backlog",
          "- **Detalles:** contexto largo",
          "  que sigue indentado.",
          "",
          "### Plan",
          "",
          "- [ ] Paso 1 — A",
        ].join("\n"),
      );
      expect(current?.description).toBe("Primera línea de la descripción.\nSegunda línea, con `código`.");
    });

    test("una línea `Origen: …` suelta, los comentarios HTML y la etiqueta en negrita de la tarea no cuentan", () => {
      const current = currentOf("<!-- nota -->\n**Tarea:** Tarea 7 — Algo\n\nOrigen: team-backlog\nDe qué trata.<!-- otra -->\n\n### Plan\n\n- [ ] Paso 1 — A");
      expect(current?.description).toBe("De qué trata.");
    });

    test("sin texto entre la tarea y la primera subsección (o solo campos): null; sin subsecciones, hasta el fin de la sección", () => {
      expect(currentOf("Tarea 7 — Algo\n\n### Plan\n\n- [ ] Paso 1 — A")?.description).toBeNull();
      expect(currentOf("Tarea 7 — Algo\n\n- **Origen:** team-backlog\n\n### Plan\n\n- [ ] Paso 1 — A")?.description).toBeNull();
      expect(currentOf("Tarea 7 — Algo\n\nSolo texto.")?.description).toBe("Solo texto.");
    });

    test("decisiones con su texto; «Ninguna.», «None» o vacías: null; en inglés también", () => {
      const withDecisions = (text: string, title = "Decisiones a medio camino") => currentOf(`Tarea 7 — Algo\n\n### Plan\n\n- [ ] Paso 1 — A\n\n### ${title}\n\n${text}`)?.decisions;
      expect(withDecisions("Usar A en vez de B.\nVer con el operador.")).toBe("Usar A en vez de B.\nVer con el operador.");
      expect(withDecisions("Ninguna.")).toBeNull();
      expect(withDecisions("None", "Decisions along the way")).toBeNull();
      expect(withDecisions("Elegir X.", "Decisions along the way")).toBe("Elegir X.");
      expect(withDecisions("")).toBeNull();
      expect(currentOf("Tarea 7 — Algo\n\n### Plan\n\n- [ ] Paso 1 — A")?.decisions).toBeNull();
    });
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

    test("la línea de modo no se cuela en la descripción ni en las decisiones, ni siquiera sin checkboxes", () => {
      const noSteps = (h: string) =>
        h
          .replace(/^- \[[ xX]\] .*\n/gm, "")
          .replace("### Plan\n\n", "### Plan\n\nNinguno.\n\n")
          .replace("todos los pasos seguidos.", "guided");
      const current = buildModel({ handoffText: noSteps(fixture("es-anchors", "handoff.md") ?? ""), backlogText: null }).current;
      expect(current?.mode).toBe("guided");
      expect(`${current?.description}${current?.decisions}`).not.toContain("Modo de ejecución acordado");
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

  describe("campos de las tareas pausadas", () => {
    const pausedOf = (fields: string[]) =>
      buildModel({
        handoffText: `# H\n\n<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nSin tarea en curso\n\n<!-- agent-context-skill:section=paused -->\n## Tareas pausadas\n\n### Tarea 8 — Algo\n\n${fields.join("\n")}\n`,
        backlogText: null,
      }).paused[0];

    test("el fixture: por qué se pausó y qué espera; sin descripción, decisiones ni modo", () => {
      const [paused] = load("es-anchors").paused;
      expect(paused).toMatchObject({ why: "surgió una prioridad mayor.", waits: "que se cierre la Tarea 12.", description: null, decisions: null, mode: null });
    });

    test("descripción, decisiones, modo, por qué y qué espera; «Qué falta» y «Próximo paso concreto» no se exponen", () => {
      const paused = pausedOf([
        "- **Descripción:** De qué trata.",
        "  Segunda línea.",
        "- **Plan:**",
        "  - [x] Paso 1 — A",
        "  - [ ] Paso 2 — B",
        "- **Modo de ejecución acordado:** step-by-step",
        "- **Qué falta:** Paso 2.",
        "- **Decisiones a medio camino:** Usar A.",
        "- **Próximo paso concreto:** Paso 2.",
        "- **Por qué se pausó:** Llegó algo urgente.",
        "- **Qué espera para retomarse:** Que se cierre la Tarea 3.",
      ]);
      expect(paused).toMatchObject({
        description: "De qué trata.\nSegunda línea.",
        mode: "step-by-step",
        decisions: "Usar A.",
        why: "Llegó algo urgente.",
        waits: "Que se cierre la Tarea 3.",
      });
      expect(paused.plan).toMatchObject({ done: 1, total: 2 });
    });

    test("decisiones «Ninguna.», modo legado, etiquetas en inglés y campos ausentes", () => {
      expect(pausedOf(["- **Decisiones a medio camino:** Ninguna.", "- **Modo de ejecución acordado:** todos los pasos seguidos."])).toMatchObject({ decisions: null, mode: null, why: null, waits: null });
      expect(
        pausedOf(["- **Description:** About it.", "- **Agreed execution mode:** auto", "- **Decisions along the way:** None", "- **Why it was paused:** Urgent.", "- **What it is waiting for:** Task 3."]),
      ).toMatchObject({ description: "About it.", mode: "auto", decisions: null, why: "Urgent.", waits: "Task 3." });
    });
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
