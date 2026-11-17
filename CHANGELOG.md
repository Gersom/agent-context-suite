# Changelog de la suite

Qué cambia en cada versión de `agent-context-suite` y qué hacer para pasar de una a la siguiente. La skill (`agent-context-skill`) tiene su propio changelog en `docs/changelog/` de su repo.

## 2.4.0

Un comando nuevo de solo lectura para listar y buscar tareas, sin tener que leer `history.md` entero ni recurrir a `grep`. No rompe nada y no cambia el formato de los archivos.

### Cómo pasar de la 2.3.x a la 2.4.0

Actualiza el paquete: `npm install -g agent-context-suite@latest`. No hay nada más que hacer. Los proyectos con la skill 2.4.x siguen siendo compatibles.

### Lo nuevo

- **`acsuite task list [--status <s>] [--search <texto>] [--last <N>] [--group <nombre>] [--json]`:** lista las tareas de todos los lugares (en curso, pausadas, libres, agrupadas, bloqueadas, cerradas y las del `team-backlog.md`), de la más reciente a la más antigua. Ejemplos: `list --last 10`, `list --status discarded --last 20` y `list --search migración --last 15`.
- **Claves de `--status`**, siempre en inglés: `free`, `blocked`, `postponed`, `in-progress`, `paused`, `done` y `discarded`. Se puede repetir o separar por comas.
- **`--search`** ignora mayúsculas y acentos y mira el título, los campos de la tarea y, en las cerradas, el cuerpo de su entrada de `history.md`.
- **Límite y recorte:** sin `--last` salen 20 tareas, con una nota si hay más. En el texto, los títulos se recortan a 100 caracteres (`show <N>` muestra la tarea completa); `--json` los trae enteros.
- Con `--operator <carpeta>` se lista el de otro operador, igual que en el resto de comandos de lectura.

## 2.3.0

Comandos nuevos y mejoras para llevar el plan de una tarea sin editar `handoff.md` a mano: cambiar el plan en curso, reabrir un paso con motivo, anotar evidencia y commit, y listar los commits al cerrar. No rompe nada para quien ya usa la suite, y no cambia el formato de los archivos: las reglas que automatizan (la 6 y la 7 de `rules.md`) ya estaban en la skill.

### Cómo pasar de la 2.2.x a la 2.3.0

Actualiza el paquete: `npm install -g agent-context-suite@latest`. No hay nada más que hacer. Los proyectos con la skill 2.4.x siguen siendo compatibles.

### Lo nuevo

- **`acsuite task plan`:** agrega (`--add`, con `--at`), quita (`--remove`), renombra (`--rename`), mueve (`--move --to`) o reemplaza (`--set -`) los pasos del plan de la tarea en curso. «Documentar cierre de tarea» queda siempre al final. El plan inicial se sigue definiendo en `start --plan`.
- **`step --undo --reason <texto>`:** al reabrir un paso deja `(reabierto: <motivo>)` al final de su línea (Regla 7); se quita al volver a marcarlo. Sin `--reason`, avisa de que la regla lo pide.
- **`step --evidence <texto> [--commit <hash|auto>]`:** anota `· evidencia · commit <hash>` al final del paso hecho. `--commit auto` usa el hash corto de `HEAD`. Repetir el comando reemplaza los campos pasados, sin duplicar.
- **`step` y «Próximo paso concreto»:** si ese texto coincide con el paso que se acaba de marcar, `step` lo actualiza al siguiente pendiente aunque lo haya escrito una persona. Un texto distinto se conserva con el aviso de siempre.
- **`close --done --commits auto|<h1,h2>`:** agrega a la entrada de `history.md` la línea `Commit: …` o `Commits: …`. `auto` toma los commits del proyecto con el scope `(T-N)` en el título, sin merges.
- **`plan --json`, `status` y `next`:** muestran el texto base del paso, sin los sufijos de reabierto, evidencia ni commit.

### Cambios de comportamiento

- **`close`** ya no imprime por defecto el aviso «Para revisar a mano» (tareas bloqueadas cuyo motivo no nombra una tarea). Se ve con `close --verbose`; `--json` no cambia.
- **`step --undo`** quita la evidencia y el commit del paso, porque ya no valen.
- En un paso hecho sin commit, el último tramo tras ` · ` se lee como evidencia. `step` avisa al marcar un paso cuyo texto ya lleva ` · `.

