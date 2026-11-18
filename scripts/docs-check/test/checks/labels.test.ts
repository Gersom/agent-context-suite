import { describe, expect, test } from "bun:test";
import { checkBlockTags, checkLabels } from "../../src/checks/tasks.ts";
import { BACKLOG, BACKLOG_WITH_GROUP, HANDOFF, HANDOFF_IDLE, HISTORY, IN_PROGRESS_TASK, TEAM_BACKLOG, TEMPLATE_BACKLOG } from "../fixtures.ts";
import { brief, makeCtx, PATHS } from "../helpers.ts";

/** Línea de la ÚLTIMA coincidencia de `needle`: las plantillas explican el campo en su texto de formato, y el que se valida es el de la tarea, que va después. */
function lineOf(text: string, needle: string): number {
  const at = text.lastIndexOf(needle);
  if (at < 0) throw new Error(`No se encontró «${needle}» en el texto.`);
  return text.slice(0, at).split("\n").length;
}

const BACKLOG_FILE = `${PATHS.flat}/backlog.md`;
const HANDOFF_FILE = `${PATHS.flat}/handoff.md`;
const HISTORY_FILE = `${PATHS.flat}/history.md`;

/** `text` con el campo de etiquetas en una línea nueva justo después de la línea que contiene `after`. */
const withLabels = (text: string, after: string, value: string, label = "Etiquetas") => text.replace(after, `${after}\n- **${label}:** ${value}`);

// Un campo por documento (la tarea libre 8, la bloqueada 6, la agrupada 11, la pausada 5...).
const FREE = "- **Descripción:** exportar el estado a JSON.";
const BLOCKED = "- **Descripción:** empaquetar y publicar.";
const GROUPED = "- **Descripción:** aceptar — y –.";
const PAUSED = "- **Por qué se pausó:** otra prioridad.";
const TEAM = "- **Descripción:** ajustar los textos.";

const backlogWith = (value: string, label?: string) => withLabels(BACKLOG, FREE, value, label);

