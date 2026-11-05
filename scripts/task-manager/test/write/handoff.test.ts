// Validación del plan de «Tarea en progreso»: qué líneas rechazan `close` y `pause`, dónde están y
// cómo se cita el formato válido.

import { describe, expect, test } from "bun:test";
import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { classifyPlanLine, invalidPlanLineMessage, invalidPlanLines, planFormat } from "../../src/write/handoff.ts";

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
  });
});
