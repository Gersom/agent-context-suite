// Validación del plan de «Tarea en progreso»: qué líneas rechazan `close` y `pause`, dónde están y
// cómo se cita el formato válido.

import { describe, expect, test } from "bun:test";
import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { UsageError } from "../../src/cli/errors.ts";
import { classifyPlanLine, EXECUTION_MODES, invalidPlanLineMessage, invalidPlanLineMessages, invalidPlanLines, isExecutionMode, modeLines, parseExecutionMode, planFormat, structureProblemMessage, structureProblems } from "../../src/write/handoff.ts";

const handoff = (plan: string) => `<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 3 — Algo

### Plan

${plan}

### Qué falta

Todo.

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

Ninguna.
`;

const invalid = (text: string) => invalidPlanLines(text, parseHandoff(text).inProgress.subsections);

describe("classifyPlanLine", () => {
  test("pasos, línea de modo (en ambos idiomas), «nada» y texto ajeno", () => {
    expect(classifyPlanLine("- [ ] Paso 1 — x")).toEqual({ kind: "step" });
    expect(classifyPlanLine("* [X] Step 1 — x")).toEqual({ kind: "step" });
    expect(classifyPlanLine("**Modo de ejecución acordado:** uno a la vez")).toEqual({ kind: "mode", value: "uno a la vez" });
    expect(classifyPlanLine("**Agreed execution mode:** one at a time")).toEqual({ kind: "mode", value: "one at a time" });
    expect(classifyPlanLine("**Modo de ejecución acordado:**")).toEqual({ kind: "mode", value: null });
    for (const none of ["Ninguno.", "None", "No aplica.", "no aplica"]) expect(classifyPlanLine(none)).toEqual({ kind: "none" });
    for (const bad of ["Una nota suelta.", "**Otra etiqueta:** algo", "-[ ] sin espacio", "Paso 1 — sin checkbox"]) {
      expect(classifyPlanLine(bad)).toEqual({ kind: "invalid" });
    }
  });
});

describe("invalidPlanLines", () => {
  test("un plan válido no tiene líneas inválidas", () => {
    expect(invalid(handoff("- [x] Paso 1 — a\n- [ ] Paso 2 — b\n\n**Modo de ejecución acordado:** seguido"))).toEqual([]);
  });

  test("cita cada línea inválida con su número de línea en el archivo", () => {
    const text = handoff("- [x] Paso 1 — a\nUna nota suelta.\n- [ ] Paso 2 — b\n  Otra nota.");
    const lines = text.split("\n");
    expect(invalid(text)).toEqual([
      { text: "Una nota suelta.", line: lines.indexOf("Una nota suelta.") + 1 },
      { text: "Otra nota.", line: lines.indexOf("  Otra nota.") + 1 },
    ]);
  });

  test("los comentarios HTML (también de varias líneas) no cuentan y no corren los números de línea", () => {
    const text = handoff("<!-- una nota\nen dos líneas -->\n- [ ] Paso 1 — a <!-- ok -->\nTexto suelto.");
    expect(invalid(text)).toEqual([{ text: "Texto suelto.", line: text.split("\n").indexOf("Texto suelto.") + 1 }]);
  });

  test("solo mira el plan: texto ajeno en otras subsecciones no cuenta", () => {
    expect(invalid(handoff("- [ ] Paso 1 — a").replace("Todo.", "Texto libre."))).toEqual([]);
  });

  test("el plan en una subsección con otro título se revisa si trae checkboxes", () => {
    const text = handoff("- [ ] Paso 1 — a\nSuelto.").replace("### Plan", "### Pasos");
    expect(invalid(text).map((l) => l.text)).toEqual(["Suelto."]);
  });

  test("sin tarea en curso o sin subsecciones: nada", () => {
    expect(invalidPlanLines("", [])).toEqual([]);
  });
});

