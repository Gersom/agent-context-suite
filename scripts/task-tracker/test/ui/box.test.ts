import { describe, expect, test } from "bun:test";
import picocolors from "picocolors";
import { boxBottom, boxRow, boxTop } from "../../src/ui/box.ts";
import { visibleLength } from "../../src/ui/format.ts";

const pc = picocolors.createColors(true);

describe("recuadros", () => {
  test("borde superior: título a la izquierda, archivo a la derecha, ancho exacto", () => {
    expect(boxTop("EN PROGRESO", "handoff.md", 40)).toBe("╭─ EN PROGRESO ─────────── handoff.md ─╮");
    expect(visibleLength(boxTop("EN PROGRESO", "handoff.md", 40))).toBe(40);
  });

  test("borde superior con un título que no entra: se recorta el título, no el archivo", () => {
    const top = boxTop("TAREAS COMPLETADAS (últimas 5) y más texto", "history.md", 40);
    expect(top).toMatch(/^╭─ TAREAS.*… ─ history\.md ─╮$/);
    expect(visibleLength(top)).toBe(40);
  });

  test("fila: contenido con margen, relleno hasta el borde y recorte con …", () => {
    expect(boxRow([{ text: "hola" }], 12)).toBe("│ hola     │");
    expect(boxRow([{ text: "un texto demasiado largo" }], 12)).toBe("│ un text… │");
    expect(visibleLength(boxRow([{ text: "un texto demasiado largo" }], 12))).toBe(12);
  });

  test("fila: el recorte con un emoji de ancho 2 o con selector de variación deja el borde alineado", () => {
    for (const mode of ["✏️ Guiado", "📋 Paso a paso", "🤖 Auto", "🔥 Extremo"]) {
      for (let width = 8; width <= 30; width++) {
        expect(visibleLength(boxRow([{ text: `Modo  ${mode}` }], width))).toBe(width);
        expect(visibleLength(boxRow([{ text: `Modo  ${mode}`, paint: pc.green }], width, pc.green))).toBe(width);
      }
    }
  });

  test("fila: los saltos de línea no rompen el borde", () => {
    expect(boxRow([{ text: "a\n  b" }], 10)).toBe("│ a b    │");
  });

  test("con colores el ancho visible es el mismo", () => {
    const row = boxRow([{ text: "✔ ", paint: pc.dim }, { text: "Paso 1", paint: (s) => pc.dim(pc.strikethrough(s)) }], 30, pc.green);
    expect(visibleLength(row)).toBe(30);
    expect(visibleLength(boxTop("EN PROGRESO", "handoff.md", 30, { border: pc.green, title: pc.bold }))).toBe(30);
    expect(visibleLength(boxBottom(30, pc.green))).toBe(30);
  });

  test("borde inferior", () => {
    expect(boxBottom(6)).toBe("╰────╯");
  });
});
