import { describe, expect, test } from "bun:test";
import { type ProjectsKeysState, projectsKeysReduce } from "../../src/cli/projects-keys.ts";

const PATHS = ["/repos/ana", "/repos/gersom", "/repos/luis"];
const CTX = { paths: PATHS };

const list = (selected: string | null = "/repos/ana"): ProjectsKeysState => ({ nav: { selected, opened: null }, adding: null, confirmRemove: null });
const adding = (text: string, selected: string | null = "/repos/ana"): ProjectsKeysState => ({ ...list(selected), adding: text });
const confirming = (path: string, selected: string | null = path): ProjectsKeysState => ({ ...list(selected), confirmRemove: path });

describe("projectsKeysReduce: lista", () => {
  test("q, Q y Ctrl+C salen", () => {
    for (const chunk of ["q", "Q", "\u0003"]) {
      expect(projectsKeysReduce(list(), chunk, CTX)).toEqual({ state: list(), actions: [{ kind: "quit" }], resume: null });
    }
  });

  test("las teclas que van antes de q se atienden y las que van después no", () => {
    const result = projectsKeysReduce(list(), "\u001b[Bq\u001b[B", CTX);
    expect(result.actions).toEqual([{ kind: "redraw" }, { kind: "quit" }]);
    expect(result.state.nav.selected).toBe("/repos/gersom");
  });

  test("r relee la lista y redibuja", () => {
    expect(projectsKeysReduce(list(), "r", CTX)).toEqual({ state: list(), actions: [{ kind: "reload" }, { kind: "redraw" }], resume: null });
    expect(projectsKeysReduce(list(), "R", CTX).actions).toEqual([{ kind: "reload" }, { kind: "redraw" }]);
  });

  test("tras r se detiene y avisa desde qué tecla seguir (las filas pueden haber cambiado)", () => {
    const result = projectsKeysReduce(list(), "r\u001b[B", CTX);
    expect(result.actions).toEqual([{ kind: "reload" }, { kind: "redraw" }]);
    expect(result.resume).toBe(1);
    expect(result.state.nav.selected).toBe("/repos/ana");
    const rest = projectsKeysReduce(result.state, "r\u001b[B", CTX, result.resume ?? 0);
    expect(rest).toEqual({ state: list("/repos/gersom"), actions: [{ kind: "redraw" }], resume: null });
  });

  test("↓ y ↑ mueven la selección y redibujan; sin cambio no hacen nada", () => {
    expect(projectsKeysReduce(list(), "\u001b[B", CTX)).toEqual({ state: list("/repos/gersom"), actions: [{ kind: "redraw" }], resume: null });
    expect(projectsKeysReduce(list(), "\u001b[A", CTX)).toEqual({ state: list("/repos/luis"), actions: [{ kind: "redraw" }], resume: null });
    expect(projectsKeysReduce(list(null), "\u001b[B", { paths: [] })).toEqual({ state: list(null), actions: [], resume: null });
  });

  test("varias flechas en un bloque: un redibujado por cada una", () => {
    const result = projectsKeysReduce(list(), "\u001b[B\u001b[B", CTX);
    expect(result.state.nav.selected).toBe("/repos/luis");
    expect(result.actions).toEqual([{ kind: "redraw" }, { kind: "redraw" }]);
  });

  test("Enter pide abrir el elegido y la selección se queda; no deja nada pendiente en el estado", () => {
    expect(projectsKeysReduce(list("/repos/gersom"), "\r", CTX)).toEqual({
      state: list("/repos/gersom"),
      actions: [{ kind: "open", path: "/repos/gersom" }],
      resume: null,
    });
    expect(projectsKeysReduce(list("/repos/gersom"), "\n", CTX).actions).toEqual([{ kind: "open", path: "/repos/gersom" }]);
  });

  test("Enter sin elegido o con uno que ya no figura no hace nada", () => {
    expect(projectsKeysReduce(list(null), "\r", { paths: [] })).toEqual({ state: list(null), actions: [], resume: null });
    expect(projectsKeysReduce(list("/repos/otro"), "\r", CTX).actions).toEqual([]);
  });

  test("tras Enter se detiene: lo que sigue depende de si el repo se abrió", () => {
    const result = projectsKeysReduce(list(), "\rq", CTX);
    expect(result.actions).toEqual([{ kind: "open", path: "/repos/ana" }]);
    expect(result.resume).toBe(1);
    expect(projectsKeysReduce(result.state, "\rq", CTX, 1)).toEqual({ state: list(), actions: [{ kind: "quit" }], resume: null });
  });

  test("c, f, t, p, e, b, Esc y otras teclas se ignoran en la lista", () => {
    for (const chunk of ["c", "C", "f", "F", "t", "T", "p", "P", "e", "E", "b", "B", "\u007f", "\u001b", "y", "1", "\u001b[C", "\u001b[3~"]) {
      expect(projectsKeysReduce(list(), chunk, CTX)).toEqual({ state: list(), actions: [], resume: null });
    }
  });
});

