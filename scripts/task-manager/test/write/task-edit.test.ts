// Funciones puras de `edit`: título, campos (reemplazar o agregar), `Bloqueos` según el estado y el
// preámbulo de «Tarea en progreso». Se prueban sobre texto parseado, sin leer archivos.

import { describe, expect, test } from "bun:test";
import { parseBacklog } from "../../../_shared/parse/backlog.ts";
import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { normalizeEol } from "../../../_shared/parse/positions.ts";
import { parseTeamBacklog } from "../../../_shared/parse/team-backlog.ts";
import { applyEdits, type Edit } from "../../src/edit/edits.ts";
import { trimRange } from "../../src/query/lines.ts";
import {
  backlogPlacement,
  fieldEdits,
  parsePreamble,
  pausedPlacement,
  preambleEdits,
  rejectLeadingTag,
  rejectStructuralLines,
  resolveBlocker,
  setField,
  titleEdit,
} from "../../src/write/task-edit.ts";
import { BACKLOG_ONE, BACKLOG_RICH, HANDOFF_CURRENT, TEAM_TWO } from "../fixtures.ts";

const apply = (text: string, edits: Edit[]) => applyEdits(text, normalizeEol(text), edits);
const label = (kind: string) => ({ details: "Detalles", description: "Descripción", labels: "Etiquetas" })[kind] ?? kind;
/** Cabecera mínima de un backlog.md para las pruebas de campos. */
const BACKLOG_HEAD = "# Backlog\n\n<!-- agent-context-skill:section=free -->\n## Tareas libres\n\n";

describe("titleEdit", () => {
  test("backlog: cambia solo el texto del título y conserva nivel, palabra y número", () => {
    const { free, grouped } = parseBacklog(BACKLOG_RICH);
    const task = free.tasks.find((t) => t.number === 1)!;
    expect(apply(BACKLOG_RICH, [titleEdit(BACKLOG_RICH, trimRange(BACKLOG_RICH, task.range!), "numbered", task.title, "Otro título")])).toBe(
      BACKLOG_RICH.replace("### Tarea 1 — Probar el flujo completo", "### Tarea 1 — Otro título"),
    );
    const nested = grouped[0].tasks[0];
    expect(apply(BACKLOG_RICH, [titleEdit(BACKLOG_RICH, trimRange(BACKLOG_RICH, nested.range!), "numbered", nested.title, "Costos")])).toContain("#### Tarea 14 — Costos\n");
  });

  test("team-backlog: el header no lleva número", () => {
    const task = parseTeamBacklog(TEAM_TWO).free[1];
    expect(apply(TEAM_TWO, [titleEdit(TEAM_TWO, trimRange(TEAM_TWO, task.range!), "team", task.title, "Migrar CI")])).toContain("### Migrar CI\n\n- **Descripción:** pasar a Actions");
  });

  test("la línea de la tarea en curso, con etiqueta en negrita y negritas en el título", () => {
    const text = "## Tarea en progreso\n\n**Tarea:** Tarea 12 — Implementar el **parser** de anclas\n\n### Plan\n";
    const line = text.indexOf("**Tarea:**");
    const range = { start: line, end: text.indexOf("\n", line) };
    expect(apply(text, [titleEdit(text, range, "current", "Implementar el parser de anclas", "Nuevo")])).toBe(text.replace("Implementar el **parser** de anclas", "Nuevo"));
  });

  test("si la línea no es la esperada, falla sin editar", () => {
    const task = parseTeamBacklog(TEAM_TWO).free[0];
    expect(() => titleEdit(TEAM_TWO, trimRange(TEAM_TWO, task.range!), "team", "Otro", "X")).toThrow("No reconozco la línea del título");
  });
});