describe("label-format y label-duplicate: valores", () => {
  test("etiquetas válidas, en español y en inglés: sin hallazgos", () => {
    expect(checkLabels(makeCtx())).toEqual([]);
    expect(checkLabels(makeCtx({ backlog: backlogWith("empresa1 trabajo ideasBrillantes") }))).toEqual([]);
    expect(checkLabels(makeCtx({ backlog: backlogWith("company1 work", "Tags") }))).toEqual([]);
    expect(checkLabels(makeCtx({ backlog: backlogWith("a 1 ABC9") }))).toEqual([]);
  });

  test("con `#`: aviso en la línea del campo que nombra la etiqueta y dice que se quite", () => {
    const backlog = backlogWith("empresa1 #trabajo");
    const findings = checkLabels(makeCtx({ backlog }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: BACKLOG_FILE, line: lineOf(backlog, "**Etiquetas:**") }]);
    expect(findings[0].message).toContain("«#trabajo»");
    expect(findings[0].message).toContain("quita el `#`");
    expect(findings[0].message).toContain("la Tarea 8");
  });

  test("con comas: la etiqueta pegada a la coma avisa y el mensaje dice cómo separarlas", () => {
    const findings = checkLabels(makeCtx({ backlog: backlogWith("empresa1, trabajo") }));
    expect(findings.map((f) => f.code)).toEqual(["label-format"]);
    expect(findings[0].message).toContain("«empresa1,»");
    expect(findings[0].message).toContain("quita la coma");
  });

  test("con tildes o ñ: un aviso por etiqueta, con el carácter", () => {
    const findings = checkLabels(makeCtx({ backlog: backlogWith("diseño acción ok") }));
    expect(findings.map((f) => f.code)).toEqual(["label-format", "label-format"]);
    expect(findings[0].message).toContain("«diseño»");
    expect(findings[0].message).toContain("«ñ» no es una letra ASCII ni un número");
    expect(findings[1].message).toContain("«acción»");
    expect(findings[1].message).toContain("«ó»");
  });

  test("con un símbolo o un guion", () => {
    const findings = checkLabels(makeCtx({ backlog: backlogWith("a$b mi-etiqueta") }));
    expect(findings.map((f) => f.code)).toEqual(["label-format", "label-format"]);
    expect(findings[0].message).toContain("«$»");
    expect(findings[1].message).toContain("«-»");
  });

  test("varios caracteres no válidos en una etiqueta: un solo aviso con todos", () => {
    const findings = checkLabels(makeCtx({ backlog: backlogWith("#año,") }));
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("quita el `#`");
    expect(findings[0].message).toContain("«ñ»");
    expect(findings[0].message).toContain("quita la coma");
  });

  test("repetidas sin distinguir mayúsculas: un aviso por cada repetición, que dice cuál ya estaba", () => {
    const backlog = backlogWith("Trabajo uno trabajo TRABAJO");
    const findings = checkLabels(makeCtx({ backlog }));
    expect(findings.map(brief)).toEqual([
      { severity: "warning", code: "label-duplicate", file: BACKLOG_FILE, line: lineOf(backlog, "**Etiquetas:**") },
      { severity: "warning", code: "label-duplicate", file: BACKLOG_FILE, line: lineOf(backlog, "**Etiquetas:**") },
    ]);
    expect(findings[0].message).toContain("«trabajo»");
    expect(findings[0].message).toContain("«Trabajo»");
    expect(findings[1].message).toContain("«TRABAJO»");
  });

  test("`a #A`: una con `#` que además repite otra avisa el formato y el duplicado", () => {
    expect(checkLabels(makeCtx({ backlog: backlogWith("a #A") })).map((f) => f.code)).toEqual(["label-format", "label-duplicate"]);
  });

  test("campo vacío, solo espacios o placeholder de plantilla: sin hallazgos", () => {
    expect(checkLabels(makeCtx({ backlog: backlogWith("") }))).toEqual([]);
    expect(checkLabels(makeCtx({ backlog: backlogWith("   ") }))).toEqual([]);
    expect(checkLabels(makeCtx({ backlog: backlogWith("[Placeholder — etiquetas]") }))).toEqual([]);
    expect(checkLabels(makeCtx({ backlog: TEMPLATE_BACKLOG }))).toEqual([]);
  });

  test("«Ninguna», «Ninguno» y «None» son etiquetas válidas", () => {
    for (const value of ["Ninguna", "Ninguno", "None"]) expect(checkLabels(makeCtx({ backlog: backlogWith(value) }))).toEqual([]);
    expect(checkLabels(makeCtx({ backlog: backlogWith("Ninguna.") })).map((f) => f.code)).toEqual(["label-format"]);
  });

  test("la etiqueta del campo en inglés o con otras mayúsculas también se revisa", () => {
    for (const label of ["Tags", "TAGS", "etiquetas", "ETIQUETAS"]) {
      expect(checkLabels(makeCtx({ backlog: backlogWith("#a", label) })).map((f) => f.code)).toEqual(["label-format"]);
    }
  });

  test("otros campos con `#` o tildes no se revisan", () => {
    expect(checkLabels(makeCtx({ backlog: BACKLOG.replace("exportar el estado a JSON.", "exportar #ñandú, a JSON.") }))).toEqual([]);
  });
});

