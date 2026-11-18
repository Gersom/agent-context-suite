// `parseLabels` / `formatLabels`: la validación y normalización de `--labels` que comparten `add` y `edit`.

import { describe, expect, test } from "bun:test";
import { UsageError } from "../../src/cli/errors.ts";
import { formatLabels, parseLabels } from "../../src/write/labels.ts";

describe("parseLabels", () => {
  test("acepta etiquetas separadas por espacios, comas o ambos, y por saltos de línea", () => {
    expect(parseLabels("labels", "empresa1 trabajo ideasBrillantes")).toEqual(["empresa1", "trabajo", "ideasBrillantes"]);
    expect(parseLabels("labels", "a,b,c")).toEqual(["a", "b", "c"]);
    expect(parseLabels("labels", "a, b ,  c,,d")).toEqual(["a", "b", "c", "d"]);
    expect(parseLabels("labels", "a\nb\r\nc\td")).toEqual(["a", "b", "c", "d"]);
  });

  test("quita un # inicial opcional por etiqueta", () => {
    expect(parseLabels("labels", "#uno dos #tres,#cuatro")).toEqual(["uno", "dos", "tres", "cuatro"]);
  });

  test("conserva el orden y, entre duplicados sin distinguir mayúsculas, la primera forma escrita", () => {
    expect(parseLabels("labels", "Trabajo b #trabajo TRABAJO a B")).toEqual(["Trabajo", "b", "a"]);
    expect(parseLabels("labels", "#a a")).toEqual(["a"]);
  });

  test("letras mayúsculas, minúsculas y números valen", () => {
    expect(parseLabels("labels", "ABC xyz 123 a1B2")).toEqual(["ABC", "xyz", "123", "a1B2"]);
  });

  test("un valor vacío o solo de separadores no tiene etiquetas", () => {
    expect(parseLabels("labels", "")).toEqual([]);
    expect(parseLabels("labels", "  , ,\n")).toEqual([]);
  });

  test("tildes, símbolos y otros caracteres son un error de uso (código 2) con la etiqueta y el carácter", () => {
    for (const [value, label, char] of [
      ["café", "café", "é"],
      ["ok año", "año", "ñ"],
      ["a-b", "a-b", "-"],
      ["a_b", "a_b", "_"],
      ["a.b", "a.b", "."],
      ["#a#b", "#a#b", "#"],
      ["##a", "##a", "#"],
      ["a/b", "a/b", "/"],
      ["x@y", "x@y", "@"],
      ["ok [x]", "[x]", "["],
      ["emoji😀", "emoji😀", "😀"],
    ] as const) {
      let error: unknown;
      try {
        parseLabels("labels", value);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).exitCode).toBe(2);
      expect((error as UsageError).message).toContain(`--labels: la etiqueta «${label}» no es válida`);
      expect((error as UsageError).message).toContain(`«${char}»`);
      expect((error as UsageError).message).toContain("No se escribió nada.");
    }
  });

  test("un # solo es una etiqueta vacía", () => {
    expect(() => parseLabels("labels", "a #")).toThrow("la etiqueta «#» está vacía");
    expect(() => parseLabels("labels", "a #")).toThrow(UsageError);
  });

  test("el error nombra la primera etiqueta inválida y usa el nombre del flag recibido", () => {
    expect(() => parseLabels("tags", "bien mal! peor?")).toThrow("--tags: la etiqueta «mal!»");
  });
});

describe("formatLabels", () => {
  test("las junta con un espacio", () => {
    expect(formatLabels(["a", "b", "c"])).toBe("a b c");
    expect(formatLabels(["solo"])).toBe("solo");
    expect(formatLabels([])).toBe("");
  });
});
