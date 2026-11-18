// Piezas puras de lo que el script escribe: idioma y etiquetas, formato de los bloques y del handoff,
// y el contador de «Próximo número de tarea».

import { afterAll, describe, expect, test } from "bun:test";
import { parseFields } from "../../../_shared/parse/blocks.ts";
import { parseBacklog } from "../../../_shared/parse/backlog.ts";
import { CliError } from "../../src/cli/errors.ts";
import { detectLanguage, findFieldOfKind, isFieldKind, STRINGS } from "../../src/write/language.ts";
import { renderBacklogTask } from "../../src/write/new-task.ts";
import { reserveNextNumber, reserveNextNumbers } from "../../src/write/numbering.ts";
import {
  carriedFields,
  fieldBody,
  formatLocalDate,
  meaningfulField,
  parsePlan,
  renderField,
  renderInProgress,
  renderTaskBlock,
} from "../../src/write/render.ts";
import { labelResolver } from "../../src/write/samples.ts";
import { BACKLOG_EMPTY, BACKLOG_RICH, HANDOFF_CURRENT, HANDOFF_EMPTY, HANDOFF_IDLE, HISTORY_RICH } from "../fixtures.ts";
import { loadDocs, makeProject, type Project, type ProjectOptions } from "../helpers.ts";

const projects: Project[] = [];
/** Crea un proyecto temporal que se borra al terminar el archivo. */
const tempProject = (options: ProjectOptions = {}): Project => {
  const p = makeProject(options);
  projects.push(p);
  return p;
};
afterAll(() => projects.forEach((p) => p.cleanup()));

describe("idioma", () => {
  test("reconoce español e inglés por las palabras que ya usa el archivo", () => {
    expect(detectLanguage(["Tarea"])).toEqual({ lang: "es", notice: null });
    expect(detectLanguage(["Task"])).toEqual({ lang: "en", notice: null });
    expect(detectLanguage(["Descripción"]).lang).toBe("es");
    expect(detectLanguage(["Blockers"]).lang).toBe("en");
    expect(detectLanguage(["Decisiones/temas a definir antes de empezar"]).lang).toBe("es");
  });

  test("la primera etiqueta que reconoce decide, aunque haya otras antes", () => {
    expect(detectLanguage(["Ticket", "Task", "Tarea"])).toEqual({ lang: "en", notice: null });
  });

  test("idioma desconocido o sin pistas: español y un aviso que lo dice", () => {
    expect(detectLanguage(["Ticket"])).toEqual({ lang: "es", notice: expect.stringContaining("«Ticket»") });
    expect(detectLanguage([])).toEqual({ lang: "es", notice: expect.stringContaining("No pude determinar") });
  });

  test("reconoce el tipo de un campo en los dos idiomas", () => {
    expect(isFieldKind("Descripción", "description")).toBe(true);
    expect(isFieldKind("Description", "description")).toBe(true);
    expect(isFieldKind("Decisiones/temas a definir antes de empezar", "decisions")).toBe(true);
    expect(isFieldKind("Bloqueos", "blockers")).toBe(true);
    expect(isFieldKind("Blockers", "blockers")).toBe(true);
    expect(isFieldKind("Disparador", "details")).toBe(false);
  });

  test("reconoce el campo de etiquetas en los dos idiomas, lo usa para detectar el idioma y lo escribe con el del documento", () => {
    expect(isFieldKind("Etiquetas", "labels")).toBe(true);
    expect(isFieldKind("etiquetas", "labels")).toBe(true);
    expect(isFieldKind("Tags", "labels")).toBe(true);
    expect(isFieldKind("Tag", "labels")).toBe(false);
    expect(isFieldKind("Etiquetas", "details")).toBe(false);
    expect(detectLanguage(["Etiquetas"])).toEqual({ lang: "es", notice: null });
    expect(detectLanguage(["Tags"])).toEqual({ lang: "en", notice: null });
    expect(STRINGS.es.fields.labels).toBe("Etiquetas");
    expect(STRINGS.en.fields.labels).toBe("Tags");
    const tasks = parseBacklog("## L\n\n### Task 1 — a\n\n- **Description:** x\n- **Tags:** a b\n").free.tasks;
    expect(findFieldOfKind(tasks[0].fields, "labels")?.label).toBe("Tags");
    expect(labelResolver([], STRINGS.es)("labels")).toBe("Etiquetas");
    expect(labelResolver([], STRINGS.en)("labels")).toBe("Tags");
  });

  test("las etiquetas salen de una tarea del archivo; si no hay, de la tabla del idioma", () => {
    const tasks = parseBacklog("## L\n\n### Task 1 — a\n\n- **Description:** x\n- **Blockers:** None.\n").free.tasks;
    const label = labelResolver(
      tasks.map((task) => task.fields),
      STRINGS.en,
    );
    expect(label("description")).toBe("Description");
    expect(label("blockers")).toBe("Blockers");
    expect(label("trigger")).toBe("Trigger"); // no está en la tarea: tabla en inglés
    expect(labelResolver([], STRINGS.es)("added")).toBe("Agregada");
  });
});

