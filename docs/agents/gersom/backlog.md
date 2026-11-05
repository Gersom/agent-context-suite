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
- **Detalles:** contexto extendido, solo si hace falta.
- **Agregada:** fecha.

**Agrupamiento (solo en "Tareas libres"):** si superan las 15 tareas (Regla 8), se evalúa agrupar 2 o más que compartan un objetivo real — el grupo entero tiene que caber en una frase de objetivo compartido, sin forzar con "y". El grupo aparece en libres como un bloque `### Grupo — título (Tareas N, M)` con un `Resumen` de una frase; el detalle de cada tarea (`#### Tarea N — título`, mismo formato) se mueve a "Tareas agrupadas", que no hace falta leer salvo para tomar una. Un grupo que queda con una sola tarea se desarma. Con el script de tareas, `acsuite task group-create`, `group-add`, `group-eject`, `group-edit` y `group-dissolve` arman y deshacen grupos (ver el README de `task-manager`); para trabajar una tarea agrupada primero se saca con `group-eject N`.

**Anclas de sección:** no borres ni muevas los comentarios `<!-- agent-context-skill:section=... -->` (`free`, `blocked`, `grouped`) que preceden a cada sección: los usa el script de seguimiento de tareas de agent-context-kit.

> Numeración iniciada el 2026-09-24. Las tareas cerradas antes de esa fecha (ver `history.md`) no tienen número asignado retroactivamente.

**Próximo número de tarea:** 150

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 34 — Reevaluar los comandos del task-manager

- **Descripción:** Revisar los comandos del script scripts/task-manager/ para hacerlos más eficientes o cambiar su forma (flags, salida, cantidad de pasos por operación, comandos que se puedan fusionar o simplificar), según cómo los usa realmente el agente.
- **Decisiones/temas a definir antes de empezar:** Qué fricciones se vieron al usarlos (flags largos, texto libre, `--apply`, pausar/empezar en varios pasos); si conviene fusionar o renombrar comandos; qué se mantiene por compatibilidad.
- **Bloqueos:** Ninguno.
- **Disparador:** cuando el operador pregunte por tareas pendientes.
- **Detalles:** Surgida al usar el script en las Tareas 24 y 32. Límites conocidos: block/unblock no soportan tareas agrupadas ni team-backlog.md; add y start sin --json. Surgido al hacer la Tarea 36: `step` ya edita de forma puntual (marcar, desmarcar y reemplazar una subsección), pero no permite cambiar el texto o la nota de un paso, agregar o quitar pasos, ni reabrir uno con motivo (lo pide la Tarea 35), y admite solo una de `--falta`/`--decisiones`/`--proximo` por ejecución. Actualización (T113): `edit` ya cubre cambiar el texto de una tarea; sigue pendiente cambiar el texto de un paso del plan, agregar o quitar pasos y reabrir uno con motivo. Actualización (T115): `step` ya no tiene --falta/--decisiones/--proximo (el texto se cambia con `edit`), así que el límite de una sola de esas flags por ejecución ya no aplica. Actualización (T114): los flags de todos los comandos y el valor de --tag están en inglés, sin alias; si se reevalúan los comandos, ya no hay nombres en español que unificar. Actualización (T129): block/unblock siguen sin soportar tareas agrupadas (ahora se sacan antes con `group-eject N`) ni team-backlog.md; ya existen los comandos `group-*` para crear, sumar, sacar, editar y deshacer grupos.
- **Agregada:** 2026-10-08.

### Tarea 4 — Deploy en skills.sh

- **Descripción:** publicar `agent-context-skill` en https://www.skills.sh/ para que esté disponible en el catálogo público de skills.
- **Decisiones/temas a definir antes de empezar:** revisar los requisitos de publicación de skills.sh (formato esperado, metadata, proceso de submit) antes de armar el paquete final.
- **Bloqueos:** `[Resuelto el 2026-10-10]` — era `[dependencia]` depende de que la Tarea 3 (Exportar como skill utilizable por Claude) esté resuelta — el paquete a publicar en skills.sh probablemente sea el mismo artefacto exportado ahí. (La Tarea 3 ya no está bloqueada, pero sigue sin hacerse — ver "Tareas libres".)
- **Disparador:** cuando el operador quiera hacer pública la skill, o priorice esta tarea explícitamente.
- **Detalles:** ninguno.
- **Agregada:** 2026-09-24.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea 38 — Revisar si el task-tracker necesita actualizarse por los últimos cambios

