# Arquitectura del proyecto

Este documento describe la estructura general del repo `agent-context-suite` y para qué sirve cada parte.

## Estructura

```
agent-context-suite/
├── README.md              # Presentación del proyecto
├── CLAUDE.md               # Puntero para agentes: remite a AGENTS.md
├── AGENTS.md               # Orden de lectura de la documentación de contexto (docs/README.md, rules, operators, handoff)
├── LICENSE                 # Licencia MIT (la skill tiene la misma, en su propio repo)
├── package.json            # Versión de la suite (SemVer), licencia + scripts (acsuite, board, task, check, build, test, typecheck) y devDependencies de scripts/
├── tsconfig.json           # TypeScript (strict) para scripts/; `bun run typecheck` = tsc --noEmit
├── bunfig.toml             # Config de `bun test`: deja `mods/` fuera (las pruebas de los mods las corre `claude plugin test`)
├── .claude-plugin/
│   └── marketplace.json    # Marketplace de plugins de Claude Code de este repo: lista los mods de `mods/`
│
├── scripts/                # Herramientas propias del repo (TypeScript con Bun); no forman parte de la skill
│   ├── acsuite/                 # CLI único (`bun run acsuite <board|task|check|init>`): despacha cada subcomando a su herramienta
│   │   ├── index.ts             # Arranque: pasa los argumentos al despachador y fija el código de salida
│   │   ├── build.ts             # Compila el CLI a `dist/cli.js` para Node, con las dependencias dentro (`bun run build`; `dist/` se ignora en git)
│   │   ├── dispatch.ts          # Despachador: registro de subcomandos, ayuda, error de uso (2) ante uno desconocido
│   │   ├── init.ts              # `acsuite init`: agrega a `rules.md` el bloque que enseña al agente a usar la suite, al inicio y tras el título (diff sin `--apply`)
│   │   └── test/                # Tests del despachador y de `init`
│   ├── _shared/               # Código compartido entre scripts (el `_` marca que no es un script: las carpetas sin `_` sí lo son)
│   │   ├── markers.ts           # Prefijo `agent-context-skill:` de los marcadores de la skill, los prefijos anteriores que se siguen leyendo y el regex del marcador de versión
│   │   ├── rules-block.ts       # El bloque de la suite en `rules.md` (marcas, texto, `hasSuiteBlock`, `upsertSuiteBlock`; se inserta tras el título, antes del primer `##`): código puro, sin E/S
│   │   ├── types.ts             # Tipos del dominio: tarea, campo, sección, entrada de historial, handoff/backlog interpretados
│   │   ├── parse/               # Markdown → datos: secciones por ancla, bloques, handoff, backlog, history, operators, team-backlog
│   │   ├── tasks/               # Tag de bloqueo vigente (block-info), etiquetas de una tarea (labels) y tareas mencionadas en un texto (task-refs)
│   │   └── test/                # Tests en espejo de parse/ y tasks/ + fixtures/ (docs de ejemplo) + helpers.ts
│   ├── docs-check/            # Verificador de otro repo (`bun run check <ruta>`): comprueba que su documentación de agentes sirva a la skill, al tracker y al task-manager
│   │   ├── README.md            # Uso, códigos de hallazgo y estructura
│   │   ├── index.ts             # Arranque: llama a run()
│   │   ├── src/                 # args, run, context, lines, report, types y checks/ (files, anchors, placeholders, tasks, handoff, history, suite-rules, legacy-marker, decisions)
│   │   └── test/                # Tests en espejo de src/ + e2e/ con proyectos en un directorio temporal
│   ├── skill-checks/          # Tests de contenido de la skill clonada en `skill/` o `agent-context-skill/` (`reading-policy`, `multi-operator`, `snapshot`, `version`, `changelog`): fijan la política de lectura, la estructura de lo que se lee en cada sesión y que la versión de la skill coincida en `plugin.json`, `SKILL.md` y la plantilla de `rules.md`; se saltan si la skill no está
│   ├── task-manager/          # Gestión de tareas desde la terminal (`bun run task <comando>`): edita handoff/backlog/history/team-backlog de forma quirúrgica
│   │   ├── README.md            # Uso: comandos, flags, `--apply` y qué escribe cada uno
│   │   ├── index.ts             # Arranque: llama al despachador de comandos
│   │   ├── src/                 # cli/ (args, despachador, ayuda), workspace/ (operador, carpeta, lectura), query/ (estado y búsqueda), edit/ (edición por rangos), write/ (lógica de escritura), commands/ (un archivo por comando)
│   │   └── test/                # Tests de `bun test` en espejo de src/
│   └── task-tracker/          # Seguimiento de tareas en la terminal (`bun run board [ruta]`)
│       ├── README.md            # Uso: comandos, atajos, qué muestra y cómo lee los archivos
│       ├── index.ts             # Arranque: llama a `main` de `src/main.ts` (argumentos, ruta a vigilar o su pregunta, y app)
│       ├── src/
│       │   ├── app.ts             # Ciclo leer → modelo → pintar; watcher, resize, atajos (q, r, Ctrl+C) y modo observador (activar, desactivar y abrir el proyecto marcado)
│       │   ├── cli/               # Argumentos (--once, ruta, operador), pregunta interactiva de la ruta, teclas (incl. flechas) y navegación de la vista de equipo (estado puro), teclas de la lista de proyectos (`projects-keys.ts`: reductor puro que devuelve los efectos que `app.ts` ejecuta), modo observador (`observer.ts`: cuándo abrir lo marcado, qué teclas se ignoran y el aviso si no se puede abrir; puro, sin E/S)
│       │   ├── io/                # Rutas, operador (modo multi: operators.md + correo de git), lectura del equipo, lectura de archivos, watcher y lectura con memoria, proyecto activo (`active-project.ts`: lee y borra el `active-project.json` que escribe el mod de Claude), ajustes del board (`settings.ts`: compacto, flechas y observador en `settings.json`)
│       │   ├── model/             # Modelo de pantalla: arma lo que se pinta con lo que interpretó el parseo (un operador, o el equipo y el team-backlog)
│       │   ├── ui/                # Pintado con picocolors (recuadros por tipo de tarea; selector EQUIPO y SIN DUEÑO en modo multi), utilidades de formato y `project-columns.ts` (anchos de la lista de proyectos y si se dibuja como tabla o como tarjetas según el ancho)
│       │   └── shared/            # Tipos de pantalla y de lectura de archivos (types.ts) y formato de hora (time.ts)
│       └── test/                # Tests de `bun test` en espejo de src/ + e2e/ (script entero)
│
├── mods/                   # Mods de Claude Code que acompañan a la suite (plugins; no forman parte de la skill ni del paquete que se publica)
│   └── acsuite-active-project/  # Marca el proyecto de la sesión de Claude para el modo observador de `acsuite board`
│       ├── README.md            # Qué hace, cómo instalarlo y cómo probarlo
│       ├── tsconfig.json        # TypeScript del mod
│       ├── .claude-plugin/
│       │   └── plugin.json      # Manifiesto del plugin (nombre, versión)
│       └── hooks/
│           ├── hooks.json       # Módulos que carga Claude Code (`register.tsx`)
│           ├── register.tsx     # Botón `[ ● Mark this project as active ]` sobre el prompt y comando `/board`: escriben `active-project.json`
│           └── register.test.ts # Pruebas del mod (las corre `claude plugin test`, no `bun test`)
│
├── docs/
│   ├── README.md            # Mapa de docs/: qué es el proyecto y qué hay en cada archivo (lo primero que lee el agente)
│   ├── architecture.md      # Este archivo
│   ├── philosophy.md        # Principios de diseño: por qué la suite es lo que es
│   ├── releasing.md         # Versionado y releases: cuándo subir patch, minor o major
│   └── agents/               # Dogfooding: este repo usa la skill sobre sí mismo, en modo multi-operador
│       ├── rules.md            # Reglas de este repo, de todos los operadores
│       ├── operators.md        # Operadores y sus correos de git
│       ├── team-backlog.md     # Tareas sin dueño, sin numeración
│       └── gersom/             # Carpeta de un operador
│           ├── handoff.md        # Estado "en caliente" de su trabajo
│           ├── backlog.md        # Sus tareas pendientes (libres / bloqueadas-pospuestas)
│           └── history.md        # Sus tareas resueltas (hechas ✅ / descartadas ❌)
│
└── skill/                  # NO es parte de este repo: clon de Gersom/agent-context-skill (también puede llamarse agent-context-skill/), ignorado por git (.gitignore)
    ├── SKILL.md              # Trigger + instrucciones de alto nivel de la skill
    ├── docs/                 # Flujos (questions-flow, migration-flow, multi-operator) y template-architecture.md
    └── template/             # Catálogo maestro de plantillas que la skill copia al repo destino: agents/, project/, external/, plans/ y multi/ (solo modo multi-operador)