describe("label-format con un corchete inicial", () => {
  test("en una libre ya lo avisa block-tag: checkLabels no repite el aviso", () => {
    const backlog = backlogWith("[postergada]");
    expect(checkLabels(makeCtx({ backlog }))).toEqual([]);
    expect(checkBlockTags(makeCtx({ backlog })).map((f) => f.code)).toEqual(["block-tag"]);
  });

  test("en una bloqueada block-tag no avisa: es label-format", () => {
    const backlog = withLabels(BACKLOG, BLOCKED, "[postergada]");
    const findings = checkLabels(makeCtx({ backlog }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: BACKLOG_FILE, line: lineOf(backlog, "**Etiquetas:**") }]);
    expect(findings[0].message).toContain("«[postergada]»");
    expect(findings[0].message).toContain("quita los corchetes");
  });

  test("en una libre, un bloqueo resuelto (`[Resuelto ...]`) no lo cubre block-tag: label-format", () => {
    expect(checkLabels(makeCtx({ backlog: backlogWith("[Resuelto el 2026-10-02]") })).map((f) => f.code)).toEqual(["label-format", "label-format"]);
    expect(checkBlockTags(makeCtx({ backlog: backlogWith("[Resuelto el 2026-10-02]") }))).toEqual([]);
  });

  test("en una pausada, una agrupada y la tarea en curso: label-format", () => {
    expect(checkLabels(makeCtx({ handoff: withLabels(HANDOFF, PAUSED, "[postergada]") })).map((f) => f.code)).toEqual(["label-format"]);
    expect(checkLabels(makeCtx({ backlog: withLabels(BACKLOG_WITH_GROUP, GROUPED, "[postergada]") })).map((f) => f.code)).toEqual(["label-format"]);
  });
});

