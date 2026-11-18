// La entrada de history.md que escribe `close`: formato y dónde se inserta.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHistory } from "../../../_shared/parse/history.ts";
import { normalizeEol } from "../../../_shared/parse/positions.ts";
import { applyEdits } from "../../src/edit/edits.ts";
import type { Doc } from "../../src/workspace/docs.ts";
import { bulletize, insertHistoryEntry, renderHistoryEntry } from "../../src/write/history.ts";
import { HISTORY_RICH } from "../fixtures.ts";
import type { ParsedHistory } from "../../../_shared/types.ts";

/** Un history.md en memoria (solo lo que `insertHistoryEntry` lee) y el texto que queda al insertar la entrada. */
function insertInto(raw: string, entry: string): string {
  const eol = normalizeEol(raw);
  const history = { raw, eol, text: eol.text, parsed: parseHistory(eol.text) } as unknown as Doc<ParsedHistory>;
  return applyEdits(raw, eol, insertHistoryEntry(history, entry));
}

const ENTRY = renderHistoryEntry({ date: "2026-10-08", outcome: "done", label: "Tarea", number: 12, title: "Algo", text: "Se hizo." });

describe("bulletize", () => {
  test("cada línea pasa a ser una viñeta; las viñetas y las continuaciones sangradas se conservan; se descartan las líneas en blanco", () => {
    expect(bulletize("Una línea")).toBe("- Una línea");
    expect(bulletize("Primera\n\nSegunda")).toBe("- Primera\n- Segunda");
    expect(bulletize("- Ya viñeta\n  - Sub\n  continúa\n* Otra")).toBe("- Ya viñeta\n  - Sub\n  continúa\n* Otra");
    expect(bulletize("  Texto  \r\n")).toBe("- Texto");
  });
});

describe("renderHistoryEntry", () => {
  test("hecha: header con ✅, línea en blanco y viñetas", () => {
    expect(renderHistoryEntry({ date: "2026-10-08", outcome: "done", label: "Tarea", number: 24, title: "El script", text: "Qué.\nPor qué." })).toBe(
      "## 2026-10-08 — ✅ Tarea 24 — El script\n\n- Qué.\n- Por qué.",
    );
  });

  test("descartada: ❌; el `Origen` de la tarea va primero, tal cual", () => {
    expect(
      renderHistoryEntry({ date: "2026-10-08", outcome: "discarded", label: "Task", number: 3, title: "X", text: "No hace falta.", origin: "- **Origen:** team-backlog  " }),
    ).toBe("## 2026-10-08 — ❌ Task 3 — X\n\n- **Origen:** team-backlog\n- No hace falta.");
  });

  test("las `Etiquetas` de la tarea van tras el `Origen`, tal cual (con la etiqueta de su idioma)", () => {
    expect(
      renderHistoryEntry({ date: "2026-10-08", outcome: "done", label: "Tarea", number: 4, title: "X", text: "Hecho.", origin: "- **Origen:** team-backlog", labels: "- **Etiquetas:** empresa1 trabajo  " }),
    ).toBe("## 2026-10-08 — ✅ Tarea 4 — X\n\n- **Origen:** team-backlog\n- **Etiquetas:** empresa1 trabajo\n- Hecho.");
    expect(renderHistoryEntry({ date: "2026-10-08", outcome: "done", label: "Task", number: 4, title: "X", text: "Done.", labels: "- **Tags:** home" })).toBe(
      "## 2026-10-08 — ✅ Task 4 — X\n\n- **Tags:** home\n- Done.",
    );
  });

  test("el parser de history.md lee bien una entrada con `Etiquetas` y sigue sin tomarla por entrada", () => {
    const entry = renderHistoryEntry({ date: "2026-10-08", outcome: "done", label: "Tarea", number: 4, title: "Con etiquetas", text: "Hecho.", labels: "- **Etiquetas:** a b" });
    const parsed = parseHistory(`# History\n\n---\n\n${entry}\n\n${ENTRY}\n`);
    expect(parsed.entries.map((e) => [e.number, e.title, e.status])).toEqual([[4, "Con etiquetas", "done"], [12, "Algo", "done"]]);
  });

  test("el parser de history.md la reconoce con su número, título y resultado", () => {
    const [entry] = parseHistory(`${renderHistoryEntry({ date: "2026-10-08", outcome: "discarded", label: "Tarea", number: 5, title: "Usar YAML", text: "x" })}\n`).entries;
    expect(entry).toMatchObject({ date: "2026-10-08", status: "discarded", number: 5, label: "Tarea", title: "Usar YAML" });
  });
});

