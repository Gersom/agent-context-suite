[English](./README.md) | Español

# agent-context-suite

Suite de herramientas para trabajar con la skill [agent-context-skill](https://github.com/Gersom/agent-context-skill), que genera documentación de contexto de proyecto para que **cualquier agente de IA** (Claude Code, Cursor, Copilot, etc.) entienda en qué momento está un proyecto, qué falta, qué se hizo y por qué — sin depender de la memoria de una sola conversación. La skill vive en su propio repo (`agent-context-skill`); este repo tiene las herramientas (seguimiento, gestión y verificación de tareas).

## Instalar la suite

### Requisitos

- Node 20 o superior, o Bun.
- Haber iniciado la skill [agent-context-skill](https://github.com/Gersom/agent-context-skill) en el proyecto en el que ejecutas la suite.

### Recomendado: instalarla de forma global

Se instala una vez y desde entonces existe el comando `acsuite` en cualquier carpeta:

```sh
bun add -g agent-context-suite@latest
```

O con npm:

```sh
npm install -g agent-context-suite@latest
```

Para actualizarla, ejecuta el mismo comando.

> **Instálala desde npm, no desde GitHub.** No uses `bun install -g github:Gersom/agent-context-suite`: el repo no incluye `dist/`, así que no se crea el comando `acsuite`. Usa siempre el paquete de [npm](https://www.npmjs.com/package/agent-context-suite). Si ya la instalaste desde GitHub con Bun, limpia esa copia con `bun pm cache rm` y vuelve a instalar desde npm.

### Alternativa: usarla sin instalar nada

Con `npx` o `bunx` se descarga, se ejecuta y termina, sin dejar instalado el comando `acsuite`, así que cada vez se escribe completo:

```sh
npx agent-context-suite@latest board
```

```sh
bunx agent-context-suite@latest board
```

`@latest` trae siempre la versión más reciente. Sin ruta, usa el proyecto de la carpeta donde lo ejecutas; si quieres otro, pásale su ruta al final (`npx agent-context-suite@latest board D:/otro-proyecto`).

**Nombres.** El *paquete* (lo que escribes con `npm install`, `npx` o `bunx`) es `agent-context-suite`; el *comando* (una vez instalada) es `acsuite`.

**Compatibilidad.** Probada en Windows 11 con Node 20, 22 y 24, y con Bun. En Linux y macOS debería funcionar igual (es Node estándar), pero no está comprobado: si encuentras algún problema, abre un [Issue](https://github.com/Gersom/agent-context-suite/issues).

## Herramientas

La suite trae cuatro herramientas, que trabajan sobre un proyecto que use la skill. Se usan con el comando `acsuite` (si no la instalaste, antepón `npx agent-context-suite@latest` al subcomando). Sin ruta, usan el proyecto de la carpeta donde ejecutas el comando, subiendo hasta la raíz de su repo git; `board` y `check` aceptan una ruta para revisar otro proyecto (`acsuite check D:/otro-proyecto`).

`acsuite` sin argumentos lista los subcomandos, y `acsuite <subcomando> --help` muestra la ayuda de cada uno.

### `acsuite board`

Tablero de tareas en vivo en la terminal: la tarea en progreso, las pausadas, las pendientes y las últimas completadas. Se redibuja solo cuando cambian los archivos, así que conviene dejarlo en una terminal aparte mientras un agente trabaja.

```sh
acsuite board
```

Uso, atajos y cómo lee los archivos: [README de `board`](./scripts/task-tracker/README.md). El board recuerda el modo compacto, las flechas y el modo observador entre ejecuciones (`settings.json` en `~/.acsuite`), con las teclas `c`, `f` y `o`.

<!-- ![acsuite board](docs/board.gif) -->

#### Seguir el proyecto activo de Claude

Si trabajas con varias sesiones de Claude Code a la vez, el board puede cambiar solo al proyecto que marques desde Claude. Pulsa `o` con el board abierto para activar el modo observador (se recuerda para la próxima vez):

```sh
acsuite board
```

Se marca desde Claude con el mod `acsuite-active-project`, con su botón `[ ● Mark this project as active ]` o con `/board`. Se instala con una línea, `/plugin install acsuite-active-project --marketplace Gersom/agent-context-suite`; los demás pasos y el detalle están en el [README del mod](./mods/acsuite-active-project/README.md), y el modo observador del board, en su [README](./scripts/task-tracker/README.md#modo-observador).

### `acsuite task`

Consulta y edita las tareas sin tocar a mano `handoff.md`, `backlog.md` ni `history.md`. Las escrituras exigen `--apply`; sin él solo muestra el diff.

```sh
acsuite task status
```

```sh
acsuite task <comando> --help
```

Comandos, flags y cómo escribe: [README de `task`](./scripts/task-manager/README.md).

### `acsuite check`

Verificador de solo lectura: revisa que la documentación de agentes del proyecto sirva a la skill, al tablero y a la gestión de tareas, y lista errores y avisos con archivo y línea.

```sh
acsuite check
```

Uso y códigos de hallazgo: [README de `check`](./scripts/docs-check/README.md).

### `acsuite init`

Agrega a `rules.md` del proyecto la sección que enseña al agente a usar la suite: que no edite a mano `handoff.md`, `backlog.md` ni `history.md`, y que use `acsuite task`, `acsuite check` y `acsuite board`. La pone al inicio de `rules.md`, después del título, y solo toca esa sección, entre sus marcas; no cambia las reglas fijas. Sin `--apply` muestra el diff y no escribe nada; si la sección ya está al día, no hace nada. En un proyecto con varios operadores, `rules.md` es de todos, así que el cambio se aplica a todo el proyecto. Si no la agregas, `acsuite check` lo avisa.

```sh
acsuite init
```

```sh
acsuite init --apply
```

## Licencia

[MIT](./LICENSE). La skill, que vive en su propio repo, tiene la misma licencia.

## Apoyar el proyecto

Si la suite o la skill te sirven y quieres apoyar su desarrollo, puedes hacer una donación por PayPal: [paypal.me/gersomalaja](https://paypal.me/gersomalaja).

## Colaborar

Si deseas colaborar con el proyecto, consulta la [guía de colaboración](https://github.com/Gersom/agent-context-suite/blob/main/CONTRIBUTING.md).
