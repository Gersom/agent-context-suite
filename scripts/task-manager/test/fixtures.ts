// Documentos de ejemplo para los tests de los comandos de lectura: cada uno cubre un caso que el
// fixture `es-anchors` no tiene (sin tarea en curso, pausadas con plan, bloqueadas candidatas a
// desbloquear, grupos entre las libres, disparadores, un número repetido...). Los cuerpos llevan
// marcadores (`CUERPO-...`) para comprobar qué texto se imprime y cuál no.

/** Con tarea en curso; el «Próximo paso concreto» es la última subsección, con un título que no se busca por nombre. */
export const HANDOFF_CURRENT = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 12 — Implementar el parser

Descripción de la tarea.

### Plan

- [x] Paso 1 — Preparar
- [x] Paso 2 — Escribir
- [ ] Paso 3 — Probar
- [ ] Cerrar

### Qué falta

Lo que falta.

### Decisiones a medio camino

- Una decisión.

### Cosa que hacer al retomar

Paso 3 — correr los tests.
Segunda línea del paso.

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

### Tarea 8 — Migrar la documentación vieja

- **Plan:**
  - [x] Paso 1 — Copiar
  - [ ] Paso 2 — Revisar
- **Qué falta:** revisar \`setup.md\`.

### Tarea 9 — Otra pausada

- **Qué falta:** nada.
`;

/** Sin tarea en curso y con una pausada. */
export const HANDOFF_IDLE = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Sin tarea en curso

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

### Tarea 8 — Migrar la documentación vieja

- **Plan:**
  - [x] Paso 1 — Copiar
  - [ ] Paso 2 — Revisar
- **Qué falta:** revisar \`setup.md\`.
`;

/** Sin tarea en curso ni pausadas. */
export const HANDOFF_EMPTY = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Sin tarea en curso

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

Ninguna.
`;

/**
 * Backlog con libres (una con grupo en medio, disparadores únicos y uno genérico repetido) y
 * bloqueadas: la 6 depende solo de la 11 (cerrada), la 7 de la 11 y de la 3 (libre), la 16 no tiene
 * bloqueo vigente y la 17 no menciona tareas.
 */
export const BACKLOG_RICH = `# Backlog

**Próximo número de tarea:** 20

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 1 — Probar el flujo completo

- **Descripción:** CUERPO-1
- **Bloqueos:** Ninguno.
- **Disparador:** cuando el operador pregunte por tareas pendientes.

### Grupo — Documentar los planes (Tareas 14, 15)

- **Resumen:** todo lo de \`plans/\`.

### Tarea 3 — Exportar como skill

- **Bloqueos:** \`[Resuelto el 2026-09-24]\` — era \`[postergada]\`.
- **Disparador:** cuando el operador pregunte por tareas pendientes.

### Tarea 18 — Revisar los links

- **Disparador:** antes del release.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea 6 — Publicar el sitio

- **Bloqueos:** \`[dependencia]\` depende de la Tarea 11.

### Tarea 7 — Rehacer el README

- **Bloqueos:** \`[postergada]\` esperar a la Tarea 11 y a la Tarea 3.

### Tarea 16 — Revisar la licencia

- **Bloqueos:** \`[Resuelto el 2026-10-01]\` — era \`[dependencia]\` la Tarea 11.

### Tarea 17 — Migrar a otro host

- **Bloqueos:** \`[postergada]\` hasta nuevo aviso del operador.

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

### Grupo — Documentar los planes

#### Tarea 14 — Redactar \`costs.md\`

- **Descripción:** costos CUERPO-14.
- **Disparador:** cuando se cierre el diseño.

#### Tarea 15 — Redactar \`limits.md\`

- **Descripción:** límites.
`;

/**
 * Backlog para `list`: tareas con «Agregada» (dos el mismo día, una con «por <operador>»), una sin
 * fecha, un grupo, y bloqueadas con tag `dependencia`, `postergada`, uno ya resuelto y uno ajeno.
 */
export const BACKLOG_DATED = `# Backlog

**Próximo número de tarea:** 30

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 21 — Reescribir la guía

- **Descripción:** Mejorar la documentación del instalador CUERPO-21.
- **Agregada:** 2026-10-06.

### Tarea 22 — Ordenar los scripts

- **Descripción:** Mover los scripts de \`bin/\`.
- **Agregada:** 2026-10-06 por ana

### Grupo — Pulir el sitio (Tareas 23, 24)

- **Resumen:** todo lo visual.

### Tarea 25 — Sin fecha

- **Descripción:** Esta tarea no trae fecha.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea 26 — Publicar el sitio

- **Descripción:** Subir todo.
- **Bloqueos:** \`[dependencia]\` depende de la Tarea 11.
- **Agregada:** 2026-10-05.

### Tarea 27 — Cambiar el logo

- **Descripción:** Un logo nuevo.
- **Bloqueos:** \`[postergada]\` hasta nuevo aviso.
- **Agregada:** 2026-10-04.

### Tarea 28 — Revisar el contrato

- **Bloqueos:** \`[Resuelto el 2026-10-01]\` — era \`[dependencia]\`.
- **Agregada:** 2026-10-01.

### Tarea 29 — Esperar al legal

- **Bloqueos:** \`[legal]\` pendiente de revisión.
- **Agregada:** 2026-09-30.

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

### Grupo — Pulir el sitio

#### Tarea 23 — Ajustar los colores

- **Descripción:** Una paleta más ÁCIDA.
- **Agregada:** 2026-10-08.

#### Tarea 24 — Revisar la tipografía

- **Descripción:** Probar otras fuentes.
- **Agregada:** 2026-10-03.
`;

