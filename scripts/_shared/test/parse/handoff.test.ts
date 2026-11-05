import { describe, expect, test } from "bun:test";
import { parseHandoff } from "../../parse/handoff.ts";
import { normalizeEol } from "../../parse/positions.ts";
import { lineNumbersMatch, requireFixture, sliceRange } from "../helpers.ts";

describe("parseHandoff", () => {
  test("detecta la tarea en curso, el plan y las subsecciones", () => {
    const { inProgress, paused, usedFallback } = parseHandoff(requireFixture("es-anchors", "handoff.md"));
    expect(usedFallback).toBe(false);
    expect(inProgress.task).toMatchObject({ label: "Tarea", number: 12, title: "Implementar el parser de anclas" });
    expect(inProgress.steps.map((s) => s.done)).toEqual([true, true, false, false, false]);
    expect(inProgress.subsections.map((s) => s.title)).toEqual(["Plan", "Qué falta", "Próximo paso concreto"]);
    expect(paused.map((t) => t.number)).toEqual([8]);
    expect(paused[0].fields.map((f) => f.label)).toEqual(["Qué falta", "Por qué se pausó", "Qué espera para retomarse"]);
  });

  test("pausada: los pasos de su plan, sin repetir el campo Plan como texto", () => {
    const { paused } = parseHandoff(requireFixture("es-anchors", "handoff.md"));
    expect(paused[0].steps).toMatchObject([
      { text: "Paso 1 — Copiar el contenido viejo", done: true },
      { text: "Paso 2 — Revisar los links", done: false },
      { text: "Paso 3 — Borrar lo duplicado", done: false },
    ]);
    expect(paused[0].fields.some((f) => f.value.includes("[x]"))).toBe(false);
  });

  describe("pasos del plan: solo los del plan, no los checkboxes de otras partes", () => {
    const doc = (inProgress: string[], paused: string[] = []) =>
      [
        "<!-- agent-context-skill:section=in-progress -->",
        "## Tarea en progreso",
        "",
        ...inProgress,
        "",
        "<!-- agent-context-skill:section=paused -->",
        "## Tareas pausadas",
        "",
        ...paused,
        "",
      ].join("\n");

    test("en curso: `planSteps` es el de la subsección del plan; `steps` sigue siendo todos los checkboxes", () => {
      const { inProgress } = parseHandoff(
        doc(["Tarea 7 — Algo", "", "- [ ] suelto", "", "### Plan", "", "- [x] Paso 1 — A", "- [ ] Paso 2 — B", "", "### Qué falta", "", "- [ ] otra cosa"]),
      );
      expect(inProgress.steps).toHaveLength(4);
      expect(inProgress.planSteps.map((s) => s.text)).toEqual(["Paso 1 — A", "Paso 2 — B"]);
      expect(inProgress.planSteps.every((s) => s.range && s.markRange)).toBe(true);
    });

    test("en curso sin subsección del plan: `planSteps` son todos los checkboxes", () => {
      const { inProgress } = parseHandoff(doc(["Tarea 7 — Algo", "", "- [x] a", "- [ ] b"]));
      expect(inProgress.planSteps.map((s) => s.text)).toEqual(["a", "b"]);
    });

    test("pausada: solo cuentan los checkboxes del campo Plan, no los de «Qué falta»", () => {
      const { paused } = parseHandoff(
        doc(
          ["Sin tarea en curso"],
          ["### Tarea 8 — Algo", "", "- **Plan:**", "  - [x] Paso 1 — A", "  - [ ] Paso 2 — B", "- **Qué falta:**", "  - [ ] otra cosa", "  - [ ] y otra", "- **Por qué se pausó:** prioridad."],
        ),
      );
      expect(paused[0].steps.map((s) => s.text)).toEqual(["Paso 1 — A", "Paso 2 — B"]);
      expect(paused[0].steps.every((s) => s.range && s.markRange)).toBe(true);
      // «Qué falta» no es el plan: se conserva como campo, no se pierde en silencio.
      expect(paused[0].fields.map((f) => f.label)).toEqual(["Qué falta", "Por qué se pausó"]);
    });
  });

  test("pausada sin plan, y campo con texto además de checkboxes que se conserva", () => {
    const text = [
      "<!-- agent-context-skill:section=in-progress -->",
      "## En progreso",
      "",
      "Sin tarea.",
      "",
      "<!-- agent-context-skill:section=paused -->",
      "## Pausadas",
      "",
      "### Task 3 — Sin plan",
      "",
      "- **Why paused:** priority.",
      "",
      "### Task 4 — Con notas",
      "",
      "- **Notes:** ver esto",
      "  - [ ] algo suelto",
    ].join("\n");
    const { paused } = parseHandoff(text);
    expect(paused[0].steps).toEqual([]);
    expect(paused[0].fields.map((f) => f.label)).toEqual(["Why paused"]);
    expect(paused[1].steps).toMatchObject([{ text: "algo suelto", done: false }]);
    expect(paused[1].fields.map((f) => f.label)).toEqual(["Notes"]);
  });

  test("sin tarea en curso devuelve null", () => {
    const { inProgress, paused } = parseHandoff(requireFixture("minimal", "handoff.md"));
    expect(inProgress.task).toBeNull();
    expect(paused).toEqual([]);
  });

  test("no toma un paso de una subsección como tarea en curso", () => {
    const text = "<!-- agent-context-skill:section=in-progress -->\n## En progreso\n\nSin tarea.\n\n### Próximo\n\nPaso 4 — algo\n";
    expect(parseHandoff(text).inProgress.task).toBeNull();
  });

  test("funciona en inglés sin anclas", () => {
    const { inProgress, usedFallback } = parseHandoff(requireFixture("en-no-anchors", "handoff.md"));
    expect(usedFallback).toBe(true);
    expect(inProgress.task).toMatchObject({ label: "Task", number: 21, title: "Add the English onboarding" });
    expect(inProgress.steps).toHaveLength(2);
  });
});

