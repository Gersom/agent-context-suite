import { describe, expect, test } from "bun:test";
import { displayProjectName, plainText, progressBar, shortTaskName, truncate, visibleLength, wrapText } from "../../src/ui/format.ts";

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

  test("plainText quita las secuencias ANSI y los caracteres de control", () => {
    expect(plainText("\x1b[31mrojo\x1b[0m y \x1b]0;título\x07normal")).toBe("rojo y normal");
    expect(plainText("a\x07b\tc\x7fd\r")).toBe("a b c d ");
    expect(plainText("uno\ndos")).toBe("uno\ndos");
  });

  test("plainText: un OSC sin terminar no se come las líneas siguientes, los C1 se quitan y una negrita no cruza una línea en blanco", () => {
    expect(plainText("\x1b]0;tit\nlinea2")).toBe(" \nlinea2".slice(1) === "\nlinea2" ? "\nlinea2" : "\nlinea2");
    expect(plainText("a\u009b31mb")).toBe("a 31mb");
    expect(plainText("**uno\n\n**dos")).toBe("**uno\n\n**dos");
  });

  test("plainText quita una negrita que cruza un salto de línea", () => {
    expect(plainText("**una\nnegrita** fin")).toBe("una\nnegrita fin");
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

describe("wrapText", () => {
  test("parte por palabras en líneas de a lo sumo `width` columnas y descarta las líneas en blanco", () => {
    expect(wrapText("uno dos tres cuatro", 9)).toEqual(["uno dos", "tres", "cuatro"]);
    expect(wrapText("uno\n\n  dos   tres  ", 20)).toEqual(["uno", "dos tres"]);
    expect(wrapText("", 10)).toEqual([]);
  });

  test("una palabra más larga que el ancho se parte entre grafemas, sin perder nada", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    const lines = wrapText("a ✏️✏️✏️✏️ 日本語日本語", 5);
    expect(lines.join("").replace(/\s/g, "")).toBe("a✏️✏️✏️✏️日本語日本語");
    for (const line of lines) expect(visibleLength(line)).toBeLessThanOrEqual(5);
  });

  test("con más de `maxLines` líneas quedan esas y la última termina en «…» sin pasar del ancho", () => {
    expect(wrapText("uno dos tres cuatro", 9, 2)).toEqual(["uno dos", "tres…"]);
    expect(wrapText("uno dos tres", 7, 2)).toEqual(["uno dos", "tres"]);
    expect(wrapText("uno dos tres cuatro", 3, 2)).toEqual(["uno", "do…"]);
  });
});
