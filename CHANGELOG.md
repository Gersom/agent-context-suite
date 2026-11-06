# Changelog de la suite

Qué cambia en cada versión de `agent-context-suite` y qué hacer para pasar de una a la siguiente. La skill (`agent-context-skill`) tiene su propio changelog en `docs/changelog/` de su repo.

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