```

## Qué es cada parte

- **`docs/philosophy.md`** — la razón de ser de la suite y sus principios de diseño.
- **`docs/releasing.md`** — cómo se versionan la suite y la skill y cuándo sube cada número; se lee al publicar.
- **`docs/agents/`** — dogfooding: este repo usa la skill sobre sí mismo en modo multi-operador (`rules.md`, `operators.md` y `team-backlog.md` son compartidos; cada operador tiene su carpeta con `handoff.md`, `backlog.md` e `history.md`, con la estructura que la skill genera en un repo destino).
- **`skill/` o `agent-context-skill/`** — la skill, que vive en su propio repo ([Gersom/agent-context-skill](https://github.com/Gersom/agent-context-skill)) con su propia versión y tags; acá solo se clona (ignorada por git) para que los tests de `scripts/skill-checks/` la lean. `SKILL.md` es el punto de entrada (resuelve el caso "ya existe documentación"), `docs/` tiene los flujos (`questions-flow.md`, `migration-flow.md`, y `multi-operator.md` para el modo de varias personas, que solo se abre si se activa) y qué es cada plantilla (`template-architecture.md`), y `template/` es el catálogo de plantillas. Cómo clonarla: [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- **`scripts/acsuite/`** — el CLI único de la suite: `acsuite <subcomando>` (`board`, `task`, `check`, `init`) despacha al task-tracker, al task-manager o a docs-check pasándoles el resto de los argumentos, o ejecuta `init` (`init.ts`); sin subcomando o con uno desconocido sale con código 2. `acsuite init` agrega a `rules.md` (el compartido de la carpeta de agentes, sin necesitar operador) un bloque delimitado por marcas que enseña al agente a usar la suite: sin `--apply` muestra el diff, solo toca ese bloque y es idempotente; reutiliza la escritura del task-manager (`planChanges` y `commitChanges`). Los scripts de `package.json` (`board`, `task`, `check`) apuntan a él.
- **`scripts/_shared/`** — código compartido entre los scripts: parseo de `handoff.md`, `backlog.md`, `history.md`, `operators.md` y `team-backlog.md` (`parse/`), tag de bloqueo, etiquetas de una tarea y referencias entre tareas (`tasks/`), el prefijo de los marcadores (`markers.ts`: el vigente y los anteriores a la skill 2.0.0, que se leen pero no se escriben), el bloque de la suite en `rules.md` (`rules-block.ts`), tipos del dominio y fixtures. Lo usan el task-tracker, el task-manager, docs-check y `acsuite init`.
- **`scripts/docs-check/`** — herramienta de este repo (no de la skill, no se copia a los repos destino) que se corre contra otro proyecto (`bun run check <ruta>`) y reporta, con archivo y línea, si su documentación de agentes cumple lo que necesitan la skill, el task-tracker y el task-manager (anclas, tareas, números, bloqueos, placeholders) y avisa si `rules.md` no lleva la sección de la suite que escribe `acsuite init` (`suite-rules`); solo lee, y sale con código distinto de 0 si hay errores. Reutiliza `resolveWorkspace` del task-manager y el parser de `_shared/`. Uso y códigos: [`scripts/docs-check/README.md`](../scripts/docs-check/README.md).
- **`scripts/task-tracker/`** — herramienta de este repo (no de la skill, no se copia a los repos destino) que muestra en la terminal el estado de las tareas de un proyecto y se redibuja sola; se lanza con `bun run board [ruta]`. La lista de proyectos que abre sin repo la guarda en `projects.json` (`{ "version": 1, "projects": [<raíz del repo>, ...] }`, en orden de alta y sin duplicados) dentro de `~/.acsuite/` o, si está definida, de la carpeta `ACSUITE_HOME`: se agregan los repos abiertos de frente (salvo con `--once`) y los de la tecla `a`, y la tecla `x` quita de la lista (y de `projects.json`) el proyecto elegido, tras confirmar con Enter; no borra nada del repo. Las opciones compacto, flechas y modo observador (teclas `c`, `f`, `o`) se recuerdan en `settings.json` de esa misma carpeta (`{ "version": 1, "board": { "compact", "arrows", "follow" } }`, solo la clave `board`). Con el modo observador (tecla `o`) el board borra `active-project.json` de esa misma carpeta de config, espera a que el mod `acsuite-active-project` guarde uno nuevo (`{ "path", "at" }`) y abre el repo marcado, agregándolo a la lista de proyectos. Uso, formatos y estructura interna: [`scripts/task-tracker/README.md`](../scripts/task-tracker/README.md).
- **`scripts/task-manager/`** — herramienta de este repo (no de la skill, no se copia a los repos destino y opcional: sin ella los archivos se editan a mano) que gestiona las tareas por comandos (`status`, `next`, `show`, `add`, `edit`, `start`, `step`, `pause`, `resume`, `block`, `unblock`, `close`) editando de forma quirúrgica `handoff.md`, `backlog.md`, `history.md` y `team-backlog.md`; las escrituras exigen `--apply`. Se lanza con `bun run task <comando>`. Comandos, flags y estructura interna: [`scripts/task-manager/README.md`](../scripts/task-manager/README.md).
- **`mods/`** — mods de Claude Code que acompañan a la suite; cada uno es un plugin en su carpeta y no forma parte de la skill ni del paquete que se publica (`package.json` solo incluye `dist`). Hoy hay uno, `acsuite-active-project`: guarda en `active-project.json` (`ACSUITE_HOME` o `~/.acsuite`) el proyecto de la sesión, con un botón `[ ● Mark this project as active ]` o el comando `/board`, para el modo observador del board. Instalación y uso: [`mods/acsuite-active-project/README.md`](../mods/acsuite-active-project/README.md).
- **`.claude-plugin/marketplace.json`** — el marketplace de Claude Code de este repo (`Gersom/agent-context-suite`): apunta a cada mod de `mods/`, y de ahí se instalan con `/plugin install`.
- **`bunfig.toml`** — deja `mods/` fuera de `bun test`: sus pruebas importan `claude-code/testing` y las corre `claude plugin test` desde la carpeta del mod, no `bun test`.
