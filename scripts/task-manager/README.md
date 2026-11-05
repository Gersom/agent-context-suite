# task-manager

Gestiona las tareas de un proyecto que usa la skill `agent-context-skill` editando de forma **quirúrgica** sus archivos (`handoff.md`, `backlog.md`, `history.md` y, en modo multi-operador, `team-backlog.md`), en lugar de que un agente o una persona los edite a mano. Los comandos de negocio se van sumando por etapas; hoy están la infraestructura, dos comandos de diagnóstico, los de lectura (`status`, `next`, `show`) y los de escritura que llevan una tarea por todo su ciclo de vida (`add`, `edit`, `start`, `step`, `mode`, `pause`, `resume`, `block`, `unblock` y `close`, que la cierra con las Reglas 6 a 9 de `rules.md`) y los de grupos de tareas del backlog (`group-create`, `group-eject`, `group-add`, `group-edit` y `group-dissolve`).

Es **opcional** y es una herramienta de este repo, no parte de la skill: no se copia a los repos destino (principio 4 de [`docs/philosophy.md`](../../docs/philosophy.md)). Sin ella, los archivos se editan a mano igual.

## Requisitos

- [Bun](https://bun.sh) (el script está en TypeScript; Bun lo ejecuta sin compilar).
- Instalar las dependencias una vez, desde la raíz de este repo: `bun install`.

## Uso

`bun run task` es el subcomando `task` del CLI único de la suite: equivale a `bun run acsuite task`.

Desde la raíz de este repo:

```sh
bun run task                          # lista los comandos
bun run task <comando> --help         # ayuda de un comando
bun run task whoami                   # operador, carpeta y archivos resueltos
bun run task anchors                  # verifica las anclas de sección de cada archivo
bun run task status                   # foto compacta: en curso, pausadas, libres, bloqueadas, últimas cerradas
bun run task next                     # qué hacer ahora
bun run task show 24                  # el bloque completo de la Tarea 24, viva donde esté
bun run task status --json            # lo mismo, estructurado, para otros scripts
bun run task add --title "..." --description "..."          # muestra el diff; NO escribe
bun run task add --title "..." --description "..." --apply  # ahora sí escribe
bun run task start 24 --plan - --apply < pasos.txt           # empieza la Tarea 24
bun run task step 2 --apply                                  # marca el paso 2 y actualiza «Qué falta» / «Próximo paso»
bun run task pause --reason "..." --waiting-for "..." --apply     # pausa la tarea en curso
bun run task resume 24 --apply                               # la retoma
bun run task block 7 --tag dependency --reason "depende de la Tarea 3" --apply
bun run task unblock --apply                                 # desbloquea las que dependían de tareas ya cerradas
bun run task close --done --summary "Qué se hizo y por qué" --apply   # cierra la tarea en curso
bun run task close --discarded --reason "Por qué se descarta" --apply
bun run task group-create --tasks 12,23 --title "..." --summary "..." --apply   # forma un grupo con las libres 12 y 23
bun run task group-eject 12 --apply                          # saca la Tarea 12 de su grupo para poder trabajarla
bun run task <comando> --dry-run      # muestra el diff sin escribir nada (también con --apply)
bun run task <comando> --agents D:/proyectos/mi-app --operator ana
```

**Comandos de hoy** (los marcados con `*` escriben, y solo con `--apply`; los demás son de solo lectura):

| Comando | Qué hace |
|---|---|
| `whoami` | Muestra el modo (multi o plano), el operador y cómo se resolvió, si la carpeta es la propia, y qué archivos existen. |
| `anchors` | Comprueba que cada archivo tenga sus anclas de sección (`in-progress` y `paused` en `handoff.md`; `free`, `blocked` y `grouped` en `backlog.md`; `free` y `blocked` en `team-backlog.md`). `history.md` no usa anclas. Sale con código 1 si falta alguna. |
| `status` | Foto compacta del operador: tarea en curso, pausadas, libres, bloqueadas, últimas 3 cerradas, team-backlog. |
| `next` | Qué hacer ahora: el siguiente paso de la tarea en curso o, sin ella, lo que se puede tomar. |
| `show <N>` | El bloque completo de una tarea y de dónde salió. |
| `add` `*` | Agrega una tarea a tu `backlog.md` (con el siguiente número) o, con `--team`, al `team-backlog.md`. |
| `start <N>` `*` | Empieza una tarea: la saca del backlog y arma «Tarea en progreso» en el `handoff.md`. Con `--team "<título>"`, la toma del `team-backlog.md`. |
| `step <N \| texto>...` `*` | Marca (o con `--undo` desmarca) pasos del plan de la tarea en curso y pone al día «Qué falta» y «Próximo paso concreto». |
| `mode <guided\|step-by-step\|auto\|extreme>` `*` | Registra el modo de ejecución acordado del plan de la tarea en curso. |
| `pause` `*` | Pasa la tarea en curso a «Tareas pausadas» y deja «Sin tarea en curso». |
| `resume <N>` `*` | Inverso de `pause`: la pausada vuelve a «Tarea en progreso». |
| `block <N>` `*` | Bloquea una tarea libre del backlog (`Bloqueos` + la mueve a «bloqueadas / pospuestas»). |
| `unblock [<N>]` `*` | Desbloquea una tarea (`N`) o, sin número, las que bloqueaba una tarea ya cerrada. |
| `close [<N>]` `*` | Cierra la tarea en curso (o la pausada `N`) como hecha (`--done`) o descartada (`--discarded`; una libre o bloqueada sin empezar solo se descarta): entrada en `history.md`, «Sin tarea en curso», bloqueadas y reporte de cierre. |
| `group-create` `*` | Forma un grupo con tareas libres: las saca de «Tareas libres», deja allí la referencia del grupo y las pone en «Tareas agrupadas». |
| `group-eject <N>` `*` | Saca una tarea agrupada de su grupo y la deja en «Tareas libres»; si el grupo queda con menos de 2 tareas, se desarma. |
| `group-add <N> <M>...` `*` | Suma tareas libres a un grupo ya formado (`N` es cualquier tarea del grupo). |
| `group-edit <N>` `*` | Cambia el título y/o el resumen del grupo de la tarea `N`. |
| `group-dissolve <N>` `*` | Deshace el grupo de la tarea `N`: todas sus tareas vuelven a «Tareas libres». |

**Flags globales** (valen para todos los comandos, antes o después de su nombre):

- `--agents <ruta>`: raíz del proyecto, carpeta de agentes (`docs/agents/` o `agent-context/agents/`) o carpeta de un operador. Sin él, el repo git que contiene la carpeta desde la que lanzaste el comando. Las rutas relativas se resuelven desde esa carpeta y se pueden pegar con comillas.
- `--operator <carpeta>`: operador a usar (modo multi-operador). Sin él, el de `git config user.email`.
- `--apply`: aplica los cambios. **Un comando que escribe no escribe nada sin `--apply`**: solo muestra el diff y avisa («No se escribió nada; repite con --apply»). Los comandos de lectura no lo necesitan.
- `--dry-run`: muestra el diff de lo que se escribiría y no escribe nada. Gana sobre `--apply`: con los dos, no escribe.
- `-h`, `--help`: ayuda general o del comando.

**Texto largo por stdin:** un flag de texto que lo admita acepta `-` como valor y lee su contenido de la entrada estándar (se normaliza a LF y se quita el salto de línea final):

```sh
bun run task <comando> --details - <<'EOF'
Varias líneas
de texto.
EOF
```

**Flags repetibles:** algunos flags de texto se pueden repetir (`close --new "A" --new "B"`); la ayuda del comando los marca «(repetible)». Esos no leen stdin.

**Códigos de salida:** `0` bien; `1` error (operador o archivo que no se pudo resolver, edición inválida, ...), con el mensaje en español en la salida de error; `2` mal uso de la línea de comandos (comando o flag desconocido, falta un valor).

## Comandos de lectura

Pensados para un agente que quiere ahorrar tokens: en vez de leer `history.md` entero o todo el backlog, pide lo que necesita. Ninguno escribe, y de `history.md` solo imprimen la cabecera de las entradas (`status`) o la entrada pedida (`show`), nunca el archivo entero. Todos aceptan los flags globales (`--agents`, `--operator`) y, salvo `whoami` y `anchors`, `--json`. Las secciones vacías no se imprimen.

### `status`

Foto del estado del operador resuelto, en este orden:

- **En curso:** `Tarea N — título` con su archivo y línea, el avance del plan (`Plan 2/8 — siguiente: <primer paso pendiente>`) y el **próximo paso concreto**, con el título de su subsección. Como los títulos de subsección están traducidos, ese paso se elige por **posición**: es la última subsección de detalle de «Tarea en progreso» (sin la del plan —la que tiene checkboxes— y sin placeholders). Sin tarea: `En curso: Sin tarea en curso` (es la única línea que no se oculta).
- **Pausadas**, **Libres** (en el orden del archivo; las de un grupo, con `[grupo: …]`) y **Bloqueadas** con su tag (`[dependencia]`/`[postergada]`) y las tareas que menciona el motivo con su estado (`Tarea 3 (libre)`, `Tarea 11 (cerrada)`...). Una bloqueada cuyas tareas mencionadas están **todas cerradas en history.md**, o que ya no tiene bloqueo vigente, se marca `⇒ candidata a desbloquear (Regla 8)`.
- **Próximo número de tarea** de `backlog.md`: se busca por forma (un campo en negrita con solo un número en la introducción del archivo), no por el texto de su etiqueta.
- **Últimas cerradas:** las 3 primeras entradas de `history.md` (fecha, ✅/❌, número y título).
- **Team-backlog:** conteo y títulos de libres y bloqueadas (solo modo multi y si existe el archivo).
- **Avisos:** archivos sin anclas o sin una sección, número de tarea bajo o repetido, tarea cerrada en history que sigue en el backlog, bloqueada sin bloqueo vigente, y que la carpeta es de otro operador (solo lectura).

### `next`

El mínimo para decidir qué hacer; no elige por el operador.

- **Con tarea en curso:** su primer paso pendiente y el próximo paso concreto (o «Plan completo: falta cerrar la tarea»).
- **Sin tarea en curso:** las pausadas (retomables), las libres en el orden del archivo, las libres del team-backlog y las bloqueadas candidatas a desbloquear, más una sugerencia. Cada libre muestra su `Disparador` si es corto (hasta 100 caracteres) y no se repite igual en otra tarea: un disparador repetido es el genérico de la plantilla y no ayuda a elegir. El campo se reconoce por su etiqueta `Disparador` o `Trigger` (las etiquetas están traducidas).

### `show <N>`

Imprime el bloque **completo** de la tarea, viva donde esté, con una cabecera `--- Tarea N · <lugar> · <archivo> líneas A-B ---`. Solo lee ese fragmento (el rango que da el parser, sin las líneas en blanco de los extremos):

| Lugar | Qué imprime |
|---|---|
| `en curso (handoff)` | La sección «Tarea en progreso»: la línea de la tarea, la descripción, el plan y las subsecciones. |
| `pausada (handoff)`, `libre`, `bloqueada` | Su bloque `### Tarea N — título` con sus campos. |
| `agrupada (backlog)` | Su bloque `####` (el grupo se indica en la cabecera). |
| `history` | Su entrada `## fecha — ✅/❌ Tarea N — título` (con «hecha» o «descartada»). |

Variantes del argumento:

- `T-N` o `N`: una tarea propia. `T-N@operador` (o `N@operador`): la de otro operador, resolviendo su carpeta por `operators.md`; es solo lectura (las carpetas ajenas no se editan) y no lee su team-backlog.
- Cualquier otro texto es el **título, o una parte única del título, de una tarea de `team-backlog.md`** (sin distinguir mayúsculas ni acentos). Si la parte coincide con varias, lista los títulos y pide uno más específico.
- **Número inexistente:** error claro con los números conocidos (`Números conocidos: 1 a 31 (30 tareas).`) y el próximo número de tarea.
- **Número en más de un lugar** (ej. en history y aún en el backlog por error): se muestran todos con su origen y se avisa.

### Esquema `--json`

La salida es un objeto con `schema` (versión del esquema, hoy `1`; sube si un campo cambia de forma o de significado, agregar campos no la sube) y `command`. Los campos ausentes son `null` o una lista vacía, nunca se omiten. Las rutas `file` son relativas a la raíz del proyecto y con `/`; las líneas son 1-based.

`status`:

```jsonc
{
  "schema": 1, "command": "status",
  "operator": "gersom",            // null en el repo plano
  "mode": "multi",                 // "multi" | "flat"
  "current": {                     // null si no hay tarea en curso
    "number": 24, "title": "...", "line": 16, "file": "docs/agents/gersom/handoff.md",
    "plan": { "done": 2, "total": 8, "nextStep": "Paso 3 — ..." },       // plan: null si no trae checkboxes; nextStep: null si está completo
    "nextConcreteStep": { "title": "Próximo paso concreto", "text": "..." }  // null si no hay subsección de detalle
  },
  "paused": [{ "number": 8, "title": "...", "plan": { "done": 1, "total": 2, "nextStep": "..." } }],
  "free": [{ "number": 14, "title": "...", "group": "título del grupo" /* o null */, "trigger": "..." /* o null */ }],
  "blocked": [{
    "number": 4, "title": "...", "tag": "dependencia" /* null si ya no hay bloqueo vigente */, "reason": "...",
    "refs": [{ "number": 3, "title": "..." /* o null */, "state": "free" }],  // state: closed | current | paused | free | blocked | unknown
    "unblockCandidate": false
  }],
  "nextTaskNumber": 32,            // null si backlog.md no existe o no tiene la línea
  "recentHistory": [{ "date": "2026-10-07", "status": "done", "number": 31 /* o null */, "title": "..." }],  // status: done | discarded; hasta 3
  "team": { "free": [{ "title": "...", "tag": null, "trigger": null }], "blocked": [{ "title": "...", "tag": "postergada", "trigger": null }] },  // null si no hay team-backlog.md
  "warnings": ["..."]
}
```

`next`: `{ schema, command, mode, current, paused, free, team, unblockCandidates, suggestion }`. `mode` es `current` (con tarea en curso; `current` como en `status` y el resto vacío), `pick` (sin tarea en curso y algo que tomar) o `empty` (nada pendiente). Las listas `paused`, `free` y `unblockCandidates` tienen la forma de `status`; `team` es la lista de libres del team-backlog (`{ title, tag, trigger }`). Los disparadores salen siempre completos (el filtro de «corto y no repetido» es solo del texto). `suggestion` es `null` con tarea en curso.

`show`: `{ schema, command, query, matches, warnings }`. Cada elemento de `matches`:

```jsonc
{
  "place": "history",     // in-progress | paused | free | blocked | grouped | history | team-free | team-blocked
  "number": 23,           // null en las de team-backlog
  "title": "...",
  "group": null,          // título del grupo si es agrupada
  "outcome": "done",      // solo en history: done | discarded; si no, null
  "operator": null,       // carpeta del operador si se pidió con T-N@operador
  "file": "docs/agents/gersom/history.md", "path": "D:/.../history.md",
  "startLine": 120, "endLine": 131,
  "text": "## 2026-10-06 — ✅ Tarea 23 — ..."   // el fragmento, con finales de línea LF
}
```

## Comandos de escritura

Reglas de seguridad que aplica el **núcleo** (no cada comando) a todo comando que escribe (`writes: true` en su definición):

- **`--apply` obligatorio.** Sin él, el comando calcula todo, verifica el resultado y muestra el diff, pero no escribe. Con `--dry-run` tampoco escribe aunque se pase `--apply`.
- **Solo la carpeta propia.** Si la carpeta resuelta no es la del correo de `git config user.email` (otro operador, o no se pudo verificar), el comando se niega con un error claro, sin escribir ni mostrar el diff: las carpetas de otros operadores son de solo lectura. En el repo plano no hay otros operadores. **Excepción:** lo que solo cambia el `team-backlog.md` (`add --team`) es un archivo compartido y no lo exige.
- **Todo por `planChanges`/`commitChanges`:** verificación de legibilidad (anclas y secciones), detección de cambios concurrentes, escritura atómica, CRLF/LF respetados, todo o nada entre los archivos que toca un comando.
- **`--json`:** los comandos de escritura nuevos (`edit`, `step`, `pause`, `resume`, `block`, `unblock`, `close` y los de grupos) lo aceptan: en vez del diff y los mensajes imprimen `{ schema, command, applied, dryRun, pending, files: [{ file, changed, written }], ...datos del comando }`. `applied`: se escribió algún archivo; `pending`: había cambios y falta `--apply`. (`add` y `start` todavía no lo tienen.)
- **Números sin repetir:** antes de numerar, «Próximo número de tarea» tiene que ser mayor que la tarea más alta que ya existe en handoff, backlog (con grupos) e history; si no, error que lo explica (no se elige otro número por cuenta propia).

### `add`

```sh
bun run task add --title "Mi tarea" --description "De qué trata" [--decisions ...] [--blocker ...] [--trigger ...] [--details ...] [--team] [--apply]
```

Agrega una tarea al final de «Tareas libres» (o de «bloqueadas / pospuestas») de tu `backlog.md`:

- `--title` y `--description` son obligatorios. `--decisions` y `--blocker` valen «Ninguno.» por defecto; `--trigger`, «cuando el operador pregunte por tareas pendientes.»; `--details` es opcional y, si no se pasa, el campo se omite. Todos admiten `-` para leer de la entrada estándar (un solo flag por ejecución).
- Si `--blocker` empieza con `[dependencia]` o `[postergada]` (`[dependency]`/`[postponed]` en un proyecto en inglés; con o sin acentos graves), la tarea va a «bloqueadas»; si no, a «libres» (con un aviso si dice algo sin ninguno de los dos tags).
- Recibe el número de «Próximo número de tarea», que pasa a N+1 **en la misma edición**. `Agregada`: la fecha de hoy (`YYYY-MM-DD.`, hora local).
- Con `--team`: va al `team-backlog.md`, sin número ni contador, con `### <título único>` (error si el título ya existe, sin distinguir mayúsculas ni acentos) y `Agregada: <fecha> por <operador>`. No lleva `Disparador` (`--trigger` es un error). Para el operador, necesita saber quién eres: el de `git config user.email` o `--operator`; el **operador «solo team-backlog»** (sin carpeta) puede usarlo.

### `start`

```sh
bun run task start 24 [--plan -] [--mode guided] [--force] [--apply]
bun run task start --team "Migrar el CI" [--plan -] [--mode <modo> [--confirm]] [--force] [--apply]
```

Empieza una tarea, **en una sola operación** sobre todos los archivos (o ninguno):

- Exige que **no haya otra tarea en curso** (si la hay, error que sugiere pausarla con `pause`) y que la elegida esté en «libres». Una **bloqueada** da error salvo con `--force` (queda constancia en la salida); una **pausada** (se retoma con `resume`) o **cerrada**, error claro; una **agrupada**, error que indica sacarla antes con `acsuite task group-eject N` (ver «Grupos»). Repetir el mismo `start --apply` falla limpio: ya hay una tarea en curso.
- Saca su bloque de `backlog.md` sin dejar huecos ni líneas en blanco dobles; si era la última, la sección queda con «Ninguna.» (`None.` en inglés).
- Reescribe el cuerpo de «Tarea en progreso» de `handoff.md` según su plantilla, sin tocar el resto del archivo ni las anclas: la línea `Tarea N — título` antes de la primera subsección `###`, un párrafo con la descripción, **Plan** (solo con `--plan`: una línea por paso; se agrega siempre el último paso «Documentar cierre de tarea»; con `--mode`, la línea «Modo de ejecución acordado»; `--mode` solo acepta `guided`, `step-by-step`, `auto` o `extreme`, y `extreme` exige además `--confirm`, como en `mode`), **Qué falta**, **Decisiones a medio camino** (con lo que la tarea traía en «decisiones», si no era «Ninguno») y **Próximo paso concreto** (el primer paso del plan, o «Empezar la tarea.»), en ese orden. Los campos de la tarea que el handoff no tiene dónde poner (`Detalles`, `Desbloquea`...) se copian tal cual, en líneas `- **Campo:** valor` tras la descripción, para que no se pierdan al sacarla del backlog.
- Con `--team`: la tarea sale de `team-backlog.md` (por título, o una parte única), recibe el siguiente número de tu secuencia (el contador pasa a N+1) y el handoff lleva la línea `- **Origen:** team-backlog`. Los tres archivos cambian juntos.
- La rama y el commit no son asunto del script.

### `step`

```sh
bun run task step <N | texto>... [--undo] [--json] [--apply]
```

Marca pasos del «Plan» de la tarea en curso (Regla 7 de `rules.md`: el handoff se pone al día en cada paso):

- Cada argumento es el **número** del paso (posición en el plan, desde 1) o **parte de su texto** (sin distinguir mayúsculas ni acentos; si coincide con varios, error que los lista). Se pueden pasar varios. `--undo` los desmarca. Un paso que ya estaba en ese estado avisa y no cambia nada.
- «Qué falta» y «Próximo paso concreto» se reescriben **solos solo si siguen con el texto que puso el script**: el de `start` (`Todos los pasos del plan.`, el primer paso) o el que `step` generó antes (`Pasos pendientes:` con la lista de los pasos sin hacer; `Plan completo: falta cerrar la tarea.` al terminar). Un texto que alguien escribió no se pisa: se avisa y se actualiza con `edit --missing` / `--next`. «Decisiones a medio camino» nunca cambia solo.
- `step` solo marca y desmarca pasos. Para cambiar un texto a mano («Qué falta», «Decisiones a medio camino», «Próximo paso concreto») se usa `edit` (ver la sección `edit`).
- Las subsecciones se reconocen por su título en español o inglés. Sin plan (sin checkboxes) no hay pasos que marcar.
- **Aviso de formato:** `step` no bloquea por el contenido del plan, pero si «Plan» tiene una línea que `close` y `pause` rechazarían (texto que no es un paso ni la línea de modo) imprime un `Aviso:` por línea, con su número de línea (el formato válido va solo en el primero; ver «Formato del plan» en `close`); lo mismo avisa de una subsección con título desconocido (`### Notas`), que `close` y `pause` rechazarían. Con `--json` va en `notes`. `edit` avisa de las líneas del plan igual (un `Aviso:` por línea; con `--json`, `notice` y la lista `notices`). El paso se marca igual y el exit code no cambia. `docs-check` lo detecta también (`current-plan-line` y `current-subsection`).

### `mode`

```sh
bun run task mode <guided|step-by-step|auto|extreme> [--confirm] [--json] [--apply]
```

Registra el **modo de ejecución acordado** del plan de la tarea en curso como la línea `**Modo de ejecución acordado:** <modo>` (`**Agreed execution mode:** <modo>` en inglés) al final de la subsección «Plan»:

- **Valores:** `guided`, `step-by-step`, `auto` y `extreme`, siempre en inglés (también en proyectos en español). Cualquier otro valor es un error de uso. Qué significa cada modo no lo define el script.
- **`extreme` exige `--confirm`.** La herramienta no puede comprobar que el operador lo haya pedido: el agente debe confirmarlo antes con el operador en el chat y recién entonces repetir el comando con `--confirm`. Sin él, error de uso (código 2) y no escribe nada. Con los otros modos `--confirm` se ignora sin error.
- **Reemplaza o agrega:** si el plan ya tiene una línea de modo la reemplaza (también la de antes con texto libre, como «uno a la vez», y la que tiene la etiqueta de otro idioma, que no se duplica); si no, la agrega al final del plan, con la etiqueta del idioma del proyecto (con aviso, como `add`, si no lo reconoce). Es idempotente: con el mismo valor avisa que no hay nada que cambiar y no escribe.
- **Solo la tarea en curso y con plan:** sin tarea en curso, o sin plan (checkboxes), es un error que no escribe nada; con contenido de «Tarea en progreso» que no reconoce (ver `pause`), también se niega.
- **Legado:** un texto libre ya escrito en un handoff sigue siendo válido para `close`, `pause` y `resume`; `mode` lo reemplaza y `docs-check` lo señala (`current-mode`).
- `--json` informa `task`, `mode`, `previous`, `unchanged` y `notice`, además de los campos comunes de los comandos que escriben.

### `pause`

```sh
bun run task pause --reason <texto> --waiting-for <texto> [--missing <texto>] [--decisions <texto>] [--next <texto>] [--json] [--apply]
```

Pasa la tarea en curso al final de «Tareas pausadas» como un bloque `### Tarea N — título` y deja «Tarea en progreso» en `Sin tarea en curso` (los comentarios y las anclas no se mueven):

- Campos del bloque, en este orden: `Descripción`, los extras que la tarea traía (`Origen`, `Detalles`...), `Plan` (los checkboxes tal cual, con lo ya marcado), `Modo de ejecución acordado`, `Qué falta`, `Decisiones a medio camino`, `Próximo paso concreto`, `Por qué se pausó` (`--reason`, obligatorio) y `Qué espera para retomarse` (`--waiting-for`, obligatorio). `Descripción`, los extras y el modo no figuran en el formato de la plantilla: se agregan para que `resume` pueda devolver la tarea tal cual estaba. `--missing`, `--decisions` y `--next` reemplazan lo que se guarda.
- **Contenido ajeno:** si «Tarea en progreso» tiene algo que no reconoce —una subsección con otro título, texto suelto dentro del plan que no sea un paso ni el modo, checkboxes fuera del plan, texto antes de la línea de la tarea— se niega con un error que lo dice y no escribe nada: hay que pausar a mano. No pierde información sin avisar. Para el texto suelto en el plan, el error cita la línea y el formato válido (ver «Formato del plan» en `close`).

### `resume`

```sh
bun run task resume <N | T-N> [--json] [--apply]
```

El inverso de `pause`: saca la tarea de «Tareas pausadas» y rearma «Tarea en progreso» con su descripción, plan (con lo ya marcado), modo, textos y extras. `Por qué se pausó` y `Qué espera para retomarse` se descartan. Falla si **ya hay una tarea en curso** (el error sugiere `pause`) o si la tarea no está pausada. Una pausada escrita a mano a la que le falte algún campo recibe los textos por defecto de `start`. `pause` + `resume` deja el archivo idéntico.

### `block`

```sh
bun run task block <N> --tag <dependency|postponed> --reason <texto> [--json] [--apply]
```

Bloquea una tarea **libre** de tu `backlog.md`: pone `Bloqueos` en `` `[tag]` motivo `` (si ya traía un `[Resuelto ...]` de un bloqueo anterior, queda después: el vigente va primero) y mueve su bloque al final de «Tareas bloqueadas / pospuestas». `--tag` es siempre `dependency` o `postponed` (palabras clave en inglés; `--tag dependencia` es un error de uso), y el tag que se escribe sigue el idioma del proyecto: `[dependencia]`/`[postergada]` en uno en español, `[dependency]`/`[postponed]` en uno en inglés. Sin formato nuevo: nombrar `Tarea N` en el motivo es lo que permite que `unblock` la desbloquee sola. Errores: la tarea ya está bloqueada (editar `Bloqueos` a mano), agrupada (el error indica `acsuite task group-eject N`; ver «Grupos»), pausada, en curso o cerrada. Solo opera sobre tu `backlog.md` (no sobre el `team-backlog.md`).

### `unblock`

```sh
bun run task unblock [<N | T-N>] [--json] [--apply]
```

Mueve tareas de «bloqueadas / pospuestas» al final de «Tareas libres» (Regla 8: `Bloqueos` no se borra, pasa a `` `[Resuelto el <fecha>]` — era `[tag]` motivo ``):

- **Sin número**, revisa todas las bloqueadas: desbloquea solas las cuyo motivo nombra `Tarea N` y **todas esas tareas figuran cerradas en `history.md`** (las mismas que `status` marca «candidata a desbloquear»), y las que ya no tenían un bloqueo vigente (solo se mueven). Lista aparte las de **revisión manual** (el motivo no nombra una tarea: texto libre, o nombra una de otro operador con `T-N@operador`) y las que **siguen bloqueadas** (alguna tarea mencionada no está cerrada). Nada de eso se toca.
- **Con número**, desbloquea esa tarea sin más condiciones (la revisión manual ya la hizo quien lo pide); error si no está bloqueada.
- Si no hay nada que desbloquear, lo dice y no escribe.

### `edit`

```sh
bun run task edit <N | título de una tarea del team-backlog> [--title <texto>] [--description <texto>] [--decisions <texto>] [--blocker <texto>] [--trigger <texto>] [--details <texto>] [--missing <texto>] [--next <texto>] [--json] [--apply]
```

Modifica el **contenido** de una tarea y nunca su estado ni su lugar: una libre sigue libre, una bloqueada sigue bloqueada, la que está en curso o pausada sigue ahí. Es el par de `show`: primero se ve la tarea completa con `show`, después se cambia lo que falte con `edit`. Solo cambia los campos cuyo flag se pasa (todos admiten `-` para leer de la entrada estándar; un flag vacío es un error, no borra el campo) y, si el campo no existe (típicamente `Detalles`), lo agrega antes de `Agregada`.

| Dónde está la tarea | Qué se puede editar |
|---|---|
| `backlog.md` (libre, bloqueada, agrupada) | `--title`, `--description`, `--decisions`, `--blocker`, `--trigger`, `--details` |
| `team-backlog.md` (por título) | lo mismo, sin `--trigger`; el título nuevo debe seguir siendo único |
| `handoff.md`, en curso o pausada | `--title`, `--description`, `--details` y las subsecciones de avance: `--missing` («Qué falta»), `--decisions` («Decisiones a medio camino»), `--next` («Próximo paso concreto»). `--blocker` y `--trigger` no aplican |
| `history.md` | nada: es un registro de solo lectura |

- **`--blocker` no cambia el estado.** La sección la decide el tag al inicio de `Bloqueos`. En una libre, un valor con tag `[dependencia]`/`[postergada]` se rechaza (usa `block`). En una bloqueada, un valor con tag se respeta (sirve para pasar de `dependencia` a `postergada`) y uno sin tag conserva el tag actual y cambia solo el motivo; dejarlo en «Ninguno» se rechaza (usa `unblock`). En una agrupada, `--blocker` con un tag de bloqueo (o sobre una tarea ya bloqueada) es un error: se saca antes con `group-eject N`; un texto de bloqueo sin tag como «Ninguno.» sí se edita.
- Si edita la tarea en curso y su plan tiene una línea que `close` y `pause` rechazarían, agrega un `Aviso:` con su número de línea y el formato válido (ver «Formato del plan» en `close`); con `--json` va en `notice`. No bloquea ni cambia el exit code.
- No toca los checkboxes del plan (eso es de `step`) ni las tareas de otro operador. Una descripción en curso mezclada con campos o comentarios da error en vez de adivinar qué reemplazar.
- El título cambia solo el texto: conserva el número, el nivel del header y la etiqueta. En las tareas con número, las referencias entre tareas van por número, así que no se rompen. En el team-backlog el título es la identidad de la tarea (no tiene número): las referencias por título quedan huérfanas, así que `edit --title` sobre una de ellas imprime un `Aviso:` recordando revisarlas.
- Un valor que empieza con un tag `[...]` en `--description`, `--decisions`, `--details` o `--trigger` se rechaza en el backlog y el team-backlog (el parser lo leería como tag de bloqueo). En una tarea en curso, `--description`, `--missing`, `--decisions` y `--next` rechazan líneas que empiecen con `#` o con un checkbox (`- [ ]`, `- [x]`), porque crearían subsecciones o pasos del plan.
- `--blocker` conserva siempre el historial `[Resuelto ...]` que ya tuviera el campo, detrás del valor nuevo.
- Si no hay nada que cambiar (los valores ya eran esos), con `--apply` imprime «Sin cambios».

### `close`

```sh
bun run task close [<N | T-N>] --done --summary <texto> [--new "<título>"]... [--json] [--apply]
bun run task close [<N | T-N>] --discarded --reason <texto> [--new "<título>"]... [--json] [--apply]
```

Cierra una tarea con las Reglas 6 a 9 de `rules.md`, **en una sola operación** sobre `handoff.md`, `history.md` y `backlog.md` (todos o ninguno). Exactamente uno de `--done` (hecha) y `--discarded` (descartada); cada uno exige su texto (`--summary` o `--reason`, que admiten `-` para stdin).

- **Qué tarea:** sin número, la tarea en curso. Con `close <N>`, la tarea en curso si es la `N` o **una pausada** (su bloque sale de «Tareas pausadas»; «Tarea en progreso» no se toca). **Una tarea que nunca se empezó** (libre o bloqueada, no agrupada) solo se puede **descartar**: `close <N> --discarded --reason ...` escribe la entrada ❌ en `history.md` y saca su bloque de `backlog.md`, sin tocar `handoff.md` (la tarea en curso, si hay, queda como estaba). Con `--done` es un error: una tarea sin empezar no se da por hecha, se empieza antes con `start`. Una tarea agrupada es un error que indica sacarla antes con `acsuite task group-eject N` (ver «Grupos»). Sin tarea en curso (por ejemplo, al repetir el mismo cierre) es un error claro que no escribe nada.
- **`history.md` (Regla 6):** la entrada `## <fecha> — ✅|❌ Tarea N — título` va **arriba de todas** (las más nuevas primero), con la fecha de hoy. Debajo, el texto como viñetas: cada línea de `--summary` / `--reason` pasa a ser una viñeta, y las que ya empiezan con `- ` o están sangradas se conservan tal cual. Va solo lo que la plantilla de `history.md` pide (qué se hizo y por qué, o el motivo del descarte); la descripción, el plan y los demás campos de la tarea no se copian. Si `history.md` no tiene entradas, la de ejemplo de la plantilla (`[Placeholder ...]`) se reemplaza; si tampoco hay, la entrada va al final del archivo. Si la tarea ya figura en `history.md`, se niega (no duplica entradas).
- **`Origen: team-backlog`:** si la tarea traía el campo (la tomó `start --team`), la entrada de `history.md` lo conserva como primera viñeta: `- **Origen:** team-backlog`. El `team-backlog.md` no se toca: la tarea ya salió de ahí al empezarla.
- **`handoff.md`:** «Tarea en progreso» queda en «Sin tarea en curso» (`STRINGS.noTask`; el comentario ancla no se mueve). Se niega, sin escribir, si «Tarea en progreso» tiene algo que no reconoce (como `pause`). **Formato del plan:** la subsección «Plan» solo admite pasos `- [ ] Paso N — texto` / `- [x] Paso N — texto`, una línea `**Modo de ejecución acordado:** <texto>` (en inglés, `**Agreed execution mode:**`), `Ninguno.`/`No aplica.` y comentarios HTML; cualquier otra línea hace fallar `close` y `pause`, y el error la cita (primeros 60 caracteres y su número de línea) con este formato. `step` y `edit` avisan antes, y `docs-check` la marca con `current-plan-line`. Si el plan tenía pasos sin marcar (sin contar «Documentar cierre de tarea»), lo avisa.
- **`backlog.md`:**
  - Si la tarea todavía figura ahí (en «libres» o «bloqueadas»), se saca. Si además hay que agregar tareas a «libres» en la misma operación (desbloqueadas o `--new`): con una tarea sin empezar (`close <N> --discarded`) las ediciones se calculan sin pisarse (si era el último bloque de «libres», las nuevas ocupan su lugar; si no, se borra y se agrega al final); con la tarea en curso o pausada que quedó en «libres» por un descuido, se niega y pide sacarla a mano. Una tarea que figura en «Tareas agrupadas» es un error (se saca con `group-eject N`).
  - `--new "<título>"` (repetible): agrega tareas nuevas al final de «Tareas libres» con los números de «Próximo número de tarea» (que pasa a N+k en la misma edición). Llevan solo el título y una descripción mínima («Surgió al cerrar la Tarea N; falta detallarla.»): para una tarea con todos sus campos, `add`.
  - **Regla 8:** revisa las bloqueadas con la misma lógica que `unblock` (módulo compartido `src/write/unblocking.ts`), contando esta tarea como cerrada: las que dependían solo de tareas cerradas pasan a «Tareas libres» con `Bloqueos` → `` `[Resuelto el <fecha>]` — era `[tag]` motivo `` (se conservan el motivo y el historial). Las de **texto libre** (o que nombran una tarea de otro operador) se listan como «Para revisar a mano» y no se tocan. Avisa si «Tareas libres» queda con más de 15 tareas (Agrupamiento en `backlog.md`); **no agrupa** automáticamente.
- **Reporte de cierre (Regla 9):** al escribir, imprime con el formato de `rules.md` las secciones que tengan contenido: `**Tareas resueltas:**`, `**Tareas descartadas:**` (con el motivo breve: la primera línea del motivo, recortada), `**Tareas desbloqueadas:**` y `**Tareas nuevas:**`. En inglés, los títulos salen en inglés. Una tarea descartada también cuenta como cerrada para la Regla 8. Las secciones «Checks pendientes» y «Próximo paso» del reporte no las genera el script: las añade el agente si hay checks fallidos, omitidos o pendientes.
- **`--json`:** `{ ..., task: { number, title, outcome, date, from (`current`, `paused` o `backlog`), origin }, report: { resolved, discarded, unblocked, created }, unblocked, manualReview, stillBlocked, freeTasks, warnings }`: `report` es el mismo contenido del reporte de cierre; `unblocked`, `manualReview` y `stillBlocked` traen tag, motivo y tareas mencionadas (como `unblock --json`).

### Grupos

Un grupo junta tareas de `backlog.md` que conviene tratar juntas (Agrupamiento en `backlog.md`). Vive en **dos lugares a la vez**: la **referencia** `### Grupo — título (Tareas N, M)` con su `- **Resumen:**` en «Tareas libres», y el **contenedor** `### Grupo — título` con un `#### Tarea N` por tarea en «Tareas agrupadas». Los cinco comandos de grupos mantienen los dos lugares de acuerdo, en una sola operación sobre `backlog.md`.

El flujo:

- **Crear:** `group-create` forma el grupo con tareas libres.
- **Sumar:** `group-add` le agrega más tareas libres.
- **Sacar para trabajar una tarea:** `start`, `close` y `block` rechazan las tareas agrupadas (el error dice `acsuite task group-eject N`). Se saca con `group-eject N`, que la deja al final de «Tareas libres», y después se trabaja como cualquier otra. `edit` sí funciona con una agrupada (salvo `--blocker` con un tag de bloqueo).
- **Editar el grupo:** `group-edit` cambia su título o su resumen.
- **Deshacer:** `group-dissolve` lo desarma entero. Un grupo con menos de 2 tareas se desarma solo: si `group-eject` lo deja con una, esa también vuelve a «Tareas libres».

Un grupo se identifica por el **número de cualquiera de sus tareas** (`N`; `T-N` también vale). Todos aceptan `--json`, el `--apply` de siempre (sin él solo muestran el diff) y trabajan solo sobre tu propio `backlog.md`: `T-N@operador` y la carpeta de otro operador se rechazan. Los que escriben etiquetas (`group-create`, `group-eject`, `group-dissolve`, y `group-edit` si agrega un `Resumen`) usan las palabras del idioma del archivo y avisan (`Aviso:`) si no lo reconocen, como `add`.

### `group-create`

```sh
bun run task group-create --tasks <N,M,...> --title <título> --summary <frase> [--json] [--apply]
```

Forma un grupo con tareas **libres**: saca sus bloques de «Tareas libres», deja allí la referencia (`### Grupo — título (Tareas N, M)` + `Resumen`) al final de la sección y pone el contenedor al final de «Tareas agrupadas», con las tareas como `#### Tarea N` y el mismo contenido que tenían.

- `--tasks`: números separados por comas (`12,23,32` o `12, 23, 32`), en el orden en que quedan en el grupo; mínimo 2. `--title` (una línea, distinto al de los demás grupos) y `--summary` (una frase) admiten `-` para leer de la entrada estándar (un solo flag por ejecución). Los tres son obligatorios; no recibe argumentos.
- Salida: `Grupo «título» creado con las Tareas N, M: pasaron de «Tareas libres» a «Tareas agrupadas» de <archivo>.`
- Errores comunes: una tarea que no es libre (el mensaje dice dónde está: ya en otro grupo, bloqueada, o no figura en «Tareas libres»), un número repetido o menos de 2 tareas, un `--tasks` que no es una lista de números, un título ya usado por otro grupo, un título o resumen vacío o de varias líneas, con `<!--`/`-->`, o un título que termina en una lista entre paréntesis con números (se leería como referencia). En todos, no escribe nada.
- `--json`: `group: { title, summary, tasks }`.

### `group-eject`

```sh
bun run task group-eject <N> [--json] [--apply]
```

Saca la tarea agrupada `N` de su grupo: su bloque pasa de `#### Tarea N` a `### Tarea N` al final de «Tareas libres» y su número sale de la lista de la referencia. Es el paso previo a `start`, `close` o `block` sobre una tarea agrupada.

- Si el grupo queda con menos de 2 tareas se desarma: la que quedaba también vuelve a «Tareas libres» y se eliminan la referencia y el contenedor (si «Tareas agrupadas» se queda sin grupos, vuelve a su texto de vacío).
- Salida: `Tarea N sacada del grupo «título»: pasó a «Tareas libres» de <archivo>.`, más, si se desarmó, qué tareas volvieron.
- Errores comunes: la tarea no está agrupada (el mensaje dice si es libre, bloqueada, en curso, pausada o cerrada), el número no existe (con los números conocidos), figura en más de un lugar, un argumento que no es un número, o más o menos de un argumento.
- `--json`: `ejected`, `dissolved`, `returned` (tareas que volvieron al desarmarse) y `group: { title, tasks }` (`tasks` vacío si se desarmó).

### `group-add`

```sh
bun run task group-add <N> <M>... [--json] [--apply]
```

Suma tareas libres a un grupo ya formado. `N` es cualquier tarea del grupo; las `M` pasan de `### Tarea M` en «Tareas libres» a `#### Tarea M` al final del contenedor (en el orden pedido) y sus números se agregan a la referencia. El `Resumen` no cambia.

- Salida: `Tarea M sumada al grupo «título»: ahora tiene K tareas (N, ..., M).` (en plural: `Tareas M, P sumadas ...`).
- Errores comunes: `N` no está agrupada (el mensaje dice dónde está), una `M` que no es libre (ya agrupada, bloqueada, en curso, pausada o cerrada; solo se suman tareas libres), un número repetido (también repetir `N`), falta al menos una `M`, o un argumento que no es un número.
- Una tarea nueva no entra a un grupo con `add`: se agrega con `add` (queda en «libres») y después se suma con `group-add`.
- `--json`: `group: { title, tasks }` (cómo queda) y `added`.

### `group-edit`

```sh
bun run task group-edit <N> [--title <texto>] [--summary <texto>] [--json] [--apply]
```

Cambia el título y/o el resumen del grupo que contiene la tarea `N`. El título se reescribe en la referencia (que conserva su lista de tareas) y en el contenedor; el resumen, en la línea `Resumen` de la referencia (si no tenía, se agrega). No mueve ninguna tarea.

- Hay que pasar al menos uno de `--title` y `--summary`; ambos admiten `-` para stdin y no pueden estar vacíos (no borra nada). El título es de una línea y distinto al de los demás grupos.
- Salida: `Grupo «título» editado en <archivo>: ahora se llama «nuevo»; resumen «anterior» → «nuevo».`
- Errores comunes: ninguno de los dos flags, un flag vacío o de varias líneas, `N` no agrupada, un título que ya usa otro grupo o que termina en una lista entre paréntesis con números, un valor igual al actual (`ya tiene el título que indicas: no hay nada que cambiar`), un header del grupo con un comentario HTML (hay que quitarlo a mano).
- `--json`: `group: { title, tasks }` y `changed` (`title`, `summary` o ambos).

### `group-dissolve`

```sh
bun run task group-dissolve <N> [--json] [--apply]
```

Deshace el grupo que contiene la tarea `N`: todas sus tareas pasan de `#### Tarea N` a `### Tarea N` al final de «Tareas libres», en el orden del contenedor, y se eliminan la referencia y el contenedor. Los demás grupos no se tocan.

- Salida: `Grupo «título» deshecho: las Tareas N, M volvieron a «Tareas libres».`
- Errores comunes: `N` no está agrupada (el mensaje dice dónde está), el número no existe, figura en más de un lugar, o un argumento que no es un número.
- `--json`: `group: { title, tasks }` y `returned`.

### Dónde y cómo escriben

- **Ubicación:** al final de la sección, justo tras el último contenido y antes de las líneas en blanco que la separan de la siguiente. **Espaciado:** el que ya usa el archivo (lo que separa a sus dos últimas tareas; una línea en blanco si no hay dos). Si la sección solo tenía el texto de vacío («Ninguna.»), un placeholder de la plantilla o la tarea anterior, el bloque lo **reemplaza**; los comentarios HTML del principio de la sección se conservan. Las tareas agrupadas no se tocan: `add` siempre deja la tarea nueva en «libres»; para meterla en un grupo, `group-add`.
- **Idioma:** el header usa la palabra que ya usan las tareas del archivo (`Tarea`, `Task`...) y las etiquetas de campo salen de una tarea existente; si no hay de dónde copiar, una tabla mínima en **español** (por defecto) o **inglés** (si la palabra de header o las etiquetas lo son). No se inventan traducciones a otros idiomas: ante un idioma desconocido, o sin ninguna pista, escribe en español y lo avisa en la salida. Los títulos de subsección del handoff (Plan, Qué falta...) salen de la misma tabla.
- **Finales de línea:** un archivo CRLF sigue siendo CRLF y uno LF, LF; lo escrito no reformatea nada de lo que no toca.

## Consulta reutilizable (`src/query/`)

Los comandos de lectura son una capa fina sobre un módulo de consulta que los comandos que editan (`add`, `start`, `step`, `close`...) también usan, para no repetir cómo se interpreta cada archivo:

- `query/find.ts`: `findTask(docs, n)` devuelve dónde vive la tarea `n` (lugar, título, grupo, archivo y rango sin líneas en blanco; más de uno si está repetida); `locationText(location)` el fragmento; `findTeamTasks(docs, query)` las del team-backlog por título; `parseTarget(arg)` interpreta `N`, `T-N@operador` o un título; `readOperatorDocs(workspace, folder)` lee (solo lectura) los archivos de otro operador; `describeKnownNumbers(docs)`.
- `query/state.ts`: `buildState(docs)` arma el estado completo (lo que muestra `status`); `buildTaskIndex(docs)` y `knownNumbers(docs)`; `planProgress`, `nextConcreteStep` y `fieldValue` (campo por etiqueta) son sus piezas.
- `query/next-number.ts`: `findNextTaskNumber(text)` devuelve el valor, la línea y los offsets de los dígitos de «Próximo número de tarea».
- `query/lines.ts`: `trimRange(text, range)` y `lineAt(text, offset)`.
- `query/format.ts`: texto compacto y `emitJson`, compartidos por los comandos de lectura.

La lógica de interpretación (bloqueos, tareas que menciona un motivo, plan y subsecciones) es la del task-tracker, pero sale de `scripts/_shared/` y de una reescritura chica en `state.ts`: el task-manager no importa del tracker.

## Qué operador y qué carpeta usa

Sigue `docs/multi-operator.md` de la skill y nunca escribe al resolver:

- **Multi-operador** si la carpeta de agentes tiene `operators.md`; **plano** si no, y trae `handoff.md` directamente (en ese caso no hay operador ni `team-backlog.md`).
- **Operador:** `--operator <carpeta>` si se indicó (sin distinguir mayúsculas); si no, el que figura en `operators.md` con el correo de `git config user.email`. Pasar directamente la carpeta de un operador como `--agents` también sirve.
- **Es un error explícito, que dice qué falta y qué opciones hay:**
  - el correo de git no se puede leer, o no figura en `operators.md`;
  - el operador figura como «solo team-backlog» (no tiene carpeta, handoff, backlog ni history);
  - la carpeta del operador no existe o no tiene `handoff.md`;
  - `operators.md` no tiene operadores legibles (las líneas sin leer se avisan);
  - **falta `operators.md` pero hay carpetas de operador:** no se asume repo plano (es el «estado inconsistente» de `multi-operator.md`); hay que restaurarlo;
  - `--operator` en un repo plano.
- **Carpeta de otro operador:** `--operator` permite apuntar a la de otro, pero esas carpetas son de solo lectura según las reglas del proyecto. `whoami` lo marca (`Carpeta propia: no`) y los comandos que escriben se niegan (ver «Comandos de escritura»).
- **Operador «solo team-backlog»:** los comandos que solo escriben en el `team-backlog.md` (`add --team`) lo resuelven igual (`ctx.workspace({ allowFolderless: true })`): trae su nombre pero no hay handoff, backlog ni history. Para todos los demás sigue siendo el error de arriba.

## Archivos que lee

Lee `handoff.md`, `backlog.md` e `history.md` de la carpeta del operador y `team-backlog.md` de la raíz de agentes (solo en modo multi-operador). Los parsea con los parsers de [`scripts/_shared/`](../_shared/) (los mismos del task-tracker), que devuelven la posición exacta de cada sección, tarea, campo y paso del plan.

- **Archivo ausente** (el set mínimo de la skill solo genera `handoff.md`; `team-backlog.md` puede no existir): no es un error al leer; queda marcado como inexistente y cada comando decide si lo necesita. Este script no crea archivos que faltan.
- **Archivo que no se puede leer** (permisos, trabado, es una carpeta): sí es un error, con su ruta.

## Edición quirúrgica

Un archivo que se modifica no se reformatea: el diff muestra solo el cambio pedido (principio 5 de `philosophy.md`). El helper de `src/edit/` trabaja así:

- **Ediciones por rango u offset** sobre el texto original: reemplazar un rango, insertar en un offset o borrar un rango. Los rangos son los de los parsers (sobre el texto con saltos de línea LF); se traducen al texto crudo y lo insertado se convierte al final de línea del archivo, así un archivo CRLF sigue siendo CRLF y uno LF, LF.
- **Sin solapamientos:** ediciones que se pisan se rechazan antes de escribir.
- **Verificación posterior:** el resultado se vuelve a parsear y, si la edición rompe las anclas o secciones que el archivo tenía, no se escribe nada y falla con el motivo. Lo que ya estaba mal antes de editar no impide editar.
- **Todo o nada al calcular:** un comando que toca varios archivos calcula todos antes de escribir el primero. Si uno falla, no se escribe ninguno.
- **Escritura atómica y solo si cambió:** cada archivo se escribe a un temporal y se renombra sobre el original (con reintentos si Windows lo tiene abierto un instante); un archivo sin cambios no se toca (ni su fecha de modificación). Antes de escribir se comprueba que nadie lo haya modificado desde que se leyó.
- **`--dry-run`:** muestra, por archivo, el diff (`-` quita, `+` agrega, con unas líneas de contexto) y no escribe nada.
- **`--apply` en los comandos de escritura:** `ctx.commit()` lo decide en el núcleo: un comando con `writes: true` solo escribe con `--apply` (sin él hace lo mismo que `--dry-run`, con otro aviso final); uno sin `writes` escribe directamente.

## Agregar un comando

Cada comando es un módulo de `src/commands/` que exporta un objeto con `name`, `summary`, `usage`, sus `flags` (opcionales) y `run(ctx)`; se importa y se suma a la lista de `src/commands/index.ts`. El despachador no se toca. Un comando que escribe lleva además `writes: true`: así `--apply`, la ayuda y la regla de la carpeta propia valen sin que el comando haga nada. Detalle del contrato (`ctx.args`, `ctx.flags`, `ctx.workspace()`, `ctx.docs()`, `ctx.now()`, `ctx.commit()`): `src/cli/types.ts`.

## Estructura

```
scripts/task-manager/
├── index.ts          # Arranque: llama al despachador y fija el código de salida
├── src/
│   ├── cli/          # Despachador, parseo de flags (y stdin), ayuda, errores y contrato de los comandos
│   ├── commands/     # Un módulo por comando + index.ts (el registro)
│   ├── query/        # Consulta reutilizable: dónde vive una tarea, estado del operador, próximo número, formato
│   ├── workspace/    # Ruta de agentes, operador (operators.md + correo de git), espacio de trabajo y lectura de archivos
│   ├── edit/         # Ediciones por rango, ubicar/sacar un bloque en una sección (`layout.ts`), verificación de legibilidad, diff, escritura atómica y cambios de varios archivos
│   └── write/        # Lo que escriben los comandos: idioma y etiquetas, formato de los bloques y del handoff, contador de número de tarea, lectura de «Tarea en progreso» (`handoff.ts`), campo `Bloqueos` (`blocking.ts`), qué desbloquear y cómo (`unblocking.ts`, lo comparten `unblock` y `close`), entrada de `history.md` (`history.ts`), bloque de una tarea nueva (`new-task.ts`), edición del contenido de una tarea sin cambiar su estado (`task-edit.ts`, la usa `edit`), armado y desarmado de grupos (`group.ts`, lo comparten los `group-*`) y `--json` de los que escriben
└── test/             # Tests de `bun test` en espejo de src/ + e2e/ (script entero); trabajan en directorios temporales
```

## Desarrollo

Desde la raíz de este repo:

```sh
bun test            # tests (en scripts/*/test/ y scripts/skill-checks/)
bun run typecheck   # chequeo de tipos (Bun ejecuta TypeScript sin revisar tipos)
```

Los tests nunca tocan los `docs/` reales: usan proyectos temporales armados con los fixtures de `scripts/_shared/test/fixtures/`.