describe("insertHistoryEntry", () => {
  test("arriba de la primera entrada, con una línea en blanco de por medio", () => {
    const out = insertInto(HISTORY_RICH, ENTRY);
    expect(out).toContain("---\n\n## 2026-10-08 — ✅ Tarea 12 — Algo\n\n- Se hizo.\n\n## 2026-10-07 — ✅ Tarea 11 — Escribir el parser");
    expect(parseHistory(out).entries.map((e) => e.number)).toEqual([12, 11, 10, 9, null, 2]);
  });

  test("la plantilla (sin entradas): reemplaza la entrada de ejemplo y conserva el comentario que la precede", () => {
    const template = "# History\n\n---\n\n<!-- Si la skill se agrega de forma retroactiva... -->\n\n## [Placeholder fecha] — ✅ [Placeholder título]\n\n- [Placeholder]\n";
    expect(insertInto(template, ENTRY)).toBe(`# History\n\n---\n\n<!-- Si la skill se agrega de forma retroactiva... -->\n\n${ENTRY}\n`);
  });

  test("la entrada de ejemplo no es la última cosa del archivo: lo que sigue se respeta", () => {
    const text = "# History\n\n## [Placeholder fecha] — ✅ [Placeholder título]\n\n- [Placeholder]\n\n## Notas\n\nAlgo.\n";
    expect(insertInto(text, ENTRY)).toBe(`# History\n\n${ENTRY}\n\n## Notas\n\nAlgo.\n`);
  });

  test("un `##` de plantilla dentro de un comentario o de un bloque de código no cuenta", () => {
    const text = "# History\n\n<!--\n## [Placeholder fecha] — ✅ [Placeholder título]\n-->\n\n```\n## [Placeholder x]\n```\n";
    expect(insertInto(text, ENTRY)).toBe(`# History\n\n<!--\n## [Placeholder fecha] — ✅ [Placeholder título]\n-->\n\n\`\`\`\n## [Placeholder x]\n\`\`\`\n\n${ENTRY}\n`);
  });

  test("sin entradas ni plantilla: al final del archivo, con una línea en blanco de por medio", () => {
    expect(insertInto("# History\n\nIntro.\n", ENTRY)).toBe(`# History\n\nIntro.\n\n${ENTRY}\n`);
    expect(insertInto("", ENTRY)).toBe(`${ENTRY}\n`);
  });

  test("respeta CRLF", () => {
    const out = insertInto(HISTORY_RICH.replace(/\n/g, "\r\n"), ENTRY);
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
    expect(out).toContain("---\r\n\r\n## 2026-10-08 — ✅ Tarea 12 — Algo\r\n\r\n- Se hizo.\r\n\r\n## 2026-10-07");
  });
});

