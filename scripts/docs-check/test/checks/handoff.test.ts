import { describe, expect, test } from "bun:test";
import { checkCurrentMode, checkCurrentPlanLines, checkCurrentSubsections, checkCurrentTask } from "../../src/checks/handoff.ts";
import { HANDOFF, HANDOFF_IDLE, lineOf, TEMPLATE_HANDOFF } from "../fixtures.ts";
import { brief, makeCtx, PATHS } from "../helpers.ts";

const FILE = `${PATHS.flat}/handoff.md`;

describe("handoff: tarea en progreso", () => {
  test("tarea reconocida con plan: sin hallazgos", () => {
    expect(checkCurrentTask(makeCtx())).toEqual([]);
  });

  test("«Sin tarea en curso»: sin hallazgos", () => {
    expect(checkCurrentTask(makeCtx({ handoff: HANDOFF_IDLE }))).toEqual([]);
  });

  test("«Sin tarea en curso» en otros idiomas conocidos: sin hallazgos", () => {
    for (const text of ["No task in progress.", "No current task", "No active task right now"]) {
      const handoff = HANDOFF_IDLE.replace("Sin tarea en curso.", text);
      expect(checkCurrentTask(makeCtx({ handoff }))).toEqual([]);
    }
  });

  test("la línea con etiqueta en negrita (`**Tarea:** Tarea 9 — título`) se reconoce", () => {
    const handoff = HANDOFF.replace("Tarea 7 — Escribir el parser", "**Tarea:** Tarea 7 — Escribir el parser");
    expect(checkCurrentTask(makeCtx({ handoff }))).toEqual([]);
  });

  test("la sección vacía: sin hallazgos", () => {
    const handoff = HANDOFF_IDLE.replace("Sin tarea en curso.\n", "");
    expect(checkCurrentTask(makeCtx({ handoff }))).toEqual([]);
  });

  test("la plantilla sin completar no avisa aquí (lo hace el check de placeholders)", () => {
    expect(checkCurrentTask(makeCtx({ handoff: TEMPLATE_HANDOFF }))).toEqual([]);
  });

  test("handoff.md ausente: sin hallazgos", () => {
    expect(checkCurrentTask(makeCtx({ handoff: null }))).toEqual([]);
  });
});

describe("current-task-line", () => {
  test("contenido sin la línea `Tarea N — título`: aviso en el header de la sección", () => {
    const handoff = HANDOFF_IDLE.replace("Sin tarea en curso.", "Estoy trabajando en el parser.");
    const findings = checkCurrentTask(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([
      { severity: "warning", code: "current-task-line", file: FILE, line: lineOf(handoff, "## Tarea en progreso") },
    ]);
    expect(findings[0].message).toContain("Tarea N — título");
  });

  test("la línea está después de la primera subsección: no se reconoce", () => {
    const handoff = HANDOFF_IDLE.replace("Sin tarea en curso.", "### Plan\n\nTarea 7 — Escribir el parser");
    const findings = checkCurrentTask(makeCtx({ handoff }));
    expect(findings.map((f) => f.code)).toEqual(["current-task-line"]);
  });

  test("sin guion entre el número y el título: no se reconoce", () => {
    const handoff = HANDOFF.replace("Tarea 7 — Escribir el parser", "Tarea 7: Escribir el parser");
    const findings = checkCurrentTask(makeCtx({ handoff }));
    expect(findings.map((f) => f.code)).toEqual(["current-task-line"]);
  });

  test("guion corto o semicuadratín: se reconoce", () => {
    for (const dash of ["-", "–"]) {
      const handoff = HANDOFF.replace("Tarea 7 — Escribir el parser", `Tarea 7 ${dash} Escribir el parser`);
      expect(checkCurrentTask(makeCtx({ handoff }))).toEqual([]);
    }
  });

  test("un comentario HTML con la tarea no cuenta como contenido", () => {
    const handoff = HANDOFF_IDLE.replace("Sin tarea en curso.", "<!-- Tarea 7 — algo -->");
    expect(checkCurrentTask(makeCtx({ handoff }))).toEqual([]);
  });
});

describe("current-no-plan", () => {
  test("tarea en curso sin checkboxes: aviso en la línea de la tarea", () => {
    const handoff = HANDOFF.replace(/### Plan[\s\S]*?### Qué falta/, "### Qué falta");
    const findings = checkCurrentTask(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "current-no-plan", file: FILE, line: lineOf(handoff, "Tarea 7 — Escribir") }]);
    expect(findings[0].message).toContain("Tarea 7");
    expect(findings[0].message).toContain("- [ ] Paso");
  });

  test("el plan en una subsección con otro nombre también cuenta (basta un checkbox)", () => {
    const handoff = HANDOFF.replace(/### Plan[\s\S]*?### Qué falta/, "### Pasos\n\n- [ ] Único paso\n\n### Qué falta");
    expect(checkCurrentTask(makeCtx({ handoff }))).toEqual([]);
  });

  test("los checkboxes de las pausadas no cuentan como plan de la tarea en curso", () => {
    const handoff = HANDOFF.replace(/### Plan[\s\S]*?### Qué falta/, "### Qué falta").replace(
      "- **Por qué se pausó:** otra prioridad.",
      "- **Plan:**\n  - [ ] Algo\n- **Por qué se pausó:** otra prioridad.",
    );
    expect(checkCurrentTask(makeCtx({ handoff })).map((f) => f.code)).toEqual(["current-no-plan"]);
  });
});

describe("current-subsection", () => {
  test("subsecciones conocidas, sin tarea o sin handoff.md: sin hallazgos", () => {
    expect(checkCurrentSubsections(makeCtx())).toEqual([]);
    expect(checkCurrentSubsections(makeCtx({ handoff: HANDOFF_IDLE }))).toEqual([]);
    expect(checkCurrentSubsections(makeCtx({ handoff: null }))).toEqual([]);
  });

  test("una subsección con título desconocido: aviso en su línea", () => {
    const handoff = HANDOFF.replace("### Qué falta", "### Notas\n\nalgo\n\n### Qué falta");
    const findings = checkCurrentSubsections(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "current-subsection", file: FILE, line: lineOf(handoff, "### Notas") }]);
    expect(findings[0].message).toContain("«Notas»");
  });
});