describe("projectsKeysReduce: observar con o", () => {
  test("o y O piden alternar el observador, sin tocar el estado", () => {
    expect(projectsKeysReduce(list(), "o", CTX)).toEqual({ state: list(), actions: [{ kind: "observe" }], resume: null });
    expect(projectsKeysReduce(list(), "O", CTX).actions).toEqual([{ kind: "observe" }]);
    expect(projectsKeysReduce(list(null), "o", { paths: [] })).toEqual({ state: list(null), actions: [{ kind: "observe" }], resume: null });
  });

  test("o se detiene ahí: lo que sigue en el bloque se atiende desde resume, ya con la vista nueva", () => {
    const first = projectsKeysReduce(list(), "o\u001b[Bq", CTX);
    expect(first.actions).toEqual([{ kind: "observe" }]);
    expect(first.resume).toBe(1);
    expect(first.state).toEqual(list());
    const rest = projectsKeysReduce(first.state, "o\u001b[Bq", CTX, first.resume ?? 0);
    expect(rest.actions).toEqual([{ kind: "redraw" }, { kind: "quit" }]);
    expect(rest.state.nav.selected).toBe("/repos/gersom");
  });

  test("escribiendo una ruta, la o es texto", () => {
    expect(projectsKeysReduce(adding("~/"), "oO", CTX)).toEqual({ state: adding("~/oO"), actions: [{ kind: "redraw" }], resume: null });
  });

  test("a con texto pegado: la o es texto, no una tecla", () => {
    const result = projectsKeysReduce(list(), "a/repos/o", CTX);
    expect(result.state.adding).toBe("/repos/o");
    expect(result.actions).toEqual([{ kind: "clearNotices" }, { kind: "redraw" }]);
  });

  test("confirmando quitar, la o se ignora", () => {
    expect(projectsKeysReduce(confirming("/repos/gersom"), "o", CTX)).toEqual({ state: confirming("/repos/gersom"), actions: [], resume: null });
  });
});