describe("formato", () => {
  test("renderField indenta las líneas de continuación y no deja espacios al final", () => {
    expect(renderField("Detalles", "uno  \n- sub\n\ndos\r\n")).toBe("- **Detalles:** uno\n  - sub\n\n  dos");
  });

  test("renderTaskBlock: header, línea en blanco y campos, sin salto de línea final", () => {
    expect(renderTaskBlock("### Tarea 3 — x", [["Descripción", "a"], ["Agregada", "2026-10-07."]])).toBe(
      "### Tarea 3 — x\n\n- **Descripción:** a\n- **Agregada:** 2026-10-07.",
    );
  });

  test("lo que se escribe lo vuelve a leer el parser con los mismos campos", () => {
    const block = renderTaskBlock("### Tarea 3 — x", [
      ["Descripción", "línea uno\n- punto\nlínea tres"],
      ["Bloqueos", "`[dependencia]` espera la Tarea 1"],
      ["Agregada", "2026-10-07."],
    ]);
    const [task] = parseBacklog(`## L\n\n${block}\n`).free.tasks;
    expect(task.number).toBe(3);
    expect(task.fields.map((f) => f.label)).toEqual(["Descripción", "Bloqueos", "Agregada"]);
    expect(task.fields[0].value).toBe("línea uno\n- punto\nlínea tres");
  });

  test("formatLocalDate usa la fecha local con ceros a la izquierda", () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  test("parsePlan: un paso por línea; quita viñetas y checkboxes y las líneas en blanco", () => {
    expect(parsePlan("- [ ] Paso 1 — a\n\n* [x] Paso 2 — b\n- Paso 3\nPaso 4 — d\r\n")).toEqual(["Paso 1 — a", "Paso 2 — b", "Paso 3", "Paso 4 — d"]);
    expect(parsePlan("  \n- \n")).toEqual([]);
  });
});

describe("campos de una tarea", () => {
  const text = [
    "- **Descripción:** de qué trata",
    "  segunda línea",
    "- **Decisiones/temas a definir antes de empezar:**",
    "  - elegir A",
    "  - elegir B",
    "- **Bloqueos:** Ninguno.",
    "- **Desbloquea:** Tarea 4.",
    "- **Detalles:** ninguno.",
    "- **Origen:** team-backlog",
    "- **Agregada:** 2026-09-24.",
    "",
  ].join("\n");
  const fields = parseFields(text.split("\n"), undefined);

  // `parseFields` sin posiciones no trae `range`: se parsea como una tarea completa para tenerlos.
  const [task] = parseBacklog(`## L\n\n### Tarea 1 — t\n\n${text}`).free.tasks;

  test("fieldBody da el valor sin la etiqueta y conserva las sublistas", () => {
    const decisions = findFieldOfKind(task.fields, "decisions")!;
    expect(fieldBody(`## L\n\n### Tarea 1 — t\n\n${text}`, decisions)).toBe("- elegir A\n- elegir B");
    expect(fields.length).toBe(task.fields.length);
  });

  test("meaningfulField: el valor, o null si falta o dice «Ninguno»", () => {
    const full = `## L\n\n### Tarea 1 — t\n\n${text}`;
    expect(meaningfulField(full, task.fields, "description")).toBe("de qué trata\nsegunda línea");
    expect(meaningfulField(full, task.fields, "blockers")).toBeNull();
    expect(meaningfulField(full, task.fields, "trigger")).toBeNull();
  });

  test("carriedFields conserva Desbloquea y Origen tal cual y omite lo vacío o lo que va aparte", () => {
    const full = `## L\n\n### Tarea 1 — t\n\n${text}`;
    expect(carriedFields(full, task.fields)).toEqual(["- **Desbloquea:** Tarea 4.", "- **Origen:** team-backlog"]);
  });
});

describe("renderInProgress", () => {
  const base = {
    strings: STRINGS.es,
    label: "Tarea",
    number: 5,
    title: "Algo",
    description: "Descripción.",
    extras: [],
    decisions: null,
    plan: null,
    mode: null,
  };

  test("sin plan: línea de la tarea, descripción y las tres subsecciones en el orden de la plantilla", () => {
    expect(renderInProgress(base)).toBe(
      [
        "Tarea 5 — Algo",
        "Descripción.",
        "### Qué falta\n\nToda la tarea.",
        "### Decisiones a medio camino\n\nNinguna.",
        "### Próximo paso concreto\n\nEmpezar la tarea.",
      ].join("\n\n"),
    );
  });

  test("con plan y modo: el paso de cierre siempre al final y el próximo paso es el primero", () => {
    const text = renderInProgress({ ...base, plan: ["Paso 1 — a", "Paso 2 — b"], mode: "uno a la vez", extras: ["- **Origen:** team-backlog"], decisions: "- una\n- otra" });
    expect(text).toBe(
      [
        "Tarea 5 — Algo",
        "Descripción.",
        "- **Origen:** team-backlog",
        "### Plan\n\n- [ ] Paso 1 — a\n- [ ] Paso 2 — b\n- [ ] Documentar cierre de tarea",
        "**Modo de ejecución acordado:** uno a la vez",
        "### Qué falta\n\nTodos los pasos del plan.",
        "### Decisiones a medio camino\n\n- una\n- otra",
        "### Próximo paso concreto\n\nPaso 1 — a",
      ].join("\n\n"),
    );
  });

  test("no duplica el paso de cierre si el plan ya lo trae", () => {
    const text = renderInProgress({ ...base, plan: ["Paso 1 — a", "Documentar cierre de tarea"] });
    expect(text.match(/Documentar cierre de tarea/g)).toHaveLength(1);
  });

  test("en inglés usa los títulos de la tabla inglesa", () => {
    const text = renderInProgress({ ...base, strings: STRINGS.en, label: "Task", plan: ["Step 1"] });
    expect(text).toContain("Task 5 — Algo");
    expect(text).toContain("### Plan\n\n- [ ] Step 1\n- [ ] Document task closure");
    expect(text).toContain("### What's left");
    expect(text).toContain("### Next concrete step\n\nStep 1");
  });

  test("lo que escribe se lee con el mismo parser: tarea, plan y subsecciones por posición", () => {
    const body = renderInProgress({ ...base, plan: ["Paso 1 — a"], mode: "seguidos" });
    const docs = loadDocs(tempProject({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE.replace("Sin tarea en curso", body) } }), "gersom");
    const { task, steps, subsections } = docs.handoff.parsed.inProgress;
    expect(task).toMatchObject({ number: 5, title: "Algo" });
    expect(steps.map((s) => s.text)).toEqual(["Paso 1 — a", "Documentar cierre de tarea"]);
    expect(subsections.map((s) => s.title)).toEqual(["Plan", "Qué falta", "Decisiones a medio camino", "Próximo paso concreto"]);
  });
});

