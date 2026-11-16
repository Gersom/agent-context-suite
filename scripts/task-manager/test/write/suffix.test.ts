// El sufijo `(reabierto: motivo)` de un paso del plan: separar, quitar y poner, sin tocar archivos.

import { describe, expect, test } from "bun:test";
import { STRINGS } from "../../src/write/language.ts";
import { formatStepText, hasReopenedMarker, isCommitHash, parseStepText, stepBase, withoutProof, withProof, withReopened } from "../../src/write/suffix.ts";

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

describe("parseStepText: evidencia y commit", () => {
  test("`texto · evidencia · commit hash`, solo evidencia (paso hecho) y solo commit", () => {
    expect(parseStepText("Paso 3 — X · bun test 779 pass · commit abc1234", true)).toEqual({ base: "Paso 3 — X", evidence: "bun test 779 pass", commit: "abc1234" });
    expect(parseStepText("Paso 3 — X · bun test 779 pass", true)).toEqual({ base: "Paso 3 — X", evidence: "bun test 779 pass" });
    expect(parseStepText("Paso 3 — X · commit abc1234", true)).toEqual({ base: "Paso 3 — X", commit: "abc1234" });
    expect(parseStepText("Paso 3 — X · commit abc1234")).toEqual({ base: "Paso 3 — X", commit: "abc1234" });
  });

  test("el commit son 7 a 40 hex y se lee en minúsculas; otra cosa es parte del texto", () => {
    expect(parseStepText("X · commit ABCDEF1", true)).toEqual({ base: "X", commit: "abcdef1" });
    expect(parseStepText(`X · commit ${"a".repeat(40)}`, true).commit).toBe("a".repeat(40));
    for (const text of ["X · commit abc123", `X · commit ${"a".repeat(41)}`, "X · commit xyz1234", "X · commit"]) {
      expect(parseStepText(text).commit).toBeUndefined();
    }
    expect(parseStepText("X · commit abc123")).toEqual({ base: "X · commit abc123" });
  });

  test("en un paso pendiente sin commit, ` · ` es parte del texto; en uno hecho, el último tramo es la evidencia", () => {
    expect(parseStepText("Paso · con punto medio")).toEqual({ base: "Paso · con punto medio" });
    expect(parseStepText("Paso · con punto medio", false)).toEqual({ base: "Paso · con punto medio" });
    expect(parseStepText("Paso · con punto medio", true)).toEqual({ base: "Paso", evidence: "con punto medio" });
    expect(parseStepText("A · B · C", true)).toEqual({ base: "A · B", evidence: "C" });
  });

  test("sin ` · ` no hay evidencia; los separadores sin espacios o sin tramo no cuentan", () => {
    for (const text of ["Paso 1", "Paso·1", "Paso ·1", " · algo", "Paso · "]) expect(parseStepText(text, true).evidence).toBeUndefined();
  });

  test("tolera el sufijo de reabierto en cualquier lado, leyendo desde el final", () => {
    expect(parseStepText("X · bun test · commit abc1234 (reabierto: falló)", true)).toEqual({ base: "X", evidence: "bun test", commit: "abc1234", reopened: "falló" });
    expect(parseStepText("X (reabierto: falló) · commit abc1234", true)).toEqual({ base: "X", commit: "abc1234", reopened: "falló" });
    expect(parseStepText("X (reopened: it failed)")).toEqual({ base: "X", reopened: "it failed" });
  });

  test("un texto de paso hecho que lleva un commit en medio no se rompe: solo cuenta al final", () => {
    expect(parseStepText("X · commit abc1234 y más", true)).toEqual({ base: "X", evidence: "commit abc1234 y más" });
  });
});

describe("stepBase / formatStepText / withReopened", () => {
  test("stepBase quita evidencia y commit según el estado del paso", () => {
    expect(stepBase("Paso 3 — X · bun test · commit abc1234")).toBe("Paso 3 — X");
    expect(stepBase("Paso 3 — X · bun test", true)).toBe("Paso 3 — X");
    expect(stepBase("Paso 3 — X · bun test")).toBe("Paso 3 — X · bun test");
  });

  test("formatStepText escribe `base · evidencia · commit hash` y es la inversa de parseStepText", () => {
    expect(formatStepText(ES, { base: "X", evidence: "bun test", commit: "abc1234" })).toBe("X · bun test · commit abc1234");
    expect(formatStepText(ES, { base: "X", evidence: "bun test" })).toBe("X · bun test");
    expect(formatStepText(ES, { base: "X", commit: "abc1234" })).toBe("X · commit abc1234");
    expect(formatStepText(EN, { base: "X", evidence: "e", commit: "abc1234", reopened: "r" })).toBe("X · e · commit abc1234 (reopened: r)");
    const parts = { base: "X", evidence: "bun test 779 pass", commit: "abc1234", reopened: "falla (ver #3)" };
    expect(parseStepText(formatStepText(ES, parts), true)).toEqual(parts);
  });

  test("withProof pone lo que se pasa, conserva lo demás y quita el reabierto", () => {
    expect(withProof(ES, "X", false, { evidence: "ok" })).toBe("X · ok");
    expect(withProof(ES, "X", false, { commit: "abc1234" })).toBe("X · commit abc1234");
    expect(withProof(ES, "X (reabierto: falló)", false, { evidence: "ok", commit: "abc1234" })).toBe("X · ok · commit abc1234");
    expect(withProof(ES, "X · viejo · commit abc1234", true, { evidence: "nuevo" })).toBe("X · nuevo · commit abc1234");
    expect(withProof(ES, "X · viejo · commit abc1234", true, { commit: "def5678" })).toBe("X · viejo · commit def5678");
    expect(withProof(ES, "X · legítimo", false, { evidence: "ok" })).toBe("X · legítimo · ok");
    expect(withProof(ES, "X", true, {})).toBe("X");
  });

  test("withoutProof quita evidencia y commit y deja intacto un texto que no los trae", () => {
    expect(withoutProof(ES, "X · bun test · commit abc1234")).toBe("X");
    expect(withoutProof(ES, "X · commit abc1234")).toBe("X");
    expect(withoutProof(ES, "X (reopened: viejo)")).toBe("X (reopened: viejo)");
  });

  test("withReopened quita la evidencia y el commit del paso hecho", () => {
    expect(withReopened(ES, "X · bun test · commit abc1234", "falló")).toBe("X (reabierto: falló)");
  });

  test("isCommitHash: 7 a 40 hex", () => {
    expect(["abc1234", "ABCDEF1234", "a".repeat(40)].every(isCommitHash)).toBe(true);
    expect(["abc123", "a".repeat(41), "abcdefg", "", "auto"].some(isCommitHash)).toBe(false);
  });

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