describe("parseHandoff: posiciones en el texto original", () => {
  const DOC = [
    "# Handoff", // 1
    "", // 2
    "<!-- agent-context-skill:section=in-progress -->", // 3
    "## Tarea en progreso", // 4
    "", // 5
    "<!-- Ejemplo: **Tarea:** Tarea 77 — dentro de un comentario -->", // 6
    "", // 7
    "**Tarea:** Tarea 12 — Implementar el **parser**", // 8
    "", // 9
    "### Plan", // 10
    "", // 11
    "- [x] Paso 1 — listo", // 12
    "- [ ] Paso 2 — falta <!-- nota -->", // 13
    "  - [X] Paso anidado", // 14
    "", // 15
    "<!--", // 16
    "### Subsección falsa", // 17
    "-->", // 18
    "### Próximo paso concreto", // 19
    "", // 20
    "Hacer X.", // 21
    "", // 22
    "<!-- agent-context-skill:section=paused -->", // 23
    "## Tareas pausadas", // 24
    "", // 25
    "<!--", // 26
    "### Tarea 55 — ejemplo en comentario", // 27
    "- [ ] no cuenta", // 28
    "-->", // 29
    "", // 30
    "### Tarea 8 — Migrar", // 31
    "", // 32
    "- **Plan:**", // 33
    "  - [x] Copiar", // 34
    "  - [ ] Revisar", // 35
    "- **Qué falta:** todo", // 36
    "", // 37
    "### Tarea 9 — Otra", // 38
    "", // 39
    "- **Por qué:** x", // 40
    "",
  ].join("\n");

  test("la línea de la tarea en curso", () => {
    const { inProgress } = parseHandoff(DOC);
    expect(sliceRange(DOC, inProgress.task!.range!)).toBe("**Tarea:** Tarea 12 — Implementar el **parser**");
    expect(inProgress.task!.range).toMatchObject({ startLine: 8, endLine: 8 });
  });

  test("cada checkbox del plan: su línea y el carácter de marca, ignorando los comentarios", () => {
    const { inProgress } = parseHandoff(DOC);
    expect(inProgress.steps.map((s) => sliceRange(DOC, s.range!))).toEqual([
      "- [x] Paso 1 — listo",
      "- [ ] Paso 2 — falta ",
      "  - [X] Paso anidado",
    ]);
    expect(inProgress.steps.map((s) => sliceRange(DOC, s.markRange!))).toEqual(["x", " ", "X"]);
    expect(inProgress.steps.map((s) => s.range!.startLine)).toEqual([12, 13, 14]);
    for (const s of inProgress.steps) expect(lineNumbersMatch(DOC, s.range!)).toBe(true);
  });

  test("marcar un paso reemplazando solo su markRange cambia únicamente ese carácter", () => {
    const step = parseHandoff(DOC).inProgress.steps[1];
    const edited = DOC.slice(0, step.markRange!.start) + "x" + DOC.slice(step.markRange!.end);
    expect(edited).toBe(DOC.replace("- [ ] Paso 2", "- [x] Paso 2"));
    expect(parseHandoff(edited).inProgress.steps.map((s) => s.done)).toEqual([true, true, true]);
  });

  test("subsecciones: de su `### ` hasta antes de la siguiente (un header en comentario no corta)", () => {
    const { inProgress } = parseHandoff(DOC);
    const [plan, next] = inProgress.subsections;
    expect(plan.title).toBe("Plan");
    expect(sliceRange(DOC, plan.range!)).toBe(DOC.split("\n").slice(9, 18).join("\n") + "\n");
    expect(sliceRange(DOC, next.range!)).toBe("### Próximo paso concreto\n\nHacer X.\n\n");
    expect(next.range!.end).toBe(DOC.indexOf("<!-- agent-context-skill:section=paused"));
  });

  test("bloques de tareas pausadas, sin el ejemplo comentado, y sus pasos", () => {
    const { paused } = parseHandoff(DOC);
    expect(paused.map((t) => t.number)).toEqual([8, 9]);
    expect(sliceRange(DOC, paused[0].range!)).toBe(DOC.split("\n").slice(30, 37).join("\n") + "\n");
    expect(sliceRange(DOC, paused[1].range!)).toBe("### Tarea 9 — Otra\n\n- **Por qué:** x\n");
    expect(paused[1].range!.end).toBe(DOC.length);
    expect(paused[0].steps.map((s) => sliceRange(DOC, s.range!))).toEqual(["  - [x] Copiar", "  - [ ] Revisar"]);
    expect(paused[0].steps.map((s) => sliceRange(DOC, s.markRange!))).toEqual(["x", " "]);
    expect(paused[0].steps.map((s) => s.range!.startLine)).toEqual([34, 35]);
    expect(paused[0].fields.map((f) => sliceRange(DOC, f.range!))).toEqual(["- **Qué falta:** todo\n"]);
  });

  test("secciones: header, ancla y cuerpo de cada una", () => {
    const { sections } = parseHandoff(DOC);
    expect(sliceRange(DOC, sections["in-progress"].anchorRange!)).toBe("<!-- agent-context-skill:section=in-progress -->");
    expect(sliceRange(DOC, sections.paused.headerRange)).toBe("## Tareas pausadas");
    expect(sections["in-progress"].bodyRange.end).toBe(sections.paused.anchorRange!.start);
  });

  test("fixture real: toda posición apunta al texto que el parser describe", () => {
    const text = requireFixture("es-anchors", "handoff.md");
    const { inProgress, paused } = parseHandoff(text);
    expect(sliceRange(text, inProgress.task!.range!)).toBe("**Tarea:** Tarea 12 — Implementar el **parser** de anclas");
    expect(inProgress.steps.map((s) => sliceRange(text, s.markRange!))).toEqual(["x", "X", " ", " ", " "]);
    expect(sliceRange(text, paused[0].range!)).toStartWith("### Tarea 8 — Migrar la documentación vieja");
    for (const t of [inProgress.task!, ...inProgress.steps, ...inProgress.subsections, ...paused]) {
      expect(lineNumbersMatch(text, t.range!)).toBe(true);
    }
  });

  test("plan B (sin anclas): las posiciones salen igual; solo falta el ancla", () => {
    const text = requireFixture("en-no-anchors", "handoff.md");
    const { inProgress, sections } = parseHandoff(text);
    expect(sliceRange(text, inProgress.task!.range!)).toBe("**Task:** Task 21 – Add the English onboarding");
    expect(inProgress.steps.map((s) => sliceRange(text, s.range!))).toEqual(["- [x] Step 1 – Draft", "- [ ] Step 2 – Review"]);
    expect(sections["in-progress"].anchorRange).toBeNull();
    expect(sliceRange(text, sections["in-progress"].headerRange)).toBe("## Task in progress");
  });

  test("CRLF: parsear el texto normalizado da las mismas posiciones y se traducen al crudo", () => {
    const crlf = DOC.replace(/\n/g, "\r\n");
    const info = normalizeEol(crlf);
    const parsed = parseHandoff(info.text);
    expect(parsed).toEqual(parseHandoff(DOC));
    const step = parsed.inProgress.steps[1];
    const [s, e] = info.rawSpan(step.markRange!);
    expect(crlf.slice(0, s) + "x" + crlf.slice(e)).toBe(crlf.replace("- [ ] Paso 2", "- [x] Paso 2"));
    const [ls, le] = info.rawSpan(parsed.inProgress.task!.range!);
    expect(crlf.slice(le, le + 2)).toBe("\r\n"); // el rango de una línea no incluye su final de línea
    expect(crlf.slice(ls, le)).toStartWith("**Tarea:**");
  });

  test("archivo vacío: sin tarea, sin pausadas, sin secciones", () => {
    const parsed = parseHandoff("");
    expect(parsed.inProgress).toEqual({ task: null, steps: [], planSteps: [], subsections: [] });
    expect(parsed.paused).toEqual([]);
    expect(parsed.sections).toEqual({});
    expect(parsed.missing).toEqual(["in-progress", "paused"]);
  });
});
