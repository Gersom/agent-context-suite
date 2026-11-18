// Archivos que tienen que existir: los del operador (handoff y backlog son imprescindibles),
// los avisos de operators.md y los AGENTS.md / CLAUDE.md de la raíz con el bloque de la skill.

import { LEGACY_ROOT_PREFIX, MARKER_PREFIX } from "../../../_shared/markers.ts";
import type { Check, CheckContext, Finding } from "../types.ts";

/** Marca con la que la skill delimita su bloque en AGENTS.md y CLAUDE.md. */
export const ROOT_MARKER = `${MARKER_PREFIX}:start`;

/** Marca anterior a la 2.0.0: se sigue aceptando (el check `legacy-marker` avisa que hay que actualizarla). */
const LEGACY_ROOT_MARKER = `${LEGACY_ROOT_PREFIX}:start`;

/** Handoff y backlog son imprescindibles (error); history y team-backlog, no (aviso). */
export const checkFilesExist: Check = ({ docs }) => {
  const findings: Finding[] = [];
  const targets = [
    { doc: docs.handoff, severity: "error" as const, what: "el estado de la tarea en curso" },
    { doc: docs.backlog, severity: "error" as const, what: "la cola de tareas y su «Próximo número de tarea»" },
    { doc: docs.history, severity: "warning" as const, what: "el registro de tareas cerradas" },
    ...(docs.teamBacklog ? [{ doc: docs.teamBacklog, severity: "warning" as const, what: "las tareas del equipo sin dueño" }] : []),
  ];
  for (const { doc, severity, what } of targets) {
    if (doc.exists) continue;
    findings.push({
      severity,
      code: "file-missing",
      file: doc.file,
      line: null,
      message: `Falta ${doc.file.split("/").pop()}, que guarda ${what}: créalo desde la plantilla de la skill (el script no lo crea).`,
    });
  }
  return findings;
};

/** Líneas de operators.md que no se pudieron leer (la lista de operadores las ignora). */
export const checkOperatorsReadable: Check = ({ operatorsFile, operatorWarnings }) => {
  if (!operatorsFile) return [];
  return operatorWarnings.map((warning) => ({
    severity: "warning" as const,
    code: "operators-unreadable",
    file: operatorsFile,
    line: null,
    message: `${warning}. Usa el formato \`- <carpeta>: <correo>, <correo>\` (o \`- <nombre> (solo team-backlog): <correo>\`).`,
  }));
};

/** AGENTS.md y CLAUDE.md de la raíz: AGENTS.md tiene que existir; CLAUDE.md es opcional (si falta, no se avisa: con AGENTS.md ausente ya avisa AGENTS.md, sin duplicar). Los que existen deben dirigir al agente a la documentación (el bloque de la skill o una mención de docs/agents; CLAUDE.md puede solo redirigir a AGENTS.md). */
export const checkRootFiles = ({ rootFiles }: Pick<CheckContext, "rootFiles">): Finding[] => {
  const findings: Finding[] = [];
  for (const root of rootFiles) {
    if (!root.exists) {
      if (root.file === "CLAUDE.md") continue;
      findings.push({
        severity: "warning",
        code: "root-file",
        file: root.file,
        line: null,
        message: `Falta ${root.file} en la raíz del proyecto: es lo primero que lee el agente. Créalo desde la plantilla de la skill.`,
      });
    } else if (!root.text.includes(ROOT_MARKER) && !root.text.includes(LEGACY_ROOT_MARKER) && !root.text.includes("docs/agents") && !root.text.includes("AGENTS.md")) {
      findings.push({
        severity: "warning",
        code: "root-file",
        file: root.file,
        line: null,
        message: `${root.file} no contiene el marcador \`<!-- ${ROOT_MARKER} -->\`: el agente no sabrá que debe leer docs/agents. Agrega el bloque de la skill entre \`${ROOT_MARKER}\` y \`${MARKER_PREFIX}:end\`.`,
      });
    }
  }
  return findings;
};