describe("insertHistoryEntry: el «Ninguna.» sobrante", () => {
  const HEAD = "# History\n\nIntro.\n\n---\n\n";

  test("`Ninguna.` sola: se retira y queda la entrada", () => {
    expect(insertInto(`${HEAD}Ninguna.\n`, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
  });

  test("`None.` en inglés, y sin punto o en otra capitalización", () => {
    expect(insertInto(`${HEAD}None.\n`, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
    expect(insertInto(`${HEAD}Ninguna\n`, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
    expect(insertInto(`${HEAD}NONE\n`, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
    expect(insertInto(`${HEAD}ninguna.\n`, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
  });

  test("sin salto de línea final, o con más líneas en blanco al final", () => {
    expect(insertInto(`${HEAD}Ninguna.`, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
    expect(insertInto(`${HEAD}Ninguna.\n\n\n`, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
  });

  test("tras un comentario que la precede: el comentario se conserva", () => {
    expect(insertInto(`${HEAD}<!-- nota -->\n\nNinguna.\n`, ENTRY)).toBe(`${HEAD}<!-- nota -->\n\n${ENTRY}\n`);
  });

  test("encima de entradas existentes: se retira y la entrada va arriba, sin dos líneas en blanco seguidas", () => {
    const old = "## 2026-10-07 — ✅ Tarea 11 — Vieja\n\n- Antes.\n";
    expect(insertInto(`${HEAD}Ninguna.\n\n${old}`, ENTRY)).toBe(`${HEAD}${ENTRY}\n\n${old}`);
    expect(insertInto(`${HEAD}Ninguna.\n${old}`, ENTRY)).toBe(`${HEAD}${ENTRY}\n\n${old}`);
  });

  test("tras una línea de texto sin línea en blanco: solo se quita la línea", () => {
    expect(insertInto("# History\n\n---\nNinguna.\n\nSigue.\n", ENTRY)).toBe(`# History\n\n---\n\nSigue.\n\n${ENTRY}\n`);
  });

  test("con la entrada de plantilla: se retira y la entrada de ejemplo se reemplaza", () => {
    const text = `${HEAD}Ninguna.\n\n## [Placeholder fecha] — ✅ [Placeholder título]\n\n- [Placeholder]\n`;
    expect(insertInto(text, ENTRY)).toBe(`${HEAD}${ENTRY}\n`);
  });

  test("el history.md que deja el perfil no técnico (plantilla con la entrada de ejemplo reemplazada por `Ninguna.`)", () => {
    const installed = readFileSync(join(import.meta.dir, "..", "..", "..", "..", "skill", "template", "agents", "history.md"), "utf8").replace(/\r\n/g, "\n");
    const text = installed.replace(/## \[Placeholder fecha\][\s\S]*$/, "Ninguna.\n");
    expect(text).toContain("-->\n\nNinguna.\n");
    expect(insertInto(text, ENTRY)).toBe(`${text.replace(/Ninguna\.\n$/, "")}${ENTRY}\n`);
  });

  test("la palabra dentro de una entrada, de prosa, de un comentario o de un bloque de código no se toca", () => {
    const text = "# History\n\nNinguna. Prosa.\n\n- Ninguna.\n\n<!--\nNinguna.\n-->\n\n```\nNone.\n```\n\n---\n\n## 2026-10-07 — ✅ Tarea 11 — Vieja\n\n- Antes.\n\nNinguna.\n";
    expect(insertInto(text, ENTRY)).toBe(text.replace("---\n\n## 2026", `---\n\n${ENTRY}\n\n## 2026`));
  });

  test("una línea sola `Ninguna.` bajo otro `##` que no es entrada no se toca", () => {
    const text = "# History\n\n## Notas\n\nNinguna.\n";
    expect(insertInto(text, ENTRY)).toBe(`${text}\n${ENTRY}\n`);
  });

  test("sin `Ninguna.` no cambia nada: el mismo resultado de siempre", () => {
    expect(insertInto("# History\n\nIntro.\n", ENTRY)).toBe(`# History\n\nIntro.\n\n${ENTRY}\n`);
    expect(insertInto(HISTORY_RICH, ENTRY)).toContain("---\n\n## 2026-10-08 — ✅ Tarea 12 — Algo\n\n- Se hizo.\n\n## 2026-10-07");
  });

  test("solo `Ninguna.` en el archivo: queda la entrada", () => {
    expect(insertInto("Ninguna.\n", ENTRY)).toBe(`${ENTRY}\n`);
  });

  test("respeta CRLF", () => {
    const out = insertInto(`${HEAD}Ninguna.\r\n\r\n## 2026-10-07 — ✅ Tarea 11 — Vieja\r\n\r\n- Antes.\r\n`.replace(/\r?\n/g, "\r\n"), ENTRY);
    expect(out).toBe(`${HEAD}${ENTRY}\n\n## 2026-10-07 — ✅ Tarea 11 — Vieja\n\n- Antes.\n`.replace(/\n/g, "\r\n"));
  });
});
