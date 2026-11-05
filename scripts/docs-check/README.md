# docs-check

Verifica que la documentación de agentes de **otro** proyecto cumpla lo que necesitan la skill `agent-context-skill`, el seguimiento de tareas (`bun run board`) y el gestor de tareas (`bun run task`), antes de trabajar ahí. Solo lee: no escribe nada en el proyecto revisado y no corrige (la corrección de repos ya adoptados es otra tarea).

Es una herramienta de este repo, no parte de la skill: no se copia a los repos destino.

## Uso

`bun run check` es el subcomando `check` del CLI único de la suite: equivale a `bun run acsuite check`.

Desde la raíz de este repo (con `bun install` hecho):

```sh
bun run check                                     # el proyecto de la carpeta actual
bun run check D:/proyectos/mi-app                 # raíz del proyecto
bun run check D:/proyectos/mi-app/docs/agents     # o su carpeta de agentes
bun run check D:/proyectos/mi-app --operator ana  # modo multi-operador: otro operador
bun run check D:/proyectos/mi-app --json          # informe como un único objeto JSON
bun run check D:/proyectos/mi-app --strict        # los avisos también hacen fallar
```

La ruta es opcional: sin ella se revisa el proyecto de la carpeta desde la que lanzas el comando (se sube hasta la raíz del repo git, o se usa la carpeta misma si no está en uno); si ahí no hay documentación de la skill, el informe lo dice con un error `workspace` y sale con código 1. Acepta la raíz del proyecto, la carpeta de agentes (`docs/agents/` o `agent-context/agents/`) o la carpeta de un operador. Sin `--operator`, el operador sale de `git config user.email` del proyecto revisado.

**Códigos de salida:** `0` sin errores; `1` con errores (con `--strict`, también con avisos); `2` mal uso de la línea de comandos.

## Qué revisa

Cada hallazgo lleva archivo, línea (cuando aplica) y un código. **Error:** el seguimiento o el gestor de tareas no pueden trabajar bien. **Aviso:** los lee, pero con plan B o datos incompletos.