- **Descripción:** Comprobar si el task-tracker (scripts/task-tracker/) sigue mostrando bien el handoff, el backlog y el history tras los cambios de las Tareas 35 y 36, y actualizarlo si hace falta.
- **Decisiones/temas a definir antes de empezar:** Ninguno.
- **Bloqueos:** `[postergada]` Revisada el 2026-10-09: el task-tracker no necesita cambios tras las Tareas 35 y 36. Volver a revisarla cuando haya cambios grandes en la skill.
- **Disparador:** cuando el operador pregunte por tareas pendientes.
- **Detalles:** Cambios a revisar: (1) los pasos del plan pueden llevar al final de la línea evidencia y commit (· bun test 779 pass · commit abc1234, Tarea 35): ver si el tracker los corta, los desalinea o los muestra bien; (2) un paso reabierto se escribe como (reabierto: motivo); (3) el handoff ahora se edita solo en lo que cambia y las pausadas ya no se leen salvo sin tarea en curso: ver si el tracker asume que el archivo se reescribe entero (reintento de primera lectura en src/io/snapshot.ts); (4) la entrada de history.md ahora es más breve y lista los commits; (5) el reporte de cierre suma Checks pendientes y Próximo paso (no afecta al tracker, solo confirmarlo). Probar contra el handoff real con una tarea en curso, con evidencia en los pasos y con una pausada. Si no hay nada que cambiar, cerrarla con esa conclusión.
- **Agregada:** 2026-10-08.

### Tarea 78 — Publicación en npm por GitHub Actions

- **Descripción:** Debatir si automatizar la publicación en npm (GitHub Actions al subir un tag vX.Y.Z, con provenance) y qué decisión tomar, porque contradice la «Decisión no negociable» de releases manuales, no por CI.
- **Decisiones/temas a definir antes de empezar:** Debatir con el operador: ¿se revisa la decisión de «no por CI»? ¿Se publica por CI o se mantiene manual? Token de npm o trusted publishing (lo configura el operador).
- **Bloqueos:** [postergada] Hay que debatirla al llegar a esta tarea, tras publicar la primera versión.
- **Disparador:** cuando el operador pregunte por tareas pendientes.
- **Agregada:** 2026-10-26.

### Tarea 108 — Separar el mod acsuite-active-project en su propio repo

- **Descripción:** Mover mods/acsuite-active-project/ a un repo propio (con su marketplace.json y README) para instalarlo con /plugin install sin depender del repo de la suite.
- **Decisiones/temas a definir antes de empezar:** Nombre y visibilidad del repo; qué queda en la suite (solo documentación del uso con el board); cómo se actualiza la entrada de CLAUDE_CODE_PLUGIN_DIRS o la instalación.
- **Bloqueos:** `[postergada]` Por ahora el mod vive en mods/ de la suite y alcanza para usarlo (decisión del operador, 2026-10-28). Retomarla cuando se quiera distribuir el mod por separado. `[Resuelto el 2026-10-27]` — era `[postergada]` Por ahora el mod vive en mods/ de la suite y alcanza para usarlo (decisión del operador, 2026-10-28). Depende de la Tarea 104.
- **Disparador:** cuando el operador quiera distribuir el mod por separado.
- **Detalles:** Surgida al planear la Tarea 104. Pasos probables: crear el repo, mover la carpeta con su historial si conviene, mover el marketplace.json, ajustar el README y la ruta en ~/.claude/settings.json.
- **Agregada:** 2026-10-27.

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

No aplica todavía — ningún grupo formado.