describe("reserveNextNumber", () => {
  function docsWith(backlog: string, handoff = HANDOFF_IDLE, history = HISTORY_RICH) {
    const p = tempProject({ folders: ["gersom"], contents: { "backlog.md": backlog, "handoff.md": handoff, "history.md": history } });
    return loadDocs(p, "gersom");
  }

  test("devuelve el número y la edición que deja el contador en N+1", () => {
    const docs = docsWith(BACKLOG_RICH);
    const reserved = reserveNextNumber(docs);
    expect(reserved.number).toBe(20);
    expect(docs.backlog.text.slice(reserved.edit.start, reserved.edit.end)).toBe("20");
    expect(reserved.edit.text).toBe("21");
  });

  test("reserva varios números seguidos y deja el contador en el último + 1", () => {
    const docs = docsWith(BACKLOG_RICH);
    const reserved = reserveNextNumbers(docs, 3);
    expect(reserved.numbers).toEqual([20, 21, 22]);
    expect(docs.backlog.text.slice(reserved.edit.start, reserved.edit.end)).toBe("20");
    expect(reserved.edit.text).toBe("23");
  });

  test("contador igual o menor que la tarea más alta (de cualquier archivo): error que lo explica", () => {
    const low = BACKLOG_RICH.replace("**Próximo número de tarea:** 20", "**Próximo número de tarea:** 18");
    expect(() => reserveNextNumber(docsWith(low))).toThrow(/no es mayor que la tarea más alta[^]*la 18[^]*al menos 19/);
    // la más alta está en history.md
    const history = HISTORY_RICH.replace("## 2026-10-07 — ✅ Tarea 11 —", "## 2026-10-07 — ✅ Tarea 25 —");
    expect(() => reserveNextNumber(docsWith(BACKLOG_RICH, HANDOFF_IDLE, history))).toThrow(/la 25/);
    // y en el handoff
    expect(() => reserveNextNumber(docsWith(BACKLOG_RICH, HANDOFF_CURRENT.replace("Tarea 12 —", "Tarea 30 —")))).toThrow(/la 30/);
  });

  test("sin la línea del contador: error que pide agregarla", () => {
    expect(() => reserveNextNumber(docsWith(BACKLOG_EMPTY.replace("**Próximo número de tarea:** 5\n", "")))).toThrow(CliError);
    expect(() => reserveNextNumber(docsWith(BACKLOG_EMPTY.replace("**Próximo número de tarea:** 5\n", "")))).toThrow(/Próximo número de tarea/);
  });
});

