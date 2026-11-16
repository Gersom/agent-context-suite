// El sufijo `(reabierto: motivo)` de un paso del plan: separar, quitar y poner, sin tocar archivos.

import { describe, expect, test } from "bun:test";
import { STRINGS } from "../../src/write/language.ts";
import { formatStepText, hasReopenedMarker, parseStepText, stepBase, withReopened } from "../../src/write/suffix.ts";

const ES = STRINGS.es;
const EN = STRINGS.en;

describe("parseStepText", () => {
  test("un paso sin sufijo es su propio texto", () => {
    expect(parseStepText("Paso 1 — Escribir")).toEqual({ base: "Paso 1 — Escribir" });
    expect(parseStepText("Paso (nota)")).toEqual({ base: "Paso (nota)" });
  });

  test("separa `(reabierto: motivo)` al final, en español o inglés", () => {
    expect(parseStepText("Paso 1 (reabierto: falló)")).toEqual({ base: "Paso 1", reopened: "falló" });
    expect(parseStepText("Step 1 (reopened: it failed)")).toEqual({ base: "Step 1", reopened: "it failed" });
  });

  test("el motivo puede llevar paréntesis", () => {
    expect(parseStepText("Paso 1 (reabierto: falla (ver #3))")).toEqual({ base: "Paso 1", reopened: "falla (ver #3)" });
  });

  test("solo cuenta al final de la línea, con espacio delante y con motivo", () => {
    for (const text of ["Paso 1 (reabierto: falló) y más", "Paso 1(reabierto: falló)", "(reabierto: falló)", "Paso 1 (reabierto: )", "Paso 1 (reabierto: falló"]) {
      expect(parseStepText(text)).toEqual({ base: text });
    }
  });

  test("un paréntesis previo del paso queda en el texto base", () => {
    expect(parseStepText("Paso (nota) (reabierto: x)")).toEqual({ base: "Paso (nota)", reopened: "x" });
  });
});

describe("stepBase / formatStepText / withReopened", () => {
  test("stepBase quita el sufijo y deja el resto igual", () => {
    expect(stepBase("Paso 1 (reabierto: falló)")).toBe("Paso 1");
    expect(stepBase("Paso 1")).toBe("Paso 1");
  });

  test("formatStepText escribe la etiqueta del idioma y es la inversa de parseStepText", () => {
    expect(formatStepText(ES, { base: "Paso 1", reopened: "falló" })).toBe("Paso 1 (reabierto: falló)");
    expect(formatStepText(EN, { base: "Step 1", reopened: "it failed" })).toBe("Step 1 (reopened: it failed)");
    expect(formatStepText(ES, { base: "Paso 1" })).toBe("Paso 1");
    const parts = { base: "Paso 1", reopened: "falla (ver #3)" };
    expect(parseStepText(formatStepText(ES, parts))).toEqual(parts);
  });

  test("withReopened reemplaza el sufijo que traía, de cualquier idioma", () => {
    expect(withReopened(ES, "Paso 1", "nuevo")).toBe("Paso 1 (reabierto: nuevo)");
    expect(withReopened(ES, "Paso 1 (reabierto: viejo)", "nuevo")).toBe("Paso 1 (reabierto: nuevo)");
    expect(withReopened(EN, "Step 1 (reabierto: old)", "new")).toBe("Step 1 (reopened: new)");
  });

  test("hasReopenedMarker reconoce el comienzo del sufijo en ambos idiomas", () => {
    expect(hasReopenedMarker("ver (reabierto: antes)")).toBe(true);
    expect(hasReopenedMarker("see (reopened: before)")).toBe(true);
    expect(hasReopenedMarker("falla (ver #3)")).toBe(false);
  });
});
