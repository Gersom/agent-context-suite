<!-- agent-context-skill:version 2.4.0 — versión de la skill con la que se generaron las Reglas por defecto de este archivo; ignorar al leer, no es contenido. Lo usa la skill para detectar versiones más nuevas (ver docs/version-check.md de la skill). -->
# Reglas del proyecto

## Reglas por defecto (fijas — no se editan por proyecto)

Vienen con la skill y aplican a cualquier proyecto; las reglas de proceso adicionales se agregan debajo, no en su reemplazo. Las Reglas 6 a 9 están al final, en "Al cerrar una tarea".

1. **Cada contenido vive en un único archivo, el de su tema** (una decisión en `decisions/`, un bug en `known-issues.md`). Si otro archivo lo necesita, va una mención breve con link, no una copia.

2. **El tamaño de la tarea decide el proceso:**
   - **Pequeña o muy pequeña** → se ejecuta directo, sin plan.
   - **Mediana a grande** → primero un plan con los pasos, escrito completo en el chat; después, en ese mismo mensaje, que cierra el turno, y en texto (no con el recuadro de preguntas, para que el plan se vea), preguntarle al operador si el plan está bien y en qué modo prefiere ejecutarlo, con las alternativas como letras en su idioma, p. ej. «Este es el plan; si te parece bien, dime qué modo prefieres: A) guiado (tú ejecutas y yo te guío) · B) paso a paso (ejecuto un paso y espero tu confirmación) · C) automático (ejecuto los pasos seguidos y me detengo ante lo irreversible, lo externo o lo que el plan no resolvió) · D) extremo (hago todo y espero solo al final)». Una letra acepta el plan y fija el modo; un texto libre se toma como cambios al plan, que se vuelve a presentar. Los ids del modo son siempre `guided`, `step-by-step`, `auto` y `extreme` aunque las alternativas se traduzcan; el modo acordado queda en la línea `**Modo de ejecución acordado:** <valor>` del plan. `extreme` es peligroso: aunque el operador haya elegido su letra, se le pide una confirmación explícita aparte antes de continuar.
   - **Antes de actuar, de cualquier tamaño:** (a) *pedir no es autorizar*: una pregunta, investigación, explicación, revisión, comparación o proponer una solución es solo lectura, y no se edita ni se ejecuta ningún cambio hasta que el operador pida implementar; si la intención es ambigua, una sola aclaración y seguir en solo lectura. (b) *Explorar primero*: mirar el código y los requisitos relevantes, en proporción a la tarea, antes de proponer o escribir. (c) *Ante una duda real de producto*, una sola pregunta concreta y esperar la respuesta; no asumir.

3. **Idioma de la documentación:** todo lo que un agente redacte acá (prosa y headers) va en el idioma registrado abajo, detectado una sola vez al generar esta documentación; no se vuelve a preguntar. Siempre en inglés: nombres de archivo/carpeta del catálogo y términos de la skill o jerga técnica sin traducción asentada ("Handoff", "Backlog", "Placeholder", "linter", "commit", "deploy").

   **Idioma de la documentación:** [Placeholder — se completa la primera vez que se genera esta documentación]

4. **El código es la fuente de verdad.** Si un archivo de acá (`architecture.md`, `stack.md`, `entities.md`, etc.) contradice lo que el código hace, gana el código: seguirlo y corregir el archivo, salvo que el operador diga explícitamente lo contrario para ese caso.

5. **Commits coherentes:** cada commit representa un trabajo hecho. Una tarea puede tener varios; si toca varios módulos o también documentación, se separa por unidad coherente (ej. uno por módulo, otro para la documentación); si es chica, uno alcanza, a criterio del agente. Los commits del trabajo se hacen durante la tarea, a medida que cada unidad queda hecha. El título lleva el número de tarea como scope de Conventional Commits, `tipo(T-N): descripción` (ej. `feat(T-27): hide empty paused tasks`), también el de cierre (`docs(T-N): close task`); los commits esporádicos o extras van sin `(T-N)`. **Los commits se escriben siempre en inglés (título y cuerpo), sea cual sea el idioma de la documentación.** El commit de cierre pasa la tarea a completada (`handoff.md`, `backlog.md` y `history.md`, Reglas 6 y 8). Los commits de otros cambios (ej. agregar tareas al backlog) se hacen cuando el operador lo pide.

## Enlaces (evitar duplicar contexto)

- Estructura del código y dónde va cada cosa nueva → [`../project/architecture.md`](../project/architecture.md)
- Decisiones técnicas, stack y qué no usar (un archivo por tema) → [`../project/decisions/README.md`](../project/decisions/README.md)
- Bugs conocidos / zonas frágiles → [`./known-issues.md`](./known-issues.md)

