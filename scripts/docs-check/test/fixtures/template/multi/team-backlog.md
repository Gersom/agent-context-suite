# Backlog del equipo

Tareas **sin dueño** del proyecto, visibles para todos los operadores. Las tareas que un operador ya tomó viven en su propio `backlog.md`, dentro de su carpeta.

**No lleva numeración ni contador:** dos operadores agregando a la vez tomarían el mismo número. Cada tarea se identifica por un **título único**.

**Tomar una tarea:** el operador la quita de este archivo y recibe el siguiente número de su secuencia. Va a su `backlog.md` si la deja en espera, o directo a su `handoff.md` si la empieza ya; en los dos casos lleva el campo `Origen: team-backlog` (línea `- **Origen:** team-backlog`, que llega hasta su `history.md` como primera viñeta), en el mismo commit. Una tarea vive en un solo lugar. Antes de tomarse se la referencia por título; después, como `T-N@operador`.

**Devolver una tarea** que no se puede seguir: vuelve acá, sin número y con la nota `Devuelta por <operador> (antes T-N@operador)`. El número queda retirado y no se reutiliza.

**Agregar tareas:** quien las agrega a pedido de su agente las deja acá solo si lo dice explícitamente; si no, van a su propio `backlog.md`. Quien solo recolecta tareas (sin carpeta) completa como mínimo título y descripción; quien la toma completa el resto.

**Formato de cada tarea** (`### <título único>`), todo breve:
- **Descripción:** de qué trata (1–3 líneas).
- **Decisiones/temas a definir antes de empezar:** qué resolver o preguntarle al operador antes de arrancar; "Ninguno" si está todo definido.
- **Bloqueos:** "Ninguno", o un valor que **empieza** con `[dependencia]` (no se puede empezar técnicamente) o `[postergada]` (conviene esperar) y el motivo. Con bloqueo va en "bloqueadas / pospuestas"; si no, en "libres".
- **Etiquetas:** (opcional) mismo formato que en `backlog.md`: `Etiquetas: empresa1 trabajo`.
- **Agregada:** fecha y operador.

**Anclas de sección:** no borres ni muevas los comentarios `<!-- agent-context-skill:section=... -->` (`free`, `blocked`) que preceden a cada sección: los usa el script de seguimiento de tareas.

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
