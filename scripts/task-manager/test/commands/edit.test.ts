// `edit`: cambia el contenido de una tarea sin tocar su estado ni su lugar. Contra proyectos
// temporales: nunca se tocan los docs reales.

import { afterAll, describe, expect, test } from "bun:test";
import { APPLY_NOTICE } from "../../src/cli/dispatch.ts";
import { BACKLOG_EN, BACKLOG_ONE, BACKLOG_RICH, HANDOFF_EMPTY, HANDOFF_IDLE, HANDOFF_IDLE_EN, HISTORY_EN, HISTORY_RICH, TEAM_RICH, TEAM_TWO } from "../fixtures.ts";
import { exec, makeProject, type Project, readIn, snapshot } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

const HANDOFF_FULL = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 12 — Implementar el parser

Primer párrafo de la descripción.

Segundo párrafo.

- **Detalles:** contexto viejo
  con una segunda línea
- **Origen:** pedida por ana

### Plan

- [x] Paso 1 — Preparar
- [ ] Paso 2 — Probar
- [ ] Documentar cierre de tarea

### Qué falta

El paso 2.

### Decisiones a medio camino

Ninguna.

### Próximo paso concreto

Paso 2.

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

### Tarea 8 — Migrar la documentación vieja

- **Descripción:** pasar los docs.
- **Plan:**
  - [x] Paso 1 — Copiar
  - [ ] Paso 2 — Revisar
- **Qué falta:** revisar \`setup.md\`.
- **Decisiones a medio camino:** Ninguna.
- **Próximo paso concreto:** Paso 2.
- **Por qué se pausó:** prioridad mayor.
- **Qué espera para retomarse:** que cierre la Tarea 12.

### Tarea 30 — Sin extras

- **Qué falta:** nada.
`;

/** Una en curso sin descripción ni campos extra. */
const HANDOFF_BARE = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

Tarea 12 — Solo el título

### Plan

- [ ] Paso 1 — Probar

### Qué falta

Todo.

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

