// El campo opcional `Etiquetas` (`Tags` en inglés): `add`, `edit` en cada estado, y que viaje intacto
// por `start`, `pause`, `resume`, `close`, `block`, `unblock` y los `group-*`. Contra proyectos
// temporales: nunca se tocan los docs reales.

import { afterAll, describe, expect, test } from "bun:test";
import { parseBacklog } from "../../../_shared/parse/backlog.ts";
import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { parseHistory } from "../../../_shared/parse/history.ts";
import { BACKLOG_EN, HANDOFF_CURRENT, HANDOFF_EMPTY, HANDOFF_IDLE_EN, HISTORY_EN } from "../fixtures.ts";
import { exec, makeProject, type Project, readIn, snapshot } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

const BACKLOG = `# Backlog

**Próximo número de tarea:** 30

---

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 1 — Con etiquetas

- **Descripción:** d1
- **Bloqueos:** Ninguno.
- **Disparador:** cuando el operador pregunte por tareas pendientes.
- **Etiquetas:** empresa1 trabajo
- **Agregada:** 2026-10-01.

### Tarea 2 — Sin etiquetas

- **Descripción:** d2
- **Bloqueos:** Ninguno.
- **Disparador:** cuando el operador pregunte por tareas pendientes.
- **Agregada:** 2026-10-01.

### Grupo — Documentos (Tareas 14, 15)

- **Resumen:** los documentos.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea 6 — Bloqueada con etiquetas

- **Descripción:** d6
- **Bloqueos:** \`[dependencia]\` depende de la Tarea 11.
- **Etiquetas:** pendiente
- **Agregada:** 2026-10-01.

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

### Grupo — Documentos

#### Tarea 14 — Costos

- **Descripción:** costos
- **Etiquetas:** docsUno finanzas

#### Tarea 15 — Límites

- **Descripción:** límites
- **Etiquetas:** docsDos
`;

const TEAM = `# Backlog del equipo

<!-- agent-context-skill:section=free -->
## Tareas libres

### Con etiquetas del equipo

- **Descripción:** algo
- **Etiquetas:** equipo viejo
- **Agregada:** 2026-10-01 por ana

### Sin etiquetas del equipo

- **Descripción:** otra cosa
- **Agregada:** 2026-10-01 por ana

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

Ninguna.
`;

// Una tarea pausada con etiquetas junto a la tarea en curso (sin ellas).
const HANDOFF_PAUSED = HANDOFF_CURRENT.replace(
  "### Tarea 9 — Otra pausada\n\n",
  "### Tarea 9 — Otra pausada\n\n- **Descripción:** pausada con etiquetas\n- **Etiquetas:** pausa uno\n",
);

const setup = (extra: Parameters<typeof makeProject>[0] = {}) =>
  project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG, "history.md": "# History\n" }, teamBacklogText: TEAM, ...extra });
const backlog = (p: Project) => readIn(p, "gersom", "backlog.md");
const handoff = (p: Project) => readIn(p, "gersom", "handoff.md");
const history = (p: Project) => readIn(p, "gersom", "history.md");
const count = (text: string, part: string) => text.split(part).length - 1;
/** Las etiquetas de una tarea del backlog según el parser. */
const labelsOf = (text: string, number: number) => {
  const { free, blocked, grouped } = parseBacklog(text);
  const task = [...free.tasks, ...blocked, ...grouped.flatMap((group) => group.tasks)].find((candidate) => candidate.number === number)!;
  return task.fields.find((field) => /^(etiquetas|tags)$/i.test(field.label))?.value ?? null;
};

