// Tarea en progreso de handoff.md: que la línea `Tarea N — título` se reconozca, que traiga un plan y
// que ese plan solo tenga lo que `close` y `pause` aceptan.

import { isPlaceholder, stripComments } from "../../../_shared/parse/markdown.ts";
import { detectLanguage } from "../../../task-manager/src/write/language.ts";
import { EXECUTION_MODES, invalidPlanLineMessages, invalidPlanLines, isExecutionMode, modeLines, unknownSubsectionMessage, unknownSubsections } from "../../../task-manager/src/write/handoff.ts";
import type { Check, Finding } from "../types.ts";

// «Sin tarea en curso» en los idiomas conocidos (el texto de la plantilla está traducido).
const NO_TASK_RE = /sin tarea en curso|no task in progress|no current task|no active task/i;

export const checkCurrentTask: Check = ({ docs }) => {
  const { handoff } = docs;
  const section = handoff.parsed.sections["in-progress"];
  if (!handoff.exists || !section) return [];
  const { task, planSteps: steps } = handoff.parsed.inProgress;
  const findings: Finding[] = [];

  if (task) {
    if (!steps.length) {
      findings.push({
        severity: "warning",
        code: "current-no-plan",
        file: handoff.file,
        line: task.range?.startLine ?? section.headerRange.startLine,
        message: `La Tarea ${task.number} está en curso pero no tiene plan: agrega sus pasos como checkboxes \`- [ ] Paso\` (el seguimiento cuenta el avance con ellos).`,
      });
    }
    return findings;
  }

  // Sin tarea reconocida: está bien solo si la sección dice que no hay (o aún es la plantilla, que ya avisa el check de placeholders).
  const body = stripComments(section.body).trim();
  if (body && !NO_TASK_RE.test(body) && !isPlaceholder(body)) {
    findings.push({
      severity: "warning",
      code: "current-task-line",
      file: handoff.file,
      line: section.headerRange.startLine,
      message:
        "«Tarea en progreso» tiene contenido pero no se reconoce la línea `Tarea N — título` (antes de la primera subsección `###`): escríbela así, o deja «Sin tarea en curso» si no hay ninguna.",
    });
  }
  return findings;
};

/** Líneas del plan de la tarea en curso que `close` y `pause` rechazarían (ni paso, ni línea de modo). */
export const checkCurrentPlanLines: Check = ({ docs }) => {
  const { handoff } = docs;
  if (!handoff.exists || !handoff.parsed.inProgress.task) return [];
  const { task, subsections } = handoff.parsed.inProgress;
  const lang = detectLanguage([task.label]).lang;
  const invalids = invalidPlanLines(handoff.text, subsections);
  const messages = invalidPlanLineMessages(invalids, lang);
  return invalids.map((invalid, i) => ({
    severity: "warning",
    code: "current-plan-line",
    file: handoff.file,
    line: invalid.line ?? task.range?.startLine ?? 1,
    message: messages[i],
  }));
};

/** Subsecciones de la tarea en curso con un título que `close` y `pause` no reconocen (por ejemplo `### Notas`). */
export const checkCurrentSubsections: Check = ({ docs }) => {
  const { handoff } = docs;
  if (!handoff.exists || !handoff.parsed.inProgress.task) return [];
  const { task, subsections } = handoff.parsed.inProgress;
  return unknownSubsections(subsections).map((unknown) => ({
    severity: "warning",
    code: "current-subsection",
    file: handoff.file,
    line: unknown.line ?? task.range?.startLine ?? 1,
    message: unknownSubsectionMessage(unknown, detectLanguage([task.label]).lang),
  }));
};

/** La línea de modo de ejecución de la tarea en curso con un valor que no es uno de los cuatro modos (texto de antes de `task mode`). */
export const checkCurrentMode: Check = ({ docs }) => {
  const { handoff } = docs;
  if (!handoff.exists || !handoff.parsed.inProgress.task) return [];
  const { task, subsections } = handoff.parsed.inProgress;
  return modeLines(handoff.text, subsections)
    .filter((mode) => mode.value === null || !isExecutionMode(mode.value))
    .map((mode) => ({
      severity: "warning",
      code: "current-mode",
      file: handoff.file,
      line: mode.line,
      message: `El modo de ejecución de la Tarea ${task.number} ${mode.value === null ? "está vacío" : `dice «${mode.value.slice(0, 60)}»`}, que no es uno de los modos válidos (${EXECUTION_MODES.join(", ")}): fíjalo con \`acsuite task mode <valor>\`.`,
    }));
};
