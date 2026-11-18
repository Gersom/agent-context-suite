// Documentos de prueba con una tarea etiquetada (`empresa1 trabajo`) en cada sección que el board
// pinta: en curso, pausadas, libres, bloqueadas, completadas y el team-backlog. En español y en inglés.

import { buildModel } from "../src/model/model.ts";
import { buildTeamBacklog } from "../src/model/team.ts";

export interface LabeledDocs {
  handoff: string;
  backlog: string;
  history: string;
  teamBacklog: string;
}

const ES: LabeledDocs = {
  handoff: `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

**Tarea:** Tarea 12 — Implementar el parser

- **Etiquetas:** empresa1 trabajo

Descripción breve.

### Plan

- [ ] Paso 1 — Escribir

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

### Tarea 8 — Revisar la API

- **Etiquetas:** empresa1 trabajo
- **Descripción:** De qué trata.
- **Por qué se pausó:** Prioridad.
`,
  backlog: `# Backlog

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 3 — Exportar como skill

- **Etiquetas:** empresa1 trabajo

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea 5 — Rehacer el README

- **Bloqueos:** \`[postergada]\` se retoma después.
- **Etiquetas:** empresa1 trabajo

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas
`,
  history: `# Historial

## 2026-10-05 — ✅ Tarea 11 — Escribir el parser

- **Origen:** team-backlog
- **Etiquetas:** empresa1 trabajo
- Quedó listo.
`,
  teamBacklog: `<!-- agent-context-skill:section=free -->
## Tareas libres

### Revisar el copy

- **Etiquetas:** empresa1 trabajo

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas
`,
};

const EN: LabeledDocs = {
  handoff: `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Task in progress

**Task:** Task 12 — Implement the parser

- **Tags:** company1 work

Short description.

### Plan

- [ ] Step 1 — Write

<!-- agent-context-skill:section=paused -->
## Paused tasks

### Task 8 — Review the API

- **Tags:** company1 work
- **Description:** What it is about.
- **Why it was paused:** Priority.
`,
  backlog: `# Backlog

<!-- agent-context-skill:section=free -->
## Free tasks

### Task 3 — Export as skill

- **Tags:** company1 work

<!-- agent-context-skill:section=blocked -->
## Blocked / postponed tasks

### Task 5 — Redo the README

- **Blockers:** \`[postponed]\` resumes later.
- **Tags:** company1 work

<!-- agent-context-skill:section=grouped -->
## Grouped tasks
`,
  history: `# History

## 2026-10-05 — ✅ Task 11 — Write the parser

- **Origin:** team-backlog
- **Tags:** company1 work
- Done.
`,
  teamBacklog: `<!-- agent-context-skill:section=free -->
## Free tasks

### Review the copy

- **Tags:** company1 work

<!-- agent-context-skill:section=blocked -->
## Blocked / postponed tasks
`,
};

export const LABELED: Record<"es" | "en", LabeledDocs> = { es: ES, en: EN };

/** Modelo del panel y del team-backlog armados con los documentos etiquetados del idioma dado. */
export function labeledModel(lang: "es" | "en" = "es", docs: LabeledDocs = LABELED[lang]) {
  return {
    model: buildModel({ handoffText: docs.handoff, backlogText: docs.backlog, historyText: docs.history }),
    teamBacklog: buildTeamBacklog(docs.teamBacklog),
  };
}

/** Filas de contenido del recuadro cuyo título empieza con `title`, sin los bordes ni el relleno final. */
export function rowsOf(out: string, title: string): string[] {
  const lines = out.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`╭─ ${title}`));
  if (start < 0) throw new Error(`no se encontró el recuadro "${title}"`);
  const rows: string[] = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("╰"); i++) rows.push(lines[i].slice(2, -2).trimEnd());
  return rows;
}
