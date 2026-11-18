// Fixtures con etiquetas para el filtro `--label` de `list` y `next`.

/**
 * Handoff con etiquetas: la tarea en curso (campo entre su línea y la primera subsección) y dos
 * pausadas, una con etiquetas y otra sin.
 */
export const HANDOFF_LABELED = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 12 — Implementar el parser

- **Etiquetas:** empresa1 trabajo

Descripción de la tarea.

### Plan

- [x] Paso 1 — Preparar
- [ ] Paso 2 — Escribir

### Cosa que hacer al retomar

Paso 2 — escribir el parser.

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

### Tarea 8 — Migrar la documentación vieja

- **Plan:**
  - [x] Paso 1 — Copiar
  - [ ] Paso 2 — Revisar
- **Qué falta:** revisar \`setup.md\`.
- **Etiquetas:** Trabajo ideas

### Tarea 9 — Otra pausada

- **Qué falta:** nada.
`;

/** Lo mismo que `HANDOFF_LABELED` pero sin tarea en curso. */
export const HANDOFF_LABELED_IDLE = HANDOFF_LABELED.replace(
  /Tarea 12 — Implementar el parser[\s\S]*?(?=<!-- agent-context-skill:section=paused -->)/,
  "Sin tarea en curso\n\n",
);

/**
 * Backlog con etiquetas: libres (con y sin), un grupo, bloqueadas (una con dependencia que figura
 * cerrada en `HISTORY_LABELED`) y una postergada.
 */
export const BACKLOG_LABELED = `# Backlog

**Próximo número de tarea:** 30

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 21 — Reescribir la guía

- **Descripción:** Mejorar la documentación del instalador.
- **Disparador:** cuando se cierre el diseño.
- **Etiquetas:** empresa1 trabajo
- **Agregada:** 2026-10-06.

### Tarea 22 — Ordenar los scripts

- **Descripción:** Mover los scripts de \`bin/\`.
- **Etiquetas:** #TRABAJO
- **Agregada:** 2026-10-05

### Grupo — Pulir el sitio (Tareas 23, 24)

- **Resumen:** todo lo visual.

### Tarea 25 — Sin etiquetas

- **Descripción:** Esta tarea no trae etiquetas.
- **Agregada:** 2026-10-04.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea 26 — Publicar el sitio

- **Descripción:** Subir todo.
- **Bloqueos:** \`[dependencia]\` depende de la Tarea 11.
- **Etiquetas:** empresa1 trabajo
- **Agregada:** 2026-10-03.

### Tarea 27 — Cambiar el logo

- **Descripción:** Un logo nuevo.
- **Bloqueos:** \`[postergada]\` hasta nuevo aviso.
- **Etiquetas:** trabajo
- **Agregada:** 2026-10-02.

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

### Grupo — Pulir el sitio

#### Tarea 23 — Ajustar los colores

- **Descripción:** Una paleta nueva.
- **Disparador:** cuando haya diseño.
- **Etiquetas:** empresa1 trabajo ideas
- **Agregada:** 2026-10-08.

#### Tarea 24 — Revisar la tipografía

- **Descripción:** Probar otras fuentes.
- **Etiquetas:** ideas
- **Agregada:** 2026-10-03.
`;

/**
 * History con etiquetas: la primera entrada las trae en su bloque de campos; la segunda solo en una
 * viñeta del resumen (no cuenta); la tercera no tiene.
 */
export const HISTORY_LABELED = `# History

---

## 2026-10-07 — ✅ Tarea 11 — Escribir el parser

- **Origen:** backlog
- **Etiquetas:** empresa1 trabajo
- Resumen del cierre.

## 2026-10-06 — ❌ Tarea 10 — Usar YAML (descartada)

- **Origen:** backlog

- Resumen del descarte.
- **Etiquetas:** trabajo

## 2026-10-05 — ✅ Tarea 9 — Preparar fixtures

- Resumen sin etiquetas.
`;

/** Team-backlog con etiquetas: dos libres (una con y otra sin) y una postergada. */
export const TEAM_LABELED = `# Backlog del equipo

<!-- agent-context-skill:section=free -->
## Tareas libres

### Revisar el copy del onboarding

- **Descripción:** ajustar textos
- **Agregada:** 2026-10-02 por gersom

### Migrar el CI

- **Descripción:** pasar a Actions
- **Disparador:** cuando se estabilice el repo.
- **Etiquetas:** empresa1 trabajo
- **Agregada:** 2026-10-03 por ana

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Cambiar de proveedor

- **Descripción:** otro proveedor
- **Bloqueos:** \`[postergada]\` esperar al contrato.
- **Etiquetas:** trabajo
- **Agregada:** 2026-10-04 por ana
`;