describe("projectsKeysReduce: agregar con a", () => {
  test("a abre la entrada vacía, borra los avisos y redibuja", () => {
    expect(projectsKeysReduce(list(), "a", CTX)).toEqual({ state: adding(""), actions: [{ kind: "clearNotices" }, { kind: "redraw" }], resume: null });
    expect(projectsKeysReduce(list(), "A", CTX).state.adding).toBe("");
  });

  test("a con texto pegado en el mismo bloque: lo que sigue ya es la ruta", () => {
    const result = projectsKeysReduce(list(), "a~/repos/nuevo", CTX);
    expect(result.state.adding).toBe("~/repos/nuevo");
    expect(result.actions).toEqual([{ kind: "clearNotices" }, { kind: "redraw" }]);
  });

  test("a con texto pegado: q, r, x y las demás letras son texto, no teclas", () => {
    expect(projectsKeysReduce(list(), "aqrxbp", CTX).state.adding).toBe("qrxbp");
  });

  test("a con texto pegado: los caracteres de control se ignoran y Retroceso borra", () => {
    expect(projectsKeysReduce(list(), "aab\u007fc", CTX).state.adding).toBe("ac");
    expect(projectsKeysReduce(list(), "aab\u001b[Ac", CTX).state.adding).toBe("abc");
  });

  test("lo que va antes de a se atiende primero; lo que va después de a ya no es navegación", () => {
    const result = projectsKeysReduce(list(), "\u001b[Ba\u001b[B", CTX);
    expect(result.state.nav.selected).toBe("/repos/gersom");
    expect(result.state.adding).toBe("");
    expect(result.actions).toEqual([{ kind: "redraw" }, { kind: "clearNotices" }, { kind: "redraw" }]);
  });

  test("escribiendo: todo es texto (también q, r, p, b, x y a)", () => {
    const result = projectsKeysReduce(adding("~/"), "qrpbxa", CTX);
    expect(result).toEqual({ state: adding("~/qrpbxa"), actions: [{ kind: "redraw" }], resume: null });
  });

  test("escribiendo: Retroceso borra el último carácter", () => {
    expect(projectsKeysReduce(adding("abc"), "\u007f", CTX).state.adding).toBe("ab");
    expect(projectsKeysReduce(adding(""), "\u007f", CTX).state.adding).toBe("");
  });

  test("escribiendo: las flechas y otras secuencias no hacen nada ni mueven la selección", () => {
    const result = projectsKeysReduce(adding("ab"), "\u001b[B\u001b[A", CTX);
    expect(result).toEqual({ state: adding("ab"), actions: [{ kind: "redraw" }], resume: null });
  });

  test("escribiendo: Enter agrega la ruta y la entrada sigue abierta hasta que app.ts lo decida", () => {
    expect(projectsKeysReduce(adding("~/repos/nuevo"), "\r", CTX)).toEqual({
      state: adding("~/repos/nuevo"),
      actions: [{ kind: "submitAdd", text: "~/repos/nuevo" }, { kind: "redraw" }],
      resume: null,
    });
  });

  test("escribiendo: el texto y Enter en el mismo bloque agregan lo escrito hasta Enter", () => {
    const result = projectsKeysReduce(adding("~/"), "repos\rignorado", CTX);
    expect(result.state.adding).toBe("~/repos");
    expect(result.actions).toEqual([{ kind: "submitAdd", text: "~/repos" }, { kind: "redraw" }]);
    expect(projectsKeysReduce(adding("x"), "\n", CTX).actions).toEqual([{ kind: "submitAdd", text: "x" }, { kind: "redraw" }]);
  });

  test("escribiendo: Enter con la entrada vacía pide agregar el texto vacío", () => {
    expect(projectsKeysReduce(adding(""), "\r", CTX).actions).toEqual([{ kind: "submitAdd", text: "" }, { kind: "redraw" }]);
  });

  test("escribiendo: Esc cancela, borra los avisos y redibuja", () => {
    expect(projectsKeysReduce(adding("abc"), "\u001b", CTX)).toEqual({
      state: list(),
      actions: [{ kind: "clearNotices" }, { kind: "redraw" }],
      resume: null,
    });
  });

  test("escribiendo: Ctrl+C sale sin tocar la entrada, aunque venga con más texto", () => {
    expect(projectsKeysReduce(adding("abc"), "\u0003", CTX)).toEqual({ state: adding("abc"), actions: [{ kind: "quit" }], resume: null });
    expect(projectsKeysReduce(adding("abc"), "de\u0003\r", CTX)).toEqual({ state: adding("abc"), actions: [{ kind: "quit" }], resume: null });
  });
});

