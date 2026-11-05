import { describe, expect, test } from "bun:test";
import { classifyPreamble, DESCRIPTION_LABEL_RE, FIELD_START_RE, matchFieldLine, NONE_RE } from "../../parse/text-fields.ts";

describe("NONE_RE", () => {
  test.each(["Ninguno", "Ninguna.", "ningunos", "NINGUNAS.", "None", "none.", "N/A", "n/a."])("«%s» significa nada", (value) => {
    expect(NONE_RE.test(value)).toBe(true);
  });
  test.each(["Ninguno más", "No aplica", "Nada", "None of them", "", "ningún", "Ninguna cosa."])("«%s» no", (value) => {
    expect(NONE_RE.test(value)).toBe(false);
  });
});

describe("FIELD_START_RE", () => {
  test("abre con `- **X:** v` y con `- **X**: v` (también con `*`) y captura la etiqueta", () => {
    expect("- **Origen:** la Tarea 3".match(FIELD_START_RE)?.[1]).toBe("Origen");
    expect("- **Detalles**: más".match(FIELD_START_RE)?.[1]).toBe("Detalles");
    expect("* **Descripción:** texto".match(FIELD_START_RE)?.[1]).toBe("Descripción");
  });
  test("sin captura se usa solo para saber si la línea abre un campo", () => {
    expect(FIELD_START_RE.test("- **Origen:** x")).toBe(true);
    expect(FIELD_START_RE.test("- **Origen**: x")).toBe(true);
    // Sin estado: repetir la prueba da lo mismo.
    expect(FIELD_START_RE.test("- **Origen:** x")).toBe(true);
  });
  test("no abre un campo: texto libre, negrita sin dos puntos, sin viñeta o sangrado", () => {
    expect(FIELD_START_RE.test("Texto libre")).toBe(false);
    expect(FIELD_START_RE.test("- **Solo negrita** y nada más")).toBe(false);
    expect(FIELD_START_RE.test("**Origen:** sin viñeta")).toBe(false);
    expect(FIELD_START_RE.test("  - **Origen:** sangrado")).toBe(false);
  });
});

describe("DESCRIPTION_LABEL_RE", () => {
  test("reconoce la etiqueta en español e inglés, sin importar mayúsculas", () => {
    for (const label of ["Descripción", "descripcion", "Description", "DESCRIPTION"]) expect(DESCRIPTION_LABEL_RE.test(label)).toBe(true);
    for (const label of ["Detalles", "Descripción larga", ""]) expect(DESCRIPTION_LABEL_RE.test(label)).toBe(false);
  });
});

describe("classifyPreamble", () => {
  const kinds = (text: string, options?: { looseOrigin?: boolean }) => classifyPreamble(text, options).map((l) => `${l.kind}:${l.text}`);

  test("texto libre: todo es texto, con las líneas en blanco", () => {
    expect(kinds("Primera.\n\nSegunda.")).toEqual(["text:Primera.", "text:", "text:Segunda."]);
  });

  test("un campo y sus líneas indentadas (continuación); lo que sigue sin sangría vuelve a ser texto", () => {
    const text = "Descripción.\n- **Detalles:** uno\n  dos\n  tres\nOtra línea.";
    expect(kinds(text)).toEqual(["text:Descripción.", "field:- **Detalles:** uno", "continuation:  dos", "continuation:  tres", "text:Otra línea."]);
  });

  test("una línea en blanco no corta el campo: su continuación sigue", () => {
    expect(kinds("- **Detalles:** uno\n\n  dos")).toEqual(["field:- **Detalles:** uno", "text:", "continuation:  dos"]);
  });

  test("una línea indentada sin campo antes es texto", () => {
    expect(kinds("  sangrada\n- **A:** x")).toEqual(["text:  sangrada", "field:- **A:** x"]);
  });

  test("los comentarios HTML no cuentan", () => {
    const text = "<!-- nota -->Texto\n- **Origen:** x <!-- oculto -->\n<!--\n  multilínea\n-->\n  sigue";
    expect(kinds(text)).toEqual(["text:Texto", "field:- **Origen:** x ", "text:", "continuation:  sigue"]);
  });

  test("`Origen:` suelto es texto salvo con looseOrigin, que lo trata como un campo (también `Origin:` y en negrita)", () => {
    const text = "Origen: la Tarea 3\n  continúa\nTexto";
    expect(kinds(text)).toEqual(["text:Origen: la Tarea 3", "text:  continúa", "text:Texto"]);
    expect(kinds(text, { looseOrigin: true })).toEqual(["field:Origen: la Tarea 3", "continuation:  continúa", "text:Texto"]);
    expect(kinds("**Origin:** x\nTexto", { looseOrigin: true })).toEqual(["field:**Origin:** x", "text:Texto"]);
  });

  test("cada línea trae su offset", () => {
    const text = "Uno\n- **A:** x\n  y";
    expect(classifyPreamble(text).map((l) => text.slice(l.offset, l.offset + l.text.length))).toEqual(["Uno", "- **A:** x", "  y"]);
  });

  test("maskComments conserva las posiciones: el comentario queda en blanco, no se quita", () => {
    const text = "<!-- nota -->Texto\n- **A:** x <!-- oculto -->\n<!--\n  multilínea\n-->\n  sigue";
    const lines = classifyPreamble(text, { maskComments: true });
    expect(lines.map((l) => l.kind)).toEqual(["text", "field", "text", "text", "text", "continuation"]);
    expect(lines.map((l) => l.text.length)).toEqual(text.split("\n").map((l) => l.length));
    expect(lines.map((l) => l.offset)).toEqual([0, 19, 46, 51, 64, 68]);
    expect(lines[0].text.trim()).toBe("Texto");
  });
});

describe("matchFieldLine", () => {
  test("separa el prefijo, la etiqueta y el valor", () => {
    expect(matchFieldLine("- **Resumen:** texto  ")).toEqual({ prefix: "- **Resumen:** ", label: "Resumen", value: "texto  " });
    expect(matchFieldLine("* **Resumen**:")).toEqual({ prefix: "* **Resumen**:", label: "Resumen", value: "" });
  });
  test("lo que no abre un campo da null", () => {
    expect(matchFieldLine("Resumen: texto")).toBeNull();
    expect(matchFieldLine("  - **A:** x")).toBeNull();
  });
});
