# History

Historial de tareas resueltas — hechas o descartadas: el "qué pasó y por qué". A diferencia de [`./handoff.md`](./handoff.md), **se acumula**: cada tarea resuelta agrega una entrada, sin sobrescribir las anteriores. La cola de pendientes vive en [`./backlog.md`](./backlog.md).

- **Entradas nuevas van arriba** (la más reciente primero). Cada una marca su tipo: ✅ **Hecha** o ❌ **Descartada** (el motivo del descarte queda para que no se vuelva a proponer sin verlo).
- **Formato:** `## <fecha> — ✅|❌ [Tarea N —] <título>` (el segmento `Tarea N —` solo si la tarea tenía número en `backlog.md`; ese número viaja con ella y no se reasigna; las entradas sin número no se numeran retroactivamente). Debajo, 3 a 5 líneas: qué se hizo y **por qué** (el motivo, no la descripción técnica), una línea de cómo y los commits que lo contienen, sin el recorrido de cambios ni decisiones (ese vive en el handoff). **Los commits se anotan por repo** (el kit y la skill son repos distintos): `- Commits (kit): …` y `- Commits (skill): …`, omitiendo la viñeta del repo que no se tocó (las entradas anteriores a la Tarea 45 no se reescriben). Si la tarea vino del `team-backlog.md` (modo multi-operador), la primera viñeta es `- **Origen:** team-backlog`.
- **Qué no va:** lo que ya dice el código, el diff o el commit, ni lo que explica otro archivo (`decisions/`, `architecture.md`): linkearlo.
- **Cómo leerlo:** no hace falta leerlo entero. Para una tarea puntual, buscar su entrada por número o título; para el contexto reciente, las primeras entradas.

> Carga inicial reconstruida retroactivamente desde `git log`, ya que este skill se aplicó sobre su propio repo después de tener historial previo (por eso todas son ✅ Hecha: del log no se reconstruyen descartes). Las entradas anteriores al 2026-09-24, cuando empezó la numeración de tareas (ver `backlog.md`), no tienen número y no se renumeran.

---

## 2026-11-05 — ✅ Tarea 134 — Rediseñar la sección "EN PROGRESO" de acsuite board

- Rediseñadas las secciones EN PROGRESO y PAUSADAS del board: Estado con barra (recién iniciado, Paso k de n, pasos completos) en lugar de Plan x/y, y Descripción y Decisiones como subtítulos con salto de línea (hasta 3 líneas); sin Qué falta, Próximo paso concreto ni otras subsecciones. Las pausadas usan la misma estructura más Por qué se pausó y Qué espera para retomarse.
- Revisión independiente hecha, sin bugs graves; corregidos N/A en decisiones y el ejemplo del README. Los hallazgos menores quedaron en las tareas 142 y 143.
- Commit en la suite: bec4e90.

## 2026-11-05 — ✅ Tarea 138 — board: mostrar el modo de la tarea en curso con emoji

- El board muestra el modo de ejecución del plan bajo el título de EN PROGRESO (✏️ Guiado, 📋 Paso a paso, 🤖 Auto, 🔥 Extremo); el texto legado o vacío no se muestra. La lectura del modo pasó a scripts/_shared/parse/plan-mode.ts y truncate corta por grafemas para mantener el borde alineado.
- Revisión independiente hecha, sin bugs; corregidos sus hallazgos menores. Documentado en el README del board.
- Commit en la suite: 09cccde.

## 2026-11-05 — ✅ Tarea 137 — rules.md: criterios de parada de auto y comportamiento de guided y extreme

- Nueva sección «Modos de ejecución del plan» en las reglas específicas de rules.md: comportamiento de guided, step-by-step, auto y extreme, con las paradas de auto, la regla del plan como contrato y el registro con acsuite task mode. La pregunta (b) de la regla 2 ofrece ahora los cuatro modos.
- Sin revisión independiente (cambio de texto). Commit en la suite: 5e2917d.

## 2026-11-05 — ✅ Tarea 140 — Skill: plantilla del handoff en inglés con la etiqueta del modo fija

- Fijada en la skill la etiqueta inglesa de la línea de modo (Agreed execution mode) y los valores en inglés (guided, step-by-step, auto, extreme) en template-architecture.md; el placeholder de la plantilla del handoff pasó a esos valores.
- Sincronizado el snapshot de la plantilla en los fixtures de docs-check. Sin revisión independiente (cambio de texto). La versión y el changelog quedan para la Tarea 141.
- Commits: 6851b66 en la skill y 65f344a en la suite.

## 2026-11-04 — ✅ Tarea 136 — Comando task mode (guided | step-by-step | auto | extreme)

- Nuevo comando acsuite task mode <guided|step-by-step|auto|extreme> que guarda el modo de ejecución del plan como dato estructurado (extreme exige --confirm). Reemplaza o inserta la línea de modo en cualquier idioma; el texto legado sigue siendo válido. start --mode se restringió a los cuatro valores.
- acsuite check avisa current-mode si el valor no es válido; el formato quedó en la regla 2 de rules.md y en los README de task-manager y docs-check.
- Revisión independiente hecha, sin bugs bloqueantes.
- Commit en la suite: feat(T-136).

## 2026-11-04 — ✅ Tarea 135 — Detección temprana de líneas de plan inválidas

- Detección temprana de líneas inválidas en el plan: la validación de close/pause se extrajo a una función reutilizable; el error de close/pause muestra el formato válido; step y edit avisan sin bloquear; acsuite check tiene el warning current-plan-line. Documentado en los README de task-manager y docs-check.
- Revisión independiente hecha; corregido el número de línea del aviso tras edit --apply.
- Commit en la suite: feat(T-135).

## 2026-11-04 — ✅ Tarea 133 — Revisar el issue #3 (modo de ejecución del plan), decidir mejoras y crear tareas

- Revisado el issue #3 y debatido con el operador: modos de ejecución guided, step-by-step, auto y extreme (valores en inglés en el archivo; el board los muestra en español con emoji), con criterios de parada en rules.md y el plan aprobado como contrato para acciones irreversibles o externas.
- Descartados por ahora: campo ejecuta por paso y marca (verificar) como mecanismo independiente del modo.
- Tareas creadas: 135 a 139.
- Commit: el de cierre de esta tarea.

## 2026-11-04 — ✅ Tarea 132 — README: advertir que el paquete se instala desde npm, no desde GitHub

- Agregada al README, en «Recomendado: instalarla de forma global», la advertencia de instalar desde npm y no desde GitHub (sin dist/ no se crea acsuite), con el enlace a npm y cómo limpiar la caché de Bun (bun pm cache rm).
- Commit: el de esta tarea en la suite.

## 2026-11-04 — ✅ Tarea 131 — Revisar las referencias de la skill a la suite