Ninguna.
`;

const RICH = { contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };
const FULL = { contents: { "handoff.md": HANDOFF_FULL, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_TWO };
const backlog = (p: Project) => readIn(p, "gersom", "backlog.md");
const handoff = (p: Project) => readIn(p, "gersom", "handoff.md");
const team = (p: Project) => readIn(p, "team-backlog.md");
const state = async (p: Project) => JSON.parse((await exec(["status", "--json"], p)).out);
const numbers = (tasks: Array<{ number: number }>) => tasks.map((t) => t.number);
const crlf = (text: string) => text.replace(/\n/g, "\r\n");

describe("edit — backlog propio", () => {
  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const before = snapshot(p.root);
    const { code, out } = await exec(["edit", "1", "--description", "Nueva"], p);
    expect(code).toBe(0);
    expect(out).toContain("-- **Descripción:** CUERPO-1");
    expect(out).toContain("+- **Descripción:** Nueva");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--dry-run + --apply tampoco escribe", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const before = snapshot(p.root);
    expect((await exec(["edit", "1", "--description", "Nueva", "--dry-run", "--apply"], p)).code).toBe(0);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("reemplaza un campo existente y la tarea sigue libre en su lugar", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code, out } = await exec(["edit", "1", "--description", "Nueva descripción\nen dos líneas", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe("Tarea 1 editada (--description): libre (backlog), docs/agents/gersom/backlog.md. Su estado no cambió.");
    expect(backlog(p)).toBe(BACKLOG_RICH.replace("- **Descripción:** CUERPO-1", "- **Descripción:** Nueva descripción\n  en dos líneas"));
    expect(numbers((await state(p)).free)).toContain(1);
  });

  test("agrega `Detalles` (antes de `Agregada` si la tarea la tiene; si no, al final)", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_ONE, "history.md": "# History\n" } });
    await exec(["edit", "7", "--details", "Contexto nuevo", "--apply"], p);
    expect(backlog(p)).toContain("- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Detalles:** Contexto nuevo\n- **Agregada:** 2026-10-01.\n");

    const q = project({ folders: ["gersom"], ...RICH });
    await exec(["edit", "1", "--details", "Contexto nuevo", "--apply"], q);
    expect(backlog(q)).toContain("- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Detalles:** Contexto nuevo\n\n### Grupo");
  });

  test("varios campos a la vez, y el valor puede venir de la entrada estándar (`-`)", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const { code } = await exec(["edit", "1", "--title", "Probar todo", "--decisions", "¿Cuál?", "--trigger", "al terminar", "--details", "-", "--apply"], p, { stdin: "uno\ndos\n" });
    expect(code).toBe(0);
    const text = backlog(p);
    expect(text).toContain("### Tarea 1 — Probar todo\n\n- **Descripción:** CUERPO-1\n- **Bloqueos:** Ninguno.\n- **Disparador:** al terminar\n- **Decisiones/temas a definir antes de empezar:** ¿Cuál?\n- **Detalles:** uno\n  dos\n");
  });

  test("título: conserva el número y el nivel; en una agrupada, el `####`", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    await exec(["edit", "14", "--title", "Costos", "--apply"], p);
    await exec(["edit", "6", "--title", "Sitio", "--apply"], p);
    expect(backlog(p)).toBe(BACKLOG_RICH.replace("#### Tarea 14 — Redactar `costs.md`", "#### Tarea 14 — Costos").replace("### Tarea 6 — Publicar el sitio", "### Tarea 6 — Sitio"));
    const s = await state(p);
    expect(numbers(s.blocked)).toEqual([6, 7, 16, 17]);
  });

  test("agrupada: se edita sin cambiar su grupo ni su sección", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    await exec(["edit", "15", "--description", "Nuevos límites", "--apply"], p);
    expect(backlog(p)).toBe(BACKLOG_RICH.replace("- **Descripción:** límites.", "- **Descripción:** Nuevos límites"));
  });

  test("--json", async () => {
    const p = project({ folders: ["gersom"], ...RICH });
    const pending = JSON.parse((await exec(["edit", "1", "--title", "Otro", "--details", "d", "--json"], p)).out);
    expect(pending).toMatchObject({ command: "edit", applied: false, pending: true, place: "free", fields: ["title", "details"], task: { number: 1, title: "Otro" } });
    expect(JSON.parse((await exec(["edit", "1", "--title", "Otro", "--details", "d", "--json", "--apply"], p)).out)).toMatchObject({ applied: true });
  });

  test("un proyecto en inglés usa `Details` y conserva CRLF", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE_EN), "backlog.md": crlf(BACKLOG_EN), "history.md": crlf(HISTORY_EN) } });
    expect((await exec(["edit", "4", "--details", "Extra", "--title", "Translate it", "--apply"], p)).code).toBe(0);
    const text = backlog(p);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("### Task 4 — Translate it\r\n");
    expect(text).toContain("- **Trigger:** when the operator asks about pending tasks.\r\n- **Details:** Extra\r\n- **Added:** 2026-10-01.\r\n");
  });

  test("un archivo CRLF sigue siendo CRLF", async () => {
    const p = project({ folders: ["gersom"], contents: { ...RICH.contents, "backlog.md": crlf(BACKLOG_RICH) } });
    await exec(["edit", "1", "--description", "Nueva\ncon dos líneas", "--apply"], p);
    const text = backlog(p);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("- **Descripción:** Nueva\r\n  con dos líneas\r\n- **Bloqueos:** Ninguno.");
  });

  describe("--blocker no cambia el estado", () => {
    test("libre: un valor que no bloquea se escribe; uno que la bloquearía manda a `block`", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      await exec(["edit", "1", "--blocker", "Esperar una respuesta", "--apply"], p);
      expect(backlog(p)).toContain("### Tarea 1 — Probar el flujo completo\n\n- **Descripción:** CUERPO-1\n- **Bloqueos:** Esperar una respuesta\n");
      expect(numbers((await state(p)).free)).toContain(1);

      const before = snapshot(p.root);
      const bad = await exec(["edit", "1", "--blocker", "`[dependencia]` la Tarea 3", "--apply"], p);
      expect(bad.code).toBe(1);
      expect(bad.err).toContain("block <N>");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("bloqueada con tag: se respeta, también al cambiar de dependencia a postergada", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      await exec(["edit", "6", "--blocker", "`[postergada]` mejor más adelante", "--apply"], p);
      expect(backlog(p)).toContain("### Tarea 6 — Publicar el sitio\n\n- **Bloqueos:** `[postergada]` mejor más adelante\n");
      const s = await state(p);
      expect(numbers(s.blocked)).toEqual([6, 7, 16, 17]);
      expect(s.blocked[0]).toMatchObject({ number: 6, tag: "postergada", reason: "mejor más adelante" });
    });

    test("bloqueada sin tag: conserva el tag actual y cambia solo el motivo", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      await exec(["edit", "6", "--blocker", "depende de la Tarea 12", "--apply"], p);
      expect(backlog(p)).toContain("### Tarea 6 — Publicar el sitio\n\n- **Bloqueos:** `[dependencia]` depende de la Tarea 12\n");
      expect((await state(p)).blocked[0]).toMatchObject({ number: 6, tag: "dependencia", reason: "depende de la Tarea 12" });
    });

    test("bloqueada: conserva el historial `[Resuelto ...]`", async () => {
      const raw = BACKLOG_RICH.replace("`[postergada]` hasta nuevo aviso del operador.", "`[postergada]` hasta nuevo aviso. `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.");
      const p = project({ folders: ["gersom"], contents: { ...RICH.contents, "backlog.md": raw } });
      await exec(["edit", "17", "--blocker", "otro motivo", "--apply"], p);
      expect(backlog(p)).toContain("- **Bloqueos:** `[postergada]` otro motivo `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.");
    });

    test("bloqueada con tag explícito: conserva el historial `[Resuelto ...]`", async () => {
      const raw = BACKLOG_RICH.replace("`[postergada]` hasta nuevo aviso del operador.", "`[postergada]` hasta nuevo aviso. `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.");
      const p = project({ folders: ["gersom"], contents: { ...RICH.contents, "backlog.md": raw } });
      await exec(["edit", "17", "--blocker", "`[dependencia]` la Tarea 4", "--apply"], p);
      expect(backlog(p)).toContain("- **Bloqueos:** `[dependencia]` la Tarea 4 `[Resuelto el 2026-09-01]` — era `[dependencia]` la Tarea 3.");
      const s = await state(p);
      expect(numbers(s.blocked)).toEqual([6, 7, 16, 17]);
      expect(s.blocked[3]).toMatchObject({ number: 17, tag: "dependencia", reason: "la Tarea 4" });
    });

    test("libre: conserva el historial `[Resuelto ...]`, también con «Ninguno.»", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      await exec(["edit", "3", "--blocker", "esperar al operador", "--apply"], p);
      expect(backlog(p)).toContain("- **Bloqueos:** esperar al operador `[Resuelto el 2026-09-24]` — era `[postergada]`.\n");
      await exec(["edit", "3", "--blocker", "Ninguno.", "--apply"], p);
      expect(backlog(p)).toContain("- **Bloqueos:** Ninguno. `[Resuelto el 2026-09-24]` — era `[postergada]`.\n");
      expect(numbers((await state(p)).free)).toContain(3);
    });

    test("bloqueada: lo que la desbloquearía o no deja un tag vigente se rechaza", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      const before = snapshot(p.root);
      const run = (n: string, value: string) => exec(["edit", n, "--blocker", value, "--apply"], p);
      expect((await run("6", "Ninguno.")).err).toContain("unblock <N>");
      expect((await run("6", "`[Resuelto el 2026-10-01]` — era `[dependencia]` x")).err).toContain("unblock <N>");
      expect((await run("16", "un motivo sin tag")).err).toContain("no tiene un tag vigente");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("los mensajes de --blocker citan los tags del idioma del archivo", async () => {
      const es = project({ folders: ["gersom"], ...RICH });
      expect((await exec(["edit", "1", "--blocker=[algo] x", "--apply"], es)).err).toContain("solo valen `[dependencia]`/`[postergada]`");
      expect((await exec(["edit", "6", "--blocker=[algo] x", "--apply"], es)).err).toContain("solo valen `[dependencia]`/`[postergada]`");
      const en = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
      expect((await exec(["edit", "4", "--blocker=[something] x", "--apply"], en)).err).toContain("solo valen `[dependency]`/`[postponed]`");
    });

    test("los mensajes de una bloqueada («no es … ni …», «o …») citan los tags del idioma del archivo", async () => {
      const blockedEn = BACKLOG_EN.replace(
        "## Blocked / postponed tasks\n\nNone.\n",
        "## Blocked / postponed tasks\n\n### Task 1 — Wait for the API\n\n- **Description:** needs the API.\n- **Blockers:** `[dependency]` needs Task 9.\n- **Trigger:** when the API ships.\n- **Added:** 2026-10-01.\n\n### Task 2 — Already resolved\n\n- **Description:** was blocked.\n- **Blockers:** `[Resolved on 2026-10-01]` — was `[dependency]` Task 9.\n- **Trigger:** any time.\n- **Added:** 2026-10-01.\n",
      );
      const en = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": blockedEn, "history.md": HISTORY_EN } });
      const before = snapshot(en.root);
      const unblocking = await exec(["edit", "1", "--blocker", "`[Resolved on 2026-10-02]` done", "--apply"], en);
      expect(unblocking.code).toBe(1);
      expect(unblocking.err).toContain("empieza con un tag que no es `[dependency]` ni `[postponed]`");
      const noTag = await exec(["edit", "2", "--blocker", "a reason without tag", "--apply"], en);
      expect(noTag.code).toBe(1);
      expect(noTag.err).toContain("escribe el valor con `[dependency]` o `[postponed]` al inicio");
      expect(snapshot(en.root)).toEqual(before);
    });

    test("un corchete inicial que no es tag de bloqueo se rechaza (se leería como tag de la tarea)", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      const before = snapshot(p.root);
      for (const n of ["1", "6", "14"]) {
        const { code, err } = await exec(["edit", n, "--blocker=[algo] x", "--apply"], p);
        expect(code).toBe(1);
        expect(err).toContain("se leería como tag de la tarea");
      }
      expect(snapshot(p.root)).toEqual(before);
      // Con el corchete en medio del texto no hay problema.
      expect((await exec(["edit", "1", "--blocker", "esperar [algo] más", "--apply"], p)).code).toBe(0);
      expect(numbers((await state(p)).free)).toContain(1);
    });

    test("agrupada: un bloqueo que no la bloquea se edita; uno bloqueante no está soportado", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      await exec(["edit", "14", "--blocker", "Ninguno.", "--apply"], p);
      expect(backlog(p)).toContain("- **Disparador:** cuando se cierre el diseño.\n- **Bloqueos:** Ninguno.\n");
      const before = snapshot(p.root);
      const bad = await exec(["edit", "14", "--blocker", "[dependencia] x", "--apply"], p);
      expect(bad.err).toContain("una tarea agrupada no se bloquea");
      expect(bad.err).toContain("acsuite task group-eject N");
      expect(snapshot(p.root)).toEqual(before);
    });
  });

  describe("errores: no se escribe nada", () => {
    test("uso: sin tarea, sin flags, flag vacío o título de varias líneas", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      const before = snapshot(p.root);
      expect((await exec(["edit", "--title", "x", "--apply"], p)).code).toBe(2);
      expect((await exec(["edit", "1", "--apply"], p)).code).toBe(2);
      const empty = await exec(["edit", "1", "--details", "", "--apply"], p);
      expect(empty.code).toBe(2);
      expect(empty.err).toContain("--details está vacío");
      expect((await exec(["edit", "1", "--title", "uno\ndos", "--apply"], p)).code).toBe(2);
      expect(snapshot(p.root)).toEqual(before);
    });

    test("un valor que empieza con un tag entre corchetes no cambia el estado que lee el parser", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      const before = snapshot(p.root);
      for (const flag of ["--description", "--decisions", "--details", "--trigger"]) {
        const { code, err } = await exec(["edit", "1", flag, "[dependencia] la Tarea 3", "--apply"], p);
        expect(code).toBe(1);
        expect(err).toContain("tag de bloqueo");
      }
      expect(snapshot(p.root)).toEqual(before);
      // Un link markdown al inicio no es un tag.
      expect((await exec(["edit", "1", "--description", "[plan](plans/a.md) revisado", "--apply"], p)).code).toBe(0);
      expect(numbers((await state(p)).free)).toContain(1);
    });

    test("sin cambios (mismo valor): lo dice y no escribe", async () => {
      const p = project({ folders: ["gersom"], ...RICH });
      const before = snapshot(p.root);
      const { code, out } = await exec(["edit", "1", "--description", "CUERPO-1", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toBe("Sin cambios: la Tarea 1 ya tenía esos valores.");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("history, otro operador, inexistente, --missing/--next fuera de handoff", async () => {
      const p = project({ folders: ["gersom", "ana"], ...RICH });
      const before = snapshot(p.root);
      const run = (...args: string[]) => exec(["edit", ...args, "--apply"], p);
      expect((await run("11", "--title", "x")).err).toContain("history.md es un registro de solo lectura");
      expect((await run("1@ana", "--title", "x")).err).toContain("de otro operador");
      expect((await run("99", "--title", "x")).err).toContain("No existe la Tarea 99");
      expect((await run("1", "--missing", "x")).err).toContain("solo existen en una tarea en curso o pausada");
      expect((await run("6", "--next", "x")).err).toContain("solo existen en una tarea en curso o pausada");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("carpeta de otro operador: se niega", async () => {
      const p = project({ folders: ["gersom", "ana"], ...RICH, folderContents: { ana: RICH.contents } });
      expect((await exec(["edit", "1", "--title", "x", "--operator", "ana", "--apply"], p)).err).toContain("«ana» no es la tuya");
    });
  });
});

describe("edit — handoff.md", () => {
  test("en curso: título, descripción (ambos párrafos) y Detalles", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const { code, out } = await exec(["edit", "12", "--title", "Hacer el parser", "--description", "Una sola descripción.", "--details", "contexto nuevo", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("Tarea 12 editada (--title, --description, --details): en curso (handoff)");
    expect(handoff(p)).toBe(
      HANDOFF_FULL.replace("Tarea 12 — Implementar el parser", "Tarea 12 — Hacer el parser")
        .replace("Primer párrafo de la descripción.\n\nSegundo párrafo.", "Una sola descripción.")
        .replace("- **Detalles:** contexto viejo\n  con una segunda línea", "- **Detalles:** contexto nuevo"),
    );
    expect(JSON.parse((await exec(["status", "--json"], p)).out).current).toMatchObject({ number: 12 });
  });

  test("en curso: las tres subsecciones, sin tocar el plan", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    await exec(["edit", "12", "--missing", "Todo el paso 2\ny el cierre", "--decisions", "Usar X", "--next", "Correr los tests", "--apply"], p);
    expect(handoff(p)).toBe(
      HANDOFF_FULL.replace("### Qué falta\n\nEl paso 2.", "### Qué falta\n\nTodo el paso 2\ny el cierre")
        .replace("### Decisiones a medio camino\n\nNinguna.", "### Decisiones a medio camino\n\nUsar X")
        .replace("### Próximo paso concreto\n\nPaso 2.", "### Próximo paso concreto\n\nCorrer los tests"),
    );
  });

  describe("avisa de líneas del plan de la tarea en curso que `close` rechazaría (sin bloquear)", () => {
    const LOOSE = HANDOFF_FULL.replace("- [ ] Paso 2 — Probar", "Una nota suelta.\n- [ ] Paso 2 — Probar");

    test("en curso: el cambio se escribe, exit 0, y el aviso cita la línea y el formato válido", async () => {
      const p = project({ folders: ["gersom"], ...FULL, contents: { ...FULL.contents, "handoff.md": LOOSE } });
      const line = LOOSE.split("\n").indexOf("Una nota suelta.") + 1;
      const { code, out } = await exec(["edit", "12", "--next", "Correr los tests", "--apply"], p);
      expect(code).toBe(0);
      expect(handoff(p)).toContain("### Próximo paso concreto\n\nCorrer los tests");
      expect(out).toContain(`Aviso: El plan tiene una línea que no es un paso ni el modo de ejecución (línea ${line}): «Una nota suelta.»`);
      expect(out).toContain("Formato válido: pasos `- [ ] Paso N — texto`");
    });

    test("--apply: el número de línea es el del archivo ya editado, aunque la edición desplace líneas", async () => {
      const p = project({ folders: ["gersom"], ...FULL, contents: { ...FULL.contents, "handoff.md": LOOSE } });
      const { out } = await exec(["edit", "12", "--description", "a\n\nb\n\nc", "--apply"], p);
      const line = handoff(p).split("\n").indexOf("Una nota suelta.") + 1;
      expect(out).toContain(`(línea ${line}): «Una nota suelta.»`);
    });

    test("en curso: también avisa de una subsección desconocida o de un checkbox fuera del plan", async () => {
      const unknown = project({ folders: ["gersom"], ...FULL, contents: { ...FULL.contents, "handoff.md": HANDOFF_FULL.replace("### Qué falta", "### Notas\n\nalgo\n\n### Qué falta") } });
      expect((await exec(["edit", "12", "--next", "Correr los tests", "--apply"], unknown)).out).toContain("la subsección «Notas» no es una de las conocidas");
      const outside = project({ folders: ["gersom"], ...FULL, contents: { ...FULL.contents, "handoff.md": HANDOFF_FULL.replace("### Qué falta", "### Qué falta\n\n- [ ] suelto") } });
      expect((await exec(["edit", "12", "--next", "Correr los tests", "--apply"], outside)).out).toContain("hay checkboxes fuera de la subsección del plan");
    });

    test("varias líneas inválidas: un Aviso por línea, con el formato válido solo en el primero", async () => {
      const handoffText = LOOSE.replace("- [ ] Paso 2 — Probar", "Otra nota.\n- [ ] Paso 2 — Probar");
      const p = project({ folders: ["gersom"], ...FULL, contents: { ...FULL.contents, "handoff.md": handoffText } });
      const avisos = (await exec(["edit", "12", "--next", "Correr los tests", "--apply"], p)).out.split("\n").filter((l) => l.startsWith("Aviso:"));
      expect(avisos).toHaveLength(2);
      expect(avisos[0]).toContain("Formato válido");
      expect(avisos[1]).toContain("«Otra nota.»");
      expect(avisos[1]).not.toContain("Formato válido");
    });

    test("--json: aparece en `notice`", async () => {
      const p = project({ folders: ["gersom"], ...FULL, contents: { ...FULL.contents, "handoff.md": LOOSE } });
      const json = JSON.parse((await exec(["edit", "12", "--next", "Correr los tests", "--json", "--apply"], p)).out);
      expect(json.notice).toContain("«Una nota suelta.»");
      expect(json.notices).toHaveLength(1);
    });

    test("editar una pausada no lo menciona; un plan válido tampoco", async () => {
      const p = project({ folders: ["gersom"], ...FULL, contents: { ...FULL.contents, "handoff.md": LOOSE } });
      expect((await exec(["edit", "8", "--next", "Otro", "--apply"], p)).out).not.toContain("Aviso");
      const valid = project({ folders: ["gersom"], ...FULL });
      expect((await exec(["edit", "12", "--next", "Otro", "--apply"], valid)).out).not.toContain("Aviso");
    });
  });

  test("en curso: una línea con `#` o con checkbox se rechaza (crearía subsecciones o pasos del plan)", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const before = snapshot(p.root);
    const run = (flag: string, value: string) => exec(["edit", "12", `${flag}=${value}`, "--apply"], p);
    for (const [flag, value] of [
      ["--description", "Texto\n## Otra sección"],
      ["--missing", "- [ ] Paso nuevo"],
      ["--decisions", "uno\n  - [x] hecho"],
      ["--next", "* [ ] algo"],
      ["--next", "# Título"],
    ]) {
      const { code, err } = await run(flag, value);
      expect(code).toBe(1);
      expect(err).toContain("crearía una subsección o un paso del plan");
    }
    expect(snapshot(p.root)).toEqual(before);
    // Una viñeta común o un `#` en medio de la línea son texto normal.
    expect((await run("--missing", "- uno\n- dos con #3")).code).toBe(0);
    expect(handoff(p)).toContain("### Qué falta\n\n- uno\n- dos con #3\n");
  });

  test("en curso sin descripción ni Detalles: se agregan tras la línea de la tarea", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_BARE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH } });
    await exec(["edit", "12", "--description", "Ahora sí", "--details", "algo más", "--apply"], p);
    expect(handoff(p)).toContain("Tarea 12 — Solo el título\n\nAhora sí\n\n- **Detalles:** algo más\n\n### Plan");
  });

  test("en curso sin la subsección pedida: se niega", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_BARE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH } });
    const before = snapshot(p.root);
    expect((await exec(["edit", "12", "--next", "x", "--apply"], p)).err).toContain("no tiene la subsección «Próximo paso concreto»");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("pausada: título, descripción, Detalles (se agrega) y las tres partes del avance", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const { code } = await exec(
      ["edit", "8", "--title", "Migrar los docs", "--description", "Pasar todo", "--details", "ver la T-3", "--missing", "Solo el paso 2", "--decisions", "Ninguna por ahora", "--next", "Revisar links", "--apply"],
      p,
    );
    expect(code).toBe(0);
    expect(handoff(p)).toBe(
      HANDOFF_FULL.replace("### Tarea 8 — Migrar la documentación vieja", "### Tarea 8 — Migrar los docs")
        .replace("- **Descripción:** pasar los docs.\n", "- **Descripción:** Pasar todo\n- **Detalles:** ver la T-3\n")
        .replace("- **Qué falta:** revisar `setup.md`.", "- **Qué falta:** Solo el paso 2")
        .replace("- **Decisiones a medio camino:** Ninguna.", "- **Decisiones a medio camino:** Ninguna por ahora")
        .replace("- **Próximo paso concreto:** Paso 2.", "- **Próximo paso concreto:** Revisar links"),
    );
    expect(JSON.parse((await exec(["status", "--json"], p)).out).paused.map((t: { number: number }) => t.number)).toEqual([8, 30]);
  });

  test("pausada sin descripción: la agrega tras el header; sin el campo del avance, se niega", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    await exec(["edit", "30", "--description", "Una pausada sin extras", "--apply"], p);
    expect(handoff(p)).toContain("### Tarea 30 — Sin extras\n\n- **Descripción:** Una pausada sin extras\n\n- **Qué falta:** nada.");
    const before = snapshot(p.root);
    expect((await exec(["edit", "30", "--next", "x", "--apply"], p)).err).toContain("no tiene el campo «Próximo paso concreto»");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--blocker y --trigger se rechazan en una tarea en curso o pausada", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const before = snapshot(p.root);
    for (const n of ["12", "8"]) {
      expect((await exec(["edit", n, "--blocker", "x", "--apply"], p)).err).toContain("una tarea en curso o pausada no tiene ese campo");
      expect((await exec(["edit", n, "--trigger", "x", "--apply"], p)).err).toContain("--trigger: una tarea en curso o pausada no tiene ese campo");
    }
    expect(snapshot(p.root)).toEqual(before);
  });

  test("pausada: una línea con `#` o con checkbox se rechaza en cualquier campo de texto", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const before = snapshot(p.root);
    const run = (flag: string, value: string) => exec(["edit", "8", `${flag}=${value}`, "--apply"], p);
    for (const [flag, value] of [
      ["--description", "Texto\n## Otra sección"],
      ["--details", "- [ ] Paso nuevo"],
      ["--missing", "  - [x] hecho"],
      ["--decisions", "uno\n# Título"],
      ["--next", "* [ ] algo"],
    ]) {
      const { code, err } = await run(flag, value);
      expect(code).toBe(1);
      expect(err).toContain("crearía una subsección o un paso del plan");
    }
    expect(snapshot(p.root)).toEqual(before);
    // Una viñeta común o un `#` en medio de la línea son texto normal.
    expect((await run("--missing", "- uno\n- dos con #3")).code).toBe(0);
  });

  test("un handoff con CRLF sigue con CRLF", async () => {
    const p = project({ folders: ["gersom"], contents: { ...FULL.contents, "handoff.md": crlf(HANDOFF_FULL) } });
    await exec(["edit", "12", "--description", "Otra\nde dos líneas", "--next", "Paso 3", "--apply"], p);
    const text = handoff(p);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("Otra\r\nde dos líneas\r\n\r\n- **Detalles:**");
    expect(text).toContain("### Próximo paso concreto\r\n\r\nPaso 3\r\n");
  });
});