describe("setField / fieldEdits", () => {
  test("reemplaza el campo existente con su propia etiqueta, también de varias líneas", () => {
    const task = parseBacklog(BACKLOG_ONE).free.tasks[0];
    const place = backlogPlacement(BACKLOG_ONE, trimRange(BACKLOG_ONE, task.range!), task.fields);
    const out = apply(BACKLOG_ONE, [setField(BACKLOG_ONE, task.fields, "decisions", "x", "uno\ndos", place)]);
    expect(out).toContain("- **Decisiones/temas a definir antes de empezar:** uno\n  dos\n- **Bloqueos:** Ninguno.");
  });

  test("agrega el campo que falta antes de `Agregada`", () => {
    const task = parseBacklog(BACKLOG_ONE).free.tasks[0];
    const place = backlogPlacement(BACKLOG_ONE, trimRange(BACKLOG_ONE, task.range!), task.fields);
    const out = apply(BACKLOG_ONE, fieldEdits(BACKLOG_ONE, task.fields, { details: "más contexto" }, label, place));
    expect(out).toContain("- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Detalles:** más contexto\n- **Agregada:** 2026-10-01.\n");
  });

  test("sin `Agregada`, lo agrega tras el último campo; sin campos, al final del bloque", () => {
    const withFields = parseBacklog(BACKLOG_RICH).free.tasks[0];
    const out = apply(BACKLOG_RICH, fieldEdits(BACKLOG_RICH, withFields.fields, { details: "d" }, label, backlogPlacement(BACKLOG_RICH, trimRange(BACKLOG_RICH, withFields.range!), withFields.fields)));
    expect(out).toContain("- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Detalles:** d\n\n### Grupo");

    const text = "## Tareas libres\n\n### Tarea 5 — Sola\n\n### Tarea 6 — Otra\n";
    const bare = parseBacklog(text).free.tasks[0];
    const range = trimRange(text, bare.range!);
    expect(apply(text, fieldEdits(text, bare.fields, { details: "d" }, label, backlogPlacement(text, range, bare.fields)))).toBe(
      "## Tareas libres\n\n### Tarea 5 — Sola\n\n- **Detalles:** d\n\n### Tarea 6 — Otra\n",
    );
  });

  test("varios campos a la vez no se solapan y mantienen el orden de la plantilla", () => {
    const task = parseBacklog(BACKLOG_ONE).free.tasks[0];
    const place = backlogPlacement(BACKLOG_ONE, trimRange(BACKLOG_ONE, task.range!), task.fields);
    const out = apply(BACKLOG_ONE, fieldEdits(BACKLOG_ONE, task.fields, { description: "D", trigger: "T", details: "X" }, label, place));
    expect(out).toContain("- **Descripción:** D\n");
    expect(out).toContain("- **Disparador:** T\n- **Detalles:** X\n- **Agregada:**");
  });

  test("tarea pausada: lo nuevo va tras la descripción y los campos previos al avance; sin ellos, tras el header", () => {
    const handoff = parseHandoff(HANDOFF_CURRENT);
    const nine = handoff.paused.find((t) => t.number === 9)!;
    const headerEnd = HANDOFF_CURRENT.indexOf("\n", nine.range!.start);
    expect(apply(HANDOFF_CURRENT, [setField(HANDOFF_CURRENT, nine.fields, "details", "Detalles", "d", pausedPlacement(HANDOFF_CURRENT, headerEnd, nine.fields))])).toContain(
      "### Tarea 9 — Otra pausada\n\n- **Detalles:** d\n\n- **Qué falta:** nada.",
    );
  });
});

