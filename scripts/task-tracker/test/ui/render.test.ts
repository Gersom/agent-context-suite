import { describe, expect, test } from "bun:test";
import { buildModel } from "../../src/model/model.ts";
import type { RenderMeta } from "../../src/shared/types.ts";
import { visibleLength } from "../../src/ui/format.ts";
import { arrowText, dependencyText, render, screenWidth, triggerText } from "../../src/ui/render.ts";
import { fixture } from "../../../_shared/test/helpers.ts";

const meta: RenderMeta = {
  projectName: "demo-app",
  projectDir: "/proyectos/demo-app",
  updatedAt: new Date(2026, 9, 5, 14, 30, 0),
  trigger: { kind: "start" },
  color: false,
  width: 100,
};
const modelOf = (name: string) =>
  buildModel({
    handoffText: fixture(name, "handoff.md"),
    backlogText: fixture(name, "backlog.md"),
    historyText: fixture(name, "history.md"),
  });
const screen = (name: string, extra: Partial<RenderMeta> = {}) => render(modelOf(name), { ...meta, ...extra });
/** Líneas que pertenecen a un recuadro (bordes y contenido). */
const boxLines = (out: string) => out.split("\n").filter((l) => /^(\x1b\[[0-9;]*m)*[╭│╰]/.test(l));
/** Fila de un recuadro que contiene `text`, sin los bordes ni el relleno. */
const rowWith = (out: string, text: string) => {
  const row = out.split("\n").find((l) => l.startsWith("│") && l.includes(text));
  if (!row) throw new Error(`no se encontró una fila con "${text}"`);
  return row.slice(2, -2).trimEnd();
};

describe("render", () => {
  test("encabezado: título TAREAS, nombre del repo en mayúsculas con su ruta al lado y última actualización", () => {
    const lines = screen("es-anchors").split("\n");
    expect(lines.slice(0, 3)).toEqual([
      "▣ TAREAS",
      "  DEMO APP   /proyectos/demo-app",
      "  Última actualización 14:30:00 · al iniciar",
    ]);
    expect(lines[3]).toBe("");
  });

  test("encabezado en modo multi-operador: el operador va junto al nombre, antes de la ruta", () => {
    const lines = screen("es-anchors", { operator: "ana" }).split("\n");
    expect(lines.slice(0, 3)).toEqual([
      "▣ TAREAS",
      "  DEMO APP · ana   /proyectos/demo-app",
      "  Última actualización 14:30:00 · al iniciar",
    ]);
  });

  test("encabezado con el observador activo y un repo abierto: el título lleva el sufijo · MODO OBSERVADOR, sin línea extra", () => {
    const lines = screen("es-anchors", { operator: "ana", observer: { notice: null } }).split("\n");
    expect(lines.slice(0, 3)).toEqual([
      "▣ TAREAS · MODO OBSERVADOR",
      "  DEMO APP · ana   /proyectos/demo-app",
      "  Última actualización 14:30:00 · al iniciar",
    ]);
    // Sin observador no hay sufijo.
    expect(screen("es-anchors", { observer: undefined }).split("\n")[0]).toBe("▣ TAREAS");
  });

  test("encabezado en un ancho estrecho: el nombre no se pierde y se recorta la ruta", () => {
    const path = "/proyectos/un/camino/bastante/largo/hasta/demo-app";
    for (const width of [60, 40]) {
      const lines = screen("es-anchors", { operator: "ana", projectDir: path, width }).split("\n");
      const location = lines[1];
      expect(location.startsWith("  DEMO APP · ana   /proyectos/")).toBe(true);
      expect(location.endsWith("…")).toBe(true);
      expect(visibleLength(location)).toBe(width);
      expect(lines[2].startsWith("  Última actualización 14:30:00 · al ")).toBe(true);
    }
  });

  test("encabezado con el observador en un ancho estrecho: el título con el sufijo cabe entero hasta 40 columnas", () => {
    for (const width of [60, 40]) {
      const title = screen("es-anchors", { observer: { notice: null }, width }).split("\n")[0];
      expect(title).toBe("▣ TAREAS · MODO OBSERVADOR");
    }
  });

  test("encabezado: si ni el nombre cabe junto a una ruta, se muestra solo el nombre recortado", () => {
    const projectName = "un-proyecto-con-un-nombre-realmente-largo";
    const lines = screen("es-anchors", { projectName, operator: "ana", width: 40 }).split("\n");
    expect(lines[1]).toBe(`  ${"UN PROYECTO CON UN NOMBRE REALMENTE LARGO · ana".slice(0, 37)}…`);
    expect(lines[1]).not.toContain("/proyectos");
  });

  test("encabezado: el título va en negrita y magenta, el nombre sin color y la ruta en el tono secundario", () => {
    const lines = screen("es-anchors", { color: true, observer: { notice: null } }).split("\n");
    expect(lines[0]).toBe("\x1b[1m\x1b[35m▣ TAREAS · MODO OBSERVADOR\x1b[39m\x1b[22m");
    expect(lines[1]).toBe("  DEMO APP   \x1b[38;5;250m/proyectos/demo-app\x1b[39m");
  });

  test("encabezado sin color: ni una secuencia ANSI en toda la pantalla, también con el observador", () => {
    expect(screen("es-anchors", { operator: "ana", observer: { notice: null } })).not.toMatch(/\x1b/);
  });

  test("un recuadro por tipo, en el orden del flujo de una tarea, con el título a la izquierda y el archivo a la derecha", () => {
    const out = screen("es-anchors");
    expect(out).not.toMatch(/\x1b\[/);
    expect(out).not.toContain("━━");
    const tops = out.split("\n").filter((l) => l.startsWith("╭"));
    expect(tops.map((l) => l.match(/^╭─ (.+?) ─+ (\S+\.md) ─╮$/)?.slice(1))).toEqual([
      ["LIBRES (4)", "backlog.md"],
      ["BLOQUEADAS (2)", "backlog.md"],
      ["EN PROGRESO", "handoff.md"],
      ["PAUSADAS (1)", "handoff.md"],
      ["TAREAS COMPLETADAS (últimas 5)", "history.md"],
    ]);
    expect(out.split("\n").filter((l) => l.startsWith("╰"))).toHaveLength(5);
  });

  test("una línea de flecha con el nombre de la transición entre cada par de recuadros", () => {
    const arrows = screen("es-anchors")
      .split("\n")
      .filter((l) => /^ {3}[↑↓]/.test(l))
      .map((l) => l.trim());
    expect(arrows).toEqual(["↓ bloquea · ↑ desbloquea", "↓ empieza (desde libres)", "↑ retoma · ↓ pausa", "↓ se cierra"]);
  });

  test("arrowText: la transición entre cada par de etapas y «↓» si no hay una conocida", () => {
    expect(arrowText("unowned", "free")).toBe("↓ se toma");
    expect(arrowText("unowned", "current")).toBe("↓ se toma");
    expect(arrowText("free", "blocked")).toBe("↓ bloquea · ↑ desbloquea");
    expect(arrowText("free", "current")).toBe("↓ empieza");
    expect(arrowText("blocked", "current")).toBe("↓ empieza (desde libres)");
    expect(arrowText("current", "paused")).toBe("↑ retoma · ↓ pausa");
    expect(arrowText("current", "completed")).toBe("↓ se cierra");
    expect(arrowText("paused", "completed")).toBe("↓ se cierra");
    expect(arrowText("free", "completed")).toBe("↓");
  });

  test("las flechas solo van entre recuadros que se muestran", () => {
    // Sin pausadas ni bloqueadas ni historial: solo LIBRES → EN PROGRESO.
    const model = buildModel({ handoffText: "# H\n", backlogText: fixture("es-anchors", "backlog.md"), historyText: null });
    const out = render({ ...model, blocked: [], paused: [], counts: { ...model.counts, blocked: 0, paused: 0 } }, meta);
    expect(out.split("\n").filter((l) => /^ {3}[↑↓]/.test(l)).map((l) => l.trim())).toEqual(["↓ empieza"]);
    // Set mínimo (solo handoff.md): un único recuadro, sin flechas.
    expect(screen("minimal")).not.toMatch(/\n {3}[↑↓]/);
  });

  test("todos los recuadros tienen el ancho de la pantalla, con y sin color", () => {
    for (const color of [false, true]) {
      for (const width of [40, 70, 120]) {
        const lines = boxLines(screen("es-anchors", { color, width }));
        expect(lines.length).toBeGreaterThan(10);
        for (const line of lines) expect(visibleLength(line)).toBe(width);
      }
    }
  });

  test("ninguna línea supera el ancho de la pantalla", () => {
    const out = screen("es-anchors", { width: 40 });
    for (const line of out.split("\n")) expect(visibleLength(line)).toBeLessThanOrEqual(40);
  });

  test("un título largo se recorta y el archivo se conserva", () => {
    const top = screen("es-anchors", { width: 40 }).split("\n").find((l) => l.includes("TAREAS COMPLETADAS") || l.includes("TAREAS COMPLE"));
    if (!top) throw new Error("no se encontró el borde de completadas");
    expect(top).toMatch(/^╭─ TAREAS .*… ─+ history\.md ─╮$/);
    expect(visibleLength(top)).toBe(40);
  });

  test("una fila larga se recorta con … sin romper el borde", () => {
    const row = screen("es-anchors", { width: 40 }).split("\n").find((l) => l.includes("T-11:"));
    if (!row) throw new Error("no se encontró la fila de T-11");
    expect(row.endsWith(" │")).toBe(true);
    expect(visibleLength(row)).toBe(40);
  });

  test("completadas: las últimas 5, compactas, sin tachar, con la descartada marcada y la fecha", () => {
    const out = screen("es-anchors");
    expect(rowWith(out, "T-11:")).toBe("T-11: Escribir el parser de secciones · 2026-10-05");
    expect(rowWith(out, "T-10:")).toBe("T-10: Usar YAML para las tareas ✖ (descartada) · 2026-10-04");
    expect(rowWith(out, "Qué es este proyecto")).toBe('Agregar la sección "Qué es este proyecto" · 2026-10-03');
    expect(out).not.toContain("Sexta entrada");
    const colored = screen("es-anchors", { color: true });
    // Con color, el prefijo `T-11` va pintado aparte del resto del nombre.
    const line = colored.split("\n").find((l) => l.includes("T-11"));
    expect(line).toBeDefined();
    expect(line).not.toContain("\x1b[9m");
  });

  test("pasos hechos tachados (solo el texto) en la tarea en progreso y en las pausadas", () => {
    const out = screen("es-anchors", { color: true });
    for (const step of ["Paso 1 — Preparar fixtures", "Paso 2 — Escribir el parser", "Paso 1 — Copiar el contenido viejo"]) {
      const line = out.split("\n").find((l) => l.includes(step));
      if (!line) throw new Error(`no se encontró el paso "${step}"`);
      expect(line).toContain(`\x1b[9m${step}\x1b[29m`);
      expect(line.slice(0, line.indexOf("\x1b[9m"))).toContain("✔");
    }
    for (const step of ["Paso 3 — Escribir el modelo", "Paso 2 — Revisar los links"]) {
      const line = out.split("\n").find((l) => l.includes(step));
      expect(line).not.toContain("\x1b[9m");
    }
    expect(screen("es-anchors")).not.toContain("\x1b[9m");
  });

  test("handoff en detalle: estado y plan, descripción y pausadas con su plan y campos propios", () => {
    const out = screen("es-anchors");
    expect(rowWith(out, "Tarea 12")).toBe("Tarea 12 — Implementar el parser de anclas");
    expect(rowWith(out, "Estado: Paso 3 de 5")).toBe("Estado: Paso 3 de 5 [█████░░░░░░░]");
    expect(rowWith(out, "Paso 3 — Escribir")).toBe("  ▸ Paso 3 — Escribir el modelo");
    expect(rowWith(out, "Descripción breve")).toBe("  Descripción breve que menciona la Tarea 13 a mitad de línea.");
    // «Qué falta» y «Próximo paso concreto» no se muestran, ni en la tarea en curso ni en la pausada.
    for (const hidden of ["Qué falta", "Pasos 3 y 4", "Próximo paso", "Segunda línea", "revisar setup.md", "Plan ["]) expect(out).not.toContain(hidden);
    // El fixture trae el modo con texto legado: no se muestra.
    expect(out).not.toContain("Modo");
    expect(rowWith(out, "Tarea 8")).toBe("• Tarea 8 — Migrar la documentación vieja");
    expect(rowWith(out, "Estado: Paso 2 de 3")).toBe("    Estado: Paso 2 de 3 [████░░░░░░░░]");
    expect(rowWith(out, "Copiar el contenido")).toBe("      ✔ Paso 1 — Copiar el contenido viejo");
    expect(rowWith(out, "Revisar los links")).toBe("      ▸ Paso 2 — Revisar los links");
    expect(rowWith(out, "Por qué se pausó:")).toBe("    Por qué se pausó:");
    expect(rowWith(out, "surgió una prioridad")).toBe("      surgió una prioridad mayor.");
    expect(rowWith(out, "Qué espera para retomarse:")).toBe("    Qué espera para retomarse:");
    expect(rowWith(out, "que se cierre la Tarea 12")).toBe("      que se cierre la Tarea 12.");
    expect(out).not.toContain("Plan: ");
  });

  describe("modo de ejecución de la tarea en curso", () => {
    // El fixture trae la línea de modo con texto legado: se cambia solo el valor.
    const withMode = (value: string, label = "Modo de ejecución acordado") =>
      buildModel({
        handoffText: (fixture("es-anchors", "handoff.md") ?? "").replace("**Modo de ejecución acordado:** todos los pasos seguidos.", `**${label}:** ${value}`),
        backlogText: fixture("es-anchors", "backlog.md"),
      });
    const SHOWN = { guided: "✏️ Guiado", "step-by-step": "📋 Paso a paso", auto: "🤖 Auto", extreme: "🔥 Extremo" } as const;

    test("cada modo se muestra con su emoji y etiqueta, entre el título y el estado", () => {
      for (const [mode, shown] of Object.entries(SHOWN)) {
        const out = render(withMode(mode), meta);
        expect(rowWith(out, "Modo")).toBe(`Modo  ${shown}`);
        const rows = out.split("\n");
        const at = (text: string) => rows.findIndex((l) => l.includes(text));
        expect(at("Modo  ")).toBe(at("Tarea 12 — Implementar") + 1);
        expect(at("Estado: ")).toBe(at("Modo  ") + 1);
      }
    });

    test("con la etiqueta en inglés también", () => {
      expect(rowWith(render(withMode("extreme", "Agreed execution mode"), meta), "Modo")).toBe("Modo  🔥 Extremo");
    });

    test("texto legado, vacío o de otro tipo: no se muestra nada", () => {
      for (const value of ["todos los pasos seguidos.", "", "Auto", "auto, sin parar"]) {
        expect(render(withMode(value), meta)).not.toContain("Modo  ");
      }
    });

    test("el borde derecho queda alineado con cada modo, en color y sin color, y en pantallas angostas", () => {
      for (const mode of Object.keys(SHOWN)) {
        for (const color of [false, true]) {
          for (const width of [40, 60, 100]) {
            const lines = boxLines(render(withMode(mode), { ...meta, color, width }));
            expect(lines.length).toBeGreaterThan(0);
            for (const line of lines) expect(visibleLength(line)).toBe(width);
          }
        }
      }
    });
  });

  describe("EN PROGRESO y PAUSADAS: estado, descripción y decisiones", () => {
    const handoffOf = (current: string, paused = "Ninguna.") =>
      `# H\n\n<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\n${current}\n\n<!-- agent-context-skill:section=paused -->\n## Tareas pausadas\n\n${paused}\n`;
    const steps = (done: number, total: number) =>
      Array.from({ length: total }, (_, i) => `- [${i < done ? "x" : " "}] Paso ${i + 1} — ${i === total - 1 ? "Documentar cierre de tarea" : `Hacer ${i + 1}`}`).join("\n");
    const sections = (plan: string, decisions = "Ninguna.") =>
      `### Plan\n\n${plan}\n\n**Modo de ejecución acordado:** auto\n\n### Qué falta\n\nToda la tarea.\n\n### Decisiones a medio camino\n\n${decisions}\n\n### Próximo paso concreto\n\nEmpezar la tarea.`;
    const screenOf = (current: string, paused?: string, extra: Partial<RenderMeta> = {}) =>
      render(buildModel({ handoffText: handoffOf(current, paused), backlogText: null }), { ...meta, ...extra });
    /** Filas de contenido del recuadro cuyo título empieza con `title`, sin bordes ni relleno final. */
    const rowsOf = (out: string, title: string) => {
      const lines = out.split("\n");
      const start = lines.findIndex((l) => l.startsWith(`╭─ ${title}`));
      if (start < 0) throw new Error(`no se encontró el recuadro "${title}"`);
      const rows: string[] = [];
      for (let i = start + 1; !lines[i].startsWith("╰"); i++) rows.push(lines[i].slice(2, -2).trimEnd());
      return rows;
    };
    const HIDDEN = ["Qué falta", "Toda la tarea", "Próximo paso", "Empezar la tarea", "Plan ["];

    test("recién iniciada: «Estado: recién iniciado», sin «Qué falta» ni «Próximo paso concreto»", () => {
      const out = screenOf(`Tarea 7 — Algo\n\nDe qué trata.\n\n${sections(steps(0, 3))}`);
      expect(rowsOf(out, "EN PROGRESO")).toEqual([
        "Tarea 7 — Algo",
        "Modo  🤖 Auto",
        "Estado: recién iniciado",
        "  ▸ Paso 1 — Hacer 1",
        "  ○ Paso 2 — Hacer 2",
        "  ○ Paso 3 — Documentar cierre de tarea",
        "Descripción:",
        "  De qué trata.",
      ]);
      for (const hidden of HIDDEN) expect(out).not.toContain(hidden);
    });

    test("con pasos hechos: «Estado: Paso k de n» y la barra; descripción y decisiones bajo su subtítulo", () => {
      const out = screenOf(`Tarea 7 — Algo\n\nDe qué trata.\n\n${sections(steps(2, 4), "Usar A en vez de B.")}`);
      expect(rowsOf(out, "EN PROGRESO")).toEqual([
        "Tarea 7 — Algo",
        "Modo  🤖 Auto",
        "Estado: Paso 3 de 4 [██████░░░░░░]",
        "  ✔ Paso 1 — Hacer 1",
        "  ✔ Paso 2 — Hacer 2",
        "  ▸ Paso 3 — Hacer 3",
        "  ○ Paso 4 — Documentar cierre de tarea",
        "Descripción:",
        "  De qué trata.",
        "Decisiones a medio camino:",
        "  Usar A en vez de B.",
      ]);
      for (const hidden of HIDDEN) expect(out).not.toContain(hidden);
    });

    test("pasos completos: «Estado: pasos completos», sin barra", () => {
      const rows = rowsOf(screenOf(`Tarea 7 — Algo\n\n${sections(steps(3, 3))}`), "EN PROGRESO");
      expect(rows.slice(0, 3)).toEqual(["Tarea 7 — Algo", "Modo  🤖 Auto", "Estado: pasos completos"]);
      expect(rows.slice(3)).toEqual(["  ✔ Paso 1 — Hacer 1", "  ✔ Paso 2 — Hacer 2", "  ✔ Paso 3 — Documentar cierre de tarea"]);
    });

    test("sin plan no hay «Estado»; sin descripción ni decisiones (o con «Ninguna.»/«None») no hay subtítulos", () => {
      expect(rowsOf(screenOf("Tarea 7 — Algo\n\nDe qué trata."), "EN PROGRESO")).toEqual(["Tarea 7 — Algo", "Descripción:", "  De qué trata."]);
      for (const none of ["Ninguna.", "None"]) {
        const out = screenOf(`Tarea 7 — Algo\n\n${sections(steps(1, 2), none)}`);
        expect(rowsOf(out, "EN PROGRESO").map((r) => r.split(":")[0]).filter((r) => /^(Descripción|Decisiones)/.test(r))).toEqual([]);
      }
      expect(rowsOf(screenOf("Tarea 7 — Algo\n\n### Plan\n\n- [ ] Paso 1 — A"), "EN PROGRESO")).toEqual(["Tarea 7 — Algo", "Estado: recién iniciado", "  ▸ Paso 1 — A"]);
    });

    test("la línea «Origen» y los campos de la tarea no se muestran como descripción", () => {
      const rows = rowsOf(screenOf(`Tarea 7 — Algo\n\nDe qué trata.\n\n- **Origen:** team-backlog\n- **Detalles:** contexto\n\n${sections(steps(0, 2))}`), "EN PROGRESO");
      expect(rows.slice(-2)).toEqual(["Descripción:", "  De qué trata."]);
      expect(rows.join("\n")).not.toMatch(/Origen|Detalles|contexto/);
    });

    describe("textos largos", () => {
      const long = "Cambiar cómo se muestra la tarea en progreso del tablero, sin tocar el formato interno del archivo: una línea clara de estado, la descripción en su propia línea y las decisiones bajo un subtítulo. ".repeat(3);
      const url = "https://ejemplo.com/una/ruta/muy/larga/que/no/tiene/espacio/donde/cortarse";
      const current = `Tarea 7 — Algo\n\n${long}\n\n${sections(steps(1, 2), `Decidido: ${url} 日本語のテキスト ✏️ 👨‍👩‍👧 más.`)}`;

      test("se parten por palabras: la descripción en hasta 3 líneas con «…» si hay más, sin romper el recuadro", () => {
        const rows = rowsOf(screenOf(current, undefined, { width: 60 }), "EN PROGRESO");
        const at = rows.indexOf("Descripción:");
        expect(rows.slice(at + 1, at + 4).every((r) => r.startsWith("  ") && visibleLength(r) <= 56)).toBe(true);
        expect(rows[at + 3].endsWith("…")).toBe(true);
        expect(rows[at + 4]).toBe("Decisiones a medio camino:");
        // Nada de la descripción pasa de la tercera línea.
        expect(rows.slice(at + 1, at + 4).join(" ").length).toBeLessThan(long.length);
      });

      test("sin «…» cuando entra en 3 líneas; una palabra sin espacios se parte entre caracteres y no se pierde", () => {
        const rows = rowsOf(screenOf(current, undefined, { width: 60 }), "EN PROGRESO");
        const decisions = rows.slice(rows.indexOf("Decisiones a medio camino:") + 1);
        expect(decisions.length).toBeLessThanOrEqual(3);
        expect(decisions.join("").replace(/\s/g, "")).toContain(url);
        expect(decisions.at(-1)?.endsWith("…")).toBe(false);
        expect(decisions.every((r) => visibleLength(r) <= 56)).toBe(true);
      });

      test("el borde derecho queda alineado (medido con visibleLength) con y sin color, en varios anchos y con pausadas largas", () => {
        const paused = `### Tarea 8 — Otra\n\n- **Descripción:** ${long}\n- **Decisiones a medio camino:** ${url} ${url}\n- **Por qué se pausó:** ${long}\n- **Qué espera para retomarse:** ${url}`;
        for (const color of [false, true]) {
          for (const width of [40, 60, 100]) {
            const lines = boxLines(screenOf(current, paused, { width, color }));
            expect(lines.length).toBeGreaterThan(10);
            for (const line of lines) expect(visibleLength(line)).toBe(width);
          }
        }
      });
    });

    test("pausada: título, estado con pasos, descripción, decisiones y, al final, sus campos propios", () => {
      const paused = [
        "### Tarea 8 — Migrar la documentación",
        "",
        "- **Descripción:** Mover lo viejo.",
        "- **Plan:**",
        "  - [x] Paso 1 — Copiar",
        "  - [ ] Paso 2 — Revisar",
        "  - [ ] Paso 3 — Documentar cierre de tarea",
        "- **Modo de ejecución acordado:** guided",
        "- **Qué falta:** Pasos 2 y 3.",
        "- **Decisiones a medio camino:** Conservar `setup.md`.",
        "- **Próximo paso concreto:** Paso 2.",
        "- **Por qué se pausó:** Surgió una prioridad mayor.",
        "- **Qué espera para retomarse:** Que se cierre la Tarea 12.",
      ].join("\n");
      const out = screenOf("Sin tarea en curso", paused);
      expect(rowsOf(out, "PAUSADAS (1)")).toEqual([
        "• Tarea 8 — Migrar la documentación",
        "    Modo  ✏️ Guiado",
        "    Estado: Paso 2 de 3 [████░░░░░░░░]",
        "      ✔ Paso 1 — Copiar",
        "      ▸ Paso 2 — Revisar",
        "      ○ Paso 3 — Documentar cierre de tarea",
        "    Descripción:",
        "      Mover lo viejo.",
        "    Decisiones a medio camino:",
        "      Conservar setup.md.",
        "    Por qué se pausó:",
        "      Surgió una prioridad mayor.",
        "    Qué espera para retomarse:",
        "      Que se cierre la Tarea 12.",
      ]);
      for (const hidden of ["Qué falta", "Pasos 2 y 3", "Próximo paso"]) expect(out).not.toContain(hidden);
    });

    test("pausada sin plan, descripción ni decisiones: solo el título y sus campos propios", () => {
      const paused = "### Tarea 8 — Algo\n\n- **Qué falta:** todo.\n- **Decisiones a medio camino:** Ninguna.\n- **Por qué se pausó:** Prioridad.\n- **Qué espera para retomarse:** Nada.";
      expect(rowsOf(screenOf("Sin tarea en curso", paused), "PAUSADAS (1)")).toEqual([
        "• Tarea 8 — Algo",
        "    Por qué se pausó:",
        "      Prioridad.",
        "    Qué espera para retomarse:",
        "      Nada.",
      ]);
    });

    test("colores: subtítulos en gris secundario, valores sin color", () => {
      const out = screenOf(`Tarea 7 — Algo\n\nDe qué trata.\n\n${sections(steps(1, 2), "Usar A.")}`, undefined, { color: true });
      const row = (text: string) => out.split("\n").find((l) => l.includes(text)) ?? "";
      expect(row("Descripción:")).toContain("\x1b[38;5;250mDescripción:\x1b[39m");
      expect(row("Decisiones a medio camino:")).toContain("\x1b[38;5;250mDecisiones a medio camino:\x1b[39m");
      expect(row("De qué trata.")).not.toMatch(/\x1b\[38;5;250m/);
      expect(row("Usar A.")).not.toMatch(/\x1b\[38;5;250m/);
    });
  });

  test("backlog compacto con T-N, grupos y dependencias de las bloqueadas", () => {
    const out = screen("es-anchors");
    expect(rowWith(out, "T-1:")).toBe("T-1: Probar el flujo completo");
    expect(rowWith(out, "Grupo:")).toBe("◇ Grupo: Documentar los planes (T-14, T-15)");
    expect(rowWith(out, "T-14: Redactar")).toBe("  · T-14: Redactar costs.md");
    expect(rowWith(out, "T-4: Deploy")).toBe("T-4: Deploy en skills.sh [dependencia]");
    expect(rowWith(out, "espera T-3")).toBe("     → espera T-3: Exportar como skill");
    expect(rowWith(out, "T-5:")).toBe("T-5: Rehacer el README [postergada]");
    expect(rowWith(out, "espera T-4")).toBe("     → espera T-4: Deploy en skills.sh");
    expect(out).not.toContain("Tarea 4 —");
  });

  test("pausadas y bloqueadas no aparecen cuando no hay ninguna", () => {
    const backlogText = "<!-- agent-context-skill:section=free -->\n## Tareas libres\n\n### Tarea 1 — Algo libre\n\n- **Descripción:** x\n";
    const out = render(buildModel({ handoffText: fixture("minimal", "handoff.md"), backlogText }), meta);
    expect(out).toContain("╭─ LIBRES (1)");
    expect(out).not.toContain("PAUSADAS");
    expect(out).not.toContain("BLOQUEADAS");
    // Con tareas pausadas y bloqueadas sí aparecen.
    const full = screen("es-anchors");
    expect(full).toContain("╭─ PAUSADAS");
    expect(full).toContain("╭─ BLOQUEADAS");
  });

  test("estados vacíos y set mínimo (sin backlog ni history)", () => {
    const out = screen("minimal", { trigger: { kind: "change", file: "handoff.md" } });
    expect(rowWith(out, "Sin tarea")).toBe("Sin tarea en curso");
    expect(out).not.toContain("PAUSADAS");
    expect(out).not.toContain("LIBRES");
    expect(out).not.toContain("history.md");
    expect(out).toContain("Sin backlog.md");
    expect(out).toContain("· se modificó handoff.md");
    expect(out.split("\n").filter((l) => l.startsWith("╭"))).toHaveLength(1);
  });

  test("pie según los controles disponibles", () => {
    expect(screen("minimal", { controls: "keys", width: 140 })).toContain("[c] compactar - [f] ocultar flechas - [r] redibujar - [o] observar - [Ctrl+C o q] salir");
    expect(screen("minimal", { controls: "keys", compact: true, arrows: false, width: 140 })).toContain("[c] expandir - [f] mostrar flechas - [r] redibujar - [o] observar - [Ctrl+C o q] salir");
    expect(screen("minimal")).toContain("[Ctrl+C] salir");
    expect(screen("minimal", { controls: "none" })).not.toContain("Ctrl+C");
  });

  test("el pie se parte en más líneas si no entra, y «salir» nunca se recorta", () => {
    const full = "[e] equipo - [p] proyectos - [c] compactar - [f] ocultar flechas - [r] redibujar - [o] observar - [Ctrl+C o q] salir";
    expect(screen("minimal", { controls: "keys", multiView: "operator", width: 140 })).toContain(full);
    const narrow = screen("minimal", { controls: "keys", multiView: "operator", width: 60 }).split("\n");
    const at = narrow.findIndex((l) => l.startsWith("[e] equipo"));
    const footer = narrow.slice(at).filter(Boolean);
    expect(footer.length).toBeGreaterThan(1);
    for (const line of footer) expect(visibleLength(line)).toBeLessThanOrEqual(60);
    expect(footer.join(" - ").replace(/ - - /g, " - ")).toContain("[Ctrl+C o q] salir");
    expect(footer.join(" ")).not.toContain("…");
  });

  test("colores: bordes en gris salvo en progreso, completadas (nombre y fecha) en su gris, título verde, secundarios en gris claro", () => {
    const out = screen("es-anchors", { color: true });
    const tops = out.split("\n").filter((l) => l.includes("╭─"));
    const top = (title: string) => {
      const line = tops.find((l) => l.includes(title));
      if (!line) throw new Error(`no se encontró el recuadro "${title}"`);
      return line;
    };
    for (const title of ["TAREAS COMPLETADAS", "PAUSADAS", "LIBRES", "BLOQUEADAS"]) {
      expect(top(title).startsWith("\x1b[90m╭─ ")).toBe(true);
    }
    expect(top("EN PROGRESO").startsWith("\x1b[32m╭─ ")).toBe(true);
    expect(top("TAREAS COMPLETADAS")).toContain("\x1b[38;2;109;176;123mTAREAS COMPLETADAS");
    // Completadas: el nombre y la fecha en el mismo gris.
    // El prefijo T-N en el verde del título; el resto del nombre en el gris de las completadas.
    expect(out).toMatch(/\x1b\[38;2;109;176;123mT-\d+\x1b\[39m\x1b\[38;5;245m: /);
    expect(out).toMatch(/\x1b\[38;5;245m · \d{4}-\d{2}-\d{2}/);
    // Textos secundarios (archivo del borde) en el gris claro.
    expect(top("EN PROGRESO")).toContain("\x1b[38;5;250mhandoff.md");
    expect(out).not.toContain("\x1b[2m");
  });
});

describe("helpers del render", () => {
  test("triggerText", () => {
    expect(triggerText({ kind: "start" })).toBe("al iniciar");
    expect(triggerText({ kind: "change", file: "backlog.md" })).toBe("se modificó backlog.md");
    expect(triggerText({ kind: "change", file: null })).toBe("cambio detectado");
    expect(triggerText({ kind: "redraw" })).toBe("redibujado");
  });

  test("dependencyText con la pista de la Regla 8 si ya está cerrada", () => {
    expect(dependencyText({ number: 3, title: "Exportar", closed: false })).toBe("→ espera T-3: Exportar");
    expect(dependencyText({ number: 9, title: null, closed: true })).toBe("→ espera T-9 (cerrada ✔ — ¿moverla a libres?)");
  });

  test("screenWidth: pedido, mínimo 40 y COLUMNS si no hay terminal", () => {
    expect(screenWidth(120)).toBe(120);
    expect(screenWidth(10)).toBe(40);
    if (process.stdout.columns == null) {
      const saved = process.env.COLUMNS;
      try {
        process.env.COLUMNS = "77";
        expect(screenWidth()).toBe(77);
        delete process.env.COLUMNS;
        expect(screenWidth()).toBe(100);
      } finally {
        if (saved === undefined) delete process.env.COLUMNS;
        else process.env.COLUMNS = saved;
      }
    }
  });
});
