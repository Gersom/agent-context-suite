import { describe, expect, test } from "bun:test";
import { entryLabels, fieldLabels, parseLabelsValue } from "../../tasks/labels.ts";

describe("parseLabelsValue", () => {
  test("separadas por espacios, sin `#`", () => {
    expect(parseLabelsValue("empresa1 trabajo ideasBrillantes")).toEqual(["empresa1", "trabajo", "ideasBrillantes"]);
  });

  test("tolera un `#` inicial, comas y espacios de más", () => {
    expect(parseLabelsValue("  #empresa1,  trabajo ")).toEqual(["empresa1", "trabajo"]);
  });

  test("vacío, solo espacios, null o placeholder de la plantilla: sin etiquetas", () => {
    expect(parseLabelsValue("")).toEqual([]);
    expect(parseLabelsValue("   ")).toEqual([]);
    expect(parseLabelsValue(null)).toEqual([]);
    expect(parseLabelsValue(undefined)).toEqual([]);
    expect(parseLabelsValue("[Placeholder: etiquetas]")).toEqual([]);
  });

  test("«Ninguna» es una etiqueta válida, no la ausencia de etiquetas", () => {
    expect(parseLabelsValue("Ninguna")).toEqual(["Ninguna"]);
  });
});

describe("fieldLabels", () => {
  test("lee el campo por su etiqueta en español o inglés, sin distinguir mayúsculas", () => {
    expect(fieldLabels([{ label: "Descripción", value: "x" }, { label: "Etiquetas", value: "a b" }])).toEqual(["a", "b"]);
    expect(fieldLabels([{ label: "Tags", value: "a b" }])).toEqual(["a", "b"]);
    expect(fieldLabels([{ label: "ETIQUETAS", value: "a" }])).toEqual(["a"]);
    expect(fieldLabels([{ label: "tags", value: "a" }])).toEqual(["a"]);
  });

  test("si el campo se repite, vale el último; sin el campo o con valor vacío, `[]`", () => {
    expect(fieldLabels([{ label: "Etiquetas", value: "a" }, { label: "Tags", value: "b" }])).toEqual(["b"]);
    expect(fieldLabels([{ label: "Descripción", value: "x" }])).toEqual([]);
    expect(fieldLabels([{ label: "Etiquetas", value: "" }])).toEqual([]);
    expect(fieldLabels([])).toEqual([]);
  });
});

describe("entryLabels", () => {
  test("formato real del task-manager: línea en blanco, Origen + Etiquetas y luego el resumen", () => {
    expect(entryLabels("\n- **Origen:** team-backlog\n- **Etiquetas:** a b\n- Se hizo A.\n")).toEqual(["a", "b"]);
    expect(entryLabels("- **Etiquetas:** a b\n- Se hizo A.")).toEqual(["a", "b"]);
  });

  test("en inglés (Tags), sin distinguir mayúsculas", () => {
    expect(entryLabels("\n- **Origin:** team-backlog\n- **Tags:** company1 work\n- Done.\n- **Tags:** x y")).toEqual(["company1", "work"]);
    expect(entryLabels("\n- **TAGS:** a")).toEqual(["a"]);
  });

  test("una viñeta del resumen posterior al bloque no pisa las reales", () => {
    expect(entryLabels("\n- **Etiquetas:** a b\n- Se hizo A.\n- **Etiquetas:** x y")).toEqual(["a", "b"]);
    expect(entryLabels("\n- **Etiquetas:** a b\n\n- **Etiquetas:** x y")).toEqual(["a", "b"]);
  });

  test("dentro de un bloque de código no cuenta", () => {
    expect(entryLabels("\n- **Etiquetas:** a b\n```\n- **Etiquetas:** x y\n```")).toEqual(["a", "b"]);
    expect(entryLabels("\n```\n- **Etiquetas:** x y\n```")).toEqual([]);
    expect(entryLabels("\n~~~\n- **Etiquetas:** x y\n~~~")).toEqual([]);
  });

  test("solo la línea de resumen, sin campo real: `[]`", () => {
    expect(entryLabels("\n- Se hizo A.\n- **Etiquetas:** x y")).toEqual([]);
    expect(entryLabels("\nTexto suelto.\n- **Etiquetas:** x y")).toEqual([]);
    expect(entryLabels("\n- **Origen:** team-backlog\n- Se hizo A.\n- **Etiquetas:** x y")).toEqual([]);
    expect(entryLabels("")).toEqual([]);
  });

  test("si el bloque repite el campo, vale el primero", () => {
    expect(entryLabels("\n- **Etiquetas:** a\n- **Tags:** b")).toEqual(["a"]);
  });

  test("ignora comentarios HTML, y un campo con continuación sangrada no corta el bloque", () => {
    expect(entryLabels("\n<!-- - **Etiquetas:** z -->\n- **Etiquetas:** a")).toEqual(["a"]);
    expect(entryLabels("\n- **Origen:** x\n  sigue\n- **Etiquetas:** a")).toEqual(["a"]);
    expect(entryLabels("\n- **Origen:** x\n<!-- nota -->\n- **Etiquetas:** a")).toEqual(["a"]);
  });

  test("CRLF crudo: lee las etiquetas", () => {
    expect(entryLabels("\r\n- **Origen:** team-backlog\r\n- **Etiquetas:** a b\r\n- Listo.\r\n")).toEqual(["a", "b"]);
    expect(entryLabels("\r\n- **Etiquetas:** a b\r\n- **Etiquetas:** x y\r\n")).toEqual(["a", "b"]);
  });
});
