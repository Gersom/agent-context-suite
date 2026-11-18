# Backlog

Cola de tareas pendientes: el "qué falta" a nivel proyecto. No es la tarea en curso (eso vive en [`./handoff.md`](./handoff.md)) ni lo ya cerrado ([`./history.md`](./history.md)).

**Ciclo de vida:** una tarea se agrega acá al identificarla; al empezar a trabajarla se saca de esta lista y pasa a `handoff.md`; al cerrarla (hecha o descartada) se registra en `history.md`. No dejar acá tareas en curso o cerradas.

**Dos secciones:** "Tareas libres" (listas para tomar) y "Tareas bloqueadas / pospuestas". Cuando el motivo de un bloqueo deja de aplicar, la tarea pasa a libres (Regla 8 de `rules.md`; `Bloqueos` no se borra, se marca como resuelto).

**Numeración:** cada tarea tiene un número correlativo fijo, asignado al crearla y **nunca reutilizado**, ni siquiera al cerrarla: sirve para referenciarla sin ambigüedad ("la tarea 3") y viaja a su entrada de `history.md`. No es un orden de cola. Para agregar una tarea: usar "Próximo número de tarea" (más abajo) y dejarlo en N+1; también se numeran las tareas nuevas que surjan de una tarea en curso.

**Formato de cada tarea** (`### Tarea N — título`), todo breve — `Detalles` solo si hace falta, y si el detalle ya vive en otro archivo (`decisions/`, `known-issues.md`), enlazarlo:
- **Descripción:** de qué trata (1–3 líneas).
- **Decisiones/temas a definir antes de empezar:** qué resolver o preguntarle al operador antes de arrancar; "Ninguno" si está todo definido.
- **Bloqueos:** "Ninguno", o un valor que **empieza** con `[dependencia]` (no se puede empezar técnicamente) o `[postergada]` (conviene esperar) y el motivo. Con bloqueo va en "bloqueadas / pospuestas"; si no, en "libres". Si una tarea ya desbloqueada (`[Resuelto el <fecha>] — …`) se vuelve a bloquear, el bloqueo vigente va **primero** y el historial resuelto después, porque el script de seguimiento toma el tag con el que empieza el campo.
- **Desbloquea:** (opcional) qué tareas quedan libres al cerrar esta.
- **Disparador:** cuándo corresponde tomarla; por defecto "cuando el operador pregunte por tareas pendientes".
- **Etiquetas:** (opcional) 0 o más, las pone el agente si ayudan a agrupar o filtrar (ej. empresa, área). Solo letras y números, sin tildes ni símbolos, separadas por un espacio y sin `#` (el tablero lo agrega): `Etiquetas: empresa1 trabajo ideasBrillantes`.
- **Detalles:** contexto extendido, solo si hace falta.
- **Agregada:** fecha.

**Agrupamiento (solo en "Tareas libres"):** si superan las 15 tareas (Regla 8), se evalúa agrupar 2 o más que compartan un objetivo real — el grupo entero tiene que caber en una frase de objetivo compartido, sin forzar con "y". El grupo aparece en libres como un bloque `### Grupo — título (Tareas N, M)` con un `Resumen` de una frase; el detalle de cada tarea (`#### Tarea N — título`, mismo formato) se mueve a "Tareas agrupadas", que no hace falta leer salvo para tomar una. Un grupo que queda con una sola tarea se desarma.

**Anclas de sección:** no borres ni muevas los comentarios `<!-- agent-context-skill:section=... -->` (`free`, `blocked`, `grouped`) que preceden a cada sección: los lee cualquier herramienta de seguimiento de tareas que use el proyecto.

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
- **Decisiones/temas a definir antes de empezar:** [Placeholder]
- **Bloqueos:** [Placeholder — `[dependencia]` o `[postergada]` + motivo]
- **Desbloquea:** [Placeholder, o quitar el campo si no aplica]
- **Disparador:** [Placeholder]
- **Detalles:** [Placeholder]
- **Agregada:** [Placeholder]

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

No aplica todavía — ningún grupo formado.