describe("planFormat y mensaje", () => {
  test("usa la etiqueta de modo del idioma", () => {
    expect(planFormat("es")).toBe("pasos `- [ ] Paso N — texto` o `- [x] Paso N — texto`, y la línea de modo `**Modo de ejecución acordado:** <texto>`");
    expect(planFormat("en")).toContain("`**Agreed execution mode:** <text>`");
  });

  test("el mensaje cita la línea, el texto y el formato", () => {
    const message = invalidPlanLineMessage({ text: "Una nota suelta.", line: 12 }, "es");
    expect(message).toContain("(línea 12)");
    expect(message).toContain("«Una nota suelta.»");
    expect(message).toContain("Formato válido: pasos `- [ ] Paso N — texto`");
    expect(invalidPlanLineMessage({ text: "x", line: null }, "es")).not.toContain("(línea");
    expect(invalidPlanLineMessage({ text: "x", line: 3 }, "es", false)).not.toContain("Formato válido");
  });

  test("varios avisos: el formato válido solo va en el primero", () => {
    const [first, second, third] = invalidPlanLineMessages(
      [
        { text: "a", line: 1 },
        { text: "b", line: 2 },
        { text: "c", line: 3 },
      ],
      "es",
    );
    expect(first).toContain("Formato válido");
    expect(second).not.toContain("Formato válido");
    expect(third).toContain("(línea 3)");
    expect(invalidPlanLineMessages([], "es")).toEqual([]);
  });

});

describe("structureProblems", () => {
  const section = (body: string) =>
    `# Handoff\n\n<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\n${body}\n\n<!-- agent-context-skill:section=paused -->\n## Tareas pausadas\n\nNinguna.\n`;
  const problems = (body: string, lang: "es" | "en" = "es") => {
    const text = section(body);
    return structureProblems(text, parseHandoff(text), lang).map(({ kind, line }) => ({ kind, line }));
  };
  const lineOf = (body: string, needle: string) => section(body).split("\n").indexOf(needle) + 1;
  const PLAN = "### Plan\n\n- [ ] Paso 1 — A";

  test("una estructura válida no tiene problemas", () => {
    expect(problems(`Tarea 7 — Algo\n\n${PLAN}\n\n### Qué falta\n\nx\n\n### Próximo paso concreto\n\ny`)).toEqual([]);
    expect(structureProblems("", parseHandoff(""))).toEqual([]);
  });

  test("subsección con título desconocido, con su línea", () => {
    const body = `Tarea 7 — Algo\n\n${PLAN}\n\n### Notas\n\nalgo`;
    expect(problems(body)).toEqual([{ kind: "unknown-subsection", line: lineOf(body, "### Notas") }]);
    expect(problems(`Tarea 7 — Algo\n\n${PLAN}\n\n### Por qué se pausó\n\ny`).map((p) => p.kind)).toEqual(["unknown-subsection"]);
  });

  test("subsección repetida y checkboxes en otra subsección que se toma como segundo plan", () => {
    const repeated = `Tarea 7 — Algo\n\n${PLAN}\n\n### Qué falta\n\nx\n\n### Qué falta\n\ny`;
    expect(problems(repeated).map((p) => p.kind)).toEqual(["repeated-subsection"]);
    const second = `Tarea 7 — Algo\n\n${PLAN}\n\n### Notas\n\n- [ ] otro paso`;
    expect(problems(second).map((p) => p.kind)).toEqual(["repeated-subsection", "checkbox-outside"]);
  });

  test("checkboxes fuera del plan: un problema con la línea del primero y cuántos son; sin plan, todos", () => {
    const body = `Tarea 7 — Algo\n\n- [ ] suelto\n\n${PLAN}\n\n### Qué falta\n\nx`;
    expect(problems(body)).toEqual([{ kind: "checkbox-outside", line: lineOf(body, "- [ ] suelto") }]);
    const loose = "Tarea 7 — Algo\n\n- [ ] a\n- [ ] b\n- [ ] c";
    const text = section(loose);
    const [only, ...rest] = structureProblems(text, parseHandoff(text));
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ kind: "checkbox-outside", count: 3 });
    expect(structureProblemMessage(only)).toContain("(el primero; son 3)");
  });

  test("texto antes de la línea de la tarea", () => {
    expect(problems(`Una nota.\n\nTarea 7 — Algo\n\n${PLAN}`).map((p) => p.kind)).toEqual(["text-before"]);
  });

  test("el mensaje cita el motivo y la línea; las etiquetas válidas siguen el idioma", () => {
    const text = section(`Tarea 7 — Algo\n\n${PLAN}\n\n### Notas\n\nalgo`);
    const [es] = structureProblems(text, parseHandoff(text), "es");
    const [en] = structureProblems(text, parseHandoff(text), "en");
    expect(structureProblemMessage(es)).toContain("«Notas»");
    expect(structureProblemMessage(es)).toContain(`(línea ${es.line})`);
    expect(es.why).toContain("Qué falta");
    expect(en.why).not.toContain("Qué falta");
  });
});