describe("projectsKeysReduce: quitar con x", () => {
  test("x sin filas no hace nada", () => {
    expect(projectsKeysReduce(list(null), "x", { paths: [] })).toEqual({ state: list(null), actions: [], resume: null });
  });

  test("x con un elegido que ya no figura no hace nada", () => {
    expect(projectsKeysReduce(list("/repos/otro"), "x", CTX)).toEqual({ state: list("/repos/otro"), actions: [], resume: null });
  });

  test("x con una fila elegida pide confirmar, borra los avisos y redibuja", () => {
    expect(projectsKeysReduce(list("/repos/gersom"), "x", CTX)).toEqual({
      state: confirming("/repos/gersom"),
      actions: [{ kind: "clearNotices" }, { kind: "redraw" }],
      resume: null,
    });
    expect(projectsKeysReduce(list(), "X", CTX).state.confirmRemove).toBe("/repos/ana");
  });

  test("pegado como x + Enter en un mismo bloque: pide confirmar pero no contesta", () => {
    const result = projectsKeysReduce(list(), "x\r", CTX);
    expect(result.state.confirmRemove).toBe("/repos/ana");
    expect(result.actions).toEqual([{ kind: "clearNotices" }, { kind: "redraw" }]);
  });

  test("x sin filas descarta el resto del bloque", () => {
    expect(projectsKeysReduce(list(null), "xq", { paths: [] })).toEqual({ state: list(null), actions: [], resume: null });
  });

  test("lo que va antes de x se atiende; lo que va después se descarta", () => {
    const result = projectsKeysReduce(list(), "\u001b[Bxq", CTX);
    expect(result.state).toEqual(confirming("/repos/gersom"));
    expect(result.actions).toEqual([{ kind: "redraw" }, { kind: "clearNotices" }, { kind: "redraw" }]);
  });

  test("confirmando: Enter quita (la confirmación se limpia en el estado) y redibuja", () => {
    expect(projectsKeysReduce(confirming("/repos/gersom"), "\r", CTX)).toEqual({
      state: list("/repos/gersom"),
      actions: [{ kind: "submitRemove", path: "/repos/gersom" }, { kind: "redraw" }],
      resume: null,
    });
    expect(projectsKeysReduce(confirming("/repos/gersom"), "\n", CTX).actions).toEqual([{ kind: "submitRemove", path: "/repos/gersom" }, { kind: "redraw" }]);
  });

  test("confirmando: Esc cancela y redibuja", () => {
    expect(projectsKeysReduce(confirming("/repos/gersom"), "\u001b", CTX)).toEqual({ state: list("/repos/gersom"), actions: [{ kind: "redraw" }], resume: null });
  });

  test("confirmando: n y N cancelan y redibujan", () => {
    for (const chunk of ["n", "N"]) {
      expect(projectsKeysReduce(confirming("/repos/gersom"), chunk, CTX)).toEqual({ state: list("/repos/gersom"), actions: [{ kind: "redraw" }], resume: null });
    }
  });

  test("confirmando: Ctrl+C sale y deja la confirmación como estaba", () => {
    expect(projectsKeysReduce(confirming("/repos/gersom"), "\u0003", CTX)).toEqual({ state: confirming("/repos/gersom"), actions: [{ kind: "quit" }], resume: null });
  });

  test("confirmando: las demás teclas se ignoran (sin acciones ni cambios, ni siquiera un redibujado)", () => {
    for (const chunk of ["q", "x", "y", "b", "a", "r", " ", "\u007f", "\u001b[A", "\u001bOB", "\u001b[3~"]) {
      expect(projectsKeysReduce(confirming("/repos/gersom"), chunk, CTX)).toEqual({ state: confirming("/repos/gersom"), actions: [], resume: null });
    }
  });

  test("confirmando: gana la primera respuesta del bloque", () => {
    expect(projectsKeysReduce(confirming("/repos/gersom"), "qn\r", CTX).actions).toEqual([{ kind: "redraw" }]);
    expect(projectsKeysReduce(confirming("/repos/gersom"), "q\r\u0003", CTX).actions).toEqual([{ kind: "submitRemove", path: "/repos/gersom" }, { kind: "redraw" }]);
  });
});
