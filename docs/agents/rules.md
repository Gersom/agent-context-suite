<!-- agent-context-skill:version 2.3.1 — versión de la skill con la que se generaron las Reglas por defecto de este archivo; ignorar al leer, no es contenido. Lo usa la skill para detectar versiones más nuevas (ver docs/version-check.md de la skill). -->
# Reglas del proyecto

<!-- agent-context-suite:start -->
### Herramientas de la suite

Este proyecto usa [agent-context-suite](https://github.com/Gersom/agent-context-suite). No edites a mano `handoff.md`, `backlog.md` ni `history.md`: usa `acsuite task` (el detalle: `acsuite task --help`). Para verificar la documentación, `acsuite check`; para ver el tablero, `acsuite board`.
<!-- agent-context-suite:end -->

## Reglas por defecto (fijas — no se editan por proyecto)

Vienen con la skill y aplican a cualquier proyecto; las reglas de proceso adicionales se agregan debajo, no en su reemplazo. Son fijas también en su plantilla (`template/agents/rules.md`, en el repo de la skill). Las Reglas 6 a 9 están al final, en "Al cerrar una tarea".

1. **Cada contenido vive en un único archivo, el de su tema** (una decisión en `decisions/`, un bug en `known-issues.md`). Si otro archivo lo necesita, va una mención breve con link, no una copia.

2. **El tamaño de la tarea decide el proceso:**
   - **Pequeña o muy pequeña** → se ejecuta directo, sin plan.
   - **Mediana a grande** → primero un plan con los pasos, escrito completo en el chat; después, en ese mismo mensaje, que cierra el turno, y en texto (no con el recuadro de preguntas, para que el plan se vea), preguntarle al operador (a) si los pasos están bien o hay que ajustarlos y (b) si prefiere ejecutarlos todos seguidos o uno a la vez, esperando su confirmación después de cada paso. El modo acordado queda registrado con `acsuite task mode <guided|step-by-step|auto|extreme>` (o, sin la herramienta, en la línea `**Modo de ejecución acordado:** <valor>` del plan); `extreme` solo se activa con confirmación explícita del operador.
   - **Antes de actuar, de cualquier tamaño:** (a) *pedir no es autorizar*: una pregunta, investigación, explicación, revisión, comparación o proponer una solución es solo lectura, y no se edita ni se ejecuta ningún cambio hasta que el operador pida implementar; si la intención es ambigua, una sola aclaración y seguir en solo lectura. (b) *Explorar primero*: mirar el código y los requisitos relevantes, en proporción a la tarea, antes de proponer o escribir. (c) *Ante una duda real de producto*, una sola pregunta concreta y esperar la respuesta; no asumir.

3. **Idioma de la documentación:** todo lo que un agente redacte acá (prosa y headers) va en el idioma registrado abajo, detectado una sola vez al generar esta documentación; no se vuelve a preguntar. Siempre en inglés: nombres de archivo/carpeta del catálogo y términos de la skill o jerga técnica sin traducción asentada ("Handoff", "Backlog", "Placeholder", "linter", "commit", "deploy").

   **Idioma de la documentación:** Español

4. **El código es la fuente de verdad.** Si un archivo de acá (`architecture.md`, `stack.md`, `entities.md`, etc.) contradice lo que el código hace, gana el código: seguirlo y corregir el archivo, salvo que el operador diga explícitamente lo contrario para ese caso.

5. **Commits coherentes:** cada commit representa un trabajo hecho. Una tarea puede tener varios; si toca varios módulos o también documentación, se separa por unidad coherente (ej. uno por módulo, otro para la documentación); si es chica, uno alcanza, a criterio del agente. Los commits del trabajo se hacen durante la tarea, a medida que cada unidad queda hecha. El título lleva el número de tarea como scope de Conventional Commits, `tipo(T-N): descripción` (ej. `feat(T-27): hide empty paused tasks`), también el de cierre (`docs(T-N): close task`); los commits esporádicos o extras van sin `(T-N)`. **Los commits se escriben siempre en inglés (título y cuerpo), sea cual sea el idioma de la documentación.** El commit de cierre pasa la tarea a completada (`handoff.md`, `backlog.md` y `history.md`, Reglas 6 y 8). Los commits de otros cambios (ej. agregar tareas al backlog) se hacen cuando el operador lo pide.

## Trabajo en paralelo (modo multi-operador)

Varias personas trabajan a la vez, cada una con su agente. Estas reglas se suman a las anteriores:

- **Tus archivos:** el `handoff.md`, `backlog.md` e `history.md` de las Reglas 2 a 9 son los de tu carpeta, `docs/agents/<operador>/`. Solo editas tu carpeta y los archivos compartidos; las carpetas de otros operadores son de solo lectura.
- **Referencias:** dentro de tu carpeta, `Tarea N`; hacia la tarea de otro operador, `T-N@operador`. Los commits siguen la Regla 5.
- **Tareas:** se toman del `team-backlog.md` y el número lo asignas tú, en tu secuencia. Una tarea vive en un solo lugar. "Agrega una tarea" va a tu `backlog.md`, salvo que digan explícitamente que es para el equipo.
- **`rules.md` es de todos:** antes de agregar una regla, recuérdale al operador que se aplicará a todo el proyecto y a los demás operadores, y confirma que no es solo suya; si lo es, va en su `preferences.md`.
- **Plan de ejecución (Regla 2):** si tu `preferences.md` fija cómo prefieres ejecutar los planes, no se te vuelve a preguntar.
- **Con una herramienta de tareas:** lo que ella ya garantiza de «Tus archivos» (solo escribe en tu carpeta) y de «Tareas» (número de tu secuencia, una tarea en un solo lugar) no se repite a mano. Siguen siendo tuyos: no tocar con otros medios carpetas ajenas, escribir bien las referencias, avisar que `rules.md` es de todos y respetar tu `preferences.md`.

## Enlaces (evitar duplicar contexto)

- Estructura de carpetas y por qué está organizado así → [`../architecture.md`](../architecture.md)
- Razón de ser y principios de diseño → [`../philosophy.md`](../philosophy.md)
- Catálogo de plantillas y para qué sirve cada una → `docs/template-architecture.md` del repo de la skill ([Gersom/agent-context-skill](https://github.com/Gersom/agent-context-skill), clonado en `skill/` o `agent-context-skill/`; no está en este repo)

## Reglas específicas de este proyecto

- **Dos repos.** La suite (este repo) tiene las herramientas y su documentación; la skill (`SKILL.md`, flujos y plantillas `.md`, markdown puro, sin código ni build) vive en su propio repo, [Gersom/agent-context-skill](https://github.com/Gersom/agent-context-skill), clonado en `skill/` o `agent-context-skill/` e ignorado por git en la suite (`.gitignore`). Quien clone la suite para tocar la skill o sus tests tiene que clonarla también en una de esas carpetas (ver `CONTRIBUTING.md`); sin ella, los tests de `scripts/skill-checks/` se saltan.
- **Commits en dos repos (complementa la Regla 5).** Un cambio en la skill se commitea en su repo, con `git -C <carpeta de la skill> commit` (`skill/` o `agent-context-skill/`) y el mismo formato `tipo(T-N): descripción`; uno en la suite, en la suite. Una tarea que toca ambos tiene commits en los dos. El commit de cierre (`docs(T-N): close task`) va siempre en la suite, porque ahí viven `handoff.md`, `backlog.md` e `history.md`. En `history.md`, la entrada indica el repo de cada commit (ver «Formato» en ese archivo).
- No hay linter/formatter. `scripts/` (TypeScript con Bun, ej. `scripts/task-tracker/`) son herramientas propias de la suite que **no forman parte de la skill distribuida** ni se copian a los repos destino.
- Dependencias de `scripts/`: en el `package.json` raíz (no uno por script); `bun install` en la raíz; `node_modules/` no se commitea y `bun.lock` sí. Tests con `bun test` desde la raíz.
- Los scripts nuevos se escriben en **TypeScript** (decisión del operador, 2026-10-05), con el `tsconfig.json` raíz (`strict`). Bun no revisa tipos: `bun run typecheck` (`tsc --noEmit`) tiene que pasar junto con `bun test`.
- **Comandos y flags de las herramientas, siempre en inglés.** Los nombres de comandos, flags y palabras clave de las herramientas (ej. `acsuite task add --title`, `--tag dependency`) van siempre en inglés, sea cual sea el idioma del usuario o de la documentación. El contenido libre que escribe la persona (título, descripción, motivo, detalles) va en su idioma y no se traduce.
- **Decisión no negociable —** versionado SemVer, un tag de git anotado `vX.Y.Z` por cada cambio de versión (se sube con `git push --follow-tags`) y releases manuales en GitHub, no por CI. Cada repo se versiona por separado: la suite con `package.json`; la skill, en su propio repo. Cuándo subir patch, minor o major y dónde vive cada versión: [`../releasing.md`](../releasing.md).
- **Revisión independiente solo cuando hace falta.** Antes de dar por buena una tarea, la revisión independiente (un subagente revisor que lee el cambio y lo prueba, p. ej. sobre proyectos temporales) se **omite en tareas pequeñas**: cambios de mensajes o de texto, o de un solo archivo sin lógica nueva. Se hace cuando el cambio tiene lógica nueva, toca varios archivos o hay que verificar un comportamiento que los tests no cubren. Los tests y el typecheck se corren siempre.

### Si usas el script de tareas

- El script `task-manager` (`bun run task`, [`scripts/task-manager/README.md`](../../scripts/task-manager/README.md)) es la herramienta de tareas de este repo y es opcional: si lo usas, rige la cláusula de «Al cerrar una tarea» (`step` hace la Regla 7; `close`, las Reglas 6 y 8 y el reporte de la Regla 9). Revisa el diff antes de aplicar con `--apply`.

### Qué NO tocar sin autorización explícita

- La estructura de carpetas de `template/` en el repo de la skill (`skill/template/` o `agent-context-skill/template/`): moverla o renombrar archivos rompe las referencias de `questions-flow.md` y `migration-flow.md` y requiere bump major de la skill.

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