describe("add --labels", () => {
  test("las normaliza (sin #, sin duplicados, orden conservado) y las escribe antes de Agregada", async () => {
    const p = setup();
    const { code, out } = await exec(["add", "--title", "Nueva", "--description", "Algo", "--labels", "#Trabajo, empresa1  trabajo,ideasBrillantes", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("Tarea 30 agregada");
    expect(backlog(p)).toContain(
      "### Tarea 30 — Nueva\n\n- **Descripción:** Algo\n- **Decisiones/temas a definir antes de empezar:** Ninguno.\n- **Bloqueos:** Ninguno.\n- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Etiquetas:** Trabajo empresa1 ideasBrillantes\n- **Agregada:** 2026-10-07.",
    );
    expect(labelsOf(backlog(p), 30)).toBe("Trabajo empresa1 ideasBrillantes");
  });

  test("sin --labels el campo se omite; con un valor vacío o solo separadores también", async () => {
    const p = setup();
    expect((await exec(["add", "--title", "Una", "--description", "x", "--apply"], p)).code).toBe(0);
    expect((await exec(["add", "--title", "Dos", "--description", "x", "--labels", "", "--apply"], p)).code).toBe(0);
    expect((await exec(["add", "--title", "Tres", "--description", "x", "--labels", " , ", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 30)).toBeNull();
    expect(labelsOf(backlog(p), 31)).toBeNull();
    expect(labelsOf(backlog(p), 32)).toBeNull();
    expect(count(backlog(p), "Etiquetas")).toBe(4); // solo las del fixture
  });

  test("`--labels -` lee la entrada estándar", async () => {
    const p = setup();
    expect((await exec(["add", "--title", "Nueva", "--description", "x", "--labels", "-", "--apply"], p, { stdin: "uno\ndos, #tres\n" })).code).toBe(0);
    expect(labelsOf(backlog(p), 30)).toBe("uno dos tres");
  });

  test("una tarea bloqueada también las lleva", async () => {
    const p = setup();
    expect((await exec(["add", "--title", "Nueva", "--description", "x", "--blocker", "`[dependencia]` espera a la 11", "--labels", "espera", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 30)).toBe("espera");
    expect(parseBacklog(backlog(p)).blocked.map((t) => t.number)).toContain(30);
  });

  test("--team: las escribe en el team-backlog.md, sin número, antes de Agregada", async () => {
    const p = setup();
    const { code, out } = await exec(["add", "--team", "--title", "Del equipo", "--description", "Algo", "--labels", "#equipo Ideas", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("agregada");
    expect(readIn(p, "team-backlog.md")).toContain(
      "### Del equipo\n\n- **Descripción:** Algo\n- **Decisiones/temas a definir antes de empezar:** Ninguno.\n- **Bloqueos:** Ninguno.\n- **Etiquetas:** equipo Ideas\n- **Agregada:** 2026-10-07 por gersom",
    );
  });

  test("--team sin etiquetas omite el campo", async () => {
    const p = setup();
    expect((await exec(["add", "--team", "--title", "Del equipo", "--description", "Algo", "--apply"], p)).code).toBe(0);
    expect(count(readIn(p, "team-backlog.md"), "Etiquetas")).toBe(1); // la del fixture
  });

  test("una etiqueta inválida es un error de uso (código 2) con el motivo y la etiqueta; no escribe nada", async () => {
    const p = setup();
    const before = snapshot(p.root);
    for (const [value, shown] of [["café", "café"], ["a-b", "a-b"], ["#", "#"], ["ok #a#b", "#a#b"], ["x_y", "x_y"], ["ñ", "ñ"], ["a.b", "a.b"]] as const) {
      const { code, err } = await exec(["add", "--title", "Nueva", "--description", "x", "--labels", value, "--apply"], p);
      expect(code).toBe(2);
      expect(err).toContain("--labels");
      expect(err).toContain(`«${shown}»`);
      expect(err).toContain("No se escribió nada");
    }
    expect((await exec(["add", "--team", "--title", "Nueva", "--description", "x", "--labels", "mal!", "--apply"], p)).code).toBe(2);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("en un proyecto en inglés el campo se llama Tags", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
    expect((await exec(["add", "--title", "New", "--description", "Something", "--labels", "work #Home", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toContain("- **Tags:** work Home\n- **Added:**");
    expect(backlog(p)).not.toContain("Etiquetas");
  });

  test("--team en inglés usa la etiqueta del idioma del team-backlog.md", async () => {
    const teamEn = "# Team backlog\n\n<!-- agent-context-skill:section=free -->\n## Free tasks\n\n### Existing\n\n- **Description:** x\n- **Blockers:** None.\n- **Added:** 2026-10-01 by ana\n\n<!-- agent-context-skill:section=blocked -->\n## Blocked / postponed tasks\n\nNone.\n";
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN }, teamBacklogText: teamEn });
    expect((await exec(["add", "--team", "--title", "New", "--description", "Something", "--labels", "work", "--apply"], p)).code).toBe(0);
    expect(readIn(p, "team-backlog.md")).toContain("- **Tags:** work\n- **Added:** 2026-10-07 by gersom");
  });
});

describe("edit --labels", () => {
  test("libre con etiquetas: las reemplaza todas (normalizadas) y no toca lo demás", async () => {
    const p = setup();
    const { code, out } = await exec(["edit", "1", "--labels", "#nueva, otra  Nueva", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("editada (--labels)");
    expect(backlog(p)).toBe(BACKLOG.replace("- **Etiquetas:** empresa1 trabajo", "- **Etiquetas:** nueva otra"));
  });

  test("libre sin etiquetas: agrega el campo antes de Agregada, con la etiqueta de su idioma", async () => {
    const p = setup();
    expect((await exec(["edit", "2", "--labels", "uno dos", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toContain("- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Etiquetas:** uno dos\n- **Agregada:** 2026-10-01.\n\n### Grupo");
  });

  test("con valor vacío quita el campo sin dejar huecos; repetirlo no cambia nada", async () => {
    const p = setup();
    expect((await exec(["edit", "1", "--labels", "", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toBe(BACKLOG.replace("- **Etiquetas:** empresa1 trabajo\n", ""));
    const again = await exec(["edit", "1", "--labels", "", "--apply"], p);
    expect(again.code).toBe(0);
    expect(again.out).toContain("Sin cambios");
    expect(backlog(p)).toBe(BACKLOG.replace("- **Etiquetas:** empresa1 trabajo\n", ""));
  });

  test("quitar sobre una tarea que no las tiene no cambia nada", async () => {
    const p = setup();
    const before = snapshot(p.root);
    const { code, out } = await exec(["edit", "2", "--labels", "", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("Sin cambios");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("también quita un campo que es lo último del bloque", async () => {
    const text = BACKLOG.replace("- **Etiquetas:** empresa1 trabajo\n- **Agregada:** 2026-10-01.", "- **Agregada:** 2026-10-01.\n- **Etiquetas:** empresa1 trabajo");
    const p = setup({ contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": text, "history.md": "# History\n" } });
    expect((await exec(["edit", "1", "--labels", "", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toBe(BACKLOG.replace("- **Etiquetas:** empresa1 trabajo\n", ""));
  });

  test("bloqueada: sigue bloqueada (el estado no cambia)", async () => {
    const p = setup();
    expect((await exec(["edit", "6", "--labels", "a b", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toBe(BACKLOG.replace("- **Etiquetas:** pendiente", "- **Etiquetas:** a b"));
    expect(parseBacklog(backlog(p)).blocked.map((t) => t.number)).toEqual([6]);
  });

  test("agrupada: cambia el campo dentro del grupo", async () => {
    const p = setup();
    expect((await exec(["edit", "14", "--labels", "#nueva", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toBe(BACKLOG.replace("- **Etiquetas:** docsUno finanzas", "- **Etiquetas:** nueva"));
    expect((await exec(["edit", "15", "--labels", "", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 15)).toBeNull();
    expect(labelsOf(backlog(p), 14)).toBe("nueva");
  });

  test("team-backlog: reemplaza, agrega y quita", async () => {
    const p = setup();
    expect((await exec(["edit", "Con etiquetas", "--labels", "nuevo", "--apply"], p)).code).toBe(0);
    expect((await exec(["edit", "Sin etiquetas", "--labels", "#a, b", "--apply"], p)).code).toBe(0);
    expect(readIn(p, "team-backlog.md")).toBe(
      TEAM.replace("- **Etiquetas:** equipo viejo", "- **Etiquetas:** nuevo").replace("- **Descripción:** otra cosa\n", "- **Descripción:** otra cosa\n- **Etiquetas:** a b\n"),
    );
    expect((await exec(["edit", "Con etiquetas", "--labels", "", "--apply"], p)).code).toBe(0);
    expect(readIn(p, "team-backlog.md")).not.toContain("nuevo");
  });

  test("en curso: va como campo extra tras la descripción, no como parte del plan", async () => {
    const p = setup({ contents: { "handoff.md": HANDOFF_PAUSED, "backlog.md": BACKLOG, "history.md": "# History\n" } });
    expect((await exec(["edit", "12", "--labels", "#uno dos", "--apply"], p)).code).toBe(0);
    const text = handoff(p);
    expect(text).toContain("Descripción de la tarea.\n\n- **Etiquetas:** uno dos\n\n### Plan");
    const parsed = parseHandoff(text);
    expect(parsed.inProgress.subsections.map((s) => s.title)).toEqual(["Plan", "Qué falta", "Decisiones a medio camino", "Cosa que hacer al retomar"]);
    expect(parsed.inProgress.steps.length).toBe(4);
    // reemplazar y quitar
    expect((await exec(["edit", "12", "--labels", "otra", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toBe(text.replace("uno dos", "otra"));
    expect((await exec(["edit", "12", "--labels", "", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toBe(HANDOFF_PAUSED);
  });

  test("en curso: junto con --details y --description agrega cada campo una vez", async () => {
    const p = setup({ contents: { "handoff.md": HANDOFF_PAUSED, "backlog.md": BACKLOG, "history.md": "# History\n" } });
    expect((await exec(["edit", "12", "--description", "Nueva.", "--labels", "x", "--details", "Más.", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain("Tarea 12 — Implementar el parser\n\nNueva.\n\n- **Etiquetas:** x\n- **Detalles:** Más.\n\n### Plan");
  });

  test("pausada: la agrega tras los campos que preceden al avance, la reemplaza y la quita", async () => {
    const p = setup({ contents: { "handoff.md": HANDOFF_PAUSED, "backlog.md": BACKLOG, "history.md": "# History\n" } });
    expect((await exec(["edit", "8", "--labels", "migracion", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain("### Tarea 8 — Migrar la documentación vieja\n\n- **Etiquetas:** migracion\n\n- **Plan:**");
    expect((await exec(["edit", "9", "--labels", "otra", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain("- **Descripción:** pausada con etiquetas\n- **Etiquetas:** otra\n- **Qué falta:** nada.");
    expect((await exec(["edit", "9", "--labels", "", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).not.toContain("otra");
    expect(parseHandoff(handoff(p)).paused.map((t) => t.number)).toEqual([8, 9]);
  });

  test("una tarea de history.md no se edita", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
    const { code, err } = await exec(["edit", "5", "--labels", "x", "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("history.md");
  });

  test("etiqueta inválida: error de uso (código 2) y no escribe nada", async () => {
    const p = setup();
    const before = snapshot(p.root);
    const { code, err } = await exec(["edit", "1", "--labels", "bien mál", "--apply"], p);
    expect(code).toBe(2);
    expect(err).toContain("«mál»");
    expect(snapshot(p.root)).toEqual(before);
    expect((await exec(["edit", "Con etiquetas", "--labels", "a b!", "--apply"], p)).code).toBe(2);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("sin ningún flag, el aviso de uso nombra --labels", async () => {
    const { code, err } = await exec(["edit", "1"], setup());
    expect(code).toBe(2);
    expect(err).toContain("--labels");
  });

  test("en inglés: agrega el campo como Tags y respeta el que ya hay", async () => {
    const backlogEn = BACKLOG_EN.replace("- **Added:** 2026-10-01.", "- **Tags:** home\n- **Added:** 2026-10-01.");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
    expect((await exec(["edit", "4", "--labels", "home", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toBe(backlogEn);
    expect((await exec(["edit", "4", "--labels", "#work, Home", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toBe(backlogEn.replace("- **Tags:** home", "- **Tags:** work Home"));
    expect((await exec(["edit", "4", "--labels", "", "--apply"], p)).code).toBe(0);
    expect(backlog(p)).toBe(BACKLOG_EN);
  });

  test("--json informa el campo cambiado", async () => {
    const p = setup();
    const { code, out } = await exec(["edit", "1", "--labels", "x", "--json", "--apply"], p);
    expect(code).toBe(0);
    expect(JSON.parse(out).fields).toEqual(["labels"]);
  });
});

describe("las etiquetas viajan con la tarea", () => {
  test("start → pause → resume → close --done: una sola vez en cada paso y en history.md", async () => {
    const p = setup();
    expect((await exec(["start", "1", "--apply"], p)).code).toBe(0);
    expect(count(handoff(p), "- **Etiquetas:** empresa1 trabajo")).toBe(1);
    expect(handoff(p)).toContain("\n\nd1\n\n- **Etiquetas:** empresa1 trabajo\n\n### Qué falta");
    expect(backlog(p)).not.toContain("Con etiquetas");

    expect((await exec(["pause", "--reason", "esperar", "--waiting-for", "revisión", "--apply"], p)).code).toBe(0);
    const paused = parseHandoff(handoff(p)).paused.find((task) => task.number === 1)!;
    expect(paused.fields.filter((field) => /etiquetas/i.test(field.label)).map((field) => field.value)).toEqual(["empresa1 trabajo"]);
    expect(count(handoff(p), "Etiquetas")).toBe(1);

    expect((await exec(["resume", "1", "--apply"], p)).code).toBe(0);
    expect(count(handoff(p), "- **Etiquetas:** empresa1 trabajo")).toBe(1);
    expect(parseHandoff(handoff(p)).inProgress.task?.number).toBe(1);

    const closed = await exec(["close", "--done", "--summary", "Listo.", "--apply"], p);
    expect(closed.code).toBe(0);
    expect(history(p)).toContain("## 2026-10-07 — ✅ Tarea 1 — Con etiquetas\n\n- **Etiquetas:** empresa1 trabajo\n- Listo.\n");
    expect(handoff(p)).not.toContain("Etiquetas");
    const [entry] = parseHistory(history(p)).entries;
    expect(entry).toMatchObject({ number: 1, status: "done", title: "Con etiquetas" });
  });

  test("close sobre una pausada y sobre una sin empezar (--discarded) también las conservan", async () => {
    const p = setup();
    expect((await exec(["start", "1", "--apply"], p)).code).toBe(0);
    expect((await exec(["pause", "--reason", "x", "--waiting-for", "y", "--apply"], p)).code).toBe(0);
    expect((await exec(["close", "1", "--done", "--summary", "Hecha.", "--commits", "abc1234", "--apply"], p)).code).toBe(0);
    expect(history(p)).toContain("## 2026-10-07 — ✅ Tarea 1 — Con etiquetas\n\n- **Etiquetas:** empresa1 trabajo\n- Hecha.\n- Commit: abc1234.\n");

    expect((await exec(["close", "6", "--discarded", "--reason", "Ya no.", "--apply"], p)).code).toBe(0);
    expect(history(p)).toContain("— ❌ Tarea 6 — Bloqueada con etiquetas\n\n- **Etiquetas:** pendiente\n- Ya no.\n");
  });

  test("una tarea sin etiquetas cierra sin la línea", async () => {
    const p = setup();
    expect((await exec(["start", "2", "--apply"], p)).code).toBe(0);
    expect((await exec(["close", "--done", "--summary", "Listo.", "--apply"], p)).code).toBe(0);
    expect(history(p)).toContain("— ✅ Tarea 2 — Sin etiquetas\n\n- Listo.\n");
    expect(history(p)).not.toContain("Etiquetas");
  });

  test("la tarea del team-backlog con etiquetas: start --team las lleva junto a Origen", async () => {
    const p = setup();
    expect((await exec(["start", "--team", "Con etiquetas del equipo", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain("- **Origen:** team-backlog\n- **Etiquetas:** equipo viejo\n");
    expect((await exec(["close", "--done", "--summary", "Listo.", "--apply"], p)).code).toBe(0);
    expect(history(p)).toContain("\n\n- **Origen:** team-backlog\n- **Etiquetas:** equipo viejo\n- Listo.\n");
  });

  test("en inglés: Tags viaja y llega a history.md con su etiqueta", async () => {
    const backlogEn = BACKLOG_EN.replace("- **Added:** 2026-10-01.", "- **Tags:** home work\n- **Added:** 2026-10-01.");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": backlogEn, "history.md": HISTORY_EN } });
    expect((await exec(["start", "4", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain("- **Tags:** home work\n");
    expect((await exec(["pause", "--reason", "wait", "--waiting-for", "review", "--apply"], p)).code).toBe(0);
    expect((await exec(["resume", "4", "--apply"], p)).code).toBe(0);
    expect(count(handoff(p), "- **Tags:** home work")).toBe(1);
    expect((await exec(["close", "--done", "--summary", "Done.", "--apply"], p)).code).toBe(0);
    expect(history(p)).toContain("— ✅ Task 4 — Translate the glossary\n\n- **Tags:** home work\n- Done.\n");
  });

  test("block y unblock conservan el campo (y el estado cambia como siempre)", async () => {
    const p = setup();
    expect((await exec(["block", "1", "--tag", "dependency", "--reason", "espera a la Tarea 11", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 1)).toBe("empresa1 trabajo");
    expect(parseBacklog(backlog(p)).blocked.map((t) => t.number)).toContain(1);
    expect(count(backlog(p), "- **Etiquetas:** empresa1 trabajo")).toBe(1);

    expect((await exec(["unblock", "6", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 6)).toBe("pendiente");
    expect(parseBacklog(backlog(p)).free.tasks.map((t) => t.number)).toContain(6);
    expect(count(backlog(p), "- **Etiquetas:** pendiente")).toBe(1);
  });
});

describe("los grupos no llevan etiquetas; sus tareas sí", () => {
  test("group-create: las tareas conservan sus etiquetas y el grupo no tiene el campo", async () => {
    const p = setup();
    expect((await exec(["group-create", "--tasks", "1,2", "--title", "Otros", "--summary", "Varias.", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 1)).toBe("empresa1 trabajo");
    expect(labelsOf(backlog(p), 2)).toBeNull();
    expect(parseBacklog(backlog(p)).grouped.map((group) => group.title)).toContain("Otros");
    expect(backlog(p)).toMatch(/### Grupo — Otros \(Tareas 1, 2\)\n\n- \*\*Resumen:\*\* Varias\.\n/);
    expect(count(backlog(p), "Etiquetas")).toBe(4);
  });

  test("group-add → group-eject → group-dissolve conservan las de cada tarea", async () => {
    const p = setup();
    expect((await exec(["group-add", "14", "1", "2", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 1)).toBe("empresa1 trabajo");
    expect(labelsOf(backlog(p), 2)).toBeNull();
    expect(labelsOf(backlog(p), 14)).toBe("docsUno finanzas");
    expect(parseBacklog(backlog(p)).grouped[0].tasks.map((t) => t.number)).toEqual([14, 15, 1, 2]);

    expect((await exec(["group-eject", "1", "--apply"], p)).code).toBe(0);
    expect(labelsOf(backlog(p), 1)).toBe("empresa1 trabajo");
    expect(parseBacklog(backlog(p)).free.tasks.map((t) => t.number)).toContain(1);

    expect((await exec(["group-dissolve", "14", "--apply"], p)).code).toBe(0);
    expect(parseBacklog(backlog(p)).grouped).toEqual([]);
    for (const [number, labels] of [[1, "empresa1 trabajo"], [2, null], [6, "pendiente"], [14, "docsUno finanzas"], [15, "docsDos"]] as const) {
      expect(labelsOf(backlog(p), number)).toBe(labels);
    }
    expect(count(backlog(p), "Etiquetas")).toBe(4);
    expect(count(backlog(p), "Etiquetas:** docsUno finanzas")).toBe(1);
  });

  test("group-eject con el grupo de dos tareas: las dos vuelven a «libres» con sus etiquetas", async () => {
    const p = setup();
    expect((await exec(["group-eject", "14", "--apply"], p)).code).toBe(0);
    expect(parseBacklog(backlog(p)).grouped).toEqual([]);
    expect(labelsOf(backlog(p), 14)).toBe("docsUno finanzas");
    expect(labelsOf(backlog(p), 15)).toBe("docsDos");
    expect(count(backlog(p), "Etiquetas")).toBe(4);
  });

  test("group-edit no agrega etiquetas al grupo", async () => {
    const p = setup();
    expect((await exec(["group-edit", "14", "--title", "Nuevo título", "--apply"], p)).code).toBe(0);
    expect(count(backlog(p), "Etiquetas")).toBe(4);
    expect(labelsOf(backlog(p), 15)).toBe("docsDos");
  });
});