describe("current-plan-line", () => {
  test("plan válido (pasos y línea de modo): sin hallazgos", () => {
    expect(checkCurrentPlanLines(makeCtx())).toEqual([]);
  });

  test("sin tarea en curso o sin handoff.md: sin hallazgos", () => {
    expect(checkCurrentPlanLines(makeCtx({ handoff: HANDOFF_IDLE }))).toEqual([]);
    expect(checkCurrentPlanLines(makeCtx({ handoff: null }))).toEqual([]);
  });

  test("una línea de texto en el plan: aviso en esa línea, con el formato válido", () => {
    const handoff = HANDOFF.replace("- [ ] Paso 2 — Completar los casos", "Una nota suelta.\n- [ ] Paso 2 — Completar los casos");
    const findings = checkCurrentPlanLines(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "current-plan-line", file: FILE, line: lineOf(handoff, "Una nota suelta.") }]);
    expect(findings[0].message).toContain("«Una nota suelta.»");
    expect(findings[0].message).toContain("`- [ ] Paso N — texto`");
    expect(findings[0].message).toContain("`**Modo de ejecución acordado:** <texto>`");
  });

  test("un hallazgo por línea inválida, con el formato válido solo en el primero", () => {
    const handoff = HANDOFF.replace("**Modo de ejecución acordado:** auto", "Primera nota.\nSegunda nota.");
    const findings = checkCurrentPlanLines(makeCtx({ handoff }));
    expect(findings.map((f) => f.line)).toEqual([lineOf(handoff, "Primera nota."), lineOf(handoff, "Segunda nota.")]);
    expect(findings[0].message).toContain("Formato válido");
    expect(findings[1].message).not.toContain("Formato válido");
  });

  test("«Ninguno», «No aplica» y la línea de modo en inglés son válidos; los comentarios no cuentan", () => {
    const handoff = HANDOFF.replace("**Modo de ejecución acordado:** auto", "No aplica.\n**Agreed execution mode:** all in a row\n<!-- nota\nen dos líneas -->");
    expect(checkCurrentPlanLines(makeCtx({ handoff }))).toEqual([]);
  });

  test("el texto ajeno fuera del plan no cuenta", () => {
    const handoff = HANDOFF.replace("El paso 2 y el cierre.", "Una nota cualquiera.");
    expect(checkCurrentPlanLines(makeCtx({ handoff }))).toEqual([]);
  });
});

describe("current-mode", () => {
  const withMode = (line: string) => HANDOFF.replace("**Modo de ejecución acordado:** auto", line);

  test("uno de los cuatro modos, en cualquier idioma de la etiqueta: sin hallazgos", () => {
    for (const mode of ["guided", "step-by-step", "auto", "extreme"]) {
      expect(checkCurrentMode(makeCtx({ handoff: withMode(`**Modo de ejecución acordado:** ${mode}`) }))).toEqual([]);
      expect(checkCurrentMode(makeCtx({ handoff: withMode(`**Agreed execution mode:** ${mode}`) }))).toEqual([]);
    }
  });

  test("texto libre de antes: aviso en esa línea, que manda a `acsuite task mode`", () => {
    const handoff = withMode("**Modo de ejecución acordado:** todos los pasos seguidos");
    const findings = checkCurrentMode(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "current-mode", file: FILE, line: lineOf(handoff, "**Modo de ejecución acordado:**") }]);
    expect(findings[0].message).toContain("«todos los pasos seguidos»");
    expect(findings[0].message).toContain("`acsuite task mode <valor>`");
  });

  test("el placeholder de la plantilla y una línea sin valor también avisan", () => {
    for (const value of ["[todos los pasos seguidos / uno a la vez con confirmación]", ""]) {
      const handoff = withMode(`**Modo de ejecución acordado:** ${value}`);
      expect(checkCurrentMode(makeCtx({ handoff })).map((f) => f.code)).toEqual(["current-mode"]);
    }
  });

  test("sin línea de modo, sin tarea en curso o sin handoff.md: sin hallazgos", () => {
    expect(checkCurrentMode(makeCtx({ handoff: withMode("") }))).toEqual([]);
    expect(checkCurrentMode(makeCtx({ handoff: HANDOFF_IDLE }))).toEqual([]);
    expect(checkCurrentMode(makeCtx({ handoff: null }))).toEqual([]);
  });

  test("una línea de modo dentro de un comentario o fuera del plan no cuenta", () => {
    expect(checkCurrentMode(makeCtx({ handoff: withMode("<!-- **Modo de ejecución acordado:** a mano -->") }))).toEqual([]);
    const outside = HANDOFF.replace("El paso 2 y el cierre.", "**Modo de ejecución acordado:** a mano");
    expect(checkCurrentMode(makeCtx({ handoff: outside }))).toEqual([]);
  });
});