/** Backlog sin tareas en ninguna sección. */
export const BACKLOG_EMPTY = `# Backlog

**Próximo número de tarea:** 5

<!-- agent-context-skill:section=free -->
## Tareas libres

Ninguna.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

Ninguna.

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

No aplica todavía — ningún grupo formado.
`;

/** Cinco entradas (la última sin número); los cuerpos no deben salir en `status`. */
export const HISTORY_RICH = `# History

---

## 2026-10-07 — ✅ Tarea 11 — Escribir el parser

- CUERPO-HISTORY-11: detalle largo que no debe imprimir status.

## 2026-10-06 — ❌ Tarea 10 — Usar YAML (descartada)

- CUERPO-HISTORY-10: motivo del descarte.

## 2026-10-05 — ✅ Tarea 9 — Preparar fixtures

- CUERPO-HISTORY-9.

## 2026-10-04 — ✅ Agregar la sección «Qué es»

- CUERPO-HISTORY-SIN-NUMERO.

## 2026-10-03 — ✅ Tarea 2 — La más vieja

- CUERPO-HISTORY-2.
`;

/** team-backlog con libres (una con disparador) y una bloqueada. */
export const TEAM_RICH = `# Backlog del equipo

<!-- agent-context-skill:section=free -->
## Tareas libres

### Revisar el copy del onboarding

- **Descripción:** CUERPO-TEAM-1
- **Disparador:** cuando salga el rediseño.

### Migrar el CI

- **Descripción:** CUERPO-TEAM-2

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Cambiar de proveedor

- **Bloqueos:** \`[postergada]\` esperar al contrato.
`;

/** Backlog con una sola tarea libre y la sección de bloqueadas vacía (al empezarla, «libres» queda vacía). */
export const BACKLOG_ONE = `# Backlog

**Próximo número de tarea:** 8

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 7 — La única

- **Descripción:** Hacer lo único.
- **Decisiones/temas a definir antes de empezar:** Ninguno.
- **Bloqueos:** Ninguno.
- **Disparador:** cuando el operador pregunte por tareas pendientes.
- **Agregada:** 2026-10-01.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

Ninguna.

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

No aplica todavía — ningún grupo formado.
`;

/** Backlog recién generado por la plantilla: las secciones traen su placeholder en vez de «Ninguna.». */
export const BACKLOG_TEMPLATE = `# Backlog

**Próximo número de tarea:** 1

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea [N] — [Placeholder — título corto de la tarea]

- **Descripción:** [Placeholder]
- **Decisiones/temas a definir antes de empezar:** [Placeholder]
- **Bloqueos:** Ninguno.
- **Disparador:** [Placeholder]
- **Detalles:** [Placeholder]
- **Agregada:** [Placeholder]

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea [N] — [Placeholder — título corto de la tarea]

- **Descripción:** [Placeholder]
- **Bloqueos:** [Placeholder — \`[dependencia]\` o \`[postergada]\` + motivo]

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

No aplica todavía — ningún grupo formado.
`;

/** team-backlog.md recién generado por la plantilla. */
export const TEAM_TEMPLATE = `# Backlog del equipo

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### [Placeholder — título único de la tarea]

- **Descripción:** [Placeholder]
- **Decisiones/temas a definir antes de empezar:** [Placeholder]
- **Bloqueos:** Ninguno.
- **Agregada:** [Placeholder — fecha y operador]

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

[Placeholder — "Ninguna" si no hay]
`;

/** team-backlog.md con una libre y una bloqueada, con dos líneas en blanco entre sus tareas libres. */
export const TEAM_TWO = `# Backlog del equipo

<!-- agent-context-skill:section=free -->
## Tareas libres

### Revisar el copy del onboarding

- **Descripción:** ajustar textos
- **Bloqueos:** Ninguno.
- **Agregada:** 2026-10-02 por gersom


### Migrar el CI

- **Descripción:** pasar a Actions
- **Decisiones/temas a definir antes de empezar:** ¿Se migra todo?
- **Bloqueos:** Ninguno.
- **Detalles:** Ver la \`T-3@ana\`.
- **Agregada:** 2026-10-03 por ana

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Cambiar de proveedor

- **Descripción:** otro proveedor
- **Bloqueos:** \`[postergada]\` esperar al contrato.
- **Agregada:** 2026-10-04 por ana
`;

/** Un proyecto en inglés: `Task`, etiquetas en inglés y «None.» como texto de vacío. */
export const HANDOFF_IDLE_EN = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Task in progress

No task in progress

<!-- agent-context-skill:section=paused -->
## Paused tasks

None.
`;

export const BACKLOG_EN = `# Backlog

**Next task number:** 6

---

<!-- agent-context-skill:section=free -->
## Free tasks

### Task 4 — Translate the glossary

- **Description:** translate \`glossary.md\`.
- **Blockers:** None.
- **Trigger:** when the operator asks about pending tasks.
- **Added:** 2026-10-01.

<!-- agent-context-skill:section=blocked -->
## Blocked / postponed tasks

None.

<!-- agent-context-skill:section=grouped -->
## Grouped tasks

Not applicable yet.
`;

export const HISTORY_EN = `# History

---

## 2026-10-02 — ✅ Task 5 — Done already

- Closed.
`;