| Código | Severidad | Qué detecta |
|---|---|---|
| `workspace` | error | No se pudo ubicar la carpeta de agentes o el operador (mensaje del gestor de tareas). Aun así se revisan `AGENTS.md` y `CLAUDE.md` si la ruta es una carpeta que existe (aunque no tenga `docs/agents`). |
| `file-missing` | error / aviso | Falta `handoff.md` o `backlog.md` (error); `history.md` o `team-backlog.md` (aviso). |
| `operators-unreadable` | aviso | Líneas de `operators.md` que no se pudieron leer. |
| `root-file` | aviso | Falta `AGENTS.md` o `CLAUDE.md`, o no llevan el bloque de la skill ni mencionan `docs/agents`. |
| `suite-rules` | aviso | `rules.md` sin la sección de agent-context-suite (el bloque entre `<!-- agent-context-suite:start -->` y `<!-- agent-context-suite:end -->`), que enseña al agente a usar la suite. Se agrega con `acsuite init`, al inicio de `rules.md`, después del título. Si no hay `rules.md`, no dice nada. |
| `legacy-marker` | aviso | Marcadores con un prefijo anterior a la skill 2.0.0 (`agent-context-kit:` en anclas, versión y firma; `agent-docs-skill:` en el bloque de `AGENTS.md` y `CLAUDE.md`) en los archivos del operador, `rules.md` o la raíz. Se siguen leyendo; actualízalos a `agent-context-skill:`. |
| `decisions-index` | aviso | La carpeta `project/decisions/` no tiene `README.md`, un tema no figura en su índice (`- [tema.md](./tema.md) — cuándo leerlo`) o una línea del índice enlaza a un archivo que no existe. |
| `decisions-legacy` | aviso | `project/decisions.md` o `project/stack.md` sueltos: formato anterior a la skill 2.0.0, hay que moverlos a `project/decisions/`. |
| `anchor-missing` | error | Falta una sección esperada (`in-progress`, `paused`, `free`, `blocked`, `grouped`). |
| `anchor-fallback` | aviso | La sección no tiene ancla y se ubicó por orden (plan B). |
| `anchor-duplicate` | aviso | Una misma ancla repetida (el parseo descarta el segundo en silencio). |
| `anchor-position` | aviso | El ancla no está justo antes de un header `## `. |
| `placeholder` | aviso | Placeholders sin completar (ignora comentarios HTML y bloques de código). |
| `next-number` | error | Falta «Próximo número de tarea» o no es mayor que la tarea más alta conocida. |
| `task-duplicate` | error | Un número de tarea repetido entre tareas vivas, o una viva que repite una cerrada en `history.md`. |
| `task-heading` | aviso | Header que parece de tarea (`### Tarea N — título`) pero no se reconoce. |
| `task-fields` | aviso | Tarea sin ningún campo `- **Etiqueta:** valor`. |
| `block-tag` | aviso | Bloqueada sin tag vigente, o libre con uno. |
| `current-task-line` | aviso | «Tarea en progreso» con contenido pero sin la línea `Tarea N — título`. |
| `current-no-plan` | aviso | Tarea en curso sin ningún checkbox de plan. |
| `current-subsection` | aviso | Una subsección de «Tarea en progreso» con un título que `close` y `pause` no reconocen (por ejemplo `### Notas`): solo admiten Plan, «Qué falta», «Decisiones a medio camino» y «Próximo paso concreto». Una por subsección, con su número de línea. |
| `current-plan-line` | aviso | Una línea del plan de la tarea en curso que no es un paso (`- [ ] Paso N — texto`) ni la línea de modo (`**Modo de ejecución acordado:** <texto>`): `close` y `pause` la rechazarían. Una por línea, con su número de línea. |
| `current-mode` | aviso | La línea de modo de ejecución de la tarea en curso (`**Modo de ejecución acordado:** <valor>`) trae un valor que no es `guided`, `step-by-step`, `auto` ni `extreme` (texto libre de antes): se fija con `acsuite task mode <valor>`. Sin línea de modo no avisa. Con varias líneas de modo vale la última; `acsuite task mode` borra las anteriores. |
| `group-too-small` | error | Grupo con menos de 2 tareas (se desarma con `group-eject`). |
| `group-missing-container` | error | Referencia en «Tareas libres» sin su contenedor en «Tareas agrupadas». |
| `group-missing-reference` | error | Contenedor en «Tareas agrupadas» sin su referencia en «Tareas libres». |
| `group-numbers-mismatch` | error | Los números de la referencia no coinciden con las tareas del contenedor. |
| `group-title-mismatch` | error | La referencia y el contenedor del grupo tienen títulos distintos. |
| `group-no-summary` | aviso | Referencia de grupo sin línea de Resumen. |
| `group-header-comment` | aviso | Header de la referencia o del contenedor con un comentario HTML: los comandos `group-*` no pueden editarlo y hay que quitar el comentario a mano. |
| `history-entry` | aviso | Header `## ` de `history.md` que no es una entrada reconocible (sin ✅ / ❌). |

Las normas salen de la documentación de arquitectura de las plantillas y de las plantillas de agentes de la skill (repo agent-context-skill); ante una diferencia gana la plantilla. Los tests usan una copia congelada de esas plantillas en `test/fixtures/template/`.

## Estructura

```
scripts/docs-check/
├── index.ts          # Arranque: llama a run()
├── src/
│   ├── args.ts         # Argumentos y ayuda
│   ├── run.ts          # Resuelve el proyecto, corre los checks y escribe el informe
│   ├── context.ts      # Lee y parsea los archivos (lector inyectable) en un CheckContext
│   ├── lines.ts        # Recorre líneas ignorando comentarios HTML y bloques de código
│   ├── report.ts       # Informe de texto y JSON
│   ├── types.ts        # Finding, CheckContext
│   └── checks/         # Un archivo por familia: files, suite-rules, legacy-marker, decisions, anchors, placeholders, tasks, groups, handoff, history
└── test/             # Espejo de src/ + e2e/ con proyectos reales en un directorio temporal
```

Reutiliza `resolveWorkspace` del task-manager (carpeta de agentes y operador) y el parser de [`scripts/_shared/`](../_shared). Tests: `bun test scripts/docs-check`; tipos: `bun run typecheck`.