## 2.2.2

Solo documentación: el README ahora está en inglés (`README.md`) y en español (`README.es.md`), con selector de idioma. No cambia ningún comando ni el formato de los archivos.

### Cómo pasar de la 2.2.1 a la 2.2.2

Actualiza el paquete: `npm install -g agent-context-suite@latest`. No hay nada más que hacer.

## 2.2.1

Solo documentación: la regla 2 de `rules.md` pide al agente que presente las alternativas de modo (A–D) una por línea y no en un párrafo corrido. Va con la skill 2.4.1.

### Cómo pasar de la 2.2.0 a la 2.2.1

1. Actualiza el paquete: `npm install -g agent-context-suite@latest`.
2. Actualiza la skill a la **2.4.1** en tus proyectos (su changelog trae el texto exacto de la regla 2 a reemplazar).

No cambia ningún comando ni el formato de los archivos.

## 2.2.0

Los modos de ejecución del plan (`guided`, `step-by-step`, `auto`, `extreme`), un tablero más claro y avisos antes de que `close` y `pause` fallen. No rompe nada para quien ya usa la suite.

### Cómo pasar de la 2.1.x a la 2.2.0

1. Actualiza el paquete desde npm (no desde GitHub):

   ```bash
   npm install -g agent-context-suite@latest
   ```

2. Opcional, recomendado: actualiza la skill a la **2.4.0** en tus proyectos (la regla 2 de `rules.md` ofrece los cuatro modos como letras; su changelog trae el texto exacto a reemplazar).
3. Corre `acsuite check` en cada proyecto. Puede mostrar avisos nuevos (ver abajo); ninguno es un error ni bloquea nada.
4. Si una tarea en curso tiene la línea `**Modo de ejecución acordado:**` con un texto libre de antes (por ejemplo «todos los pasos seguidos»), sigue siendo válida. Para pasarla a un modo, `acsuite task mode <guided|step-by-step|auto|extreme>`.

### Lo nuevo

- **`acsuite task mode <modo>`:** registra el modo de ejecución acordado del plan de la tarea en curso. `extreme` exige `--confirm`: el agente debe haber pedido antes la confirmación explícita del operador en el chat. Con varias líneas de modo en el plan, conserva la última y borra las anteriores.
- **Tablero (`acsuite board`):** «En progreso» y «Pausadas» muestran el modo (✏️ Guiado, 📋 Paso a paso, 🤖 Auto, 🔥 Extremo), el estado del plan con su barra, la descripción y las decisiones a medio camino. Ocultan reglas `---`, placeholders de plantilla y secuencias de control.
- **Avisos tempranos (`step`, `edit` y `acsuite check`):** avisan, sin bloquear, de lo que `close` y `pause` rechazarían: una línea del plan que no es un paso ni el modo, una subsección con título desconocido o repetida, texto antes de la tarea y checkboxes fuera del plan. `check` los marca como `current-plan-line`, `current-subsection`, `current-structure` y `current-mode` (este último, cuando el modo no es uno de los cuatro).
- **Errores de `close` y `pause`:** citan el número de línea de la línea inválida del plan.

### Cambios que pueden notarse

- **`start --mode`** solo acepta `guided`, `step-by-step`, `auto` o `extreme`; un texto libre es un error de uso. Los valores van siempre en inglés, también en proyectos en español.
- **Qué cuenta como paso del plan:** en la tarea en curso, los checkboxes de la subsección del plan (o todos, si no hay subsección); en una pausada, los del campo del plan. Los checkboxes de otras partes («Qué falta»...) ya no entran en el estado ni en la numeración de `step`.
- **`--json`:** `edit` agrega `notices` (la lista de avisos; `notice` sigue igual, unido) y `mode` agrega `removed` (las líneas de modo anteriores que borró).
- **Avisos de `edit`:** un `Aviso:` por línea inválida; el formato válido del plan solo va en el primero.
- **Documentación:** el README avisa de instalar desde npm y no desde GitHub.