describe("modos de ejecución", () => {
  test("EXECUTION_MODES son los cuatro, siempre en inglés", () => {
    expect([...EXECUTION_MODES]).toEqual(["guided", "step-by-step", "auto", "extreme"]);
    for (const mode of EXECUTION_MODES) expect(isExecutionMode(mode)).toBe(true);
  });

  test("isExecutionMode: solo el valor exacto; el texto libre de antes es legado", () => {
    for (const legacy of ["seguidos", "uno a la vez con confirmación", "[todos los pasos seguidos / uno a la vez]", "Auto", "guided ", "", "step by step"]) {
      expect(isExecutionMode(legacy)).toBe(false);
    }
  });

  test("parseExecutionMode: devuelve el modo (sin espacios en los extremos) y ignora --confirm con los demás", () => {
    expect(parseExecutionMode(" guided ", false)).toBe("guided");
    expect(parseExecutionMode("step-by-step", true)).toBe("step-by-step");
    expect(parseExecutionMode("auto", false)).toBe("auto");
    expect(parseExecutionMode("extreme", true)).toBe("extreme");
  });

  test("parseExecutionMode: un valor inválido o `extreme` sin confirmar es un error de uso", () => {
    expect(() => parseExecutionMode("seguidos", false)).toThrow(UsageError);
    expect(() => parseExecutionMode("seguidos", false)).toThrow("«seguidos» no es un modo de ejecución válido");
    expect(() => parseExecutionMode("extreme", false)).toThrow(UsageError);
    expect(() => parseExecutionMode("extreme", false)).toThrow("exige --confirm");
    expect(() => parseExecutionMode("extreme", false)).toThrow("operador en el chat");
  });
});

describe("modeLines", () => {
  const lines = (text: string) => modeLines(text, parseHandoff(text).inProgress.subsections);

  test("ubica la línea con su offset, valor y número de línea; la etiqueta puede estar en cualquier idioma", () => {
    for (const label of ["Modo de ejecución acordado", "Agreed execution mode"]) {
      const text = handoff(`- [ ] Paso 1 — a\n\n**${label}:** seguidos`);
      const [found] = lines(text);
      expect(text.slice(found.start, found.end)).toBe(`**${label}:** seguidos`);
      expect(found).toMatchObject({ value: "seguidos", line: text.split("\n").indexOf(`**${label}:** seguidos`) + 1 });
    }
  });

  test("sin valor: `null`; sin línea de modo: lista vacía", () => {
    expect(lines(handoff("- [ ] Paso 1 — a\n**Modo de ejecución acordado:**")).map((l) => l.value)).toEqual([null]);
    expect(lines(handoff("- [ ] Paso 1 — a"))).toEqual([]);
  });

  test("ignora los comentarios, deja fuera lo que los sigue en la línea y no cuenta lo de otras subsecciones", () => {
    const text = handoff("<!-- **Modo de ejecución acordado:** viejo -->\n  **Modo de ejecución acordado:** auto <!-- ok -->\n- [ ] Paso 1 — a").replace("Todo.", "**Modo de ejecución acordado:** otro");
    const found = lines(text);
    expect(found.map((l) => l.value)).toEqual(["auto"]);
    expect(text.slice(found[0].start, found[0].end)).toBe("**Modo de ejecución acordado:** auto");
  });
});
