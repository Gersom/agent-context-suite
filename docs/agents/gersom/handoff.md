# Handoff

Estado "en caliente": en qué se está ahora. **Se actualiza editando solo lo que cambió**, sin reescribir el archivo entero, en cada paso del plan y al cerrar la tarea (ej. al avanzar el paso 3, solo el checkbox y la nota de ese paso, "Qué falta" y "Próximo paso concreto"): es una foto del presente, no un historial, con el próximo paso concreto para que un chat nuevo retome sin depender de la sesión anterior.

- Pendientes → [`./backlog.md`](./backlog.md) · Cerradas (hechas o descartadas) → [`./history.md`](./history.md)
- Sin tarea en curso: "Tarea en progreso" dice "Sin tarea en curso" (no deja el contenido de la última cerrada); "Tareas pausadas" queda en "Ninguna" si no hay.
- **No borres ni muevas los comentarios `<!-- agent-context-skill:section=... -->`** (`in-progress`, `paused`): los lee el script de seguimiento de tareas; al editar solo lo que cambió no se tocan, y si alguna vez se reescribe el archivo entero hay que reescribirlos. La tarea en curso va en una línea `Tarea N — título` antes de la primera subsección `###`.
- **Tarea pausada:** un bloque `### Tarea N — título` con `Plan` (opcional: los checkboxes de "Tarea en progreso" tal cual), `Qué falta`, `Decisiones a medio camino`, `Próximo paso concreto`, `Por qué se pausó` y `Qué espera para retomarse`.
- **Línea de un paso:** `- [x] Paso N — texto · evidencia · commit abc1234`. El texto tras el checkbox es libre (evidencia y commit van al final, según la Regla 7); los checkboxes son solo los pasos del plan, porque el script de seguimiento cuenta como paso todo `- [ ]` de «Tarea en progreso».
- Las reglas para cerrar una tarea están al final de [`rules.md`](../rules.md).

---

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 183 — Actualizar la documentación de la suite a la skill 2.5.0

Aplicar al propio repo de la suite (docs/agents) el flujo de actualizar de la skill, de la 2.3.1 a la 2.5.0: fusionar la Regla 2 (conservar el texto del proyecto y añadir la explicación entre paréntesis a las cuatro letras de los modos), subir el marcador de rules.md a 2.5.0 y empezar a usar etiquetas (skill para las tareas del repo de la skill y suite para las de la suite), también en las tareas del backlog.

- **Etiquetas:** suite
- **Detalles:** Origen: la skill 2.5.0 se publicó el 2026-11-18 y docs/agents/rules.md seguía en la 2.3.1. Flujo: skill/docs/update-flow.md. Commit con el formato del proyecto, docs(T-N): update the agent-context documentation from skill 2.3.1 to 2.5.0.

### Qué falta

Toda la tarea.

### Decisiones a medio camino

Decidido: Regla 2 fusionada (se conserva el texto del proyecto, que remite a Modos de ejecución del plan y a acsuite task mode, y se añade la explicación entre paréntesis a las letras A a D); el campo Etiquetas del changelog 2.5.0 se aplica: etiquetas skill y suite desde ahora y en las tareas del backlog; el cambio manual de la línea de modo no aplica (sin plan en curso ni pausadas); el flujo se hace en la rama agent-context-update-2.5.0 y se pregunta el merge a main al terminar.

### Próximo paso concreto

Empezar la tarea.

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

Ninguna.