describe("resolveBlocker", () => {
  const base = { current: null, blocking: false, team: false } as const;

  test("libre: el valor no puede bloquearla", () => {
    expect(resolveBlocker({ ...base, state: "free", value: "Ninguno." })).toBe("Ninguno.");
    expect(resolveBlocker({ ...base, state: "free", value: "esperar" })).toBe("esperar");
    expect(() => resolveBlocker({ ...base, state: "free", value: "`[dependencia]` x", blocking: true })).toThrow("block <N>");
    expect(() => resolveBlocker({ ...base, state: "free", value: "[postergada] x", blocking: true, team: true })).toThrow("no hay comando");
  });

  test("bloqueada: con tag bloqueante se respeta; sin tag conserva el actual", () => {
    const current = "`[dependencia]` la Tarea 3";
    expect(resolveBlocker({ ...base, state: "blocked", current, value: "`[postergada]` mejor después", blocking: true })).toBe("`[postergada]` mejor después");
    expect(resolveBlocker({ ...base, state: "blocked", current, value: "la Tarea 4" })).toBe("`[dependencia]` la Tarea 4");
  });

  test("bloqueada: conserva el historial `[Resuelto ...]` al cambiar solo el motivo", () => {
    const current = "`[postergada]` esperar. `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.";
    expect(resolveBlocker({ ...base, state: "blocked", current, value: "otro motivo" })).toBe("`[postergada]` otro motivo `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.");
  });

  test("bloqueada con tag explícito: conserva el historial `[Resuelto ...]` tras el valor nuevo", () => {
    const current = "`[postergada]` esperar. `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.";
    expect(resolveBlocker({ ...base, state: "blocked", current, value: "`[dependencia]` otra", blocking: true })).toBe(
      "`[dependencia]` otra `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.",
    );
    // Sin historial, o con uno propio en el valor pedido, no se agrega ni se duplica nada.
    expect(resolveBlocker({ ...base, state: "blocked", current: "`[postergada]` esperar", value: "`[dependencia]` otra", blocking: true })).toBe("`[dependencia]` otra");
    const own = "`[dependencia]` otra `[Resuelto el 2026-10-01]` — era `[postergada]` x";
    expect(resolveBlocker({ ...base, state: "blocked", current, value: own, blocking: true })).toBe(own);
  });

  test("libre: conserva el historial `[Resuelto ...]`, sea el campo entero o lo que sigue a un texto", () => {
    const history = "`[Resuelto el 2026-09-24]` — era `[postergada]`.";
    expect(resolveBlocker({ ...base, state: "free", current: history, value: "esperar" })).toBe(`esperar ${history}`);
    expect(resolveBlocker({ ...base, state: "free", current: history, value: "Ninguno." })).toBe(`Ninguno. ${history}`);
    expect(resolveBlocker({ ...base, state: "free", current: `Antes: ${history}`, value: "esperar" })).toBe(`esperar Antes: ${history}`);
    expect(resolveBlocker({ ...base, state: "free", current: history, value: "uno\ndos" })).toBe(`uno\ndos\n${history}`);
    expect(resolveBlocker({ ...base, state: "free", current: "Ninguno.", value: "esperar" })).toBe("esperar");
  });

  test("bloqueada: lo que la desbloquearía se rechaza y manda a unblock", () => {
    const current = "`[dependencia]` x";
    expect(() => resolveBlocker({ ...base, state: "blocked", current, value: "Ninguno." })).toThrow("unblock <N>");
    expect(() => resolveBlocker({ ...base, state: "blocked", current, value: "`[Resuelto el 2026-10-01]` — era `[dependencia]` x" })).toThrow("unblock <N>");
  });

  test("un corchete inicial que no es de bloqueo ni `[Resuelto ...]` se rechaza, en libre y en bloqueada", () => {
    for (const state of ["free", "blocked"] as const) {
      for (const team of [false, true]) {
        const input = { ...base, state, team, current: "`[dependencia]` x" } as const;
        expect(() => resolveBlocker({ ...input, value: "[algo] x" })).toThrow("se leería como tag de la tarea");
        expect(() => resolveBlocker({ ...input, value: "  `[otra cosa]` x" })).toThrow("--blocker");
      }
    }
    // Sin corchete inicial, con corchetes en medio o con un link, sigue como antes.
    expect(resolveBlocker({ ...base, state: "free", value: "esperar [algo] más" })).toBe("esperar [algo] más");
    expect(resolveBlocker({ ...base, state: "free", value: "[plan](a.md) revisado" })).toBe("[plan](a.md) revisado");
    expect(resolveBlocker({ ...base, state: "free", value: "[Resuelto el 2026-10-01] — era x" })).toBe("[Resuelto el 2026-10-01] — era x");
    expect(resolveBlocker({ ...base, state: "blocked", current: "`[dependencia]` x", value: "[postergada] y", blocking: true })).toBe("[postergada] y");
  });

  test("bloqueada sin tag vigente que conservar: pide un tag", () => {
    expect(() => resolveBlocker({ ...base, state: "blocked", current: "`[Resuelto el 2026-10-01]` — era `[dependencia]` x", value: "algo" })).toThrow("no tiene un tag vigente");
    expect(() => resolveBlocker({ ...base, state: "blocked", current: null, value: "algo" })).toThrow("no tiene un tag vigente");
  });
});

