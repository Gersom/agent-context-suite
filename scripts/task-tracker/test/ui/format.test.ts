import { describe, expect, test } from "bun:test";
import { displayProjectName, plainText, progressBar, shortTaskName, truncate, visibleLength } from "../../src/ui/format.ts";

describe("helpers de formato", () => {
  test("truncate agrega … y respeta caracteres multibyte", () => {
    expect(truncate("áéíóú-abc", 5)).toBe("áéíó…");
    expect(truncate("corto", 10)).toBe("corto");
  });

  test("truncate trata un emoji con selector de variación como una unidad (ancho 2) y no lo parte", () => {
    const mode = "Modo  ✏️ Guiado";
    expect(visibleLength(mode)).toBe(15);
    expect(truncate(mode, 15)).toBe(mode);
    expect(truncate(mode, 9)).toBe("Modo  ✏️…");
    // No entra entero: se omite completo, no queda el `✏` suelto ni su selector.
    expect(truncate(mode, 8)).toBe("Modo  …");
    for (let max = 2; max <= 15; max++) expect(visibleLength(truncate(mode, max))).toBeLessThanOrEqual(max);
  });

  test("truncate no parte una secuencia unida con ZWJ", () => {
    const text = "ab👨‍👩‍👧cd";
    expect(visibleLength(text)).toBe(6);
    expect(truncate(text, 5)).toBe("ab👨‍👩‍👧…");
    expect(truncate(text, 4)).toBe("ab…");
    for (const emoji of ["📋", "🤖", "🔥"]) {
      for (let max = 2; max <= 8; max++) expect(visibleLength(truncate(`Modo ${emoji} Paso a paso`, max))).toBeLessThanOrEqual(max);
    }
  });

  test("plainText quita negritas y backticks", () => {
    expect(plainText("**sin** `package.json`")).toBe("sin package.json");
  });

  test("progressBar", () => {
    expect(progressBar(0, 0, 4)).toBe("[░░░░]");
    expect(progressBar(2, 4, 4)).toBe("[██░░]");
  });
});

describe("nombres para la pantalla", () => {
  test("displayProjectName: mayúsculas y guiones como espacios (los guiones bajos quedan)", () => {
    expect(displayProjectName("agent-context-suite")).toBe("AGENT CONTEXT SUITE");
    expect(displayProjectName("mi_proyecto-web")).toBe("MI_PROYECTO WEB");
  });

  test("shortTaskName: `T-N: título`, o `T-N` sin título", () => {
    expect(shortTaskName(4, "Deploy en skills.sh")).toBe("T-4: Deploy en skills.sh");
    expect(shortTaskName(12, null)).toBe("T-12");
  });
});