describe("renderBacklogTask", () => {
  test("usa la palabra de header y las etiquetas de las tareas del archivo; lo que no se pasa toma los valores por defecto", () => {
    const p = tempProject({ folders: ["gersom"], contents: { "backlog.md": BACKLOG_RICH, "handoff.md": HANDOFF_IDLE, "history.md": HISTORY_RICH } });
    const docs = loadDocs(p, "gersom");
    const block = renderBacklogTask(docs, STRINGS.es, docs.backlog.parsed.free.tasks, { number: 20, title: "Nueva", description: "Algo.", date: "2026-10-07" });
    expect(block).toBe(
      "### Tarea 20 — Nueva\n\n- **Descripción:** Algo.\n- **Decisiones/temas a definir antes de empezar:** Ninguno.\n- **Bloqueos:** Ninguno.\n- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Agregada:** 2026-10-07.",
    );
    p.cleanup();
  });

  test("sin tareas de donde copiar usa la tabla del idioma, y los detalles solo si se pasan", () => {
    const p = tempProject({ folders: ["gersom"], contents: { "backlog.md": BACKLOG_EMPTY, "handoff.md": HANDOFF_EMPTY, "history.md": "# History\n" } });
    const docs = loadDocs(p, "gersom");
    const block = renderBacklogTask(docs, STRINGS.en, [], { number: 5, title: "New", description: "Something.", details: "More.", trigger: "later", date: "2026-10-07" });
    expect(block).toBe(
      "### Task 5 — New\n\n- **Description:** Something.\n- **Decisions/topics to settle before starting:** None.\n- **Blockers:** None.\n- **Trigger:** later\n- **Details:** More.\n- **Added:** 2026-10-07.",
    );
    p.cleanup();
  });
});