describe("rejectLeadingTag", () => {
  test("rechaza un valor que empieza con un tag, con o sin backticks; el resto pasa", () => {
    expect(() => rejectLeadingTag("description", "[dependencia] x")).toThrow("tag de bloqueo");
    expect(() => rejectLeadingTag("details", "  `[postergada]` x")).toThrow("tag de bloqueo");
    expect(() => rejectLeadingTag("trigger", "[Resuelto el 2026-10-01] x")).toThrow("--trigger");
    expect(() => rejectLeadingTag("description", "texto [con] corchetes")).not.toThrow();
    expect(() => rejectLeadingTag("description", "[plan](plans/a.md) y más")).not.toThrow();
  });
});

describe("rejectStructuralLines", () => {
  test("rechaza líneas que empiezan con `#` o con un checkbox, en cualquier parte del valor", () => {
    for (const value of ["# Título", "uno\n## Dos", "- [ ] paso", "x\n  - [x] hecho", "* [ ] otro", "a\r\n- [X] b"]) {
      expect(() => rejectStructuralLines("next", value)).toThrow("crearía una subsección o un paso del plan");
    }
  });

  test("deja pasar viñetas comunes y `#` o corchetes dentro de la línea", () => {
    for (const value of ["- uno\n- dos", "ver la Tarea #3", "texto [x] y [ ] sueltos", "- [link](a.md)"]) {
      expect(() => rejectStructuralLines("next", value)).not.toThrow();
    }
  });
});

