// Documentos válidos para los tests de docs-check. La introducción de cada archivo se lee de
// test/fixtures/template/, una copia congelada de las plantillas de la skill (repo
// agent-context-skill), y las secciones se completan como lo haría un proyecto. Los tests rompen
// estos textos con `replace` para producir un solo problema a la vez.
//
// skill-checks compara este snapshot contra la skill (SKILL_DIR/template) cuando está presente,
// así que avisa si se desfasa. Para regenerarlo, copia los archivos desde SKILL_DIR/template/ a
// test/fixtures/template/ conservando el mismo path relativo.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { upsertSuiteBlock } from "../../_shared/rules-block.ts";

const TEMPLATE = join(import.meta.dir, "fixtures", "template");

/** Una plantilla con saltos de línea LF. */
function template(...parts: string[]): string {
  return readFileSync(join(TEMPLATE, ...parts), "utf8").replace(/\r\n/g, "\n");
}

/** El texto de la plantilla hasta `marker` (sin incluirlo). */
function until(text: string, marker: string): string {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`La plantilla ya no contiene «${marker}»: actualiza los fixtures.`);
  return text.slice(0, at);
}

export const ANCHOR = (id: string) => `<!-- agent-context-skill:section=${id} -->`;

/** Línea (1-based) donde aparece `needle` por primera vez en `text`. */
export function lineOf(text: string, needle: string): number {
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`No se encontró «${needle}» en el texto.`);
  return text.slice(0, at).split("\n").length;
}

// -- handoff.md ---------------------------------------------------------------------------------

const HANDOFF_INTRO = until(template("agents", "handoff.md"), ANCHOR("in-progress"));

/** Sección «Tarea en progreso» con una tarea y su plan. */
export const IN_PROGRESS_TASK = `${ANCHOR("in-progress")}
## Tarea en progreso

Tarea 7 — Escribir el parser

Se escribe el parser de los documentos para que el seguimiento los lea.

### Plan

- [x] Paso 1 — Preparar el esqueleto · tests en verde · commit abc1234
- [ ] Paso 2 — Completar los casos
- [ ] Documentar cierre de tarea

**Modo de ejecución acordado:** auto

### Qué falta

El paso 2 y el cierre.

### Decisiones a medio camino

Ninguna.

### Próximo paso concreto

Paso 2 — completar los casos.

`;

/** Sección «Tarea en progreso» sin tarea. */
export const IN_PROGRESS_IDLE = `${ANCHOR("in-progress")}
## Tarea en progreso

Sin tarea en curso.

`;

/** Sección «Tareas pausadas» con una tarea. */
export const PAUSED_TASK = `${ANCHOR("paused")}
## Tareas pausadas

### Tarea 5 — Migrar la documentación vieja

- **Qué falta:** revisar el \`setup.md\`.
- **Por qué se pausó:** otra prioridad.
`;

export const PAUSED_NONE = `${ANCHOR("paused")}
## Tareas pausadas

Ninguna.
`;

export const HANDOFF = `${HANDOFF_INTRO}${IN_PROGRESS_TASK}${PAUSED_TASK}`;
export const HANDOFF_IDLE = `${HANDOFF_INTRO}${IN_PROGRESS_IDLE}${PAUSED_NONE}`;

// -- backlog.md ---------------------------------------------------------------------------------

const BACKLOG_INTRO_TEMPLATE = until(template("agents", "backlog.md"), ANCHOR("free"));

/** Introducción de la plantilla con «Próximo número de tarea» en `next`. */
export function backlogIntro(next: number): string {
  const intro = BACKLOG_INTRO_TEMPLATE.replace(/(\*\*Próximo número de tarea:\*\* )\d+/, `$1${next}`);
  if (!intro.includes(`**Próximo número de tarea:** ${next}`)) throw new Error("La plantilla ya no trae «Próximo número de tarea»: actualiza los fixtures.");
  return intro;
}

export const BACKLOG_FREE = `${ANCHOR("free")}
## Tareas libres

### Tarea 8 — Agregar el comando de exportación

- **Descripción:** exportar el estado a JSON.
- **Decisiones/temas a definir antes de empezar:** Ninguno.
- **Bloqueos:** Ninguno.
- **Disparador:** cuando el operador pregunte por tareas pendientes.
- **Agregada:** 2026-10-01

### Tarea 9 — Revisar los mensajes de error

- **Descripción:** unificar el tono.
- **Bloqueos:** \`[Resuelto el 2026-10-02]\` — era \`[dependencia]\` la Tarea 7.
- **Agregada:** 2026-10-01

`;

export const BACKLOG_BLOCKED = `${ANCHOR("blocked")}
## Tareas bloqueadas / pospuestas

### Tarea 6 — Publicar la versión 2

- **Descripción:** empaquetar y publicar.
- **Bloqueos:** \`[postergada]\` esperar a que cierre la Tarea 7.
- **Desbloquea:** ninguna.
- **Agregada:** 2026-09-30

`;