describe("label-format en cada documento", () => {
  test("backlog.md: libres, bloqueadas y agrupadas, cada una en su línea", () => {
    const free = withLabels(BACKLOG, FREE, "#uno");
    expect(checkLabels(makeCtx({ backlog: free })).map(brief)).toEqual([{ severity: "warning", code: "label-format", file: BACKLOG_FILE, line: lineOf(free, "**Etiquetas:**") }]);

    const blocked = withLabels(BACKLOG, BLOCKED, "a,b");
    const found = checkLabels(makeCtx({ backlog: blocked }));
    expect(found.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: BACKLOG_FILE, line: lineOf(blocked, "**Etiquetas:**") }]);
    expect(found[0].message).toContain("la Tarea 6");

    const grouped = withLabels(BACKLOG_WITH_GROUP, GROUPED, "ñ");
    const inGroup = checkLabels(makeCtx({ backlog: grouped }));
    expect(inGroup.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: BACKLOG_FILE, line: lineOf(grouped, "**Etiquetas:**") }]);
    expect(inGroup[0].message).toContain("la Tarea 11");
  });

  test("backlog.md: las tres a la vez", () => {
    const backlog = withLabels(withLabels(BACKLOG, FREE, "#a"), BLOCKED, "#b");
    expect(checkLabels(makeCtx({ backlog })).map((f) => f.line)).toEqual([lineOf(backlog, "**Etiquetas:** #a"), lineOf(backlog, "**Etiquetas:** #b")]);
  });

  test("handoff.md, tarea en curso: en el bloque previo a la primera subsección, con su línea", () => {
    const handoff = HANDOFF.replace("Tarea 7 — Escribir el parser\n", "Tarea 7 — Escribir el parser\n\n- **Etiquetas:** #uno dos");
    const findings = checkLabels(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: HANDOFF_FILE, line: lineOf(handoff, "**Etiquetas:**") }]);
    expect(findings[0].message).toContain("la Tarea 7");
  });

  test("handoff.md, tarea en curso: la línea es correcta aunque haya un comentario multilínea antes y se aceptan `Tags` y duplicados", () => {
    const handoff = HANDOFF.replace("Tarea 7 — Escribir el parser\n", "Tarea 7 — Escribir el parser\n<!-- nota\nde varias\nlíneas -->\n- **Origen:** la Tarea 3\n- **Tags:** a A");
    const findings = checkLabels(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-duplicate", file: HANDOFF_FILE, line: lineOf(handoff, "**Tags:**") }]);
  });

  test("handoff.md, tarea en curso: lo que viene después de la primera subsección no se mira", () => {
    const handoff = HANDOFF.replace("### Qué falta\n", "### Qué falta\n\n- **Etiquetas:** #x\n");
    expect(checkLabels(makeCtx({ handoff }))).toEqual([]);
  });

  test("handoff.md, tarea en curso: sin tarea o sin subsecciones", () => {
    expect(checkLabels(makeCtx({ handoff: HANDOFF_IDLE }))).toEqual([]);
    const noSubsections = HANDOFF.replace(IN_PROGRESS_TASK, IN_PROGRESS_TASK.slice(0, IN_PROGRESS_TASK.indexOf("### Plan")) + "- **Etiquetas:** #x\n\n");
    expect(checkLabels(makeCtx({ handoff: noSubsections })).map((f) => f.code)).toEqual(["label-format"]);
  });

  test("handoff.md, tarea pausada", () => {
    const handoff = withLabels(HANDOFF, PAUSED, "bien mal#");
    const findings = checkLabels(makeCtx({ handoff }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: HANDOFF_FILE, line: lineOf(handoff, "**Etiquetas:**") }]);
    expect(findings[0].message).toContain("la Tarea 5");
  });

  test("history.md: el primer bloque de campos de la entrada, con su línea", () => {
    const header = "## 2026-10-03 — ✅ Tarea 4 — Ignorar bloques de código\n\n";
    const history = HISTORY.replace(header, `${header}- **Origen:** team-backlog\n- **Etiquetas:** #uno dos\n`);
    const findings = checkLabels(makeCtx({ history }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: HISTORY_FILE, line: lineOf(history, "**Etiquetas:**") }]);
    expect(findings[0].message).toContain("la entrada de la Tarea 4");
  });

  test("history.md: entrada sin número, duplicados e inglés", () => {
    const header = "## 2026-10-01 — ✅ Configurar el repositorio\n\n";
    const history = HISTORY.replace(header, `${header}- **Tags:** a b A\n`);
    const findings = checkLabels(makeCtx({ history }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-duplicate", file: HISTORY_FILE, line: lineOf(history, "**Tags:**") }]);
    expect(findings[0].message).toContain("«Configurar el repositorio»");
  });

  test("history.md: una viñeta del resumen con ese nombre no cuenta (solo el primer bloque)", () => {
    const history = HISTORY.replace("- Commit: abc1234.", "- Commit: abc1234.\n- **Etiquetas:** #x");
    expect(checkLabels(makeCtx({ history }))).toEqual([]);
    const afterSummary = HISTORY.replace("## 2026-10-03 — ✅ Tarea 4 — Ignorar bloques de código\n\n", "## 2026-10-03 — ✅ Tarea 4 — Ignorar bloques de código\n\n- Se hizo algo.\n- **Etiquetas:** #x\n");
    expect(checkLabels(makeCtx({ history: afterSummary }))).toEqual([]);
  });

  test("team-backlog.md: libres y bloqueadas", () => {
    const teamBacklog = withLabels(TEAM_BACKLOG, TEAM, "#equipo");
    const findings = checkLabels(makeCtx({ teamBacklog }));
    expect(findings.map(brief)).toEqual([{ severity: "warning", code: "label-format", file: PATHS.teamBacklog, line: lineOf(teamBacklog, "**Etiquetas:**") }]);
    expect(findings[0].message).toContain("«Revisar el copy del onboarding»");

    const blocked = TEAM_BACKLOG.replace(
      "## Tareas bloqueadas / pospuestas\n\nNinguna.\n",
      "## Tareas bloqueadas / pospuestas\n\n### Migrar la base\n\n- **Descripción:** pasar a otra base.\n- **Bloqueos:** `[dependencia]` falta la API.\n- **Etiquetas:** a a\n",
    );
    expect(checkLabels(makeCtx({ teamBacklog: blocked })).map((f) => f.code)).toEqual(["label-duplicate"]);
  });

  test("repo plano: no hay team-backlog.md que revisar", () => {
    expect(checkLabels(makeCtx({ mode: "flat" }))).toEqual([]);
  });

  test("archivos ausentes: sin hallazgos", () => {
    expect(checkLabels(makeCtx({ handoff: null, backlog: null, history: null }))).toEqual([]);
    expect(checkLabels(makeCtx({ teamBacklog: null }))).toEqual([]);
  });

  test("una tarea que es un placeholder no se revisa", () => {
    const backlog = backlogWith("#a").replace("### Tarea 8 — Agregar el comando de exportación", "### Tarea 8 — [Placeholder — título]");
    expect(checkLabels(makeCtx({ backlog }))).toEqual([]);
  });
});