describe("parsePreamble / preambleEdits", () => {
  const region = (text: string) => {
    const handoff = parseHandoff(text);
    const task = handoff.inProgress.task!;
    return { task, region: { start: task.range!.end, end: handoff.inProgress.subsections[0].range!.start } };
  };

  test("separa la descripción de los campos con sus líneas de continuación", () => {
    const text = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\nUno.\n\nDos.\n\n- **Detalles:** a\n  b\n- **Origen:** c\n\n### Plan\n\n- [ ] x\n";
    const { region: r } = region(text);
    const pre = parsePreamble(text, r);
    expect(text.slice(pre.description!.start, pre.description!.end)).toBe("Uno.\n\nDos.");
    expect(pre.fields.map((f) => [f.label, text.slice(f.span.start, f.span.end)])).toEqual([
      ["Detalles", "- **Detalles:** a\n  b"],
      ["Origen", "- **Origen:** c"],
    ]);
  });

  test("sin descripción ni campos; con descripción mezclada con un campo se niega", () => {
    const bare = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\n### Plan\n\n- [ ] x\n";
    expect(parsePreamble(bare, region(bare).region)).toEqual({ description: null, fields: [] });
    const mixed = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\nUno.\n- **Detalles:** a\nDos.\n\n### Plan\n\n- [ ] x\n";
    expect(() => parsePreamble(mixed, region(mixed).region)).toThrow("mezclada");
    const commented = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\nUno.\n<!-- nota -->\nDos.\n\n### Plan\n\n- [ ] x\n";
    expect(() => parsePreamble(commented, region(commented).region)).toThrow("mezclada");
  });

  test("agrega descripción y Detalles donde corresponde", () => {
    const text = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\n### Plan\n\n- [ ] x\n";
    const { task, region: r } = region(text);
    const edits = preambleEdits(parsePreamble(text, r), task.range!.end, { description: "Desc", details: "Det" }, label, text);
    expect(apply(text, edits)).toContain("Tarea 3 — T\n\nDesc\n\n- **Detalles:** Det\n\n### Plan");
  });

  test("agrega Etiquetas antes de Detalles; sin descripción ni campos, en fila", () => {
    const text = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\n### Plan\n\n- [ ] x\n";
    const { task, region: r } = region(text);
    const edits = preambleEdits(parsePreamble(text, r), task.range!.end, { labels: "a b", details: "Det" }, label, text);
    expect(apply(text, edits)).toContain("Tarea 3 — T\n\n- **Etiquetas:** a b\n- **Detalles:** Det\n\n### Plan");
  });

  test("Etiquetas: reemplaza el campo existente (con su etiqueta) o lo quita sin dejar líneas en blanco dobles", () => {
    const text = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\nUno.\n\n- **Tags:** x y\n\n### Plan\n\n- [ ] x\n";
    const { task, region: r } = region(text);
    const pre = parsePreamble(text, r);
    expect(apply(text, preambleEdits(pre, task.range!.end, { labels: "z" }, label, text))).toContain("Uno.\n\n- **Tags:** z\n\n### Plan");
    expect(apply(text, preambleEdits(pre, task.range!.end, { labels: "" }, label, text))).toBe(text.replace("- **Tags:** x y\n\n", ""));
    // Quitar lo que no está no hace nada.
    const bare = "<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nTarea 3 — T\n\n### Plan\n\n- [ ] x\n";
    const rb = region(bare);
    expect(preambleEdits(parsePreamble(bare, rb.region), rb.task.range!.end, { labels: "" }, label, bare)).toEqual([]);
  });
});

describe("removeField / fieldEdits con valor vacío", () => {
  const edits = (text: string, number: number, values: Parameters<typeof fieldEdits>[2]) => {
    const task = parseBacklog(text).free.tasks.find((candidate) => candidate.number === number)!;
    return fieldEdits(text, task.fields, values, label, backlogPlacement(text, trimRange(text, task.range!), task.fields));
  };
  const TEXT = `${BACKLOG_HEAD}### Tarea 1 — T\n\n- **Descripción:** d\n- **Etiquetas:** a b\n- **Agregada:** hoy.\n\n### Tarea 2 — U\n\n- **Descripción:** d\n- **Etiquetas:** c\n`;

  test("quita la línea del campo y su salto de línea; si es lo último del texto, el salto anterior", () => {
    expect(apply(TEXT, edits(TEXT, 1, { labels: "" }))).toBe(TEXT.replace("- **Etiquetas:** a b\n", ""));
    expect(apply(TEXT, edits(TEXT, 2, { labels: "" }))).toBe(TEXT.replace("\n- **Etiquetas:** c\n", "\n"));
  });

  test("un campo de varias líneas se quita entero; sin el campo no hay edición", () => {
    const text = `${BACKLOG_HEAD}### Tarea 1 — T\n\n- **Descripción:** d\n- **Etiquetas:** a\n  b\n- **Agregada:** hoy.\n\n### Tarea 2 — U\n\n- **Descripción:** d\n`;
    expect(apply(text, edits(text, 1, { labels: "" }))).toBe(text.replace("- **Etiquetas:** a\n  b\n", ""));
    expect(edits(text, 2, { labels: "" })).toEqual([]);
  });

  test("con valor, Etiquetas va antes de Detalles y de Agregada", () => {
    const text = `${BACKLOG_HEAD}### Tarea 1 — T\n\n- **Descripción:** d\n- **Agregada:** hoy.\n`;
    expect(apply(text, edits(text, 1, { details: "x", labels: "a b" }))).toContain("- **Descripción:** d\n- **Etiquetas:** a b\n- **Detalles:** x\n- **Agregada:** hoy.");
  });
});