describe("edit — team-backlog.md", () => {
  test("por título (o parte única): reemplaza un campo y agrega Detalles antes de `Agregada`", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const { code, out } = await exec(["edit", "onboarding", "--description", "ajustar todos los textos", "--details", "ver el rediseño", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("Tarea «Revisar el copy del onboarding» editada (--description, --details): libre (team-backlog), docs/agents/team-backlog.md.");
    expect(team(p)).toBe(
      TEAM_TWO.replace("- **Descripción:** ajustar textos", "- **Descripción:** ajustar todos los textos").replace("- **Bloqueos:** Ninguno.\n- **Agregada:** 2026-10-02 por gersom", "- **Bloqueos:** Ninguno.\n- **Detalles:** ver el rediseño\n- **Agregada:** 2026-10-02 por gersom"),
    );
  });

  test("título: debe seguir siendo único (ignorando la propia tarea)", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const before = snapshot(p.root);
    const dup = await exec(["edit", "Migrar el CI", "--title", "REVISAR EL COPY DEL ONBOARDING", "--apply"], p);
    expect(dup.code).toBe(1);
    expect(dup.err).toContain("debe ser único");
    expect(snapshot(p.root)).toEqual(before);

    expect((await exec(["edit", "Migrar el CI", "--title", "migrar el ci", "--apply"], p)).code).toBe(0);
    expect(team(p)).toContain("### migrar el ci\n\n- **Descripción:** pasar a Actions");
  });

  test("bloqueada sigue bloqueada: --blocker conserva el tag; uno libre no se puede bloquear; --trigger se rechaza", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    await exec(["edit", "proveedor", "--blocker", "esperar al nuevo contrato", "--title", "Cambiar de host", "--apply"], p);
    expect(team(p)).toContain("### Cambiar de host\n\n- **Descripción:** otro proveedor\n- **Bloqueos:** `[postergada]` esperar al nuevo contrato\n");

    const before = snapshot(p.root);
    const block = await exec(["edit", "Migrar el CI", "--blocker", "[dependencia] algo", "--apply"], p);
    expect(block.err).toContain("para el team-backlog.md no hay comando");
    expect((await exec(["edit", "Cambiar de host", "--blocker", "Ninguno.", "--apply"], p)).err).toContain("desbloquearía");
    const trigger = await exec(["edit", "Migrar el CI", "--trigger", "x", "--apply"], p);
    expect(trigger.err).toContain("no llevan Disparador");
    expect((await exec(["edit", "Migrar el CI", "--missing", "x", "--apply"], p)).code).toBe(1);
    // Un corchete inicial que no es de bloqueo se leería como tag de la tarea, esté libre o bloqueada.
    for (const title of ["Migrar el CI", "Cambiar de host"]) {
      expect((await exec(["edit", title, "--blocker=[algo] x", "--apply"], p)).err).toContain("se leería como tag de la tarea");
    }
    expect(snapshot(p.root)).toEqual(before);
  });

  test("título ambiguo o inexistente, repo plano, y sin --apply no escribe", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const before = snapshot(p.root);
    expect((await exec(["edit", "e", "--title", "x", "--apply"], p)).err).toContain("coincide con");
    expect((await exec(["edit", "nada de nada", "--title", "x", "--apply"], p)).err).toContain("Ninguna tarea del team-backlog.md");
    expect(snapshot(p.root)).toEqual(before);
    const dry = project({ folders: ["gersom"], ...FULL });
    const snap = snapshot(dry.root);
    const { out } = await exec(["edit", "Migrar el CI", "--details", "x"], dry);
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(dry.root)).toEqual(snap);

    const flat = project({ flat: true, contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH } });
    expect((await exec(["edit", "algo", "--title", "x", "--apply"], flat)).err).toContain("el repo es plano");
  });

  test("bloqueos con historial `[Resuelto ...]`: libre y bloqueada con tag explícito lo conservan", async () => {
    const history = "`[Resuelto el 2026-09-24]` — era `[dependencia]` la T-3.";
    const raw = TEAM_TWO.replace("- **Bloqueos:** Ninguno.\n- **Detalles:**", `- **Bloqueos:** ${history}\n- **Detalles:**`).replace(
      "`[postergada]` esperar al contrato.",
      `\`[postergada]\` esperar al contrato. ${history}`,
    );
    const p = project({ folders: ["gersom"], ...FULL, teamBacklogText: raw });
    await exec(["edit", "Migrar el CI", "--blocker", "esperar a ana", "--apply"], p);
    expect(team(p)).toContain(`- **Bloqueos:** esperar a ana ${history}\n`);
    await exec(["edit", "Migrar el CI", "--blocker", "Ninguno.", "--apply"], p);
    expect(team(p)).toContain(`- **Bloqueos:** Ninguno. ${history}\n`);

    await exec(["edit", "proveedor", "--blocker", "`[dependencia]` la T-9", "--apply"], p);
    expect(team(p)).toContain(`- **Bloqueos:** \`[dependencia]\` la T-9 ${history}\n`);
  });

  test("un valor que empieza con un tag entre corchetes se rechaza", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const before = snapshot(p.root);
    for (const flag of ["--description", "--decisions", "--details"]) {
      const { code, err } = await exec(["edit", "Migrar el CI", flag, "[dependencia] algo", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("tag de bloqueo");
    }
    expect((await exec(["edit", "Migrar el CI", "--details", "`[postergada]` algo", "--apply"], p)).code).toBe(1);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("cambiar el título avisa de las referencias por título; sin cambio de título, no", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const { code, out } = await exec(["edit", "Migrar el CI", "--title", "Migrar CI", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("Aviso: el título cambió de «Migrar el CI» a «Migrar CI»: revisa las referencias por título");
    const pending = JSON.parse((await exec(["edit", "Migrar CI", "--title", "Migrar CI 2", "--json"], p)).out);
    expect(pending.notice).toContain("referencias por título");
    expect((await exec(["edit", "Migrar CI", "--details", "x", "--apply"], p)).out).not.toContain("Aviso");
  });

  test("sin cambios (mismo valor): lo dice en vez de no imprimir nada", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const before = snapshot(p.root);
    const { code, out } = await exec(["edit", "Migrar el CI", "--description", "pasar a Actions", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe("Sin cambios: la Tarea «Migrar el CI» ya tenía esos valores.");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--json de una tarea del equipo", async () => {
    const p = project({ folders: ["gersom"], ...FULL });
    const out = JSON.parse((await exec(["edit", "Migrar el CI", "--details", "d", "--json", "--apply"], p)).out);
    expect(out).toMatchObject({ command: "edit", applied: true, place: "team-free", task: { number: null, title: "Migrar el CI" }, fields: ["details"] });
  });
});
