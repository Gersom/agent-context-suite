import { describe, expect, test } from "bun:test";
import { parseHandoff } from "../../parse/handoff.ts";
import { normalizeTitle } from "../../parse/markdown.ts";
import { EXECUTION_MODES, isExecutionMode, modeLines, parseModeLine, partOf, planSubsections } from "../../parse/plan-mode.ts";

const handoff = (plan: string) => `<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 3 — Algo

### Plan

${plan}

### Qué falta

Todo.
`;

const lines = (text: string) => modeLines(text, parseHandoff(text).inProgress.subsections);

describe("partOf", () => {
  test("reconoce el título en español e inglés, sin acentos ni mayúsculas", () => {
    expect(partOf("Plan")).toBe("plan");
    expect(partOf("QUE FALTA")).toBe("missing");
    expect(partOf("What's left")).toBe("missing");
    expect(partOf("Modo de ejecución acordado")).toBe("mode");
    expect(partOf("agreed execution mode")).toBe("mode");
    expect(partOf("Por qué se pausó")).toBe("why");
  });

  test("acepta texto después de la etiqueta si lo separa un signo, pero no una palabra pegada", () => {
    expect(partOf("Plan (versión 2)")).toBe("plan");
    expect(partOf("Planificación")).toBeNull();
    expect(partOf("Otra cosa")).toBeNull();
  });
});

describe("normalizeTitle", () => {
  test("quita acentos y mayúsculas y colapsa espacios", () => {
    expect(normalizeTitle("  Próximo   PASO ")).toBe("proximo paso");
  });
});

describe("isExecutionMode", () => {
  test("solo los cuatro modos, exactos", () => {
    expect([...EXECUTION_MODES]).toEqual(["guided", "step-by-step", "auto", "extreme"]);
    for (const mode of EXECUTION_MODES) expect(isExecutionMode(mode)).toBe(true);
    for (const legacy of ["Auto", "seguidos", "auto ", "", "paso a paso"]) expect(isExecutionMode(legacy)).toBe(false);
  });
});

describe("parseModeLine", () => {
  test("lee el valor con la etiqueta en español o inglés", () => {
    expect(parseModeLine("**Modo de ejecución acordado:** auto")).toEqual({ value: "auto" });
    expect(parseModeLine("**Agreed execution mode:** guided")).toEqual({ value: "guided" });
  });

  test("línea de modo sin valor: `null`", () => {
    expect(parseModeLine("**Modo de ejecución acordado:**")).toEqual({ value: null });
    expect(parseModeLine("**Agreed execution mode:**   ")).toEqual({ value: null });
  });

  test("lo que no es una línea de modo, `undefined`", () => {
    expect(parseModeLine("- [ ] Paso 1 — a")).toBeUndefined();
    expect(parseModeLine("**Otro campo:** auto")).toBeUndefined();
    expect(parseModeLine("Modo de ejecución acordado: auto")).toBeUndefined();
  });
});

describe("planSubsections", () => {
  test("la titulada «Plan» o, sin título conocido, la que trae checkboxes", () => {
    const text = `<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 3 — Algo

### Pasos a seguir

- [ ] Paso 1 — a

### Qué falta

- [ ] no es el plan
`;
    expect(planSubsections(parseHandoff(text).inProgress.subsections).map((s) => s.title)).toEqual(["Pasos a seguir"]);
  });
});

describe("modeLines", () => {
  test("ubica la línea con su offset, valor y número de línea, en español e inglés", () => {
    for (const label of ["Modo de ejecución acordado", "Agreed execution mode"]) {
      const text = handoff(`- [ ] Paso 1 — a\n\n**${label}:** auto`);
      const [found] = lines(text);
      expect(text.slice(found.start, found.end)).toBe(`**${label}:** auto`);
      expect(found).toMatchObject({ value: "auto", line: text.split("\n").indexOf(`**${label}:** auto`) + 1 });
    }
  });

  test("ignora lo que está dentro de comentarios HTML", () => {
    const text = handoff("- [ ] Paso 1 — a\n<!-- **Modo de ejecución acordado:** extreme -->\n**Modo de ejecución acordado:** guided");
    expect(lines(text).map((l) => l.value)).toEqual(["guided"]);
    const multiline = handoff("- [ ] Paso 1 — a\n<!--\n**Modo de ejecución acordado:** extreme\n-->");
    expect(lines(multiline)).toEqual([]);
  });

  test("texto legado: devuelve el valor tal como está escrito", () => {
    expect(lines(handoff("- [ ] Paso 1 — a\n**Modo de ejecución acordado:** seguidos, sin parar")).map((l) => l.value)).toEqual(["seguidos, sin parar"]);
  });

  test("línea sin valor: `null`; sin línea de modo, o plan vacío: lista vacía", () => {
    expect(lines(handoff("- [ ] Paso 1 — a\n**Modo de ejecución acordado:**")).map((l) => l.value)).toEqual([null]);
    expect(lines(handoff("- [ ] Paso 1 — a"))).toEqual([]);
    expect(lines(handoff(""))).toEqual([]);
  });

  test("solo mira el plan: una línea de modo en otra subsección no cuenta", () => {
    const text = handoff("- [ ] Paso 1 — a").replace("Todo.", "**Modo de ejecución acordado:** auto");
    expect(lines(text)).toEqual([]);
  });

  test("subsecciones sin posiciones no se miran", () => {
    expect(modeLines("", [{ title: "Plan", body: "**Modo de ejecución acordado:** auto" }])).toEqual([]);
  });
});