export const BACKLOG_GROUPED_NONE = `${ANCHOR("grouped")}
## Tareas agrupadas

No aplica todavía — ningún grupo formado.
`;

export const BACKLOG = `${backlogIntro(10)}---

${BACKLOG_FREE}${BACKLOG_BLOCKED}${BACKLOG_GROUPED_NONE}`;

/** Backlog con un grupo: la referencia en libres y el detalle de sus tareas en «Tareas agrupadas». */
export const BACKLOG_WITH_GROUP = `${backlogIntro(13)}---

${ANCHOR("free")}
## Tareas libres

### Grupo — Mejorar el parseo (Tareas 11, 12)

- **Resumen:** dos arreglos del mismo parser.

${BACKLOG_BLOCKED}${ANCHOR("grouped")}
## Tareas agrupadas

### Grupo — Mejorar el parseo

#### Tarea 11 — Aceptar guiones largos

- **Descripción:** aceptar — y –.
- **Bloqueos:** Ninguno.

#### Tarea 12 — Ignorar ejemplos de código

- **Descripción:** no leer ejemplos.
- **Bloqueos:** Ninguno.
`;

// -- history.md ---------------------------------------------------------------------------------

const HISTORY_INTRO = until(template("agents", "history.md"), "<!-- Si la skill se agrega");

export const HISTORY_ENTRIES = `## 2026-10-03 — ✅ Tarea 4 — Ignorar bloques de código

- Se dejó de leer los ejemplos de las plantillas porque confundían al seguimiento.
- Commit: abc1234.

## 2026-10-02 — ❌ Tarea 2 — Soportar YAML

- Descartada: el formato es markdown y no hace falta otro.

## 2026-10-01 — ✅ Configurar el repositorio

- Entrada sin número: nació antes de la numeración.
`;

export const HISTORY = `${HISTORY_INTRO}${HISTORY_ENTRIES}`;

// -- team-backlog.md y operators.md (multi-operador) --------------------------------------------

const TEAM_INTRO = until(template("multi", "team-backlog.md"), ANCHOR("free"));

export const TEAM_BACKLOG = `${TEAM_INTRO}${ANCHOR("free")}
## Tareas libres

### Revisar el copy del onboarding

- **Descripción:** ajustar los textos.
- **Decisiones/temas a definir antes de empezar:** Ninguno.
- **Bloqueos:** Ninguno.
- **Agregada:** 2026-10-01 por ana

${ANCHOR("blocked")}
## Tareas bloqueadas / pospuestas

Ninguna.
`;

const OPERATORS_INTRO = until(template("multi", "operators.md"), "- [Placeholder");

export const OPERATORS = `${OPERATORS_INTRO}- gersom: gersom@mail.com, g@work.com
- ana: ana@mail.com
- luis (solo team-backlog): luis@mail.com
`;

// -- AGENTS.md y CLAUDE.md de la raíz -----------------------------------------------------------

/** El bloque delimitado de la skill de una plantilla, sin la guía para el agente que la precede. */
function rootBlock(name: string): string {
  const text = template(name);
  return text.slice(text.indexOf("<!-- agent-context-skill:start -->"));
}

export const ROOT_AGENTS = `# Mi proyecto\n\n${rootBlock("AGENTS.md")}`;
export const ROOT_CLAUDE = rootBlock("CLAUDE.md");

// -- rules.md de la carpeta de agentes -------------------------------------------------------------

/** rules.md de la plantilla, tal como la genera la skill (sin la sección de la suite): lleva el marcador de versión en la línea 1. */
export const TEMPLATE_RULES = template("agents", "rules.md");

/** rules.md de un proyecto que ya corrió `acsuite init`: la plantilla más el bloque de la suite (no es parte del espejo de la skill). */
export const RULES = upsertSuiteBlock(TEMPLATE_RULES).text;

// -- Variantes ----------------------------------------------------------------------------------

/** Backlog válido sin tareas, con «Próximo número de tarea» en `next`. */
export function emptyBacklog(next: number): string {
  return `${backlogIntro(next)}---

${ANCHOR("free")}
## Tareas libres

Ninguna.

${ANCHOR("blocked")}
## Tareas bloqueadas / pospuestas

Ninguna.

${BACKLOG_GROUPED_NONE}`;
}

/** history.md válido sin entradas. */
export const HISTORY_EMPTY = HISTORY_INTRO;

// -- Plantillas sin completar (con sus placeholders) --------------------------------------------

export const TEMPLATE_HANDOFF = template("agents", "handoff.md");
export const TEMPLATE_BACKLOG = template("agents", "backlog.md");
export const TEMPLATE_HISTORY = template("agents", "history.md");
export const TEMPLATE_TEAM_BACKLOG = template("multi", "team-backlog.md");