- Revisadas las referencias de la skill a la suite (comandos acsuite, instalación, bloque de rules.md): estaban vigentes; no hace falta nombrar los comandos group-*.
- Los enlaces a GitHub de skill/README.md y docs/suite-recommendation.md pasan al paquete de npm (https://www.npmjs.com/package/agent-context-suite); la lectura del README ahora usa npm view.
- Commit en la skill: 54cf837.

## 2026-10-31 — ✅ Tarea 130 — Regla en rules.md: omitir la revisión independiente en tareas pequeñas

- Regla nueva en «Reglas específicas de este proyecto» de docs/agents/rules.md, para todos los operadores: la revisión independiente se omite en tareas pequeñas (mensajes, texto o un solo archivo sin lógica nueva) y se hace con lógica nueva, varios archivos o comportamiento no cubierto por tests; tests y typecheck se corren siempre.
- Commit 7baa1e3 (suite).

## 2026-10-31 — ✅ Tarea 129 — Grupos: check, README y plantillas

- Check de grupos en acsuite check (scripts/docs-check/src/checks/groups.ts): group-too-small, group-missing-container, group-missing-reference, group-numbers-mismatch, group-title-mismatch, group-no-summary y group-header-comment.
- README del task-manager con los cinco comandos group-* y la sección «Grupos» (frases de «no soportado» corregidas); códigos nuevos en el README de docs-check; regla «Agrupamiento» y nota de la Tarea 34 actualizadas. La plantilla de la skill no se toca.
- bun test (1691), typecheck y acsuite check limpios; revisado por un subagente y corregidos sus hallazgos. Commit ae915f1 (suite).

## 2026-10-31 — ✅ Tarea 128 — Grupos: apuntar start, close, block y edit a group-eject

- Los errores de start, block, close y edit --blocker sobre una tarea agrupada ahora indican acsuite task group-eject N en vez de pedir moverla a mano; actualizado el comentario de cabecera de close.ts.
- Tests de start, block, close y edit afirman que el mensaje nombra group-eject. edit sin --blocker ya funcionaba con tareas agrupadas.
- bun test (1663) y typecheck limpios. Commit 5d4192f (suite).

## 2026-10-31 — ✅ Tarea 127 — Grupos: comandos group-edit y group-dissolve

- Comandos group-edit <N> (--title, --summary, --json) y group-dissolve <N> (--json), con editGroup y dissolveGroup en src/write/group.ts.
- Validaciones de título compartidas con createGroup (checkGroupText, checkTitleFree, checkHeaderReads); el Resumen solo se reconoce por su etiqueta; se repara el desajuste de título entre referencia y contenedor. Límite conocido: reemplazar un Resumen borra su sublista.
- bun test (1663) y typecheck limpios; revisado por un subagente y corregidos sus hallazgos. Commit 9d5ca02 (suite).

## 2026-10-31 — ✅ Tarea 126 — Grupos: comando group-add

- Comando group-add <N> <M>... (--json): suma tareas libres al grupo que contiene la tarea N con addTasks, sin tocar el Resumen.
- Helper compartido findSinglePlace y NOT_GROUPED con group-eject, nombres de lugar legibles en los errores y pickFreeTasks con verbo configurable.
- bun test (1587) y typecheck limpios; revisado por un subagente y aplicadas sus correcciones. Commit 3d176ca (suite).

## 2026-10-31 — ✅ Tarea 125 — Grupos: comando group-eject

- Comando group-eject <N> (--json): saca una tarea agrupada a «Tareas libres» con ejectTask y desarma el grupo si queda con menos de 2 tareas.
- Errores con etiquetas en español (WHERE exportado de block.ts), rechazo de tareas en varios lugares y mensaje correcto con contenedores de una sola tarea.
- bun test (1570) y typecheck limpios; revisado por un subagente y corregidos sus hallazgos. Commit a7cf30e (suite).

## 2026-10-31 — ✅ Tarea 124 — Grupos: comando group-create

- Comando group-create (--tasks, --title, --summary, --json): createGroup en src/write/group.ts arma la referencia con su Resumen en «Tareas libres» y el contenedor en «Tareas agrupadas»; palabras Grupo/Resumen/Tareas en language.ts.
- Valida mínimo de 2 tareas, repetidas, solo libres, título repetido, paréntesis sin cerrar y comentarios HTML. Límite conocido: un título que termina en (número) se rechaza porque el parser lo leería como lista.
- bun test (1556) y typecheck limpios; revisado por un subagente y corregidos sus hallazgos. Commit 14a95ae (suite).

## 2026-10-31 — ✅ Tarea 123 — Grupos: base compartida en src/write/group.ts

- Base de grupos en src/write/group.ts: ejectTask, addTasks y findGroupOf, con desarme automático de grupos de menos de 2 tareas y texto de vacío propio para «Tareas agrupadas» (emptyGrouped).
- 16 tests en test/write/group.test.ts con comparación exacta; bun test (1529) y typecheck limpios; revisada por un subagente sin bugs graves.
- Commit 5fda6b8 (suite).

## 2026-10-28 — ✅ Tarea 122 — docs-check: quitar el check skill-version

- Se quitó el check skill-version de docs-check con sus tests (VERSION_MARKER_RE pasó a _shared/markers.ts con su propio test); placeholders y legacy-marker se quedan.

## 2026-10-28 — ✅ Tarea 121 — Board: quitar los flags --operator, --compact, --arrows y --follow

- Se quitaron del board los flags --operator, --compact, --arrows y --follow (con sus --no-); los flags quitados o desconocidos dan error de uso (código 2) con la alternativa; compacto, flechas y observador se cambian con c, f y o y se recuerdan en settings.json.

## 2026-10-28 — ✅ Tarea 120 — Revisar la cantidad de tests de la suite

- Auditoría de la suite: el helper de los tests de task-manager pasa --agents y evita un git por llamada (suite de 40 s a 25 s); se consolidó watch.test.ts y se quitaron 4 e2e repetidos (1540 a 1536 tests).

## 2026-10-28 — ✅ Tarea 119 — Board: guardar preferencias (compacto, flechas, observador) en settings.json

- El board guarda compacto, flechas y observador en settings.json (clave board, archivo compartido entre scripts) al pulsar c, f u o; flags simétricos que mandan en la sesión; el observador guardado solo vale sin ruta y sin --once.

## 2026-10-28 — ✅ Tarea 118 — Board: al abrir un proyecto con varios operadores, entrar directo a las tareas del operador activo

- Al ejecutar board de frente o abrir un proyecto desde la lista, en un repo multi-operador se abre la vista de tareas del operador del correo de git; si no figura con carpeta, la vista de equipo.

## 2026-10-28 — ✅ Tarea 116 — Board: que la vista siga la selección cuando no cabe en el alto de la terminal

- Las vistas de equipo y proyectos se recortan al alto de la terminal siguiendo la fila elegida, con indicadores de líneas ocultas; pie, entrada de ruta, confirmación y avisos siempre visibles.

## 2026-10-28 — ✅ Tarea 117 — Board: reemplazar «volver al equipo» por «equipo» y quitar el botón volver

- Tecla e lleva al equipo desde las tareas de un operador y se quita la tecla volver; vistas con la misma jerarquía equipo, proyectos, tareas.

## 2026-10-28 — ✅ Tarea 112 — Mejorar la UX de la tabla de listado de proyectos del board con poco ancho

- La lista de proyectos del board ya no se corta con poco ancho: con terminales anchas se muestra la tabla y con angostas una tarjeta de tres líneas por proyecto (nombre · libres · bloqueadas / ruta / operador · en curso), con una línea en blanco entre proyectos. El modo sale de los anchos reales de la tabla: ruta ≥ 24 columnas y en curso ≥ 22.
- En las tarjetas la ruta se recorta por el principio, el operador se omite si no hay y el aviso de un repo ilegible va en la tercera línea. Función pura en ui/project-columns.ts; README y architecture.md actualizados. Revisado con un revisor aparte; 1468 tests, typecheck y check pasan.
- Commits en la suite: bd7ecc9, b180310 y d681b1b. Queda como Tarea 116 que la vista siga la selección cuando no cabe en el alto de la terminal.

## 2026-10-28 — ✅ Tarea 114 — Pasar los flags y tags de los comandos del task-manager a inglés y fijar la regla

- Los flags de `add`, `block`, `close`, `start` y `pause` pasaron a inglés, sin alias (`--title`, `--description`, `--decisions`, `--blocker`, `--trigger`, `--details`, `--reason`, `--summary`, `--new`, `--mode`, `--waiting-for`, `--missing`, `--next`). `block --tag` acepta solo `dependency|postponed`; el tag que se escribe en el archivo sigue el idioma de la documentación y la lectura acepta ambos idiomas.
- Regla nueva en rules.md: comandos, flags y palabras clave en inglés; el contenido libre va en el idioma de la persona. Revisado con un revisor aparte; 1451 tests, typecheck y check pasan.
- Commits en la suite: 2415ec7 y caf146e. Quedan fuera el mensaje de docs-check que cita solo tags en español y `dist/cli.js`, que se regenera con `bun run build`.

## 2026-10-28 — ✅ Tarea 115 — Quitar de step los flags de edición de texto (ahora en edit)

- `step` quedó con una sola función: marcar o desmarcar (`--undo`) pasos del plan y mantener al día «Qué falta» y «Próximo paso concreto» cuando siguen con el texto automático. Se quitaron sus flags `--falta`, `--decisiones` y `--proximo`, de golpe y sin período de aviso: el texto se cambia con `edit`.
- El aviso de texto propio ahora manda a `edit <N> --missing` o `--next`. `pause` conserva sus flags (otra función). Tests y README actualizados; revisado con un revisor aparte (2 observaciones corregidas); 1437 tests y typecheck pasan.
- Commit en la suite: 3b6f6dc.

## 2026-10-28 — ✅ Tarea 113 — Comando para modificar el contenido de una tarea del backlog

- Nuevo comando `edit` del task-manager: modifica el contenido de una tarea (título, descripción, decisiones, bloqueo, disparador, detalles y, en el handoff, «Qué falta», «Decisiones a medio camino» y «Próximo paso concreto») sin cambiar su estado ni su lugar. Funciona en backlog, team-backlog y handoff (en curso y pausadas); history queda solo lectura.
- Flags en inglés. `--blocker` conserva el tag y el historial `[Resuelto ...]` y rechaza lo que cambiaría la sección; también se rechazan líneas que rompan la estructura del handoff. Revisado con un revisor aparte (7 hallazgos corregidos); 1436 tests y typecheck pasan.
- Commits en la suite: c915864, 7d163a8 y 2c0ddcb.

## 2026-10-28 — ✅ Tarea 107 — Documentar y versionar el modo observador

- Documentado el modo observador y el mod acsuite-active-project: sección «Modo observador» y tabla de atajos completa en el README del board, árbol y descripciones en docs/architecture.md, y sección breve en el README de la raíz con enlace al README del mod.
- De paso: mensajes del board alineados con el botón [ ● Mark ], README del mod con el JSON escapado y corrección del texto desactualizado de «sin ruta».
- Versión 1.13.0 de la suite con el tag anotado local v1.13.0 (sin push). Commits en la suite: 33c445f y 745e117.

## 2026-10-27 — ✅ Tarea 111 — Mejoras UX del mod acsuite-active-project

- Banda del mod acsuite-active-project con el diseño de agent-radar: «Active Project» a la izquierda y un único botón [ ● Mark ] a la derecha; cede ante una encuesta y conserva las bandas de otros hooks.
- Sin Hide, sin cambio de idioma y sin $.store; los textos de usuario quedan fijos en inglés. Mod 0.3.0 con 6 pruebas nuevas de la banda (8 en total), README actualizado. Verificado por el operador.
- Commit en la suite: c494991.

## 2026-10-27 — ❌ Tarea 110 — Pruebas automáticas de startApp (teclas y observador con TTY simulada)

- Decisión del operador (2026-10-28): el riesgo es bajo y el cableado de startApp (teclas y observador) se verifica a mano; no vale el costo de simular una TTY.

## 2026-10-27 — ✅ Tarea 106 — Board: aviso cuando el repo no tiene la skill iniciada

- Aviso del modo observador cuando el repo marcado no tiene la skill iniciada: «Este repo no tiene la skill iniciada: <ruta>. Instálala desde https://github.com/Gersom/agent-context-skill»; los demás errores siguen genéricos.
- Nuevos en paths.ts: isSkillMissing, SKILL_URL, SKILL_MISSING_ERROR; en observer.ts: observerFailureNotice (pura). Los avisos del observador ahora se parten por palabras (wrapWords, que también parte palabras más largas que el ancho) para no perder el enlace.
- Commit en la suite: 1b07abf.

## 2026-10-27 — ✅ Tarea 109 — Normalizar el título y el modo de la vista del board

- Encabezado normalizado en las vistas del board: título en mayúsculas con ▣ (TAREAS, EQUIPO, PROYECTOS, MODO OBSERVADOR), segunda línea con el nombre del proyecto (· operador en tareas) y la ruta a su lado, recortada si no cabe; con el observador activo el título lleva el sufijo · MODO OBSERVADOR.
- README del board actualizado y pruebas de render y e2e ajustadas; setTitle (título de la ventana) no cambia. Verificado por el operador.
- Commits en la suite: aa642af y 883a838.

## 2026-10-27 — ✅ Tarea 105 — Board: modo observador del proyecto activo

- Modo observador del board: tecla o y flag --follow. Al entrar borra active-project.json y muestra una vista de espera propia; cuando el mod acsuite-active-project marca un proyecto (botón o /board, con at posterior), abre ese repo agregándolo a la lista si no estaba, entra al tablero del operador del correo de git en repos multi-operador y sigue observando; con el observador activo se ignoran p y b/Esc (se sale con o).
- Lectura tolerante del archivo (ilegible o inválido = no hace nada). Módulos nuevos: io/active-project.ts y cli/observer.ts; el mod pasó a guardar session.root (v0.2.1) porque session.cwd lo mueve un cd. bunfig.toml deja las pruebas de mods/ fuera de bun test. Verificado por el operador en la app; startApp sigue sin pruebas automáticas (necesita TTY).
- Commits en la suite: 53f05a9, f2a4f8d, b7ec69e, 15f95c7, c9d547f, 90f7040, 25dcc4c.

## 2026-10-27 — ✅ Tarea 104 — Mod de Claude: botón y /board que guardan el proyecto activo

- Mod mods/acsuite-active-project/ (v0.2.0): comando /board y botón en la banda sobre el prompt que guardan {path, at} en active-project.json (ACSUITE_HOME o ~/.acsuite); incluye README, 2 pruebas (claude plugin test) y marketplace.json en la raíz.
- Verificado por el operador en una sesión nueva de otro proyecto. Guarda el cwd tal cual (el board sube a la raíz); el mod queda en este repo y su separación va en la Tarea 108.
- Commits: 0579454 (mod) y 89e4f1e (marketplace), ambos en la suite.

## 2026-10-27 — ✅ Tarea 103 — Prueba mínima del mod de proyecto activo

- Mod de prueba mods/active-project-probe/: comando /board y banda con botón que guardan {path, at} en ~/.acsuite/active-project.json (ACSUITE_HOME).
- Verificado en la app de escritorio: el mod escribe fuera de su carpeta, la banda se dibuja y cada sesión guarda su propio proyecto; se instala vía CLAUDE_CODE_PLUGIN_DIRS porque un mod de dev-mods solo carga en la sesión que lo creó. Veredicto: viable.
- Commit: fdacf49 (suite).

## 2026-10-27 — ❌ Tarea 102 — Board: menores descartados y pegados en la lista de proyectos

- El operador descartó estos menores de la lista de proyectos (carrera de dos escrituras, x con archivo corrupto, aviso truncado, casos raros de pegado y tests del flujo de app.ts): son improbables en uso normal y no justifican el trabajo.

## 2026-10-27 — ✅ Tarea 101 — Board: menores pendientes de la lista de proyectos

- Pulido de la lista de proyectos de acsuite board: c ya no actúa en la vista de equipo y se eliminó el campo backToProjects; el error de git con dubious ownership explica que la carpeta es de otro usuario.
- Reescribir un projects.json con entradas inválidas lo respalda con sello de tiempo, y los avisos de guardado y de quitar muestran proyecto, causa y ruta completa al final.
- El manejo de teclas de la lista pasó a un reductor puro (src/cli/projects-keys.ts) con tests, sin cambios de comportamiento.
- Commits en la suite: efa677e, 937fa03.

## 2026-10-27 — ✅ Tarea 100 — Board: pulir menores de la lista de proyectos

- Pulido de la lista de proyectos de acsuite board: las entradas inválidas de projects.json se filtran con aviso con conteo, y el respaldo de un archivo corrupto lleva sello de tiempo sin pisar anteriores.
- Al agregar con a se expande ~ y se explican mejor una ruta que es un archivo o un fallo de confianza de git; la confirmación de x muestra nombre y ruta y [x] quitar solo aparece con filas.
- En el pie de la vista de equipo ya no salen [c] compactar ni el volver a proyectos duplicado (tampoco en el panel plano).
- Commit en la suite: 0119502.

## 2026-10-27 — ✅ Tarea 99 — Board: eliminar proyectos inexistentes de la lista

- Tecla x en la lista de proyectos de acsuite board: pide confirmación (Enter acepta; Esc o n cancelan) y quita el proyecto elegido de la lista y de projects.json, sin borrar nada del disco; vale para cualquier fila.
- La selección pasa a la fila vecina sin releer los repos; si falla el guardado, avisa y la lista no cambia.
- Commit en la suite: 94c7462.

## 2026-10-27 — ✅ Tarea 97 — Board: guardar los repos en los que se ejecuta

- La lista de proyectos de acsuite board se guarda en projects.json dentro de ACSUITE_HOME (por defecto ~/.acsuite), con formato { version: 1, projects: [rutas] }, escritura atómica, sin duplicados y con rutas normalizadas (barras y barra final).
- Ejecutar el board en un repo (también desde una subcarpeta) registra su raíz git, salvo con --once; la tecla a también guarda. Un archivo corrupto se ignora con aviso y se respalda en .bak antes de reescribirlo; los repos inexistentes quedan con aviso.
- Commits en la suite: e97a184, c5d02a0.

## 2026-10-27 — ✅ Tarea 96 — Board: opción de agregar repo en el listado de projects

- Tecla a en la lista de proyectos de acsuite board: abre una línea para escribir la ruta de una carpeta; Enter agrega y Esc cancela.
- Acepta la raíz del repo o cualquier subcarpeta (se sube a la raíz git y se exige la documentación de la skill); no duplica, muestra el error sin cerrar la entrada y deja el repo agregado seleccionado sin abrirlo.
- La lista agregada vive solo en memoria (persistencia: Tarea 97).
- Commit en la suite: 404f26e.

## 2026-10-27 — ✅ Tarea 95 — Board: tecla para ir a la vista de listado de projects (repositorios)

- Tecla p en acsuite board: desde cualquier vista de un repo (panel plano, equipo, panel de operador) lleva a la lista de proyectos; en la lista no hace nada.
- El pie de las vistas de un repo muestra [p] proyectos y la ayuda del comando lo menciona.
- Commit en la suite: 6bc87bf.

## 2026-10-27 — ✅ Tarea 98 — Board: crear la vista de listado de proyectos

- Vista de listado de proyectos en acsuite board: una fila por repo con nombre, ruta, tu operador, tarea en curso y cantidad de libres y bloqueadas.
- Enter abre el repo y b/Esc vuelve a la lista; se lee solo al abrir la vista y con r. Fuera de un repo con docs, el board abre la lista (vacía) en vez de fallar.
- La lista de rutas es inyectable y hoy trae solo el repo actual (persistencia: Tarea 97; tecla de acceso: Tarea 95).
- Commit en la suite: 98f3951.

## 2026-10-27 — ✅ Tarea 94 — Suite 1.11.1: versión con el fixture de la skill 2.3.1

- La suite sube a la versión 1.11.1 (patch): desde la 1.11.0 solo cambió el fixture espejo de la skill (hasta la 2.3.1) y la documentación; el código es el mismo.
- package.json 1.11.1, tag v1.11.1 subido con push --follow-tags y release en GitHub; la publicación en npm queda para el operador. bun test 1130 pass, typecheck, check y build limpios; npm pack muestra 1.11.1. Commit f39d148 (kit).

## 2026-10-27 — ✅ Tarea 93 — Skill 2.3.1: borrar la rama de trabajo tras un merge exitoso

- Tras un merge exitoso, los flujos de la skill que trabajan en rama (generar, migrar y actualizar) borran la rama agent-context-* con git branch -d (nunca -D ni remotas) para que no se acumulen; no la borran si el operador la dejó, si hubo conflictos o si descartó el commit, y el mensaje de resultado dice si se borró o se dejó y por qué. Una ejecución que no escribió nada también borra su rama vacía.
- Skill 2.3.1 (patch, ajuste de redacción; changelog «Sin cambios que aplicar»), tag v2.3.1. En la suite: marcador de rules.md y fixture espejo sincronizados. Revisión independiente sin bloqueantes (mejoras aplicadas); bun test 1130 pass, typecheck y check limpios. Commits 9a6e957, 1912202 y 75f12c7 (skill) y 87d0b42 (kit).

## 2026-10-27 — ✅ Tarea 92 — Skill 2.3.0: los flujos que escriben trabajan en una rama nueva y ofrecen el merge

- Los flujos de la skill que escriben en el repo (generar, migrar y actualizar) ahora trabajan en una rama nueva (agent-context-generate, -migrate o -update-X) creada desde la rama de partida, no siguen sin ella (ni sin git, ni con HEAD desacoplado, ni con cambios previos en sus rutas) y, al terminar, hacen el commit con confirmación y preguntan si el agente hace el merge de vuelta (nunca push). Antes, un agente siguió sin rama porque el árbol estaba modificado y el flujo de actualizar terminaba sin ofrecer el merge.
- El procedimiento vive en docs/working-branch.md de la skill y los tres flujos lo referencian; commits de la skill en inglés. Skill 2.3.0 (minor, comportamiento nuevo; changelog 2.3.md «Sin cambios que aplicar»), tag v2.3.0. En la suite: marcador de rules.md y fixture espejo sincronizados. Tres revisiones independientes (bloqueantes y mejoras corregidos); bun test 1130 pass, typecheck y check limpios. Commits ddff7a2, 29d5d81, 482fbd3, 3022b61 y 5a5c155 (skill) y 93784ed (kit).

## 2026-10-27 — ✅ Tarea 91 — Skill 2.2.2: la oferta de la suite explica su valor y no narra la instrucción

- La oferta de la suite en la skill ahora explica su valor (acsuite board para que el operador vea las tareas en vivo; acsuite task para que el agente ahorre tokens y baje el riesgo de romper la estructura) y prohíbe narrar que la skill o la versión «piden» ofrecerla; antes un agente dijo «esta versión pide ofrecer una recomendación opcional» sin explicar el beneficio. Se redacta en primera persona y en el idioma de la conversación; los encabezados de update-flow y migration-flow ya no dicen «obligatoria».
- Skill 2.2.2 (patch, ajuste de redacción; changelog «Sin cambios que aplicar»), tag v2.2.2. En la suite: marcador de rules.md y fixture espejo sincronizados. Revisión independiente sin bloqueantes (mejoras aplicadas); bun test 1130 pass, typecheck y check limpios. Commits a242ccf, 0d28128 y f0e6a2f (skill) y cdda6e1 (kit).

## 2026-10-27 — ✅ Tarea 90 — Skill 2.2.1: mostrar la recomendación de la suite es obligatorio

- En los flujos de la skill (generar, migrar y actualizar), ofrecer la recomendación de la suite ahora es obligatorio y solo aceptarla es opcional; antes decían «puede llevar» y un agente lo leyó como que mostrarla era opcional. Una actualización sin cambios aplicables también llega al Cierre y la ofrece, y se explicitan los caminos que no cuentan como terminar la actualización.
- Skill 2.2.1 (patch, ajuste de redacción; changelog «Sin cambios que aplicar»), tag v2.2.1. En la suite: marcador de rules.md y fixture espejo sincronizados. Revisión independiente sin bloqueantes (cinco mejoras aplicadas); bun test 1130 pass, typecheck y check limpios. Commits 0cb0dd8, cbecbda y 8af7a7f (skill) y 7127172 (kit).

## 2026-10-27 — ✅ Tarea 89 — Skill 2.2.0: el flujo de actualizar también recomienda la suite

- El flujo de actualizar de la skill (update-flow.md) ahora ofrece al terminar la recomendación opcional de la suite, una vez y solo si rules.md no tiene el bloque de la suite; antes solo se ofrecía al generar o migrar, así que un proyecto que solo se actualizaba nunca se enteraba. suite-recommendation.md lo recoge en «Cuándo se abre».
- Skill 2.2.0 (minor, comportamiento nuevo; changelog 2.2.md «Sin cambios que aplicar»), tag v2.2.0. En la suite: marcador de rules.md y fixture espejo sincronizados. Revisión independiente sin bloqueantes (dos mejoras aplicadas); bun test 1130 pass, typecheck y check limpios. Commits caa90c5, ca828a3 y bfa2f01 (skill) y ac3a464 (kit).

## 2026-10-27 — ✅ Tarea 88 — Skill 2.1.0: los commits se escriben siempre en inglés

- La Regla 5 de la plantilla rules.md de la skill ahora fija que los commits se escriben siempre en inglés (título y cuerpo), sea cual sea el idioma de la documentación, y su ejemplo pasa a inglés; antes no decía nada y el ejemplo en español hacía que los agentes commitearan en español.
- Skill 2.1.0 (minor, porque añade una obligación nueva): plugin.json, SKILL.md, marcador de la plantilla y docs/changelog/2.1.md con dos cambios «reemplazar»; tag v2.1.0. En la suite: marcador de rules.md y fixture espejo sincronizados. Revisión independiente sin bloqueantes; bun test 1130 pass, typecheck y check limpios. Commits 8c91851 y 94d116d (skill) y 9e5eed1 y 6e34ee5 (kit).

## 2026-10-27 — ✅ Tarea 87 — Skill 2.0.8: la recomendación de la suite ofrece acsuite init

- La recomendación de la suite en la skill (docs/suite-recommendation.md) ahora, si el operador acepta, le ofrece dos caminos: que el agente instale la suite de forma global (bun add -g / npm install -g agent-context-suite@latest) y ejecute acsuite init --apply, o que lo haga el operador; le explica que desde entonces el agente usará acsuite task y que puede ver el tablero con acsuite board dentro del repo; no instala ni ejecuta nada hasta que el operador elige.
- Skill 2.0.8 (plugin.json, SKILL.md, marcador de la plantilla rules.md y changelog «Sin cambios que aplicar»), tag v2.0.8 y release en GitHub. En la suite: marcador de rules.md y fixture espejo sincronizados. bun test 1130 pass. Commits 5223117 y a89907e (skill) y afa1750 (kit).

## 2026-10-27 — ✅ Tarea 86 — Que el agente sepa usar la suite cuando está instalada

- Nuevo subcomando acsuite init: agrega a rules.md del proyecto un bloque delimitado (agent-context-suite:start/end) que enseña al agente a usar acsuite task, check y board, insertado al inicio del archivo (tras el título, antes del primer ##, sin depender del idioma de los encabezados). Sin --apply muestra el diff; es idempotente; avisa en multi-operador. Nuevo aviso suite-rules en acsuite check cuando falta el bloque.
- Lógica compartida en scripts/_shared/rules-block.ts; este repo ya tiene el bloque. bun test 1130 pass, typecheck limpio; probado con Node 20, 22 y 24 (incluido un rules.md en inglés). Versión 1.11.0 (6937c80) con tag v1.11.0 y release en GitHub, publicada en npm por el operador y verificada por nombre con npx, bunx e instalación global (npm y bun). Commits 9a669f4, fc216ab, e1fb649, 9d22ef7, 0bc3a25 y 6937c80 (kit).

## 2026-10-26 — ✅ Tarea 85 — Reestructurar el README

- README raíz reestructurado: «Instalar la suite» con Requisitos (Node 20 o Bun y haber iniciado la skill en el proyecto), instalación recomendada global con bun add -g / npm install -g agent-context-suite@latest (actualizar con el mismo comando) y alternativa npx/bunx con @latest, un comando por bloque; una sola sección «Herramientas» (board, task, check) debajo de la instalación, con descripción breve y comando copiable cada una.
- Se quitaron «Cómo usar» (es de la skill), la frase de filosofía (pasó a docs/README.md), «Estado», «Estructura del repositorio» y las secciones repetidas, y ya no hay menciones de docs/ en el README raíz. @latest se mantiene en npx/bunx: bunx reutiliza una versión vieja en caché sin él. bun test 1072 pass, check limpio. Commits 8496930, fd5c5c2, c32fb78 y f8f079f (kit).

## 2026-10-26 — ✅ Tarea 83 — Reevaluar la dependencia de la skill respecto de la suite

- Decisión: se mantienen dos repos (la suite no depende de la skill en runtime; solo la usan en desarrollo los tests de scripts/skill-checks). La guía para colaborar pasa a CONTRIBUTING.md (PRs e Issues, requisitos, pruebas, clon de la skill, commits sin T-N) y el README del usuario ya no habla de clonar la skill: termina con una sección «Colaborar» con enlace absoluto.
- skill-dir.ts resuelve SKILL_DIR, agent-context-skill/ y skill/ (5 tests nuevos) y .gitignore ignora ambas carpetas; rules.md, architecture.md, docs/README.md y philosophy.md actualizados. bun test 1072 pass, typecheck y check limpios. El README llega a la página de npm con la próxima versión. Commits 31972bd y 09d2888 (kit).

## 2026-10-26 — ✅ Tarea 84 — Quitar la ruta del proyecto de los comandos (la ruta es donde se ejecuta el comando)

- board y check usan por defecto el proyecto de la carpeta de invocación (se sube hasta la raíz de git, como task); la ruta sigue siendo opcional. board deja de usar prompt() (que no existe en Node: fallaba con «prompt is not defined») y gana --help; gitToplevel pasó a scripts/_shared/git.ts y ask-path.ts a resolve-error.ts.
- Ayuda, mensajes, tests (1067 pass), README raíz y README de las herramientas actualizados, sin bun run en el README raíz. Versión 1.10.0 (320b302) con tag v1.10.0, publicada en npm por el operador y con release en GitHub; verificada por nombre con npx (raíz, subcarpeta, fuera de proyecto), bunx (con y sin --bun) e instalación global (npm y bun). Commits eabf23f, 0042f1e y 320b302 (kit).

## 2026-10-26 — ✅ Tarea 80 — Skill 2.0.7: quitar «kit» de sus textos y promocionar agent-context-suite

- Skill 2.0.7: las tres líneas con «kit» reescritas sin nombrar la suite (Regla 3 de template/agents/rules.md, questions-flow.md y la nota de anclas de template/agents/backlog.md), sección «Herramientas complementarias (opcional)» en el README de la skill y archivo nuevo docs/suite-recommendation.md, enlazado al final de questions-flow.md y como paso 8 de migration-flow.md (no desde SKILL.md ni en las sesiones donde la documentación ya existía).
- Versión 2.0.7 en plugin.json, SKILL.md y el marcador de la plantilla, con su entrada en el changelog (un cambio reemplazar y uno manual). En la suite: fixtures espejo de docs-check y rules.md sincronizados con la plantilla. bun test 1049 pass, typecheck y check limpios. Commits 87ff819 y 56fedea (skill, tag v2.0.7 y release en GitHub) y aad4577 (kit).

## 2026-10-26 — ✅ Tarea 81 — Aclarar el flujo de instalación de la suite en el README

- README reescrito: instalación recomendada global (npm install -g / bun add -g), alternativa sin instalar con npx/bunx, diferencia entre paquete (agent-context-suite) y comando (acsuite) y tabla de uso de los comandos; sin menciones de bun run.
- La ayuda y los mensajes del CLI (docs-check y task-manager) y sus tests pasan de bun run a acsuite. Versión 1.9.1 (736d3f0) con el tag v1.9.1, publicada en npm por el operador y con release en GitHub; verificada por nombre con npx, bunx e instalación global (npm y bun). Se dejaron con bun run los README por herramienta, architecture.md y los comentarios de cabecera (documentación de desarrollo). Commits 511de9b, 5018b99, f6b57a2 y 736d3f0 (kit).

## 2026-10-26 — ✅ Tarea 77 — Publicar la primera versión en npm y documentar la instalación

- Primera versión de la suite publicada: agent-context-suite 1.9.0 en npm (publicado por el operador con 2FA), commit de versión 63a28d3 con el tag anotado v1.9.0 subido con git push --follow-tags, y release v1.9.0 en GitHub.
- README con instalación, actualización y compatibilidad (probada en Windows 11 con Node 20, 22 y 24 y Bun; problemas en Linux/macOS por Issue). Verificado por nombre desde el registro con npx, bunx (con y sin --bun) e instalación global. Queda cosmética la versión placeholder 0.0.0-stage del registro y sin probar Linux/macOS. Commits 24558d5 y 63a28d3 (kit).

## 2026-10-26 — ✅ Tarea 76 — Probar la instalación real del paquete

- Instalación real del paquete probada en Windows 11 con el tarball de npm pack (agent-context-suite 1.8.1): npm install local + npx, instalación global con shim .cmd, npx y bunx (con y sin --bun) sobre Node 20.20.2, 22.23.4 y 24.14.0; check, task status, board --once, task add por stdin y códigos de salida correctos. Node 16 falla por sintaxis, lo que confirma engines >=20.
- No probado: Linux ni macOS (sin WSL) ni la instalación por nombre desde el registro (se verifica tras publicar, T-77). Rarezas de rutas locales de npx (ruta absoluta con /) y bunx (ruta relativa) con tarballs, no del paquete.

## 2026-10-26 — ✅ Tarea 79 — Renombrar «kit» a «suite» (agent-context-suite, comando acsuite) en todo el repo

- Renombrado «kit» a «suite» en todo el repo: carpeta scripts/ackit a scripts/acsuite y comando acsuite; prosa, comentarios, tests (format.test.ts, multi-operator.test.ts), description de package.json y bun.lock; repo renombrado en GitHub a Gersom/agent-context-suite con remoto y repository.url actualizados.
- Intactos: prefijo legado agent-context-kit: de los marcadores, history.md, fixtures espejo de la skill y tags. README corregido: la skill se llama agent-context-skill. Revisado por un revisor independiente (corregida una concordancia). bun test 1049 pass, typecheck y check limpios; dist/cli.js probado con Node. Commits e33829a, 1685cb7, bf64152 y cd8d17f (kit).

## 2026-10-26 — ✅ Tarea 75 — Preparar package.json para npm

- package.json listo para npm: name agent-context-suite, bin acsuite (dist/cli.js), files [dist], engines node >=20, prepublishOnly (bun run build) y sin private. Eliminada de rules.md la restricción «solo en devDependencies».
- npm pack --dry-run lista solo LICENSE, README.md, dist/cli.js y package.json (71 KB). bun test 1049 pass, typecheck limpio. Commit 1f6248c (kit). Nombre decidido: suite (agent-context-suite / acsuite); el renombrado del repo es la T-79.

## 2026-10-26 — ✅ Tarea 74 — Build a JS publicable

- Build a JS publicable: bun run build (scripts/ackit/build.ts, Bun.build) genera dist/cli.js (248 KB) para Node con shebang y picocolors/string-width dentro del bundle; dist/ ya estaba en .gitignore.
- Sin lecturas fuera de dist/ en runtime ni referencias a Bun en el bundle. Probado con Node desde otra carpeta y sin node_modules (check, task, board). bun test 1049 pass, typecheck limpio. Commit f4bf9da (kit).

## 2026-10-26 — ✅ Tarea 72 — CLI único ackit con subcomandos

- CLI único ackit con los subcomandos board (task-tracker), task (task-manager) y check (docs-check): despachador en scripts/ackit/dispatch.ts, con ayuda y código 2 ante uso incorrecto; el task-tracker pasó a main(argv) en src/main.ts.
- Scripts de package.json (ackit, board, task, check) apuntan al despachador; sin campo bin (T-75). Documentado en README raíz, architecture.md y los tres README de scripts.
- bun test 1049 pass, typecheck limpio; los tres subcomandos probados con Bun y con Node 24. Commits 0b66bff y 0bd4066 (kit).

## 2026-10-26 — ✅ Tarea 73 — Renombrar el comando tasks a board

- Renombrado el comando del task-tracker de bun run tasks a bun run board: script de package.json y menciones en README raíz, architecture.md, README y comentarios del task-tracker y textos de ayuda/reporte de docs-check.
- history.md no se tocó (registro histórico). bun test 1043 pass, typecheck limpio, bun run board arranca. Commit 54a71c4 (kit).

## 2026-10-26 — ✅ Tarea 71 — Quitar las APIs de Bun del runtime de los scripts

- Quitadas las dos APIs de Bun del runtime: Bun.stringWidth por string-width (task-tracker/ui/format.ts) y Bun.stdin.text() por text(process.stdin) de node:stream/consumers (task-manager/cli/dispatch.ts).
- string-width 8.3.0 en devDependencies. bun test 1043 pass y typecheck limpio; stdin y string-width probados con Node 24. Commit 5d1541f (kit).

## 2026-10-26 — ✅ Tarea 70 — Precisar la regla de tags de versión (anotados, en el commit de versión, con --follow-tags)

- Regla de tags precisada: tag anotado vX.Y.Z por cada cambio de versión, creado en el commit que la sube y subido con git push --follow-tags, desde la v1.8.1.
- Se editó la «Decisión no negociable» de rules.md y se agregó la viñeta «Tags» en docs/releasing.md. Commit c686f36 (kit).

## 2026-10-26 — ✅ Tarea 69 — Redactar la respuesta a la propuesta de publicación de Agensi

- Respuesta a Agensi redactada en inglés para exploración sin compromiso: aclara que la skill a listar es agent-context-skill (MIT) y no el kit, y pregunta por el proceso de alta, qué hay que aportar, formato y envío (paquete o GitHub), revisión y escaneo de seguridad, publicación de versiones nuevas y si se puede retirar el listado.
- Antes se comprobó en fuentes públicas que Agensi existe y qué dicen sus términos (70/30 sin cargos extra, licencia no exclusiva, copia hospedada por ellos). El correo no se ha enviado; lo envía el operador tras verificar agensi.io.

## 2026-10-26 — ✅ Tarea 68 — Agregar una licencia al kit y a la skill

- Licencia MIT («Copyright (c) 2026 Gersom Alaja») en la raíz del kit y de la skill (LICENSE idénticos), declarada con el campo license en package.json y plugin.json y con una sección Licencia en cada README; LICENSE añadido a los tres árboles de archivos.
- Skill 2.0.6 (tag local v2.0.6) y kit 1.8.1 (tag local v1.8.1), sin subir a GitHub todavía.
- Revisión independiente (sin bloqueantes; dos mejoras aplicadas), bun test, typecheck, docs-check y claude plugin validate en verde. Commits: skill 44085ab y 804e7e2; kit 520490e y b4b33c4.

## 2026-10-25 — ✅ Tarea 58 — Publicar la skill 2.0.0 y un release del kit

- Skill publicada como v2.0.5 (plugin.json, SKILL.md y marcador en 2.0.5; un solo tag porque 2.0.0 a 2.0.4 nunca se etiquetaron) y kit como v1.8.0 (package.json de 1.7.0 a 1.8.0).
- Ramas main y los dos tags subidos a GitHub con autorización del operador; los releases de GitHub los publica el operador con los textos redactados en el chat.
- bun test, typecheck, docs-check y claude plugin validate en verde antes de subir. Commits: kit d8ad045 (versión 1.8.0); skill sin commits nuevos (tag sobre e79aa87).

## 2026-10-25 — ✅ Tarea 67 — Renombrar a agent-context-skill los marcadores y nombres heredados agent-context-kit en proyectos ya generados

- Cuando la skill se aplica sobre un proyecto con documentación y encuentra el prefijo heredado (agent-context-kit: en anclas, versión y firma; agent-docs-skill: en los bloques start/end), ofrece renombrarlo a agent-context-skill: con la lista de archivos y líneas, en texto y con confirmación. Corre también con la versión «Igual» y tras «Actualizar», sin tocar history.md. Los scripts siguen leyendo el prefijo heredado.
- version-check.md (sección «Marcadores heredados»), update-flow.md, SKILL.md y template-architecture.md; skill 2.0.5 con «Sin cambios que aplicar» en el changelog.
- Medición con claude -p en dos caminos (versión igual y Actualizar), 2 corridas cada uno: 0 prefijos heredados y resultados idénticos. Revisión independiente (2 bloqueantes corregidos), bun test, typecheck y docs-check en verde. Commits: skill 95a22d9 y e79aa87; kit 03e6084.

## 2026-10-25 — ✅ Tarea 66 — Unificar los términos de la documentación: «la skill», operador, ronda y tanda

- Un término por concepto: «la skill» en femenino (93 cambios en 36 archivos), «operador» en vez de «usuario» para quien trabaja con el agente, «plantilla» en prosa y template/ solo como carpeta, «recuadro» en vez de widget, y ronda frente a tanda definidas.
- Sección «Términos» en docs/philosophy.md del kit y línea en asking-questions.md de la skill. Cambio 2 en la sección 2.0.2 del changelog para la introducción de las reglas por defecto de rules.md.
- Revisión independiente del diff (sin bloqueantes; dos fallos de género corregidos), bun test, typecheck y docs-check en verde. Commits: skill 2f1b688; kit 842aedd y fc76f9c.

## 2026-10-25 — ✅ Tarea 60 — Renombrar el name y el título de SKILL.md de agent-context-kit a agent-context-skill

- La skill pasa a llamarse agent-context-skill (igual que su repo) en SKILL.md, plugin.json, marketplace.json, el README de la skill (instalación y frases de invocación, con aviso de reinstalación) y los ejemplos de los flujos.
- La documentación del kit que habla de la skill también dice agent-context-skill; el kit y sus scripts siguen siendo agent-context-kit, y el prefijo heredado agent-context-kit: de los marcadores no se tocó.
- Revisión independiente del diff (sin bloqueantes; un residual corregido), bun test, typecheck, docs-check y claude plugin validate en verde. Commits: skill b66a38e; kit 3712ef1.

## 2026-10-25 — ✅ Tarea 65 — Mostrar el contexto antes de preguntar sin depender del recuadro

- Las preguntas de la skill que necesitan que el operador revise contenido (plan, tabla, resumen, lista, diff, estado) van en texto, como mensaje final del turno; las que se entienden solas siguen con el recuadro en tandas. Medido en el cliente del operador: el texto previo al recuadro no se ve si el turno ya usó herramientas.
- Regla 5 de asking-questions.md, SKILL.md, Regla 2 de rules.md (el plan y sus preguntas en texto, en el mismo mensaje) y cada flujo (questions, migration, update, version-check, multi-operator). Skill 2.0.4; changelog fusionado en la sección 2.0.2 porque 2.0.2 a 2.0.4 no estaban publicadas.
- Revisión independiente del diff (sin bloqueantes; mejoras corregidas) y bun test, typecheck y docs-check en verde. Falta confirmar la regla en el cliente del operador. Commits: skill 776c539 y 128c1e2; kit edfcec1.

## 2026-10-25 — ✅ Tarea 63 — Decidir cuándo se genera roadmap.md al migrar

- En una migración, roadmap.md se genera solo si la documentación vieja tenía uno, sin depender de la etapa que el modelo infiera (migration-flow.md, paso 4, y questions-flow.md).
- Skill 2.0.3, sin cambios que aplicar a proyectos ya generados.
- Medición con claude -p (2 corridas de migración): ambas sin roadmap.md, antes una sí y otra no. No se probó el caso con un roadmap previo. Commits: skill (docs y chore de T-63); kit test(T-63).

## 2026-10-25 — ✅ Tarea 64 — Corrección de tandas de preguntas: mostrar el contexto en el chat

- Las preguntas de la skill van cortas y el contexto que necesitan (plan, tablas, resúmenes, listas, diferencias, evidencia de las recomendaciones) se escribe completo en el chat antes de la tanda: regla 5 de asking-questions.md, Regla 2 de rules.md y cada pregunta de los flujos que depende de contexto.
- Skill 2.0.2, con el cambio de la Regla 2 en el changelog y una nota sobre cómo aplicarlo a mano en proyectos que ya no usan la skill.
- Revisión independiente del diff (un bloqueante corregido en SKILL.md) y bun test, typecheck y docs-check en verde. Commits: skill 1cf5796, 80925f0 y el de la nota del changelog; kit ac2153e.

## 2026-10-25 — ✅ Tarea 62 — Fijar el texto de las plantillas al generar y migrar para que salga idéntico entre corridas

- La skill copia el archivo de la plantilla y edita solo los placeholders y comentarios de guía, así que el texto fijo ya no se resume (flujos de generación y migración, comando de copia neutral al sistema).
- history.md se reconstruye desde git solo con 2 o más commits; frase fija «Ninguna registrada todavía.»; se comprueba que no queden comentarios de guía.
- Skill 2.0.1; medición con claude -p (4 corridas por iteración, 2 iteraciones): líneas fijas no literales de 22/32 a 8/11, todas intencionales. Commits: skill 8f81564, 28ca1fd y 9eb90b6; kit: fixture de rules.md.

## 2026-10-25 — ✅ Tarea 59 — Repetir la medición de determinismo con claude -p real y 2 o más corridas por escenario

- Medición con claude -p --model sonnet, 2 corridas por escenario (generación, migración, actualización 1.11.0 a 2.0.0): el conjunto de archivos y la estructura salen iguales en las 3; el texto fijo de las plantillas a veces se copia y a veces se resume (generación y migración); la actualización fue estable. Detalle y causa probable en la Tarea 62.

## 2026-10-25 — ✅ Tarea 61 — Reevaluar project/stack.md

- Commits: skill f944b61, 55cc661 y 41dc459; kit b2a0055, 9ef87e2 y d44f04d.

## 2026-10-24 — ✅ Tarea 52 — Verificación de optimización

- Sin cambios en las reglas fijas de las plantillas: los recortes posibles no llegan al 5 % del archivo. bun test (1034), typecheck y docs-check sin errores. Commits: skill d179455; kit 7b997fb.

## 2026-10-24 — ✅ Tarea 51 — Reevaluación de determinismo

- Desvíos corregidos: estado en reposo del handoff, plantillas sin contenido y enlaces de archivos compartidos en multi. Commits: skill d72366e; kit 9de7dbb.

## 2026-10-11 — ✅ Tarea 57 — Aclarar o unificar los dos prefijos de marcador (agent-docs-skill y agent-context-kit)

- Commits: skill 59465d4; kit d2ae1c2, 601d6be y a7765c0.

## 2026-10-11 — ✅ Tarea 56 — Unificar voseo y tuteo en los flujos y plantillas de la skill

- Commits: skill 2c6d7ba y 96c291c; kit e304cc2 y 716e368.

## 2026-10-11 — ✅ Tarea 55 — Unificar el orden de las reglas en la plantilla rules.md (Regla 9 entre la 4 y la 5)

- Commits: skill bf8369f y 0df184c; kit 5678bb1.

## 2026-10-11 — ✅ Tarea 54 — Confirmar si falta publicar el release del kit (package.json 1.7.0, último tag v1.5.0)

- Sin commits de contenido: solo tags v1.6.0 (3021dd5) y v1.7.0 (2970f5b).

## 2026-10-11 — ✅ Tarea 53 — Actualizar los pendientes desactualizados de docs/desing.md

- Commits (kit): e30a83a, b27b96c.

## 2026-10-11 — ✅ Tarea 50 — Revisión de consistencia

- Commits: kit e518907; skill e1eb38f.

## 2026-10-10 — ✅ Tarea 49 — Corregir los huecos pendientes de migration-flow.md

- Se corrigieron los huecos de migration-flow.md que la auditoría de la Tarea 48 había encontrado, para que migrar documentación de otro sistema sea verificable y no deje duplicados.
- El umbral pasa a 3 archivos o 30 %, se buscan docs/, doc/, documentation/ y archivos sueltos de la raíz (sin .claude/), hay una sola precondición de git limpio, un paso para retirar los originales con confirmación, subrutas en docs/others/ y avisos de punteros viejos; «Pasar de plano a multi-operador» se movió a multi-operator.md con tres correcciones, y el chequeo «ya existe» ahora exige firma o marcador y, si faltan, pregunta de quién es la documentación.
- Publicada como 1.11.0 (tag v1.11.0). Probado con claude -p sobre un repo con documentación de otro sistema y sobre uno con carpetas sin firma ni marcador.
- Commits (skill): ef7e151, 379a5e2, 34c642d y f960c64. Commits (kit): b5a81a8 y 11f8f4e. bun test 1025 pass, typecheck ok.

## 2026-10-10 — ✅ Tarea 48 — Actualizar la documentación de un proyecto al cambiar de versión de la skill (changelog y migración)

- La skill ahora puede actualizar un proyecto ya generado cuando se vuelve a usar con una versión más reciente, en vez de solo avisar.
- Se agregó docs/changelog/ (un archivo por versión minor o major, con las patch como secciones) y docs/update-flow.md: crea una rama nueva en el proyecto, muestra un resumen único, confirma cada cambio, pregunta qué hacer si una regla fija fue editada a mano y sube el marcador solo si todo quedó resuelto. version-check.md ofrece «Actualizar», «Solo revisar» o «Ahora no».
- Se auditó migration-flow.md: se corrigió la ruta obsoleta, su entrada desde SKILL.md y la regex del marcador, y la firma o el marcador ahora ganan sobre la intención de migrar. Los huecos que ya existían quedaron en la Tarea 49.
- Publicada como 1.10.0 (tag v1.10.0). Probado con claude -p sobre un proyecto 1.10.0 con una skill de prueba 1.11.0 (cambio aplicado, conflicto conservado, commit en la rama nueva).
- Commits (skill): 72cecf8, ca6a25b y d1fbb31. Commits (kit): 7526df4 y 5e00f0d. bun test 1025 pass, typecheck ok.

## 2026-10-10 — ✅ Tarea 47 — Revisar el versionado de la skill y registrar su versión en la documentación generada

- La skill ahora deja su versión en la documentación que genera y detecta cuando un proyecto se creó con una versión distinta, para poder avisar al reusarla con una versión más reciente.
- La versión va como comentario en la línea 1 de rules.md; el nuevo docs/version-check.md la compara con la de la skill, avisa y, si el operador acepta, muestra qué reglas fijas difieren de la plantilla, sin editar nada por su cuenta. docs-check avisa si el marcador falta o está mal formado, y un test exige que plugin.json, SKILL.md, el marcador y los tags coincidan. Se corrigió además la URL de la firma de handoff.md.
- Publicada como 1.9.0 (tag v1.9.0). Actualizar los proyectos automáticamente queda para la Tarea 48.
- Commits (skill): e733e40 y 98fad18. Commits (kit): c6a36ec, e9e468a y 64c141c. bun test 1018 pass, typecheck ok.

## 2026-10-10 — ✅ Tarea 46 — Hacer template-architecture.md de la skill independiente del repo kit

- template-architecture.md de la skill dejó de depender del kit: ya no se presenta como documentación de «este repo (agent-context-kit)» ni nombra los scripts del kit (task-tracker), para que la skill se pueda usar y publicar sola.
- Un test nuevo en skill-checks falla si la skill vuelve a mencionar los scripts del kit.
- Commits (skill): c8adf94. Commits (kit): 10df134. bun test 996 pass, typecheck ok.

## 2026-10-10 — ✅ Tarea 42 — Hacer que docs-check revise AGENTS.md y CLAUDE.md aunque la carpeta indicada no tenga docs/agents

- bun run check <ruta> sobre una carpeta que existe pero no tiene docs/agents ahora revisa también AGENTS.md y CLAUDE.md de esa carpeta, además de dar el error workspace; antes quedaban sin revisar.
- Si la ruta es una carpeta de agentes vacía, esos archivos se buscan en la raíz del repo. Una ruta que no existe sigue dando solo el error workspace.
- Commits (kit): 548e326. bun test 995 pass, typecheck ok.

## 2026-10-10 — ✅ Tarea 3 — Exportar como skill utilizable por Claude

- La skill quedó empaquetada como plugin de Claude Code en su propio repo, para poder instalarla con /plugin en vez de copiarla a mano.
- Se agregaron .claude-plugin/plugin.json y marketplace.json (SKILL.md sigue en la raíz, con "skills": ["./"]) y un README con instalación, uso y versionado; versión 1.8.0 con tag v1.8.0 local, sin publicar.
- Validado con claude plugin validate --strict y cargado en un clon temporal con --plugin-dir; la instalación real desde el marketplace y la caché quedan sin probar hasta publicar el repo.
- Commits (skill): 9f48c40 y 2204656 (aún sin push). Commits (kit): d618651, más el de cierre.

## 2026-10-10 — ✅ Tarea 45 — Actualizar proceso y documentación por la separación en dos repos

- Las reglas y la documentación del kit pasaron a tratar la skill como un repo aparte (Gersom/agent-context-skill, clonado e ignorado en skill/), para que quien lea el kit no suponga que skill/ es suyo ni que package.json versiona la skill.
- En rules.md se agregaron las reglas específicas «Dos repos» y «Commits en dos repos» (la Regla 9 y la 5, fijas, no se tocaron) y el versionado quedó separado: el kit con package.json y tags, la skill con los suyos en su repo.
- La cabecera de history.md pide anotar los commits por repo (Commits (kit) / Commits (skill)); architecture.md, philosophy.md, README raíz (con la sección «Clonar la skill»), docs/README.md y package.json se actualizaron en consecuencia.
- Commits (kit): 07a8a32 y 9b7f025. bun test 993 pass, typecheck ok, bun run check . sin errores.

## 2026-10-10 — ✅ Tarea 44 — Crear el repo agent-context-skill con el historial de skill/

- Se extrajo el historial de skill/ (33 commits, git subtree split) a un repo propio: https://github.com/Gersom/agent-context-skill (público, rama main), clonado en skill/ e ignorado por el kit (.gitignore).
- La raíz del repo de la skill solo tiene SKILL.md, docs/ y template/. Los commits de la skill ahora se hacen con git -C skill.
- Commit en el kit: 105cb48. bun test 993 pass, typecheck ok.

## 2026-10-10 — ✅ Tarea 43 — Desacoplar el kit de la carpeta skill/

- Los scripts y tests del kit ya no dependen de la carpeta skill/: skill-checks lee la skill desde SKILL_DIR y salta sus tests si no está; docs-check usa un snapshot de plantillas que skill-checks compara con la skill; se quitaron los enlaces a skill/ de docs/, README y scripts.
- La skill quedó autocontenida: la regla docs/ vs agent-context/ pasó de docs/desing.md a questions-flow.md («Carpeta destino») y se quitaron las referencias al README raíz y a desing.md.
- Commits: 85a000c, 6d29130, c0d96d6 y los dos de corrección tras la revisión. bun test 964 pass, 28 skip sin skill/.

## 2026-10-09 — ✅ Tarea 15 — Crear script para validar si un proyecto cumple las normas del task-tracker

- Se creó scripts/docs-check/ (bun run check <ruta>, con --operator, --json y --strict): revisa en otro repo, solo lectura, que su documentación de agentes sirva al skill, al task-tracker y al task-manager.
- Detecta con archivo y línea: workspace/archivos faltantes, anclas (faltantes, sin ancla, duplicadas, mal ubicadas), placeholders, Próximo número de tarea, números repetidos, headers y campos de tarea, tags de bloqueo, tarea en curso y entradas de history.md; sale con código 1 si hay errores.
- Reutiliza resolveWorkspace del task-manager y el parser de _shared/ (se exportaron TASK_HEADING_RE y ANCHOR_RE). 208 tests propios; bun test 988 pass y typecheck limpio. Sobre claude-mods y este repo da 0 errores y 0 avisos.
- Commits: feat, test y docs de T-15 más el de cierre.

## 2026-10-09 — ✅ Tarea 1 — Probar el flujo completo end-to-end sobre un repo real

- Se copió la skill en D:\personal\claude-mods (.claude/skills/agent-context-kit/) y se corrió el flujo de scaffolding en modo plano (un operador, Español).
- Resultado: se generaron AGENTS.md, CLAUDE.md, docs/README.md, docs/agents/ (rules, handoff, backlog, history) y docs/project/ (architecture, stack), con anclas de sección y sin placeholders sin completar.
- Queda sin probar el flujo de migración sobre un repo con documentación propia.
- Sin cambios de código en este repo: la tarea fue de verificación; el único commit es el de cierre.

## 2026-10-09 — ✅ Tarea 39 — Dejar la funcionalidad de subagentes en el CLAUDE.md global

- Los subagentes no van en la skill, que debe servir a cualquier agente o harness, sino en el CLAUDE.md global de Claude Code. Se creó la sección «Subagentes» en ~/.claude/CLAUDE.md (fuera de los marcadores de gentle-ai) con triggers obligatorios de delegación (mapeo 4+ archivos, escritor 2+ archivos no triviales, preparación, respaldo de sesión larga), y seis agentes en ~/.claude/agents/ con modelo y esfuerzo fijos: explorador y ejecutor en Haiku, investigador, escritor y revisor en Sonnet, retador en Opus. SDD se descartó. CLAUDE.md.trimmed se refrescó para que restaurarlo no pierda el bloque. Nada de esto vive en el repo: no hubo cambios en rules.md ni bump de versión. Commit: solo el de cierre.

## 2026-10-08 — ✅ Tarea 40 — Pasar a las reglas de la skill: autorizar antes de escribir, explorar y resolver incertidumbre

- Lo que solo vivía en el CLAUDE.md global pasó a la skill para que se cargue únicamente en los proyectos que la usan: la Regla 2 de rules.md (y su plantilla) tiene ahora el bloque «Antes de actuar, de cualquier tamaño» con tres ideas: pedir no es autorizar (una pregunta, investigación o propuesta es solo lectura hasta que el operador pida implementar), explorar antes de proponer y una sola pregunta concreta ante una duda real de producto. Va en rules.md y no en preferences.md para que valga para todos los operadores y agentes. Versión 1.7.0 sin tag ni release; bun test 780 pasan y typecheck limpio. Commits: a59d7b3, 35ba93c.

## 2026-10-08 — ✅ Tarea 41 — Evitar que gentle-ai restaure el bloque ODD del CLAUDE.md global

- El bloque agent-routing del CLAUDE.md global lo gestiona gentle-ai (hace copia en ~/.gentle-ai/backups antes de escribir) y no documenta una forma de excluir el ODD. Hoy gentle-ai sync no toca ningún agente (installed_agents vacío), pero install o sync --agent claude-code podrían devolverlo. Solución elegida: conservar el recorte como CLAUDE.md.trimmed junto al original (y el .bak con ODD) y restaurarlo a mano con cp tras un install o sync, sin cambiar la configuración de gentle-ai; quedó anotado en la memoria del agente. No se ejecutó ningún sync real, solo --dry-run.

## 2026-10-08 — ✅ Tarea 37 — Limpiar el seguimiento de ODD de las instrucciones globales

- El seguimiento de tareas deja de estar duplicado en las instrucciones globales: el CLAUDE.md global pasó de 21,4 KB a 4,7 KB (unos 4.500 tokens menos por conversación) y conserva solo CodeGraph, operaciones remotas y una línea de validar premisas con evidencia. Salieron el protocolo y el seguimiento de ODD, rutas y triggers de delegación, revisión por recibos, TDD, presupuesto de líneas, estrategia de PR y la regla de rama y commit; la revisión por recibos quedó desactivada con gentle-ai review mode disable. Se borró la carpeta odd/ del repo. El archivo global está fuera del repo; su copia de seguridad queda en C:\Users\Gersom\.claude\CLAUDE.md.bak hasta resolver la Tarea 41 (gentle-ai puede restaurar el bloque con sync). Commit: 471ca4f.

## 2026-10-08 — ✅ Tarea 35 — Portar a las reglas del kit las prácticas de seguimiento de ODD

- Tres prácticas de ODD portadas a las reglas del kit para que el seguimiento viva solo en el handoff: evidencia por paso como sufijo de la línea (checks y commit, solo mientras la tarea está en curso o pausada), cambios aceptados a mitad de trabajo (se conserva lo hecho y se reabre el invalidado con motivo) y cierre honesto (history guarda solo resultado, cómo y commits; el reporte de cierre suma «Checks pendientes» y «Próximo paso»). Reglas 5, 6 y 8 y los history.md en docs/agents y en las plantillas, nota del formato en los dos handoff, un test nuevo de pause/resume/step con el sufijo y versión 1.6.0 sin tag ni release. bun test 780 pasan y typecheck limpio. Commits: c258e83, 88dc566, 4e76872.

## 2026-10-08 — ✅ Tarea 36 — Optimizar el handoff: leer pausadas solo sin tarea en curso y editar solo lo que cambia

- Dos cambios para ahorrar tokens: el agente lee del handoff solo «Tarea en progreso» (las pausadas solo si no hay tarea en curso o si le piden retomar una), y el handoff se actualiza editando solo lo que cambió en vez de reescribirse entero. Se ajustaron AGENTS.md y sus dos plantillas, los textos del handoff y su plantilla, template-architecture.md y la Regla 6 (con su plantilla). El script task-manager ya edita de forma puntual; lo que le falta (editar la nota de un paso, reabrirlo con motivo) quedó anotado en la Tarea 34. bun test 779 pasan y typecheck limpio. Commits: d0aac8d, 48d2877.

## 2026-10-08 — ✅ Tarea 33 — Reevaluar las reglas de rules.md

- Reglas reorganizadas: «Commits coherentes» pasa a regla por defecto (Regla 9) y «solo se cierra si el operador lo pide» entra en la Regla 5. Nueva cláusula «Con una herramienta de tareas» en «Al cerrar una tarea» y en el bloque multi-operador: lo que ya hace la herramienta no se repite a mano. Se eliminaron las repeticiones (nombres en inglés, número correlativo, plantillas por idioma, «fijas» duplicado, «no se copia literal»). Sin regla propia de AskUserQuestion: queda a criterio del agente y solo rige para las preguntas del skill. Plantillas alineadas y versión 1.5.0, sin tag ni release.

## 2026-10-08 — ✅ Tarea 24 — Script para gestionar las tareas (handoff, backlog, history)

- Script `scripts/task-manager/` (`bun run task`) que edita de forma quirúrgica handoff, backlog, history y team-backlog, en vez de editarlos a mano. Comandos: status, next, show, add, start, step, pause, resume, block, unblock y close (Reglas 5 a 8 y reporte de cierre). Las escrituras exigen --apply; es opcional y no forma parte del skill. Documentado en su README, el README raíz, architecture.md y una sección de rules.md que aclara que no exime de las Reglas 5 a 8. close también descarta directo tareas del backlog. bun test 779 pasan y typecheck limpio. Rama feat/task-manager, sin mergear ni pushear.

## 2026-10-07 — ✅ Tarea 32 — Cambiar preguntas normales a widget

- El skill pregunta al operador con AskUserQuestion: regla general en SKILL.md (abiertas con 2 opciones mínimas, hasta 4 preguntas por llamada, respaldo en texto), flujos questions-flow/migration-flow/multi-operator reexpresados como opciones, mención en la Regla 2 por defecto y versión 1.4.0. Commits: e68a9cb, 573817f, a91c5e4, 37c7dbe, 1530107.

## 2026-10-07 — ✅ Tarea 31 — Cambiar la organización del render

- El panel del operador muestra los recuadros como el flujo de una tarea, de arriba abajo: SIN DUEÑO → LIBRES ⇅ BLOQUEADAS → EN PROGRESO ⇅ PAUSADAS → COMPLETADAS, con una línea de flecha que nombra cada transición (`↓ se toma`, `↓ bloquea · ↑ desbloquea`, `↓ empieza`, `↑ retoma · ↓ pausa`, `↓ se cierra`). Solo hay flecha entre recuadros que se muestran. La vista de equipo no cambió.
- Decisiones del operador: el orden de LIBRES y BLOQUEADAS cambió de opinión una vez (primero BLOQUEADAS arriba, al final LIBRES arriba); con el orden final, entre BLOQUEADAS y EN PROGRESO la flecha dice `↓ empieza (desde libres)`, porque una bloqueada no empieza directo. La dirección de cada flecha sigue el movimiento de la tarea.
- Ampliación: tecla `c` que compacta o expande los recuadros que no son EN PROGRESO ni PAUSADAS (una sola tarea, la más reciente, con `· +N más`; EQUIPO nunca se compacta), tecla `f` que oculta o muestra las flechas, y las opciones `--compact` y `--no-arrows`. El pie pasó al formato `[tecla] acción` sugerido por el operador y se parte en dos líneas si no entra, para que "salir" no se recorte.
- Verificación: `bun test` → 239 tests, todos pasan (19 nuevos); `bun run typecheck` sin errores; el operador probó a mano el selector y las teclas en una terminal real (queda resuelto lo que había quedado pendiente en la Tarea 30).
- Commits: `bfad675`, `fa426c1`, `1c2b7e9`, `18385cc` y el de cierre, en la rama `chore/apply-multi-operator`.
- A pedido del operador, esa rama (que llevaba apiladas las de las Tareas 26 y 30 y el paso de este repo a modo multi) se mergeó a `main` y se pusheó, y se publicó la versión 1.3.0 (bump **minor**: el modo multi es opcional y no cambia lo que se genera en modo plano): tag `v1.3.0` y [GitHub Release](https://github.com/Gersom/agent-context-kit/releases/tag/v1.3.0) con notas que resumen los cambios desde `v1.2.0`. Se borraron las ramas locales ya integradas (`docs/optimize-context`, `feat/multi-operator`, `feat/team-view` y `chore/apply-multi-operator`).

## 2026-10-06 — ✅ Pasado a modo multi-operador

- Este repo pasó de la estructura plana a la multi-operador (dogfooding, con `migration-flow.md`, "Pasar de plano a multi-operador"): `handoff.md`, `backlog.md` e `history.md` se movieron con `git mv` a `docs/agents/gersom/` sin reescribirlos (solo cambiaron dos enlaces relativos) y la numeración continúa (próximo número: 31).
- Registrados: `gersom` (gersomalaja@gmail.com), sin más operadores por ahora. Se crearon `operators.md` y `team-backlog.md`; el `rules.md` suma el bloque "Trabajo en paralelo" (las Reglas por defecto no se tocaron), el `AGENTS.md` raíz usa la variante multi y `docs/README.md` y `docs/architecture.md` muestran la estructura nueva.
- La Tarea 19 (prompt de normalización para repos que ya adoptaron el skill) pasó al `team-backlog.md` como tarea sin dueño; su número queda retirado. Cuando alguien la tome recibirá un número de su propia secuencia.
- Verificación: `bun test` → 219 tests, todos pasan; el tracker abre la vista de equipo de este repo con `gersom` preseleccionado.

## 2026-10-06 — ✅ Tarea 30 — Vista de equipo en el task-tracker (todos los operadores)

- En modo multi-operador el tracker abre en una vista de equipo: el recuadro EQUIPO es un selector con una fila por operador (su tarea en curso con el avance del plan, sus libres y bloqueadas y la última tarea que cerró) y, debajo, el recuadro "SIN DUEÑO" con las tareas de `team-backlog.md`. `↑`/`↓` eligen, `Enter` abre el panel del operador (que lleva el mismo recuadro "SIN DUEÑO" debajo de BLOQUEADAS) y `b`, `Esc` o Retroceso vuelven. `bun run tasks <ruta> <operador>` abre su panel de frente.
- Decisiones del operador: selector en lugar de un resumen fijo encima, con la última completada en la fila de cada operador (sin recuadro mezclado de completadas); el título del recuadro es "SIN DUEÑO"; las teclas para volver son `b` y `Esc`. Cambio sobre la Tarea 26: se eliminó la pregunta interactiva de operador y el correo de git ya no abre el panel propio, solo deja la fila marcada `(tú)` y preseleccionada. Solo lectura, nunca modifica carpetas ajenas.
- Código: parser de `team-backlog.md` en `scripts/_shared/parse/`, lectura del equipo con un lector con memoria por carpeta, `watchDir` con lista de archivos (se vigilan la raíz y cada operador), modelo del equipo, navegación como función pura de estado y teclas (`cli/nav.ts`), teclas con flechas (`cli/keys.ts`) y `render.ts` con lienzo compartido entre el panel y la vista de equipo.
- Verificación: `bun test` → 220 tests, todos pasan (57 nuevos); `bun run typecheck` sin errores; 0 enlaces relativos rotos; el script entero probado con un repo multi real con git (vista de equipo, operador por segundo argumento, `--operator`, carpeta directa y error con operador inexistente). Pendiente: el bucle interactivo del selector (modo raw) no se pudo ejecutar en este entorno; solo está cubierta su lógica pura.
- Commits: `75545ae`, `64c096d`, `cb54b63`, `331d0dd`, `2963a61` y el de cierre, en la rama `feat/team-view` (sale de `feat/multi-operator`).

## 2026-10-06 — ✅ Tarea 26 — Soportar varios operadores trabajando en paralelo

- Modo multi-operador opcional (opt-in en la Ronda 3 de `questions-flow.md`): cada operador tiene su carpeta `docs/agents/<operador>/` con su `handoff.md`, `backlog.md` e `history.md`, así nadie edita los archivos de otro y desaparecen los conflictos de merge y los números repetidos. El modo se detecta por `docs/agents/operators.md`; el operador actual, por el correo de `git config user.email`. Las reglas y el diseño completo están en `skill/docs/multi-operator.md`.
- Las tareas sin dueño van a `team-backlog.md`, sin numeración; quien la toma recibe el número de su secuencia (va a su `backlog.md` o directo a su `handoff.md`) y puede devolverla. Hay operadores sin carpeta (`solo team-backlog`) para quien solo recolecta tareas, y `preferences.md` opcional para la forma de trabajar de cada uno, que no puede contradecir `rules.md`.
- Decisiones del operador: soporte completo por carpeta de operador (en vez de documentar la limitación); nombres cortos y `operators.md` en lugar del correo en la ruta; `team-backlog.md` para lo sin dueño y `backlog.md` para lo tomado; las Reglas por defecto no se tocan: el bloque "Trabajo en paralelo" se agrega a `rules.md` solo en modo multi. Un proyecto de una sola persona no cambia (el diff de sus plantillas contra `main` está vacío). La vista de todos los operadores quedó en la Tarea 30.
- Task-tracker: detecta el modo, resuelve el operador (con `--operator` o elección interactiva si no puede solo), muestra el operador en el título y avisa si falta `operators.md` habiendo carpetas de operador. Parser de `operators.md` en `scripts/_shared/parse/`.
- Resultado (bytes / 3,1): inicio de sesión en un repo destino plano 6.149 B (igual que antes); en modo multi 8.945 B, +2.796 B ≈ +900 tokens por sesión que solo paga quien lo activa.
- Verificación: `bun test` → 163 tests, todos pasan (40 nuevos); `bun run typecheck` sin errores; 0 enlaces relativos rotos; probado con un repo multi real. Sin bump de versión; sería minor, se decide al publicar.
- Commits: `dd152ef`, `3941426`, `cdc7db8`, `69c307f`, `48d72d5`, `af78ce1`, `274d2b6`, `27add45`, `289932f`, `a94adb9`, `eb1d51d`, `6b33aee` y el de cierre, en la rama `feat/multi-operator`.

## 2026-10-06 — ✅ Tarea 29 — Política de lectura selectiva del skill y de la migración

- El skill se aplica una vez por repo; las sesiones siguientes solo leen lo generado. Por eso la política de uso diario quedó en el `AGENTS.md` del repo destino (leer `docs/README.md`, `rules.md` y `handoff.md`; el resto solo si la tarea lo exige; sin leer `backlog.md`/`history.md` con tarea en curso) y la de `SKILL.md` solo cubre generar y migrar (medir antes de leer, `cp` en vez de leer y reescribir, de a un archivo).
- `docs/README.md` pasó a ser un mapa de ~1,5 KB con la definición de "operador"; `architecture.md` recuperó su árbol anotado (corrige el hallazgo F4 de la Tarea 25). Las Reglas 5 a 8 pasaron, sin renumerar, a una sección final "Al cerrar una tarea" que se lee solo al cerrar. La migración pregunta si conservar `docs-legacy/` y si condensar o mantener el texto.
- Autorizado por el operador: editar las Reglas por defecto fijas (partir su lectura y acortar su redacción). Sin bump de versión; se decide al publicar la próxima release.
- Resultado (bytes / 3,1): inicio de sesión de este repo 11.411 → 9.324 B (−18%, README incluido); repo destino ≈ 6.149 B (≈ 1.980 tokens), no comparable 1:1 con la medición anterior porque `SKILL.md` ya no se carga en las sesiones siguientes.
- Verificación: `bun test` → 123 tests, todos pasan (16 nuevos en `scripts/skill-checks/`); `bun run typecheck` sin errores; 0 enlaces relativos rotos.
- Commits: `4678fa1`, `f3b85ed`, `8e772d8`, `78107d0`, `4cf8a9e`, `268f39c`, `806e7f1` y el de cierre, en la rama `docs/optimize-context`.
- A pedido del operador, la rama (Tareas 25 y 29) se mergeó a `main` y se pusheó, y se publicó la versión 1.2.0 (bump **minor**: no cambia los archivos que genera el skill ni mueve archivos de `template/`): tag `v1.2.0` y [GitHub Release](https://github.com/Gersom/agent-context-kit/releases/tag/v1.2.0) con notas que resumen los cambios desde `v1.1.0`.

## 2026-10-06 — ✅ Tarea 25 — Optimización del contenido del kit: menos tokens y sin duplicados

- Se midió una línea base de lo que se carga al iniciar sesión y se auditó el kit (8 hallazgos, F1–F8, todos aprobados y aplicados): comentarios de guía de las plantillas que ya no viajan al repo destino, preámbulos y reglas por defecto recortados, `architecture.md`/`stack.md` reescritos para contener solo lo no deducible del código, flujo "ya existe" resuelto en `SKILL.md` sin abrir `questions-flow.md`, y política de lectura de `history.md`/`backlog.md`. El porqué: el kit solo vale si su costo en tokens se mantiene bajo (`docs/philosophy.md`).
- Resultado (tokens ≈ bytes / 3,1): inicio de sesión de este repo −14% (13.321 → 11.411 B), plantillas `agents/` −32%, inicio de sesión en un repo destino −67% (31.490 → 10.383 B; estimación que supone que el agente quita los comentarios de guía).
- Autorizado por el operador: recortar las Reglas por defecto de `rules.md` (fijas) y reescribir `architecture.md`/`stack.md`. Sin bump de versión; se decide al publicar la próxima release.
- Verificación: `bun test` → 107 tests, todos pasan; `bun run typecheck` sin errores; enlaces relativos sin roturas; el parser del tracker lee las plantillas nuevas.
- Commits: `b28c1f0`, `2852c20`, `1327727`, `fa890b1` y el de cierre, en la rama `docs/optimize-context`.

## 2026-10-06 — ✅ Tarea 28 — Renombrar la carpeta `src/` a `skill/`

- La carpeta `src/` (con `SKILL.md`, `docs/` y `template/`) pasó a `skill/`, hecho con `git mv` para conservar el historial. Se actualizaron las referencias vivas: archivos dentro de `skill/`, README del task-tracker, `README.md`, `docs/architecture.md`, `docs/agents/rules.md` y las descripciones de las tareas abiertas del backlog. Los enlaces internos del skill son relativos, así que no se rompieron.
- `docs/desing.md` y las entradas ya cerradas de `history.md` se dejaron como están: son registro histórico con la ruta de entonces. El `src/` interno de `scripts/task-tracker/` no cambia.
- Autorizado por el operador: cambiar solo la ruta (no el contenido) dentro de las Reglas por defecto 3 y 4 de `rules.md`, que son fijas. Sin bump de versión (queda en 1.1.0); se decide al publicar la próxima release.
- Efecto conocido: los repos que ya generaron documentación con las plantillas `agents/handoff.md` y `agents/backlog.md` quedan con un puntero de texto a `src/docs/template-architecture.md`; no rompe nada.
- Verificación: `bun test` → 107 tests, todos pasan; `bun run typecheck` sin errores; búsqueda de `src/` sin restos fuera del `src/` interno del task-tracker y de los registros históricos.
- La rama `refactor/rename-src-to-skill` se mergeó a `main`, sin push.

## 2026-10-06 — ✅ Tarea 20 — Actualizar la sección "Estructura del repositorio" del README raíz

- La sección de `README.md` ahora muestra la estructura real: `src/` (el skill: `SKILL.md`, flujos de decisión y plantillas), `scripts/` (task-tracker y `_shared/`), `docs/` (documentación del propio repo, con `agents/`), `package.json` y `tsconfig.json`. Una línea por entrada, sin repetir el árbol completo: enlaza a `docs/architecture.md` y a `src/docs/template-architecture.md` (Regla 1).
- Antes mostraba `SKILL.md` y `template/` en la raíz y no mencionaba `docs/`, `scripts/` ni `package.json`.
- Fuera de alcance: la sección "Estado" del README ("Proyecto en diseño") puede estar desactualizada; no se tocó.
- Por pedido del operador durante la tarea, nació la Tarea 28 (renombrar `src/` a `skill/`); al hacerse, el README y `architecture.md` pasarán a decir `skill/`.
- Verificación: solo documentación; sin código ni tests afectados.
- La rama `docs/readme-structure` se mergeó a `main`, sin push.

## 2026-10-06 — ✅ Tarea 27 — Ocultamiento de tareas pausadas y bloqueadas cuando no hay

- En la pantalla del task-tracker, los recuadros PAUSADAS y BLOQUEADAS solo aparecen si hay tareas de ese tipo (`ui/render.ts`); ya no muestran "Ninguna". EN PROGRESO ("Sin tarea en curso"), LIBRES y TAREAS COMPLETADAS no cambian, y los contadores del modelo tampoco.
- Tests: se ajustó el de "estados vacíos y set mínimo" (pasó de 2 recuadros a 1) y se agregó uno que cubre los dos casos (sin pausadas ni bloqueadas no aparecen; con ellas sí). README del task-tracker actualizado.
- Verificación: `bun test` → 107 tests en 18 archivos, todos pasan; `bun run typecheck` sin errores; `bun run tasks docs/agents --once` sin recuadro PAUSADAS.
- Aparte, a pedido del operador durante la tarea: regla de "Commits coherentes" en `rules.md` (varios commits por tarea por unidad coherente, título `tipo(T-N): descripción`, commit de cierre con handoff/backlog/history). Primera tarea cerrada con esa convención.
- La rama `feat/hide-empty-sections` se mergeó a `main`, sin push.

## 2026-10-06 — ✅ Tarea 23 — Separar el parser de `parse/*.ts` para reutilizarlo en otros scripts

- Nuevo módulo compartido `scripts/_shared/` (decisión del operador: el `_` marca código de apoyo, y las carpetas de `scripts/` sin `_` son scripts independientes; documentado en `docs/architecture.md`). Contiene `parse/` (backlog, blocks, handoff, history, markdown, sections), `tasks/` (`block-info`, `task-refs`), `types.ts` con los tipos del dominio, y `test/` con los tests en espejo, los fixtures y `helpers.ts`.
- `shared/types.ts` del task-tracker quedó solo con los tipos de pantalla y de lectura de archivos; importa los del dominio desde `_shared`. Se movieron también `block-info.ts` y `task-refs.ts` porque los necesitan las Tareas 15 y 24.
- Refactor puro: el task-tracker no cambió de comportamiento. Las posiciones línea/offset del parser no se agregaron (decisión del operador): van en la Tarea 24.
- Verificación: `bun test` → 106 tests en 18 archivos, todos pasan; `bun run typecheck` sin errores; `bun run tasks docs/agents --once` se ve igual.
- Aparte: `.codegraph/` (índice local de CodeGraph) se agregó a `.gitignore`. Se mergeó la rama `refactor/shared-parser` a `main`, sin push.
- Desbloquea la Tarea 24, que pasó a "Tareas libres".

## 2026-10-06 — ✅ Tarea 22 — Definir y agregar la filosofía del proyecto

- Nuevo `docs/philosophy.md`: la razón de ser del kit (dictada por el operador: contexto que sobrevive entre sesiones, modelos y herramientas de IA, sin releer todo el código) y cinco principios — markdown plano como fuente de verdad del estado, el código gana ante un conflicto (enlaza la Regla 4 de `rules.md` sin duplicarla), versionado y portable, herramientas opcionales, y tolerancia a la edición manual (incluye edición quirúrgica).
- Decisiones del operador: archivo propio (no regla en `rules.md`, por lo que no hay regla nueva); el principio del código lo agregó él; la razón de ser la dictó él. Se depuró el texto para quitar repeticiones (56 → 44 líneas).
- Enlazado desde `README.md` y `docs/architecture.md` (árbol y "Qué es cada parte").
- Es la base de principios de la Tarea 24 (script de gestión de tareas).
- Verificación: solo documentación; sin código ni tests afectados.

## 2026-10-05 — ✅ Regla de cierre explícito y MVP del task-tracker

- Regla nueva en `rules.md` (reglas específicas): ninguna tarea se cierra sin que el operador lo pida explícitamente; al terminar se le manda el resumen y se espera, también en tareas chicas sin plan. Decisión del operador después de aplicarla por primera vez en la Tarea 21.
- El operador confirmó que el task-tracker llegó a su MVP → la Tarea 19 (prompt de normalización) se desbloqueó y pasó a "Tareas libres".
- La rama `feat/task-tracker` (Tareas 9 a 21) se mergeó a `main` (fast-forward) y se pusheó, a pedido del operador; después se borró la rama local.
- Se creó el tag `v1.1.0` y el [GitHub Release](https://github.com/Gersom/agent-context-kit/releases/tag/v1.1.0) correspondiente, con notas que resumen los cambios desde `v1.0.0`: anclas de sección, convenciones nuevas de las plantillas (bloqueos, plan de las pausadas, formato de `history.md`) y el task-tracker.

## 2026-10-05 — ✅ Tarea 21 — Ajustes de pantalla del task-tracker: tachado de pasos y recuadros

- **Recuadros:** cada tipo de tarea (completadas, en progreso, pausadas, libres, bloqueadas) va en un recuadro de esquinas redondeadas (`ui/box.ts`), con el título del tipo en el borde superior izquierdo y el archivo del que sale a la derecha; reemplazan a los separadores `━━ archivo ━━`. Todos tienen el ancho de la terminal (o `COLUMNS`, o 100 sin terminal; mínimo 40), con el texto largo recortado sin romper el borde (el ancho se mide en columnas visibles con `Bun.stringWidth`).
- **Tachado:** las tareas completadas ya no se tachan; se tacha solo el texto de los **pasos hechos** del plan, en la tarea en progreso y en las pausadas.
- **Plan de las pausadas:** la plantilla de `handoff.md` suma un campo opcional `Plan` en las pausadas, para conservar los checkboxes al pausar una tarea; el script lo muestra como plan (barra y pasos), sin repetirlo como texto. Documentado en `src/docs/template-architecture.md`.
- **Colores**, tras seis rondas de correcciones del operador: títulos de los recuadros sin íconos; bordes en gris (`picocolors.gray`) salvo el de "en progreso", que queda verde; tareas completadas (nombre y fecha) en gris 245 de la paleta de 256, con el prefijo `T-N` en verde; título "TAREAS COMPLETADAS" en `#6DB07B` (RGB directo, elegido por el operador a partir del `#4EBA65` del aviso de actualización de Claude Code); textos secundarios (rutas, archivo del borde, campos, pasos hechos, "Ninguna", pie) en gris 250, y ya no queda texto atenuado (`dim`). Los tonos viven en `tones()` de `ui/render.ts`.
- Verificación: `bun test` → 106 tests en 18 archivos, todos pasan; `bun run typecheck` sin errores. README del script actualizado.
- Instrucción del operador para esta tarea: no cerrarla hasta que lo pidiera explícitamente; después de cada ronda de correcciones se le mandó el resumen y se esperó.
- Al revisar las bloqueadas (Regla 7): la Tarea 4 sigue esperando a la 3; la 19 sigue postergada hasta que el operador confirme el MVP.

## 2026-10-05 — ✅ Tarea 11 — Refinar script de seguimiento de tareas

- **Pantalla rediseñada** a pedido del operador: encabezado con el nombre de la carpeta del repo en mayúsculas y sin guiones (`AGENT CONTEXT KIT`), la ruta del repo y "Última actualización HH:MM:SS · se modificó <archivo>"; un bloque por archivo con su separador `━━ archivo ━━`, en este orden:
  - `history.md` — "TAREAS COMPLETADAS" con las 5 últimas entradas, compactas (`T-18: título`), **tachadas** (código ANSI de tachado) y con la fecha sin tachar; las descartadas marcadas con ✖. `history.md` ahora también se vigila y se lee (opcional, como `backlog.md`).
  - `handoff.md` — en detalle: la tarea en progreso con su plan y cada subsección (`Qué falta`, `Próximo paso`, etc., con el título tal como está escrito), y cada pausada con todos sus campos.
  - `backlog.md` — compacto (`T-N: título`); en las bloqueadas, debajo, las tareas que menciona su motivo (`→ espera T-3: título`), con aviso si esa tarea ya está cerrada en `history.md` (pista para la Regla 7).
- **Atajos** en terminal interactiva: `q` / Ctrl+C salen, `r` redibuja. Sin terminal interactiva o con `--once`, no se activan.
- **Documentación:** `scripts/task-tracker/README.md` (uso, rutas, atajos, qué lee y cómo, avisos frecuentes), mención en el `README.md` raíz y en `docs/architecture.md`; en `src/docs/template-architecture.md` se documentó el formato de `history.md` que lee el script (entradas `## <fecha> — ✅|❌ [Tarea N —] título`, nuevas arriba, sin anclas).
- **Versión `1.1.0`** en `package.json` (bump minor acordado en la Tarea 9: anclas + script). El tag `v1.1.0` y el release en GitHub van después del merge a `main`, que decide el operador.
- Verificación: `bun test` → 92 tests en 17 archivos, todos pasan (5 corridas); `bun run typecheck` sin errores; la salida contra este repo coincide con el diseño acordado.
- Decisiones del operador: el prompt de normalización se sacó a la Tarea 19 (`[postergada]` hasta que el operador confirme el MVP del script); no hay vista alternable (por eso no hay atajo `d`); "completadas" incluye las descartadas; los guiones bajos del nombre del repo no se convierten.
- Las dependencias de una bloqueada se muestran para cualquier tag cuyo motivo mencione tareas, no solo `[dependencia]`, porque el nombre del tag se traduce según el idioma.
- Tarea nueva surgida: la 20 (sección "Estructura del repositorio" del `README.md` raíz, desactualizada desde antes).
- Al revisar las bloqueadas (Regla 7): la Tarea 4 sigue esperando a la 3; la 19 sigue postergada hasta que el operador confirme el MVP.

## 2026-10-05 — ✅ Tarea 18 — Migrar a TypeScript

- `scripts/task-tracker/` (código y tests, 32 archivos) pasó de JavaScript a TypeScript con `git mv`, imports con extensión `.ts`. Bun ejecuta `.ts` sin compilar; `"tasks"` apunta ahora a `index.ts`. Revierte la decisión de la Tarea 10 de usar JavaScript.
- Configuración en la raíz: `tsconfig.json` (la recomendada por Bun, con `strict: true`, sobre `scripts/**/*.ts`), `typescript` y `@types/bun` en `devDependencies`, y script `bun run typecheck` (`tsc --noEmit`). Por qué el chequeo: Bun ejecuta TypeScript **sin revisar tipos**, así que sin `tsc` los errores de tipos pasarían desapercibidos.
- Tipos: los tipos que vivían en comentarios JSDoc pasaron a TypeScript; los compartidos (tarea, grupo, sección, modelo, resultados de lectura y de rutas) quedaron en `src/shared/types.ts`. Sin `any` ni aserciones `!`. Ningún error de `tsc` apuntó a un bug real: todos eran de tipos (anotaciones faltantes, comprobaciones de `null` que TypeScript no deducía).
- Se unificó la función de hora que había quedado duplicada en la Tarea 14: ahora vive en `src/shared/time.ts`, así `io/` no depende de `ui/`.
- Verificación: `bun test` → 64 tests, todos pasan (5 corridas); `bun run typecheck` sin errores; `bun run tasks . --once` contra este repo muestra la tarea en curso; ruta inexistente → código 1. Comparando textos y regex con la versión JavaScript, solo cambian tipos, comentarios y la unificación de la hora.
- Decisiones del operador: `strict: true`; chequeo de tipos; TypeScript por defecto para los scripts nuevos de `scripts/` (regla nueva en `rules.md`, junto con que `bun run typecheck` tiene que pasar igual que `bun test`). Se actualizó también `docs/architecture.md`.
- Sugerencia que quedó sin aplicar: activar `noUncheckedIndexedAccess` (más seguro con los accesos por índice y los grupos de regex, a costa de varios chequeos más).
- El operador decidió no hacer la revisión que `gentle-ai` propuso sobre las Tareas 17 y 14 (~3100 líneas, mayormente archivos movidos); el rechazo quedó registrado en `gentle-ai`.
- Al revisar las bloqueadas (Regla 7): ninguna dependía de esta tarea.

## 2026-10-05 — ✅ Tarea 14 — Estructuración del script de seguimiento de tareas

- Refactor puro de `scripts/task-tracker/`, con la estructura acordada con el operador: `index.js` queda solo como arranque; `src/app.js` (ciclo leer → modelo → pintar, watcher, Ctrl+C); `src/cli/` (argumentos, pregunta de la ruta); `src/io/` (rutas, lectura, watcher, lectura con memoria); `src/parse/` (`parser.js` de ~300 líneas dividido en markdown, secciones, bloques, handoff y backlog); `src/model/` (`blockInfo` separado de `buildModel`); `src/ui/` (render y utilidades de formato).
- Tests en espejo dentro de `test/` (`io/`, `parse/`, `model/`, `ui/`, `e2e/`), con las mismas aserciones: 64 tests, todos pasan, ahora en 14 archivos. Archivos movidos con `git mv` para conservar su historial.
- Verificación de que fue solo un movimiento: comparando las líneas de lógica antes y después, solo cambian los dos envoltorios nuevos (`parseArgs`, `startApp`) y el nombre de una variable (`args` → `argv`).
- Decisiones del operador: tests en espejo (no junto al código); `parse/` queda dentro de `task-tracker/` — si se comparte con otro script se decide al hacer la Tarea 15.
- Pendiente menor: `snapshot.js` tiene una función de formato de hora idéntica a `formatTime` de `ui/format.js`; no se unificó para no salir del refactor puro.
- Se actualizó el árbol de `scripts/task-tracker/` en `docs/architecture.md`.
- Se creó además la Tarea 18 (Migrar a TypeScript), a pedido del operador.
- Al revisar las bloqueadas (Regla 7): la Tarea 11 dependía de esta tarea → movida a "Tareas libres" con su bloqueo marcado como resuelto.

## 2026-10-05 — ✅ Tarea 17 — Corregir observaciones de la segunda revisión del script

- **Tag de bloqueo:** `blockInfo` solo acepta el tag con el que **empieza** el valor de un campo (con o sin backticks); los tags en medio del texto se ignoran, así un `[algo]` dentro de `Descripción` ya no se toma como bloqueo ni oculta el aviso "sin bloqueo vigente". Convención ajustada en `src/docs/template-architecture.md` y en el campo `Bloqueos` de `src/template/agents/backlog.md` ("el valor empieza con la etiqueta del motivo"). Todos los `Bloqueos` de este backlog ya cumplían.
- **Motivo:** la etiqueta final tipo "Antes:" se recorta solo cuando hay historial después; un motivo que termina en "ver:" queda intacto.
- **Primera lectura:** `src/snapshot.js` reintenta una vez un archivo que todavía no se leyó bien, solo en la primera lectura de la sesión (si el tracker arranca justo mientras un agente lo reescribe); en lecturas posteriores no, para no sumar 300 ms a cada redibujo del set mínimo.
- **Tests de `watchDir`:** sin esperas fijas para lo que puede fallar por lentitud — esperan en bucle con tope, "calientan" el watcher antes de medir y comprueban que otro archivo no avisa usando un `handoff.md` marcador.
- Verificación: `bun test` → 64 tests, todos pasan, en 9 corridas seguidas (6 del agente que implementó + 3 de revisión).
- Al revisar las bloqueadas (Regla 7): la Tarea 14 dependía de esta tarea → movida a "Tareas libres" con su bloqueo marcado como resuelto. La Tarea 11 sigue bloqueada por la 14.

## 2026-10-05 — ✅ Tarea 16 — Segunda revisión de código de la rama `feat/task-tracker`

- Revisión de lo sumado desde la revisión de la Tarea 12 (sobre todo la Tarea 13, `95382d7`; ~490 líneas), pedida por el operador después de que `gentle-ai review assess` volviera a marcar riesgo medio con el presupuesto del slice superado. Revisión nativa de `gentle-ai` (lente `review-reliability`) con consentimiento del operador.
- Resultado: **aprobada** y confirmada (`review-5dffdeca0adb3fba`). Sin hallazgos bloqueantes; 4 observaciones no bloqueantes, todas resueltas en la Tarea 17:
  - (WARNING, resuelta en la Tarea 17) `blockInfo` recorre los campos en orden y toma el primer tag de cada uno: un `[algo]` sin backticks (que no sea link) en un campo anterior a `Bloqueos` (ej. `Descripción`) se toma como tag de bloqueo en lugar del real, y puede ocultar el aviso "sin bloqueo vigente". El código anterior priorizaba los tags con backticks en todos los campos.
  - (SUGGESTION) El recorte de una etiqueta final tipo `Antes:` en el motivo se aplica siempre, aunque no haya historial: un motivo que termina en `ver:` pierde esa palabra. Aplicarlo solo cuando hay historial.
  - (SUGGESTION) Un archivo que nunca se leyó bien no se reintenta: si el tracker arranca justo mientras un agente reescribe `handoff.md` (o está trabado), muestra vacío/error hasta el próximo evento. Antes sí se reintentaba en la primera lectura.
  - (SUGGESTION) Los tests de `watchDir` usan esperas fijas (100 ms / 600 ms); en una máquina cargada podrían fallar de forma intermitente. Mejor esperar en bucle hasta que se cumpla la condición, con un tope.
- Se creó y se tomó en el momento, así que no pasó por la lista del backlog (número asignado con el contador).

## 2026-10-05 — ✅ Tarea 13 — Corregir observaciones de la revisión del script

- **Tag de bloqueo viejo:** `blockInfo` (`scripts/task-tracker/src/model.js`) ahora mira solo el primer tag de cada campo; si es `[Resuelto…]`, el campo entero es historial y se salta. Nuevo aviso en pantalla para una tarea en "bloqueadas" sin bloqueo vigente (candidata a volver a libres, Regla 7). Convención nueva para una tarea que se vuelve a bloquear: el bloqueo vigente va primero y el historial resuelto después — documentada en `src/docs/template-architecture.md` (viñeta "Tag de bloqueo") y en el campo `Bloqueos` de `src/template/agents/backlog.md`, sin tocar las Reglas por defecto. Ya aplicada en este backlog a la Tarea 11.
- **Lectura con memoria:** nuevo `src/snapshot.js`, que trata igual a `handoff.md` y `backlog.md`: si falla la lectura de un archivo que ya se leyó bien (no existe, vacío, EBUSY/EPERM), reintenta a los 300 ms y, si sigue fallando, muestra la última versión buena con un aviso que dice de qué hora es. La nota del set mínimo solo aparece si `backlog.md` nunca existió en la sesión. `index.js` dejó de tener su reintento propio.
- **Tests faltantes:** `watchDir` (una ráfaga de escrituras da un solo aviso; otros archivos se ignoran), precedencia de `invocationDir`, el lector con memoria (con lecturas simuladas) y el script entero con `Bun.spawn` (`--once`, ruta inválida, sin argumento ni datos de entrada). `bun test`: 60 tests en 7 archivos, todos pasan; se corrió 6 veces seguidas sin fallos intermitentes.
- Prueba manual: borrar `backlog.md` mientras el script vigilaba una copia de `docs/agents/` mostró la última versión con el aviso, y al restaurarlo volvió a la normalidad.
- Incidente: para cortar esa prueba en segundo plano se usó `taskkill /F /IM bun.exe`, que cierra **todos** los procesos de Bun de la máquina, no solo el de la prueba. Avisado al operador; en adelante, cortar solo el proceso propio.
- Al revisar las bloqueadas (Regla 7): la Tarea 14 dependía de esta tarea → movida a "Tareas libres" con su bloqueo marcado como resuelto. La Tarea 11 sigue bloqueada por la 14.

## 2026-10-05 — ✅ Tarea 12 — Revisión de código de la rama `feat/task-tracker`

- Revisión de los commits de las Tareas 9 y 10 contra `main` (28 archivos, ~1450 líneas), pedida por el operador después de que `gentle-ai review assess` marcara la rama como riesgo medio con el presupuesto del slice superado. Se corrió la revisión nativa de `gentle-ai` (lente `review-reliability`) con consentimiento del operador.
- Resultado: **aprobada** y confirmada (`review-9c41ddb06aa2357c`). Sin hallazgos bloqueantes; 3 observaciones no bloqueantes (2 WARNING, 1 SUGGESTION) que se anotaron en la Tarea 11 para evaluarlas al armar su plan: tag de bloqueo resuelto en `blockInfo`, reintento de lectura solo para `handoff.md`, y falta de tests del punto de entrada y del watcher.
- Se creó y se tomó en el momento, así que no pasó por la lista del backlog (número asignado con el contador).

## 2026-10-05 — ✅ Tarea 10 — Crear script funcional de seguimiento de tareas

- Se creó `scripts/task-tracker/` (JavaScript, Bun): vigila el `docs/agents/` de un proyecto y redibuja en la terminal la tarea en progreso (con el avance del plan y el próximo paso), las pausadas, las libres (y sus grupos) y las bloqueadas (con su tag `[dependencia]`/`[postergada]`) cada vez que cambian `handoff.md` o `backlog.md`. Separado por responsabilidad: `index.js` (entrada), `src/reader.js` (ubicar la carpeta, leer, vigilar con debounce), `src/parser.js` (markdown → estructura, independiente del idioma), `src/model.js` (procesamiento) y `src/render.js` (pintado con `picocolors`).
- Se lanza desde la raíz con `bun run tasks [ruta]`: sin ruta, la pregunta al arrancar; acepta la raíz del proyecto (busca `docs/agents/` o `agent-context/agents/`) o la carpeta directa; `--once` pinta una vez y sale. Cada instancia es independiente, así que se puede correr una por proyecto en paralelo; el título de la ventana muestra el nombre del proyecto.
- Ubica las secciones por las anclas de la Tarea 9, con plan B por orden de `##` (avisado en pantalla) para docs que todavía no las tienen. `backlog.md` es opcional (set mínimo).
- Dependencias en la raíz, no por script: `picocolors` en `devDependencies` del `package.json` raíz (que además pasó a `"type": "module"` y suma los scripts `tasks` y `test`), `bun.lock` commiteado y `node_modules/` en `.gitignore`. Por qué: `package.json` es `private` y lo que se distribuye es `src/`, así que las dependencias de las herramientas no viajan con el skill; un futuro script (ej. empaquetar `src/template` en `.zip`) suma su dependencia al mismo archivo.
- Verificación: `bun test` → 41 tests en 4 archivos, todos pasan (fixtures en español con anclas, en inglés sin anclas, solo `handoff.md`, CRLF, resolución de rutas). Prueba manual contra este repo: detecta la tarea en curso y el plan real.
- Se actualizaron `docs/agents/rules.md` (el skill en `src/` sigue siendo markdown puro; `scripts/` son herramientas del repo; dependencias solo en `devDependencies` raíz) y `docs/architecture.md` (carpeta `scripts/`). En `src/docs/template-architecture.md` se precisó cómo se detecta la tarea en progreso (solo antes de la primera subsección `###`), alineándolo con el código.
- Hallazgo: `bun run` (Bun 1.4.2) cambia el cwd a la raíz del package y no define `INIT_CWD`; la carpeta de invocación queda en `npm_config_local_prefix`, que es la que se usa para resolver rutas relativas.
- Al revisar las bloqueadas (Regla 7): la Tarea 11 dependía de esta tarea → movida a "Tareas libres" con su bloqueo marcado como resuelto.

## 2026-10-05 — ✅ Tarea 9 — Preparación para el script de seguimiento de tareas

- Se agregaron **anclas de sección** (`<!-- agent-context-kit:section=<id> -->`) antes de cada sección de tareas: `free`, `blocked`, `grouped` en `backlog.md` e `in-progress`, `paused` en `handoff.md`, tanto en las plantillas de `src/template/agents/` como en los `docs/agents/` de este repo. Cada archivo lleva una nota corta: son comentarios de máquina, no se traducen ni se borran, y en `handoff.md` se reescriben en cada sobrescritura.
- La fuente de verdad del mecanismo quedó en `src/docs/template-architecture.md` (sección "Anclas de sección"); `questions-flow.md` (flujo de proyecto existente) y `migration-flow.md` (al migrar y con firma presente) solo lo mencionan y enlazan, e indican que el agente agrega las anclas si faltan (auto-curación).
- Se normalizó `docs/agents/backlog.md` de este repo de `## Tarea N` a `### Tarea N`, como dice la plantilla. Se corrigió además el ejemplo comentado de `src/template/agents/backlog.md`, que decía `## Tarea [N]` mientras los placeholders reales usan `### Tarea [N]` — origen probable del desvío.
- Por qué: el script de seguimiento de tareas (Tarea 10, `scripts/task-tracker/`) necesita ubicar las secciones sin depender del idioma — por la Regla 3 los headers se redactan en el idioma de cada proyecto, así que buscar "Tareas libres" literal no funciona en un repo en inglés. Se usó el mismo prefijo que la firma `agent-context-kit:signature`.
- Decisiones del operador: sin ancla para la línea `**Tarea:**` (la tarea en progreso es la primera `Tarea N` dentro de `in-progress`); el bump minor (`1.1.0`) se hace al cerrar la Tarea 11; se trabaja en la rama `feat/task-tracker`.
- Al revisar las bloqueadas (Regla 7): la Tarea 10 dependía de esta tarea → movida a "Tareas libres" con su bloqueo marcado como resuelto.

## 2026-09-26 — ✅ Agregar sección "Qué es este proyecto" al README generado

- Se identificó un hueco real en el catálogo: ningún archivo cubría "qué es este proyecto" (ej. ecommerce, API REST) — `project/architecture.md` es estructura de carpetas y filosofía de organización, no eso.
- Se agregó esa sección como primer bloque de `template/README.md` (guía de generación del `docs/README.md` real). Se pregunta una sola vez, la primera vez que se genera el archivo (o si existe pero no tiene la sección), y se preserva tal cual en corridas futuras.
- Se documentó el paso en `questions-flow.md` (Ronda final, paso 1) y en `template-architecture.md`.
- Se reordenó `template/AGENTS.md` para que apunte primero a `docs/README.md` (qué es el proyecto + índice), antes de `agents/rules.md` y `agents/handoff.md`.
- Se detectó redundancia: `template/README.md` tenía su propia sección "Empezar acá" con el mismo orden de lectura que ya dicta `AGENTS.md`. Se sacó esa sección — el README queda como índice puro (qué es el proyecto + qué archivo cubre qué tema), sin repetir instrucciones de orden.

## 2026-09-26 — ✅ Tarea 8 — Agregar punto de partida AGENTS.md y CLAUDE.md

- Se detectó el bug real: la "Ronda final" de `questions-flow.md` excluía explícitamente al set mínimo (tarea puntual/testear) del paso que asegura el puntero raíz. Como el set mínimo solo copia `agents/rules.md` y `agents/handoff.md`, un agente genérico que abriera el repo después no tenía forma de encontrar esa documentación sin invocar el skill de nuevo.
- Se agregaron `template/AGENTS.md` y `template/CLAUDE.md` al catálogo (en vez de redactar el párrafo puntero ad-hoc que solo vivía como ejemplo en `docs/desing.md`). `AGENTS.md` es la fuente de verdad (dice qué leer primero); `CLAUDE.md` nunca duplica ese contenido, solo redirige a `AGENTS.md`. Ambos llevan la sección delimitada `<!-- agent-docs-skill:start/end -->` para agregarse sin sobrescribir si el archivo ya existe con contenido propio del operador.
- Se actualizó `questions-flow.md` (Ronda final, pasos 3-4 y las dos tablas resumen) para que ambos punteros se aseguren siempre, en cualquier set incluido el mínimo — solo el `README.md` generado sigue exclusivo de los sets intermedio/completo.
- Se documentó el nuevo par de plantillas en `template-architecture.md`.
- Dogfooding: se actualizó el `CLAUDE.md` raíz de este mismo repo para que redirija a `AGENTS.md` en vez de duplicar su contenido.

## 2026-09-25 — ✅ Tarea 7 — Resolver el caso de un backlog muy grande

- Se agregó un mecanismo de agrupamiento a "Tareas libres" de `backlog.md` (Regla 7 de `rules.md` extendida): si esa sección supera las 15 tareas, se evalúan agrupar 2 o más que compartan un objetivo real. El criterio no es un tope de cantidad — es que el grupo entero quepa en una sola frase de objetivo compartido, sin usar "y" para forzar una tarea que en realidad no pertenece.
- Un grupo aparece en "Tareas libres" como una sola línea corta (resumen + tareas que lo componen); el detalle completo se mueve a una sección nueva, "Tareas agrupadas", que no hace falta leer salvo que el operador pida el detalle de una tarea puntual o se vaya a tomar una — el objetivo es reducir lo que hay que leer para ver qué está disponible, sin perder ningún dato.
- Si un grupo queda con una sola tarea (las demás se tomaron o cerraron), se desarma y esa tarea vuelve a ser una entrada individual normal.
- Se descartó la alternativa de mover tareas concretas a `roadmap.md` agrupadas — invertía la definición ya establecida de `roadmap.md` (visión sin desglosar que "gradúa" hacia `backlog.md`, no al revés) y, además, no resolvía el problema real: agrupar por sí solo no reduce el tamaño del archivo si el detalle sigue estando ahí completo.
- Cambios aplicados al catálogo maestro (`src/template/agents/rules.md`, `backlog.md`) y propagados a `src/docs/template-architecture.md` y al dogfooding de este repo (`docs/agents/rules.md`, `backlog.md`) — sin formar ningún grupo todavía, porque "Tareas libres" tiene solo 2 tareas, bien por debajo del umbral.
- Por qué: el disparador fue notar que `backlog.md` podía volverse largo e incómodo de leer/navegar a medida que crece. Agrupar por objetivo compartido, con el detalle diferido, resuelve eso sin perder información ni forzar una reestructuración más grande (varios archivos, paginado) que el proyecto no necesita todavía.

## 2026-09-24 — ✅ Tarea 6 — Definir el término "operador" en la documentación

- Se agregó una definición corta de "operador" (blockquote, justo después del título) a `template/agents/rules.md` y a `docs/agents/rules.md` (dogfooding de este repo): "la persona humana dueña de este proyecto — quien pide las tareas, aprueba decisiones y a quien se le pregunta cuando algo no está definido".
- Decisión sobre dónde vivir: no se creó un glosario nuevo del kit — se puso en `rules.md` porque es el único archivo garantizado en cualquier alcance (Mínimo/Intermedio/Completo, según `questions-flow.md`), así que la definición siempre está presente sin fragmentar el catálogo por un solo término.
- Por qué: "operador" se usa extensamente en todo el catálogo (`rules.md`, `backlog.md`, `handoff.md`, etc.) sin definirse en ningún lado — detectado al debatir la Tarea 5, cuyo propio texto lo daba por sentado.

## 2026-09-24 — ✅ Bump a `v1.0.0`

- Se bumpeó `package.json` de `0.3.1` a `1.0.0`, aplicando el criterio de bump **major** ya fijado en `rules.md` (esta tarea renombró `template/agents/changelog.md` → `history.md`, referenciado desde `questions-flow.md`, y cambió la estructura generada en `docs/agents`).
- Decisión explícita del operador: saltar directo a `1.0.0` en vez de `0.4.0`, aunque la Tarea 1 (probar el flujo end-to-end sobre un repo real) sigue sin resolverse — la razón original para arrancar en `0.1.0` y no en `1.0.0` (ver entrada del 2026-09-22 "Versionar el proyecto") quedó superada por esta decisión puntual, no derogada como criterio general.
- Por qué: el operador priorizó reflejar en el número de versión que el catálogo tuvo un cambio estructural real (bump major), en vez de seguir la lectura convencional de SemVer 0.x de tratar todo como pre-estable hasta validar end-to-end.
- Se creó el tag `v1.0.0` y el [GitHub Release](https://github.com/Gersom/agent-context-kit/releases/tag/v1.0.0) correspondiente, con notas que resumen todos los cambios desde `v0.3.1` (última versión con release publicado).

## 2026-09-24 — ✅ Tarea 5 — Contemplación de nuevos flujos y estados de tareas

- Se rediseñó el ciclo de vida de las tareas de `agents/`, que antes solo contemplaba "pendiente" (en `backlog.md`) y "cerrada" (en `changelog.md`):
  - **Descartada:** se renombró `changelog.md` → `history.md` (bump **major**, ver criterio en `rules.md`) y se redefinió su alcance para cubrir tareas resueltas en general, marcando cada entrada como ✅ Hecha o ❌ Descartada. El número de tarea se conserva igual en ambos casos.
  - **Pausada:** `handoff.md` pasó de tener una única sección ("Tarea actual") a dos: "Tarea en progreso" (una sola, activa) y "Tareas pausadas" (lista, cada una con motivo de pausa y qué espera para retomarse).
  - **Bloqueada / pospuesta:** `backlog.md` se dividió en "Tareas libres" y "Tareas bloqueadas / pospuestas", con el campo `Bloqueos` etiquetado `[dependencia]` (no se puede empezar) o `[postergada]` (se podría, pero conviene esperar), un campo nuevo `Desbloquea` para link bidireccional, y la convención de no borrar `Bloqueos` al resolverse sino marcarlo `[Resuelto el <fecha>]` conservando el motivo original.
- Se agregaron tres reglas por defecto nuevas a `rules.md` (Reglas 6, 7 y 8): `handoff.md` se actualiza en cada paso de un plan (no solo al cerrar la tarea) para dar continuidad entre sesiones/chats; el último paso de todo plan mediano/grande es "documentar cierre de tarea", que incluye revisar todas las tareas bloqueadas del backlog por si alguna dejó de estarlo; y un formato fijo de reporte de cierre en el chat (resueltas / descartadas / desbloqueadas / nuevas).
- Al revisar las bloqueadas de este mismo backlog (Regla 7) se encontraron dos que ya no aplicaban: el bloqueo de la Tarea 3 (esperaba que `SKILL.md` y `template/` estuvieran terminados — lo estaban desde el 2026-09-22) y el de la Tarea 7 (esperaba que esta misma Tarea 5 se cerrara). Ambas se movieron a "Tareas libres".
- Todos los cambios se aplicaron primero al catálogo maestro (`src/template/agents/`) y se propagaron a la documentación auxiliar que lo referencia (`template-architecture.md`, `questions-flow.md`, `SKILL.md`, `migration-flow.md`, `template/README.md`, `decisions.md`, `known-issues.md`) y recién después al dogfooding de este mismo repo (`docs/agents/`), incluyendo este archivo — `docs/desing.md` quedó intencionalmente sin tocar por ser registro histórico, no spec vigente.
- Por qué: el disparador concreto fue notar que no había forma de descartar una tarea evaluada sin perder su número y el motivo del descarte — evitando que se re-proponga sin ver por qué se rechazó antes. Al debatirlo con el operador surgieron los otros dos casos (pausada, bloqueada/pospuesta) como huecos reales del mismo ciclo de vida, no solo el caso puntual del descarte.

## 2026-09-24 — ✅ Dos reglas por defecto nuevas + `docs/agents/rules.md` de este repo

- Se agregaron dos reglas fijas nuevas a `template/agents/rules.md` (reglas 4 y 5, después de la de numeración/idioma agregadas antes):
  - **Regla 4 — El código es la fuente de verdad:** ante un conflicto entre esta documentación y lo que el código realmente hace, gana el código, salvo que el operador diga explícitamente lo contrario.
  - **Regla 5 — Mínimo al cerrar una tarea:** `handoff.md`, `backlog.md` y `changelog.md` se actualizan siempre como mínimo (sobrescribir handoff, agregar entrada a changelog, sacar/agregar items en backlog según corresponda), sin importar qué otro archivo también haya cambiado.
- Se creó `docs/agents/rules.md` para este mismo repo (no existía todavía, aunque el resto de `docs/agents/` sí) — con las 5 reglas por defecto ya vigentes, `Idioma de la documentación: Español`, y reglas específicas del proyecto (versionado SemVer + criterio de bump, qué no tocar sin autorización, decisiones no negociables ya tomadas).
- Se actualizaron los punteros raíz `CLAUDE.md`/`AGENTS.md` para que remitan también a `rules.md`, no solo a `handoff.md`. Se agregó `docs/agents/` (con sus 4 archivos) al árbol de `docs/architecture.md`, que no lo tenía listado.
- Por qué: pedido directo del operador — formalizar dos convenciones que ya se venían aplicando implícitamente (seguir el código cuando la doc queda desactualizada; no dejar `handoff`/`backlog`/`changelog` sin tocar al cerrar algo) como reglas explícitas del catálogo, y completar el dogfooding de este repo con su propio `rules.md`.

## 2026-09-24 — ✅ Tarea 2 — Soporte multi-idioma

- Se agregó un paso nuevo en `questions-flow.md` ("Idioma de la documentación"), que corre siempre antes que cualquier otra cosa: detecta `IDIOMA` a partir del texto disponible del operador en la conversación actual (puede ser solo la frase de invocación, si es un chat nuevo sin más historial), y si es ambiguo, pregunta explícitamente en inglés.
- Todo el contenido redactado por el agente (prosa y headers de sección) va en `IDIOMA`, con excepción de los nombres de archivo del catálogo (siempre en inglés) y términos propios del kit o jerga técnica sin traducción natural asentada (ej. "Handoff", "Backlog", "Placeholder", "linter", "commit", "deploy"), que se mantienen en inglés.
- `IDIOMA` se persiste en `agents/rules.md` (nueva regla fija #3 + campo) la primera vez que se detecta, para que sesiones futuras no lo vuelvan a preguntar. Se actualizó la descripción de `rules.md` en `src/docs/template-architecture.md` en consecuencia.
- Se descartaron las alternativas de mantener plantillas duplicadas por idioma (carpetas `template/es/`+`template/en/`, o archivos `doc.en.md` al estilo Docusaurus): el catálogo ya no se copia literal, el agente redacta el contenido real por proyecto, así que duplicar la estructura por idioma solo agregaba riesgo de desincronización sin beneficio real.
- Por qué: el catálogo estaba escrito enteramente en español, lo que no encaja si el operador (u otro que use el skill) trabaja en otro idioma — la documentación de contexto debe ser legible para quien la usa, no solo para quien construyó la plantilla.

## 2026-09-22 — ✅ Sección "Comandos" en `template/project/setup.md`

- Se investigaron proyectos parecidos (Cline Memory Bank, `agent-markdown-memory-bank-protocol`, la spec de AGENTS.md, y el template `agentic-repository-engineering-template`) para comparar nuestro catálogo de `template/`. Conclusión: la estructura actual (backlog/handoff/changelog separados, puntero `CLAUDE.md`/`AGENTS.md`) es más granular que Cline y más proporcionada que templates tipo SDLC completo — no ameritaba una reestructuración grande.
- Se detectó un hueco real: la spec de AGENTS.md marca explícitamente "build commands with exact flags, test procedures" como contenido esperado de primera línea, y ningún archivo nuestro cubría comandos de build/lint/typecheck (solo `testing.md` cubre tests, y `setup.md` solo cubría "cómo levantar el proyecto").
- Se agregó la sección "Comandos" al inicio de `template/project/setup.md` (dev, build, lint, typecheck), sin crear un archivo nuevo — mantiene la proporción del catálogo actual. Se actualizó la descripción de `setup.md` en `src/docs/template-architecture.md` en consecuencia.
- Por qué: un agente necesita estos comandos durante la tarea, no solo al levantar el proyecto por primera vez — dejarlos implícitos en un `README.md` del proyecto (si existe) obliga a adivinar o buscar.

## 2026-09-22 — ✅ Invocación explícita del skill ("usa agent-context-kit...")

- Se agregó la sección "Cómo usar" al `README.md` raíz: dos frases de invocación explícita — "usa la skill agent-context-kit" (detección automática normal) y "...y migra mi proyecto" (fuerza el chequeo de migración).
- Se enganchó de verdad en `migration-flow.md` (nueva sección "Intención explícita del operador"): la intención explícita reemplaza el umbral de "proporción significativa" de la heurística de nombres — si el operador pide migrar, el flujo se dispara igual aunque haya pocas o ninguna coincidencia automática, y en ese caso se le pregunta a mano qué migrar en vez de asumir que no hay nada.
- Se agregó una mención breve en `SKILL.md` ("Cuándo se dispara") apuntando a esta sección del README, sin duplicar el detalle.
- De paso, se corrigió un link roto en `README.md` que todavía apuntaba a `agent-context-kit-diseno.md` (renombrado hace varios commits a `docs/desing.md`).
- Por qué: sin esto, la frase "migra mi proyecto" hubiera quedado documentada mostrando una funcionalidad que en la práctica no existía en el flujo — la heurística automática podía no alcanzar el umbral y simplemente no dispararse, sin forma de que el operador la forzara.

## 2026-09-22 — ✅ Firma opcional en `handoff.md` para `migration-flow.md`

- Se agregó un comentario HTML de firma (`agent-context-kit:signature`) al inicio de `template/agents/handoff.md`, marcado explícitamente como "ignorar al leer/actualizar, no es contenido".
- Se integró en `migration-flow.md` como señal de alta prioridad: si un archivo candidato a `handoff.md` durante la migración ya tiene esta firma, no se trata como sistema distinto a migrar — se asume que ya es de este skill (aunque la estructura de carpetas no calce exactamente) y se va directo al flujo de proyecto existente.
- Decisión explícita con el operador: **opcional, no obligatoria**. Su ausencia no descarta nada (un `handoff.md` de este skill sin la firma sigue siendo válido, solo se sigue con la heurística de nombre normal) — evita tener que retrofitear archivos ya generados (incluidos los de este mismo repo, que no la tienen).
- Por qué: la heurística de nombre de `migration-flow.md` puede confundir un `handoff.md` ya generado por este skill con uno de un sistema distinto que casualmente usa el mismo nombre; la firma resuelve esa ambigüedad cuando está presente.

## 2026-09-22 — ✅ Flujo de migración desde otro sistema de documentación

- Se creó `src/docs/migration-flow.md`: se dispara cuando `docs/agents/`+`docs/project/` no existen pero el `docs/` del repo destino tiene archivos cuyo nombre matchea el catálogo de este skill (tabla de heurística por patrón de nombre — `backlog`, `handoff`, `stack`, `entities`, etc. — construida sobre la estructura de referencia real de la sección 6 de `docs/desing.md`).
- Decisiones tomadas (con el operador, antes de escribir el flujo):
  - Archivos sin equivalente claro en la skill (ej. `idempotency.md`, `production-watch.md`) van a una carpeta nueva `docs/others/`, sin transformar, tal cual estaban — no se fuerzan a encajar en un template que no les corresponde.
  - El `docs/` viejo se resguarda completo en `docs-legacy/` antes de tocar nada, y **no se borra automáticamente** — queda como respaldo hasta que el operador lo borre a mano.
  - Los archivos que sí mapean se transforman (no solo se renombran) para encajar en la plantilla correspondiente de `template/`, conservando toda la información original.
  - Antes de mover o escribir nada, se muestra al operador la tabla de mapeo propuesta (incluyendo fusiones, ej. `stack-backend.md` + `stack-frontend.md` → `stack.md`) para confirmar.
- Se enganchó el flujo desde `questions-flow.md` (nueva rama en la detección automática, antes del chequeo de `ALCANCE`), `SKILL.md` (punto 1 y sección de enlaces) y `docs/architecture.md` (árbol + descripción). Se agregó la sección condicional "Otros (`others/`)" a `template/README.md` para cuando la migración genera esa carpeta.
- Por qué: el operador tiene otros proyectos con sistemas de documentación propios o parecidos al de este skill; sin este flujo, esa documentación se hubiera perdido o quedado duplicada sin usar en `agent-context/` en vez de reusarse.
- Con esto, `docs/agents/backlog.md` queda vacío — no hay más items pendientes identificados por ahora.

## 2026-09-22 — ✅ Generar GitHub Release de `v0.1.0`

- Se decidió el proceso: manual (`gh release create` al cortar un tag), con notas redactadas a mano resumiendo `docs/agents/changelog.md` — no se automatiza con GitHub Actions por ahora, porque los releases van a ser poco frecuentes y esto es un repo de documentación, no software que se despliegue por CI.
- Se creó el release [`v0.1.0`](https://github.com/Gersom/agent-context-kit/releases/tag/v0.1.0) sobre el tag ya pusheado.
- Por qué: para que un repo destino pueda ver de un vistazo qué cambió entre versiones sin tener que leer `git log`.

## 2026-09-22 — ✅ Versionar el proyecto: `package.json` + SemVer + tags de git

- Se creó `package.json` en la raíz (`name`, `version: 0.1.0`, `description`, `private: true`, `repository`) como número de versión visible dentro del repo.
- Se define el esquema: SemVer, tag de git `vX.Y.Z` como fuente de verdad para que un repo destino se fije a una versión concreta. Criterio de bump — patch: fixes/ajustes de redacción en plantillas existentes; minor: contenido nuevo que no rompe nada (nueva plantilla, nueva rama del árbol de preguntas); major: cambios que rompen algo que un repo destino ya pudiera estar usando (mover/renombrar archivos de `template/` referenciados desde `questions-flow.md`, cambiar la estructura generada en `docs/agents`/`docs/project`).
- Versión inicial `0.1.0` y no `1.0.0`: aunque el catálogo de `template/` y `SKILL.md` ya están completos, el flujo todavía no se probó end-to-end sobre un repo real.
- Por qué: para que un repo destino pueda fijar/actualizar a una versión concreta del skill en vez de seguir `main` a ciegas.
- Queda pendiente como item de backlog aparte: "Generar GitHub Releases" (notas por versión) — esta tarea solo resolvió el esquema de versión + tags, no el proceso de release.

## 2026-09-22 — ✅ Redactar `external/_example-service.md` y `template/README.md` — catálogo de `template/` completo

- Se redactó `external/_example-service.md`: plantilla a duplicar/renombrar por integración, con secciones para qué se usa, cómo se integra, credenciales, límites/costos (con link a `plans/limits.md`/`plans/costs.md` en vez de duplicar), comportamiento ante fallos y documentación oficial.
- Se redactó `template/README.md`: guía de estructura/tono para el `docs/README.md` que el agente genera al final del flujo (no se copia literal), cubriendo todas las secciones posibles (`agents/`, `project/`, `external/`, `plans/`) con nota de qué es condicional.
- Por qué: eran los dos últimos archivos vacíos del catálogo de `template/`. Con esto queda completo: `agents/` (6 archivos), `project/` (8), `external/` (1 plantilla), `plans/` (5) y el `README.md` raíz — todo lo que falta ahora es lógica/proceso (versionado, migración), no contenido de plantillas.

## 2026-09-22 — ✅ Agregar `src/template/plans/tiers.md` (catálogo de planes)

- Se creó `template/plans/tiers.md`: catálogo de planes (nombre, para quién es, qué incluye a alto nivel, modelo de cobro, precio) separado de los números de cuota (`limits.md`) y del detalle de pasarelas (`payments.md`).
- Se recortó la sección "Modelo de facturación" de `payments.md` (quedaba redundante con el nuevo archivo) y se dejó un link a `tiers.md` en su lugar.
- Se actualizaron las referencias cruzadas: `plans/README.md` (índice), `src/docs/template-architecture.md` (árbol + descripción) y `src/docs/questions-flow.md` (lista de archivos que se copian al elegir la carpeta `plans/`).
- Por qué: al responder una pregunta del operador sobre dónde documentar planes tipo Free/Pro/Max, se detectó que no había un lugar único y obvio para el catálogo de planes — quedaba repartido de forma implícita entre `payments.md` y `limits.md`.

## 2026-09-22 — ✅ Redactar `src/template/project/*.md`

- Se redactaron los 8 archivos: `architecture.md`, `stack.md`, `entities.md`, `infrastructure.md`, `decisions.md` (formato ADR), `glossary.md`, `testing.md` y `setup.md`.
- Por qué: era el bloque más grande de plantillas vacías que quedaba. Con esto `template/project/` queda completo — solo faltan `external/_example-service.md` y `template/README.md` para terminar todo el catálogo de `template/`.

## 2026-09-22 — ✅ Redactar `src/template/plans/*.md`

- Se redactaron los 4 archivos: `README.md` (índice de la carpeta), `costs.md` (costos de operar el proyecto, por partida), `limits.md` (cuotas/rate limits/topes por plan) y `payments.md` (modelo de facturación, pasarelas y casos particulares).
- Por qué: con esto `template/plans/` queda completo — solo faltan `template/project/*`, `external/_example-service.md` y `template/README.md` para terminar todo el catálogo de `template/`.

## 2026-09-22 — ✅ Redactar `src/template/agents/roadmap.md`

- Se redactó la plantilla de `roadmap.md`: visión a mediano/largo plazo, con la distinción explícita frente a `backlog.md` (roadmap = iniciativas a nivel de visión, todavía sin desglosar; backlog = tareas ya concretas y accionables) y el criterio de cuándo una iniciativa "gradúa" de una a otra.
- Por qué: era el único archivo de `template/agents/` que seguía vacío — con esto esa carpeta queda completa.
- Se agregó además un nuevo item al backlog: "Flujo de migración desde otro sistema de documentación", para cubrir el caso en que el `docs/` de un repo destino ya tiene documentación de contexto pero con otro formato/convención (hoy solo se contempla "no existe" o "existe y es ajena → se usa `agent-context/`").

## 2026-09-22 — ✅ Redactar `src/SKILL.md`

- Se redactó el punto de entrada del skill: frontmatter (`name`/`description`) + trigger, flujo de alto nivel (detección automática → proyecto existente vs. scaffolding condicionado por alcance) y enlaces a `docs/questions-flow.md`, `docs/template-architecture.md` y `../docs/desing.md`, sin duplicar su contenido.
- Por qué: era el archivo más urgente del backlog — sin él el skill no tenía un punto de entrada real, solo la lógica de decisión (`questions-flow.md`) sin nada que la dispare.
- Se agregó además un nuevo item al backlog: "Versionar el skill y generar releases", para más adelante (una vez que `template/` esté completo).

## 2026-09-22 — ✅ Scaffolding de `docs/agents/` en la raíz del propio repo

- Se crearon `docs/agents/handoff.md`, `backlog.md` y `changelog.md` en la raíz de `agent-context-kit`, siguiendo el formato definido en `src/template/agents/`.
- Por qué: dogfooding — usar el propio skill para documentar el estado del proyecto que lo construye, en vez de depender solo de `docs/desing.md` (que es un registro histórico de diseño, no el estado actual).

## 2026-09-22 — ✅ Flesh out de `template/agents/handoff.md`, `backlog.md`, `changelog.md`

- Se redactó el contenido real (estructura + placeholders + instrucciones de uso) de estas tres plantillas.
- Por qué: eran de los últimos archivos de `agents/` sin contenido; hacían falta para poder usar el set mínimo/intermedio del flujo.

## 2026-09-22 — ✅ Flesh out de `questions-flow.md`, rename `example/` → `template/`, `rules.md`

- Se redactó el árbol de decisión completo (rondas 1 a 4 + ronda final) en `src/questions-flow.md`.
- Se renombró la carpeta `example/` a `template/` para reflejar mejor su rol (plantillas a copiar, no un ejemplo de referencia).
- Se agregó `template/agents/rules.md`.
- Por qué: era el corazón de la lógica del skill; sin esto no había forma de que un agente supiera qué preguntar ni qué copiar.

## 2026-09-21 — ✅ Scaffold de la estructura de archivos del skill bajo `src/`

- Se crearon (vacíos) `src/SKILL.md`, `src/questions-flow.md` y todo el árbol de `src/template/` (agents/, project/, external/, plans/).
- Por qué: fijar la estructura de carpetas acordada en el diseño antes de rellenar contenido.

## 2026-09-21 — ✅ Documentación inicial de diseño + `CLAUDE.md` raíz

- Se agregó `docs/desing.md` (documento de diseño completo) y `CLAUDE.md` en la raíz apuntando a él.
- Por qué: dejar registro de las decisiones tomadas en la conversación de diseño (nombre del proyecto, estructura, lógica de detección `docs/` vs `agent-context/`, flujo de preguntas) para no depender de la memoria de esa conversación.

## 2026-09-21 — ✅ README inicial del repo

- Se agregó `README.md` con la presentación del proyecto y su estructura general.

## 2026-09-21 — ✅ Documento de diseño inicial

- Primer commit del repo: borrador inicial de diseño de `agent-context-kit`.