## Reglas específicas de este proyecto

<!-- Reglas concretas de estilo/naming/formato que el proyecto ya sigue. Si hay un linter/formatter configurado, nombrarlo y enlazar su config en vez de repetir sus reglas. Solo se agregan por instrucción explícita del operador, nunca por inferencia propia; si ya están en architecture.md o decisions/, enlazarlas. -->

- [Placeholder]

### Qué NO tocar sin autorización explícita

<!-- Zonas sensibles: workarounds intencionales, integraciones frágiles, código legado que "funciona pero no se entiende". Si ya está en known-issues.md, enlazar. -->

- [Placeholder, o "Ninguna zona marcada como sensible todavía"]

### Decisiones no negociables

<!-- Cosas ya decididas que un agente no debe re-litigar ni revertir por su cuenta (ej. "no se editan las migraciones ya aplicadas"). Lo de stack va en `decisions/stack.md`; si hay un ADR, enlazar la entrada de `decisions/`. -->

- [Placeholder]

## Al cerrar una tarea (fijas — leer solo al cerrar)

**Con una herramienta de tareas:** si el proyecto tiene una que edita `handoff.md`, `backlog.md` e `history.md`, lo que ella ya hace de las Reglas 6, 7, 8 y 9 no se repite a mano ni se vuelve a verificar; sigue valiendo todo lo demás (en particular, que la tarea solo se cierra si el operador lo pide, y la sección «Checks pendientes» del reporte de la Regla 9, que añade el agente).

6. **Una tarea solo se cierra cuando el operador lo pide explícitamente** (también las chicas, sin plan): al terminar el trabajo se manda el resumen y se espera; si pide correcciones, se hacen y se vuelve a mandar. **Al cerrarla se actualizan, como mínimo:** `handoff.md` (estado actual, o "sin tarea en curso"), `history.md` (la entrada de la tarea, hecha o descartada) y `backlog.md` (se saca la tarea si venía de ahí y se agregan las nuevas; ver "Numeración" en ese archivo), aunque también hayan cambiado otros archivos. La entrada de `history.md` guarda solo el resultado: qué se hizo, una línea de cómo y qué commit(s) lo contienen, sin el recorrido de cambios y decisiones (ese vive en el handoff mientras la tarea está en curso).

7. **`handoff.md` también se actualiza en cada paso del plan** (Regla 2): qué se hizo, qué falta y el próximo paso concreto, para que un chat nuevo retome exactamente ahí si la conversación se corta. Se edita solo lo que cambió (el checkbox y la nota de ese paso, "Qué falta" y "Próximo paso concreto"), no se reescribe el archivo entero. **Evidencia:** al marcar un paso se anota al final de su línea lo que ya se corrió y observó (ej. `- [x] Paso 3 — … · bun test 779 pass`), y `· commit abc1234` solo si ese paso cierra un grupo de cambios ya commiteado; no se corre nada extra solo para tener evidencia. **Cambios a mitad de trabajo:** si el operador pide un ajuste antes de cerrar, se conservan los pasos hechos que no cambian, el invalidado se reabre con el motivo (`- [ ] Paso 2 — … (reabierto: <motivo>)`) y los pasos nuevos se agregan. Esa evidencia vive solo en el handoff (en curso o pausada); al cerrar no pasa a `history.md`.

8. **El último paso de todo plan es "documentar cierre de tarea":** la Regla 6 más revisar las tareas bloqueadas de `backlog.md` por si alguna dejó de estarlo. Al desbloquearla, su campo `Bloqueos` no se borra: pasa a `[Resuelto el <fecha>] — <motivo original>`. Se hace igual en tareas sin plan. También se evalúa si "Tareas libres" superó las 15 (ver "Agrupamiento" en `backlog.md`).

9. **Reporte de cierre.** Al terminar el cierre, resumir en el chat con este formato (se omiten las secciones sin contenido):

   ```
   **Tareas resueltas:**
   - Tarea N — título

   **Tareas descartadas:**
   - Tarea N — título — motivo breve

   **Tareas desbloqueadas:**
   - Tarea N — título

   **Tareas nuevas:**
   - Tarea N — título

   **Checks pendientes:**
   - check — fallido | omitido | pendiente — motivo breve

   **Próximo paso:** <qué sigue>
   ```

   «Checks pendientes» y «Próximo paso» solo se ponen si hay checks fallidos, omitidos o pendientes: nunca se dan por buenos sin decirlo.
