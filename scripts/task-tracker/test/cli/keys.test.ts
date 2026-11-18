import { describe, expect, test } from "bun:test";
import { parseConfirm, parseKeys } from "../../src/cli/keys.ts";

describe("parseKeys", () => {
  test("q, Q y Ctrl+C salen; r y R redibujan; el resto no hace nada", () => {
    expect(parseKeys("qQ\u0003")).toEqual(["quit", "quit", "quit"]);
    expect(parseKeys("rR")).toEqual(["redraw", "redraw"]);
    expect(parseKeys("y 1")).toEqual([]);
  });

  test("p lleva a la lista de proyectos (mayúscula o minúscula)", () => {
    expect(parseKeys("pP")).toEqual(["projects", "projects"]);
  });

  test("a pide agregar un repo (mayúscula o minúscula)", () => {
    expect(parseKeys("aA")).toEqual(["add", "add"]);
  });

  test("x pide quitar de la lista el proyecto elegido (mayúscula o minúscula)", () => {
    expect(parseKeys("xX")).toEqual(["remove", "remove"]);
  });

  test("o activa o desactiva el modo observador (mayúscula o minúscula)", () => {
    expect(parseKeys("oO")).toEqual(["observe", "observe"]);
  });

  test("c compacta o expande y f oculta o muestra las flechas del flujo (mayúscula o minúscula)", () => {
    expect(parseKeys("cC")).toEqual(["compact", "compact"]);
    expect(parseKeys("fF")).toEqual(["flow", "flow"]);
  });

  test("t filtra por etiqueta (mayúscula o minúscula)", () => {
    expect(parseKeys("tT")).toEqual(["label", "label"]);
    expect(parseKeys("ct\u001b[Bf")).toEqual(["compact", "label", "down", "flow"]);
  });

  test("las flechas llegan como secuencias de varios caracteres (CSI y SS3)", () => {
    expect(parseKeys("\u001b[A")).toEqual(["up"]);
    expect(parseKeys("\u001b[B")).toEqual(["down"]);
    expect(parseKeys("\u001bOA\u001bOB")).toEqual(["up", "down"]);
  });

  test("e lleva a la vista de equipo (mayúscula o minúscula)", () => {
    expect(parseKeys("eE")).toEqual(["team", "team"]);
  });

  test("Enter abre", () => {
    expect(parseKeys("\r")).toEqual(["enter"]);
    expect(parseKeys("\n")).toEqual(["enter"]);
  });

  test("b, B, Retroceso y un Esc suelto ya no son teclas del tablero", () => {
    expect(parseKeys("bB")).toEqual([]);
    expect(parseKeys("\u007f\b")).toEqual([]);
    expect(parseKeys("\u001b")).toEqual([]);
    expect(parseKeys("\u001bq")).toEqual(["quit"]);
    expect(parseKeys("\u001b[Ae")).toEqual(["up", "team"]);
  });

  test("otras secuencias (flechas laterales, teclas con parámetros) se ignoran enteras", () => {
    expect(parseKeys("\u001b[C\u001b[D")).toEqual([]);
    expect(parseKeys("\u001b[1;5Aq")).toEqual(["up", "quit"]);
    expect(parseKeys("\u001b[3~")).toEqual([]);
  });

  test("varias teclas en una misma lectura, en orden", () => {
    expect(parseKeys("\u001b[B\u001b[B\r")).toEqual(["down", "down", "enter"]);
  });
});

describe("parseConfirm", () => {
  test("Enter acepta; Esc suelto, n y N cancelan; Ctrl+C sale", () => {
    expect(parseConfirm("\r")).toBe("accept");
    expect(parseConfirm("\n")).toBe("accept");
    expect(parseConfirm("\u001b")).toBe("cancel");
    expect(parseConfirm("nN")).toBe("cancel");
    expect(parseConfirm("\u0003")).toBe("quit");
  });

  test("las demás teclas se ignoran: letras (también q y b), Retroceso, flechas y otras secuencias", () => {
    for (const chunk of ["q", "x", "y", "b", "a", "r", " ", "\u007f", "\u001b[A", "\u001bOB", "\u001b[3~", "\u001b[1;5Aq"]) {
      expect(parseConfirm(chunk)).toBeNull();
    }
  });

  test("gana la primera respuesta del bloque, tras ignorar lo que no contesta", () => {
    expect(parseConfirm("q\u001b[A\r")).toBe("accept");
    expect(parseConfirm("yn\r")).toBe("cancel");
    expect(parseConfirm("\r\u0003")).toBe("accept");
  });
});
