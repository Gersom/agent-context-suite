// `close`: cierra una tarea (hecha o descartada) con las Reglas 6 a 9. Contra proyectos temporales:
// nunca se tocan los docs reales.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { APPLY_NOTICE } from "../../src/cli/dispatch.ts";
import {
  BACKLOG_EN,
  BACKLOG_ONE,
  BACKLOG_RICH,
  HANDOFF_CURRENT,
  HANDOFF_EMPTY,
  HANDOFF_IDLE,
  HANDOFF_IDLE_EN,
  HISTORY_EN,
  HISTORY_RICH,
  TEAM_RICH,
} from "../fixtures.ts";
import { exec, makeProject, type Project, readIn, snapshot } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

const IDLE = { contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };
const handoff = (p: Project) => readIn(p, "gersom", "handoff.md");
const backlog = (p: Project) => readIn(p, "gersom", "backlog.md");
const history = (p: Project) => readIn(p, "gersom", "history.md");
const DONE = ["close", "--done", "--summary", "Se hizo lo pedido."];

/** Proyecto con una tarea libre ya empezada (con un plan de un paso, ya marcado). */
async function started(task = "1"): Promise<Project> {
  const p = project({ folders: ["gersom"], ...IDLE });
  await exec(["start", task, "--plan", "-", "--apply"], p, { stdin: "Paso 1 — Escribir" });
  await exec(["step", "1", "--apply"], p);
  return p;
}

describe("close --done", () => {
  test("sin --apply muestra el diff y no escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, out } = await exec(DONE, p);
    expect(code).toBe(0);
    expect(out).toContain("+## 2026-10-07 — ✅ Tarea 1 — Probar el flujo completo");
    expect(out).toContain("+- Se hizo lo pedido.");
    expect(out).toContain("+Sin tarea en curso");
    expect(out).toContain(APPLY_NOTICE);
    expect(out).not.toContain("**Tareas resueltas:**");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("escribe la entrada arriba de history.md, deja «Sin tarea en curso» y muestra el reporte de cierre", async () => {
    const p = await started();
    const { code, out } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe(
      [
        "Tarea 1 cerrada (hecha): entrada en docs/agents/gersom/history.md, «Sin tarea en curso» en docs/agents/gersom/handoff.md, backlog actualizado en docs/agents/gersom/backlog.md.",
        "",
        "**Tareas resueltas:**",
        "- Tarea 1 — Probar el flujo completo",
        "",
        "**Tareas desbloqueadas:**",
        "- Tarea 6 — Publicar el sitio",
        "- Tarea 16 — Revisar la licencia",
      ].join("\n"),
    );
    expect(history(p)).toBe(HISTORY_RICH.replace("## 2026-10-07 — ✅ Tarea 11", "## 2026-10-07 — ✅ Tarea 1 — Probar el flujo completo\n\n- Se hizo lo pedido.\n\n## 2026-10-07 — ✅ Tarea 11"));
    expect(handoff(p)).toContain("<!-- agent-context-skill:section=in-progress -->\n## Tarea en progreso\n\nSin tarea en curso\n\n<!-- agent-context-skill:section=paused -->");
    const status = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(status.current).toBeNull();
    expect(status.recentHistory[0]).toMatchObject({ number: 1, status: "done" });
    expect((await exec(["anchors"], p)).code).toBe(0);
  });

  test("las bloqueadas que dependían de esta (y de otras ya cerradas) pasan a «libres» con `Bloqueos` resuelto", async () => {
    const p = await started("3");
    const { out } = await exec([...DONE, "--apply"], p);
    expect(out).toContain("**Tareas desbloqueadas:**\n- Tarea 6 — Publicar el sitio\n- Tarea 7 — Rehacer el README\n- Tarea 16 — Revisar la licencia");
    const text = backlog(p);
    // La 7 esperaba a la 11 (cerrada) y a la 3 (la que se cierra); la 16 ya estaba resuelta y solo se mueve.
    expect(text).toContain("- **Bloqueos:** `[Resuelto el 2026-10-07]` — era `[postergada]` esperar a la Tarea 11 y a la Tarea 3.");
    expect(text).toContain("- **Bloqueos:** `[Resuelto el 2026-10-01]` — era `[dependencia]` la Tarea 11.");
    const state = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(state.free.map((t: { number: number }) => t.number)).toEqual([1, 14, 15, 18, 6, 7, 16]);
    expect(state.blocked.map((t: { number: number }) => t.number)).toEqual([17]);
  });

  test("una bloqueada que depende de otra tarea que sigue abierta se queda y no se lista como desbloqueada", async () => {
    const p = await started("1");
    const { out } = await exec([...DONE, "--apply"], p);
    expect(out).not.toContain("Tarea 7 — Rehacer el README");
    expect(backlog(p)).toContain("### Tarea 7 — Rehacer el README\n\n- **Bloqueos:** `[postergada]` esperar a la Tarea 11 y a la Tarea 3.");
  });

  test("el resumen en varias líneas son viñetas; las que ya lo son se conservan", async () => {
    const p = await started();
    await exec(["close", "--done", "--summary", "Qué se hizo.\n- Ya viñeta\n  - Sub\nPor qué.", "--apply"], p);
    expect(history(p)).toContain("## 2026-10-07 — ✅ Tarea 1 — Probar el flujo completo\n\n- Qué se hizo.\n- Ya viñeta\n  - Sub\n- Por qué.\n\n## 2026-10-07 — ✅ Tarea 11");
  });

  test("el resumen puede venir por la entrada estándar", async () => {
    const p = await started();
    await exec(["close", "--done", "--summary", "-", "--apply"], p, { stdin: "Largo\nen dos líneas" });
    expect(history(p)).toContain("- Largo\n- en dos líneas\n");
  });

  test("avisa si el plan tenía pasos sin marcar (menos el de «Documentar cierre de tarea»)", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: "Paso 1\nPaso 2" });
    const { out } = await exec([...DONE, "--apply"], p);
    expect(out).toContain("Aviso: El plan de la Tarea 1 tenía 2 paso(s) sin marcar: «Paso 1», «Paso 2».");
  });
});

describe("close --done --commits", () => {
  const ENTRY = "## 2026-10-07 — ✅ Tarea 1 — Probar el flujo completo\n\n- Se hizo lo pedido.\n";

  /** Vuelve repo git el proyecto temporal con un commit vacío por asunto; devuelve el hash corto de cada uno. */
  function gitRepo(p: Project, subjects: string[]): string[] {
    const git = (...args: string[]) => spawnSync("git", ["-C", p.root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    expect(git("init", "-q").status).toBe(0);
    return subjects.map((subject) => {
      expect(git("commit", "-q", "--allow-empty", "-m", subject).status).toBe(0);
      return git("rev-parse", "--short", "HEAD").stdout.trim();
    });
  }

  test("un hash: la entrada termina con `- Commit: <hash>.` después de las viñetas del resumen", async () => {
    const p = await started();
    const { code, err } = await exec([...DONE, "--commits", "abc1234", "--apply"], p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(history(p)).toContain(`${ENTRY}- Commit: abc1234.\n\n## 2026-10-07 — ✅ Tarea 11`);
    expect((await exec(["anchors"], p)).code).toBe(0);
  });

  test("varios: `- Commits: h1, h2.`; recorta, pasa a minúsculas y quita duplicados conservando el orden", async () => {
    const p = await started();
    const { code } = await exec(["close", "--done", "--summary", "Qué.\nPor qué.", "--commits", " DEF5678 ,abc1234,def5678, ABC1234", "--apply"], p);
    expect(code).toBe(0);
    expect(history(p)).toContain("- Qué.\n- Por qué.\n- Commits: def5678, abc1234.\n\n## 2026-10-07 — ✅ Tarea 11");
  });

  test("con `Origen: team-backlog` la línea sigue al resumen", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "--team", "Migrar el CI", "--apply"], p);
    await exec([...DONE, "--commits", "a".repeat(40), "--apply"], p);
    expect(history(p)).toContain(`- **Origen:** team-backlog\n- Se hizo lo pedido.\n- Commit: ${"a".repeat(40)}.\n`);
  });

  test("sin --apply muestra la línea en el diff y no escribe nada", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, out } = await exec([...DONE, "--commits", "abc1234,def5678"], p);
    expect(code).toBe(0);
    expect(out).toContain("+- Commits: abc1234, def5678.");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("sin --commits la entrada queda como siempre", async () => {
    const p = await started();
    await exec([...DONE, "--apply"], p);
    expect(history(p)).not.toContain("Commit");
  });

  test("un hash inválido, una lista vacía o `auto` mezclado con hashes: error de uso (2), sin escribir", async () => {
    const p = await started();
    const before = snapshot(p.root);
    for (const value of ["abc123", "xyz1234", "a".repeat(41), "abc1234,zzz", "abc 1234", "auto,abc1234", "", "  ", ",", " , "]) {
      const { code, err } = await exec([...DONE, "--commits", value, "--apply"], p);
      expect(code).toBe(2);
      expect(err).toContain("--commits");
    }
    expect(snapshot(p.root)).toEqual(before);
  });

  test("con --discarded es un error de uso (2), sin escribir", async () => {
    const p = await started();
    const before = snapshot(p.root);
    const { code, err } = await exec(["close", "--discarded", "--reason", "No hace falta.", "--commits", "abc1234", "--apply"], p);
    expect(code).toBe(2);
    expect(err).toContain("--commits es de --done");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("si el resumen ya trae una línea `Commit:`/`Commits:` (viñeta o no) no agrega otra y avisa", async () => {
    for (const line of ["- Commit: 1234567.", "Commits: 1234567, 7654321.", "  - commit: 1234567"]) {
      const p = await started();
      const { code, out } = await exec(["close", "--done", "--summary", `Hecho.\n${line}`, "--commits", "abc1234", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Aviso: El resumen ya trae commits; no se agregó la línea.");
      expect(history(p)).not.toContain("abc1234");
      expect(history(p).match(/ommits?:/gi)).toHaveLength(1);
    }
  });

  test("también reconoce `**Commit:**`/`**Commits:**` y `Commits (etiqueta): ...` (repos múltiples), con o sin viñeta", async () => {
    const lines = ["**Commit:** 1234567", "- **Commits:** 1234567, 7654321", "* **Commits**: 1234567", "Commits (skill): 1234567.", "- Commit (skill): 1234567.", "- **Commits (skill):** 1234567"];
    for (const line of lines) {
      const p = await started();
      const { code, out } = await exec(["close", "--done", "--summary", `Hecho.\n${line}`, "--commits", "abc1234", "--apply"], p);
      expect(code).toBe(0);
      expect(out).toContain("Aviso: El resumen ya trae commits; no se agregó la línea.");
      expect(history(p)).not.toContain("abc1234");
    }
  });

  test("una palabra que solo empieza como «Commit» no cuenta como línea de commits", async () => {
    const p = await started();
    const { out } = await exec(["close", "--done", "--summary", "Commitear los cambios.\nSe hizo un commit: bien.", "--commits", "abc1234", "--apply"], p);
    expect(out).not.toContain("El resumen ya trae commits");
    expect(history(p)).toContain("- Commitear los cambios.\n- Se hizo un commit: bien.\n- Commit: abc1234.\n");
  });

  test("--json: `commits` y `notes` en los datos del comando; sin --commits no aparecen", async () => {
    const p = await started();
    const plain = JSON.parse((await exec([...DONE, "--json"], p)).out);
    expect(plain).not.toHaveProperty("commits");
    expect(plain).not.toHaveProperty("notes");
    const out = JSON.parse((await exec([...DONE, "--commits", "ABC1234,def5678", "--json", "--apply"], p)).out);
    expect(out).toMatchObject({ applied: true, commits: ["abc1234", "def5678"], notes: [] });
    const dup = await started();
    const again = JSON.parse((await exec(["close", "--done", "--summary", "Commit: 1234567.", "--commits", "abc1234", "--json", "--apply"], dup)).out);
    expect(again.notes).toEqual(["El resumen ya trae commits; no se agregó la línea."]);
  });

  test("inglés y CRLF: `Commits` y los finales de línea se conservan", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE_EN), "backlog.md": crlf(BACKLOG_EN), "history.md": crlf(HISTORY_EN) } });
    await exec(["start", "4", "--apply"], p);
    const { code } = await exec(["close", "--done", "--summary", "Translated.", "--commits", "abc1234,def5678", "--apply"], p);
    expect(code).toBe(0);
    const text = history(p);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("## 2026-10-07 — ✅ Task 4 — Translate the glossary\r\n\r\n- Translated.\r\n- Commits: abc1234, def5678.\r\n\r\n## 2026-10-02 — ✅ Task 5");
  });

  describe("auto", () => {
    test("toma los commits del repo cuyo asunto lleva `(T-N)` exacto, del más antiguo al más nuevo", async () => {
      const p = await started();
      const [first, , third] = gitRepo(p, ["feat(T-1): a", "fix(T-12): b", "docs(T-1): c", "chore: sin tarea"]);
      const { code, err } = await exec([...DONE, "--commits", "auto", "--apply"], p);
      expect(err).toBe("");
      expect(code).toBe(0);
      expect(history(p)).toContain(`${ENTRY}- Commits: ${first}, ${third}.\n\n## 2026-10-07 — ✅ Tarea 11`);
    });

    test("un solo commit: `- Commit: <hash>.`; `AUTO` en mayúsculas también vale; --json lista los hashes", async () => {
      const p = await started();
      const [, only] = gitRepo(p, ["chore: inicial", "feat(T-1): a"]);
      const out = JSON.parse((await exec([...DONE, "--commits", "AUTO", "--json", "--apply"], p)).out);
      expect(out.commits).toEqual([only]);
      expect(history(p)).toContain(`- Commit: ${only}.\n`);
    });

    test("el asunto debe llevar el scope: `T-1` en el cuerpo o sin paréntesis no cuenta", async () => {
      const p = await started();
      const [kept] = gitRepo(p, ["feat(T-1): a", "fix: arregla T-1 y (T-10)", "refactor(t-1): minúscula"]);
      spawnSync("git", ["-C", p.root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "chore: x", "-m", "cuerpo (T-1)"]);
      await exec([...DONE, "--commits", "auto", "--apply"], p);
      expect(history(p)).toContain(`- Commit: ${kept}.\n`);
    });

    test("no depende de `core.abbrev`: los hashes salen siempre de 7 caracteres", async () => {
      const p = await started();
      gitRepo(p, ["feat(T-1): a", "fix(T-1): b"]);
      const git = (...args: string[]) => spawnSync("git", ["-C", p.root, ...args], { encoding: "utf8" });
      expect(git("config", "core.abbrev", "4").status).toBe(0);
      const full = git("rev-list", "--reverse", "HEAD").stdout.trim().split("\n");
      const out = JSON.parse((await exec([...DONE, "--commits", "auto", "--json", "--apply"], p)).out);
      expect(out.commits).toEqual(full.map((hash) => hash.slice(0, 7)));
    });

    test("orden por ancestría aunque las fechas estén desordenadas (el más antiguo primero)", async () => {
      const p = await started();
      const git = (env: Record<string, string>, ...args: string[]) =>
        spawnSync("git", ["-C", p.root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: { ...process.env, ...env } });
      expect(git({}, "init", "-q").status).toBe(0);
      const dates = ["2030-01-01T00:00:00", "2020-01-01T00:00:00", "2025-01-01T00:00:00"];
      const hashes = dates.map((date, i) => {
        expect(git({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, "commit", "-q", "--allow-empty", "-m", `feat(T-1): paso ${i}`).status).toBe(0);
        return git({}, "rev-parse", "--short=7", "HEAD").stdout.trim();
      });
      const out = JSON.parse((await exec([...DONE, "--commits", "auto", "--json", "--apply"], p)).out);
      expect(out.commits).toEqual(hashes);
    });

    test("no incluye los commits de merge aunque su asunto lleve `(T-N)`", async () => {
      const p = await started();
      const git = (...args: string[]) => spawnSync("git", ["-C", p.root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
      const commit = (subject: string) => {
        expect(git("commit", "-q", "--allow-empty", "-m", subject).status).toBe(0);
        return git("rev-parse", "--short=7", "HEAD").stdout.trim();
      };
      expect(git("init", "-q").status).toBe(0);
      commit("chore: base");
      const trunk = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
      expect(git("checkout", "-q", "-b", "lateral").status).toBe(0);
      const side = commit("feat(T-1): lateral");
      expect(git("checkout", "-q", trunk).status).toBe(0);
      const main = commit("feat(T-1): principal");
      expect(git("merge", "-q", "--no-ff", "lateral", "-m", "Merge lateral (T-1)").status).toBe(0);
      const out = JSON.parse((await exec([...DONE, "--commits", "auto", "--json", "--apply"], p)).out);
      expect([...out.commits].sort()).toEqual([main, side].sort());
      expect(history(p)).not.toContain("Merge lateral");
    });

    test("sin coincidencias: error de dominio (1), sin escribir", async () => {
      const p = await started();
      gitRepo(p, ["feat(T-12): a", "fix(T-10): b"]);
      const before = snapshot(p.root);
      const { code, err } = await exec([...DONE, "--commits", "auto", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("--commits auto");
      expect(err).toContain("(T-1)");
      expect(err).toContain("No se escribió nada");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("fuera de un repo git o sin commits: error de dominio (1), sin escribir", async () => {
      const outside = await started();
      const before = snapshot(outside.root);
      const none = await exec([...DONE, "--commits", "auto", "--apply"], outside);
      expect(none.code).toBe(1);
      expect(none.err).toContain("--commits auto: no se pudo leer el historial de git");
      expect(none.err).toContain("No se escribió nada");
      expect(snapshot(outside.root)).toEqual(before);

      const empty = await started();
      gitRepo(empty, []);
      const beforeEmpty = snapshot(empty.root);
      expect((await exec([...DONE, "--commits", "auto", "--apply"], empty)).code).toBe(1);
      expect(snapshot(empty.root)).toEqual(beforeEmpty);
    });

    test("sin --apply muestra la línea y no escribe", async () => {
      const p = await started();
      const [hash] = gitRepo(p, ["feat(T-1): a"]);
      const before = snapshot(p.root);
      const { code, out } = await exec([...DONE, "--commits", "auto"], p);
      expect(code).toBe(0);
      expect(out).toContain(`+- Commit: ${hash}.`);
      expect(snapshot(p.root)).toEqual(before);
    });
  });
});

describe("close --discarded", () => {
  test("entrada ❌ con el motivo; el reporte lo trae breve (su primera línea)", async () => {
    const p = await started();
    const { out } = await exec(["close", "--discarded", "--reason", "Ya no hace falta.\nLo cubre la Tarea 15.", "--apply"], p);
    expect(out).toContain("Tarea 1 cerrada (descartada)");
    expect(out).toContain("**Tareas descartadas:**\n- Tarea 1 — Probar el flujo completo — Ya no hace falta.\n");
    expect(out).not.toContain("**Tareas resueltas:**");
    expect(history(p)).toContain("## 2026-10-07 — ❌ Tarea 1 — Probar el flujo completo\n\n- Ya no hace falta.\n- Lo cubre la Tarea 15.\n\n## 2026-10-07 — ✅ Tarea 11");
    // Una descartada también cuenta como cerrada para la Regla 8.
    expect(out).toContain("**Tareas desbloqueadas:**");
  });

  test("un motivo largo se recorta en el reporte, pero entero en history.md", async () => {
    const p = await started();
    const reason = `${"palabra ".repeat(40)}final`;
    const { out } = await exec(["close", "--discarded", "--reason", reason, "--apply"], p);
    const line = out.split("\n").find((l) => l.startsWith("- Tarea 1 — "))!;
    expect(line.endsWith("…")).toBe(true);
    expect(line.length).toBeLessThan(190);
    expect(history(p)).toContain(`- ${reason}`);
  });
});

describe("--new", () => {
  test("agrega tareas nuevas a «libres» con los números de «Próximo número de tarea» (que pasa a N+k) y las reporta", async () => {
    const p = await started();
    const { out } = await exec([...DONE, "--new", "Revisar el README", "--new", "Probar en Linux", "--apply"], p);
    expect(out).toContain("**Tareas nuevas:**\n- Tarea 20 — Revisar el README\n- Tarea 21 — Probar en Linux");
    const text = backlog(p);
    expect(text).toContain("**Próximo número de tarea:** 22");
    expect(text).toContain(
      "### Tarea 20 — Revisar el README\n\n- **Descripción:** Surgió al cerrar la Tarea 1; falta detallarla.\n- **Decisiones/temas a definir antes de empezar:** Ninguno.\n- **Bloqueos:** Ninguno.\n- **Disparador:** cuando el operador pregunte por tareas pendientes.\n- **Agregada:** 2026-10-07.\n\n### Tarea 21 — Probar en Linux",
    );
    // Después de las desbloqueadas, al final de «libres».
    expect(text.indexOf("### Tarea 16 — ")).toBeLessThan(text.indexOf("### Tarea 20 — "));
    expect(text.indexOf("### Tarea 21 — ")).toBeLessThan(text.indexOf("<!-- agent-context-skill:section=blocked -->"));
  });

  test("un título vacío o de varias líneas es un error de uso", async () => {
    const p = await started();
    const before = snapshot(p.root);
    expect((await exec([...DONE, "--new", "  ", "--apply"], p)).code).toBe(2);
    expect((await exec([...DONE, "--new", "a\nb", "--apply"], p)).code).toBe(2);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("avisa si «Tareas libres» queda con más de 15 tareas, sin agrupar", async () => {
    const p = await started();
    const titles = Array.from({ length: 10 }, (_, i) => ["--new", `Tarea extra ${i + 1}`]).flat();
    const { out } = await exec([...DONE, ...titles, "--apply"], p);
    // 4 libres tras empezar la 1 (incluidas las 2 del grupo) + 2 desbloqueadas (6 y 16) + 10 nuevas.
    expect(out).toContain("Aviso: «Tareas libres» queda con 16 tareas (más de 15): evalúa agruparlas (Agrupamiento en backlog.md, Regla 8). No agrupo automáticamente.");
    expect(backlog(p)).not.toContain("### Grupo — Tareas extra");
  });
});

describe("Origen: team-backlog", () => {
  test("la entrada de history conserva `- **Origen:** team-backlog` como primera viñeta", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "--team", "Migrar el CI", "--apply"], p);
    expect(handoff(p)).toContain("- **Origen:** team-backlog");
    const teamAfterStart = readIn(p, "team-backlog.md");
    const { code, out } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("- Tarea 20 — Migrar el CI");
    expect(history(p)).toContain("## 2026-10-07 — ✅ Tarea 20 — Migrar el CI\n\n- **Origen:** team-backlog\n- Se hizo lo pedido.\n\n## 2026-10-07 — ✅ Tarea 11");
    // El team-backlog.md ya lo cambió `start`: cerrar no lo toca.
    expect(readIn(p, "team-backlog.md")).toBe(teamAfterStart);
  });

  test("una pausada con `Origen` también lo conserva", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "--team", "Migrar el CI", "--apply"], p);
    await exec(["pause", "--reason", "Otra prioridad.", "--waiting-for", "Nada.", "--apply"], p);
    await exec(["close", "20", "--discarded", "--reason", "Se hace en otro repo.", "--apply"], p);
    expect(history(p)).toContain("## 2026-10-07 — ❌ Tarea 20 — Migrar el CI\n\n- **Origen:** team-backlog\n- Se hace en otro repo.");
  });
});

describe("cerrar una pausada", () => {
  async function paused(): Promise<Project> {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "1", "--apply"], p);
    await exec(["pause", "--reason", "Otra prioridad.", "--waiting-for", "Nada.", "--apply"], p);
    return p;
  }

  test("`close <N>` saca su bloque de «Tareas pausadas» (las demás pausadas quedan) y no toca «Tarea en progreso»", async () => {
    const p = await paused();
    const { code, out } = await exec(["close", "1", "--done", "--summary", "Hecha.", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("**Tareas resueltas:**\n- Tarea 1 — Probar el flujo completo");
    const text = handoff(p);
    expect(text).not.toContain("### Tarea 1 — Probar el flujo completo");
    expect(text).toContain("### Tarea 8 — Migrar la documentación vieja");
    expect(history(p)).toContain("✅ Tarea 1 — Probar el flujo completo");
  });

  test("sin tarea en curso, `close` sin número se niega y sugiere las pausadas", async () => {
    const p = await paused();
    const before = snapshot(p.root);
    const { code, err } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("No hay tarea en curso que cerrar");
    expect(err).toContain("pausadas: 8, 1");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("con otra tarea en curso, `close <N>` cierra la pausada y deja la en curso como estaba", async () => {
    const p = await paused();
    await exec(["start", "3", "--apply"], p);
    const inProgress = handoff(p).slice(handoff(p).indexOf("## Tarea en progreso"), handoff(p).indexOf("<!-- agent-context-skill:section=paused -->"));
    expect((await exec(["close", "1", "--done", "--summary", "Hecha.", "--apply"], p)).code).toBe(0);
    expect(handoff(p)).toContain(inProgress);
  });
});

describe("descartar una tarea sin empezar (libre o bloqueada)", () => {
  const DISCARD = (n: string, ...more: string[]) => ["close", n, "--discarded", "--reason", "Ya no hace falta.", ...more, "--apply"];

  test("una libre: entrada ❌ en history, bloque fuera de «libres», handoff intacto", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const handoffBefore = handoff(p);
    const { code, err, out } = await exec(DISCARD("18"), p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(out).toContain("Tarea 18 descartada sin empezarla");
    expect(out).toContain("**Tareas descartadas:**\n- Tarea 18 — Revisar los links — Ya no hace falta.");
    expect(handoff(p)).toBe(handoffBefore);
    expect(history(p)).toContain("## 2026-10-07 — ❌ Tarea 18 — Revisar los links\n\n- Ya no hace falta.\n\n## 2026-10-07 — ✅ Tarea 11");
    expect(backlog(p)).not.toContain("### Tarea 18 — Revisar los links");
    const status = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(status.free.map((t: { number: number }) => t.number)).not.toContain(18);
    expect((await exec(["anchors"], p)).code).toBe(0);
  });

  test("una bloqueada: se saca de «bloqueadas» (las demás se quedan) y la Regla 8 cuenta la descartada como cerrada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, err, out } = await exec(DISCARD("17"), p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(out).toContain("**Tareas descartadas:**\n- Tarea 17 — Migrar a otro host — Ya no hace falta.");
    const text = backlog(p);
    expect(text).not.toContain("### Tarea 17 — Migrar a otro host");
    expect(history(p)).toContain("❌ Tarea 17 — Migrar a otro host");
    // Las 6 y 16 se desbloquean porque la 11 está cerrada; la 7 espera aún a la 3.
    expect(out).toContain("**Tareas desbloqueadas:**\n- Tarea 6 — Publicar el sitio\n- Tarea 16 — Revisar la licencia");
    expect(text).toContain("### Tarea 7 — Rehacer el README");
    expect((await exec(["anchors"], p)).code).toBe(0);
  });

  test("una bloqueada de la que dependen otras: pasan a «libres» y ella sale de «bloqueadas»", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, err, out } = await exec(DISCARD("3"), p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(out).toContain("**Tareas desbloqueadas:**\n- Tarea 6 — Publicar el sitio\n- Tarea 7 — Rehacer el README\n- Tarea 16 — Revisar la licencia");
    const state = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(state.free.map((t: { number: number }) => t.number)).toEqual([1, 14, 15, 18, 6, 7, 16]);
    expect(state.blocked.map((t: { number: number }) => t.number)).toEqual([17]);
  });

  test("la tarea en curso (si hay) queda exactamente como estaba", async () => {
    const p = await started("1");
    const handoffBefore = handoff(p);
    const { code, err } = await exec(DISCARD("18"), p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(handoff(p)).toBe(handoffBefore);
    expect(history(p)).toContain("❌ Tarea 18 — Revisar los links");
    expect(JSON.parse((await exec(["status", "--json"], p)).out).current.number).toBe(1);
  });

  test("sin --apply solo muestra el diff y no escribe nada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { code, out } = await exec(DISCARD("18").slice(0, -1), p);
    expect(code).toBe(0);
    expect(out).toContain("+## 2026-10-07 — ❌ Tarea 18 — Revisar los links");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--new con la descartada en «libres» (la última): las nuevas ocupan su lugar, sin ediciones solapadas", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, err, out } = await exec(DISCARD("18", "--new", "Revisar el README"), p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(out).toContain("**Tareas nuevas:**\n- Tarea 20 — Revisar el README");
    const text = backlog(p);
    expect(text).not.toContain("### Tarea 18 — Revisar los links");
    expect(text).toContain("**Próximo número de tarea:** 21");
    expect(text).toContain("### Tarea 20 — Revisar el README\n\n- **Descripción:** Surgió al cerrar la Tarea 18; falta detallarla.");
    expect(text.indexOf("### Tarea 3 — ")).toBeLessThan(text.indexOf("### Tarea 20 — "));
    expect(text.indexOf("### Tarea 16 — ")).toBeLessThan(text.indexOf("<!-- agent-context-skill:section=blocked -->"));
    expect((await exec(["anchors"], p)).code).toBe(0);
  });

  test("--new con la descartada en «libres» que no es la última: se borra y las nuevas van al final", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, err } = await exec(DISCARD("1", "--new", "Una nueva"), p);
    expect(err).toBe("");
    expect(code).toBe(0);
    const text = backlog(p);
    expect(text).not.toContain("### Tarea 1 — Probar el flujo completo");
    // Tras la 18 vienen las desbloqueadas (6 y 16) y, al final, la nueva.
    expect(text).toContain("- **Disparador:** antes del release.\n\n### Tarea 6 — Publicar el sitio");
    expect(text).toContain("### Tarea 16 — Revisar la licencia");
    expect(text.indexOf("### Tarea 16 — ")).toBeLessThan(text.indexOf("### Tarea 20 — Una nueva"));
    expect(text.indexOf("### Tarea 20 — ")).toBeLessThan(text.indexOf("<!-- agent-context-skill:section=blocked -->"));
    expect((await exec(["anchors"], p)).code).toBe(0);
  });

  test("la única libre con --new: la nueva reemplaza a la descartada", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_ONE, "history.md": "# History\n" } });
    const { code, err } = await exec(DISCARD("7", "--new", "Otra"), p);
    expect(err).toBe("");
    expect(code).toBe(0);
    const text = backlog(p);
    expect(text).not.toContain("### Tarea 7 — La única");
    expect(text).toContain("### Tarea 8 — Otra");
    expect((await exec(["anchors"], p)).code).toBe(0);
  });

  test("--done sobre una del backlog: error que manda a `start`, sin escribir", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    for (const n of ["18", "17"]) {
      const { code, err } = await exec(["close", n, "--done", "--summary", "x", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("una tarea sin empezar no se puede dar por hecha");
      expect(err).toContain(`start ${n}`);
    }
    expect(snapshot(p.root)).toEqual(before);
  });

  test("una agrupada sigue siendo un error, sin escribir", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { code, err } = await exec(DISCARD("14"), p);
    expect(code).toBe(1);
    expect(err).toContain("«Tareas agrupadas» (grupo «Documentar los planes»)");
    expect(err).toContain("acsuite task group-eject 14");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("una tarea inexistente o ya cerrada: error, sin escribir", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    expect((await exec(DISCARD("99"), p)).err).toContain("No existe la Tarea 99");
    expect((await exec(DISCARD("11"), p)).err).toContain("ya figura cerrada");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("falta --reason: error de uso", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { code, err } = await exec(["close", "18", "--discarded", "--apply"], p);
    expect(code).toBe(2);
    expect(err).toContain("Falta --reason");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--json: from `backlog` y reporte de descartadas", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const out = JSON.parse((await exec(DISCARD("18", "--json"), p)).out);
    expect(out.task).toMatchObject({ number: 18, outcome: "discarded", from: "backlog", origin: null });
    expect(out.report.discarded).toEqual([{ number: 18, title: "Revisar los links", reason: "Ya no hace falta." }]);
  });
});

describe("errores: no se escribe nada", () => {
  test("hay que indicar exactamente uno de --done y --discarded, con su texto", async () => {
    const p = await started();
    const before = snapshot(p.root);
    expect((await exec(["close", "--summary", "x", "--apply"], p)).code).toBe(2);
    expect((await exec(["close", "--done", "--discarded", "--summary", "x", "--apply"], p)).code).toBe(2);
    expect((await exec(["close", "--done", "--apply"], p)).err).toContain("Falta --summary");
    expect((await exec(["close", "--discarded", "--apply"], p)).err).toContain("Falta --reason");
    expect((await exec(["close", "--done", "--summary", "x", "--reason", "y", "--apply"], p)).err).toContain("--reason es de --discarded");
    expect((await exec(["close", "--discarded", "--reason", "x", "--summary", "y", "--apply"], p)).err).toContain("--summary es de --done");
    expect((await exec([...DONE, "1", "2", "--apply"], p)).code).toBe(2);
    expect((await exec([...DONE, "Un título", "--apply"], p)).code).toBe(2);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("texto suelto en el plan: se niega y el error cita la línea y el formato válido", async () => {
    const p = await started();
    writeFileSync(join(p.agents, "gersom", "handoff.md"), handoff(p).replace("### Qué falta", "Una nota suelta en el plan.\n\n### Qué falta"));
    const before = snapshot(p.root);
    const { code, err } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("No puedo cerrar la Tarea 1");
    expect(err).toContain("«Una nota suelta en el plan.», línea ");
    expect(err).toContain("formato válido: pasos `- [ ] Paso N — texto` o `- [x] Paso N — texto`, y la línea de modo `**Modo de ejecución acordado:** <texto>`");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("sin tarea en curso: error claro; repetir el cierre no duplica la entrada", async () => {
    const p = await started();
    expect((await exec([...DONE, "--apply"], p)).code).toBe(0);
    const after = snapshot(p.root);
    const again = await exec([...DONE, "--apply"], p);
    expect(again.code).toBe(1);
    expect(again.err).toContain("No hay tarea en curso que cerrar");
    expect(snapshot(p.root)).toEqual(after);
    expect(history(p).match(/Tarea 1 — Probar el flujo completo/g)).toHaveLength(1);
  });

  test("la tarea ya figura en history.md: no duplica la entrada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "1", "--apply"], p);
    writeFileSync(join(p.agents, "gersom", "history.md"), HISTORY_RICH.replace("✅ Tarea 11", "✅ Tarea 1"));
    const before = snapshot(p.root);
    const { code, err } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("ya figura cerrada en history.md");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("`close <N>` de una tarea que no se empezó (con --done), cerrada, o inexistente", async () => {
    const p = await started();
    const before = snapshot(p.root);
    expect((await exec(["close", "18", "--done", "--summary", "x", "--apply"], p)).err).toContain("una tarea sin empezar no se puede dar por hecha");
    expect((await exec(["close", "11", "--done", "--summary", "x", "--apply"], p)).err).toContain("ya figura cerrada");
    expect((await exec(["close", "99", "--done", "--summary", "x", "--apply"], p)).err).toContain("No existe la Tarea 99");
    expect((await exec(["close", "1@ana", "--done", "--summary", "x", "--apply"], p)).err).toContain("de otro operador");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("contenido que no reconoce en «Tarea en progreso»: se niega, como `pause`", async () => {
    const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "handoff.md": HANDOFF_CURRENT } });
    const before = snapshot(p.root);
    const { code, err } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("No puedo cerrar la Tarea 12");
    expect(err).toContain("Cosa que hacer al retomar");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("carpeta de otro operador: se niega", async () => {
    const p = project({ folders: ["gersom", "ana"], ...IDLE, folderContents: { ana: IDLE.contents } });
    await exec(["start", "1", "--operator", "ana", "--apply"], p, { email: "ana@mail.com" });
    const { code, err } = await exec([...DONE, "--operator", "ana", "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("«ana» no es la tuya");
  });

  test("falta history.md: error, sin escribir", async () => {
    const p = project({ folders: ["gersom"], ...IDLE, omit: ["history.md"] });
    await exec(["start", "1", "--apply"], p);
    const before = snapshot(p.root);
    const { code, err } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("Falta history.md");
    expect(snapshot(p.root)).toEqual(before);
  });
});

describe("la tarea cerrada sigue en backlog.md", () => {
  const UNIQUE_BLOCK = /### Tarea 7 — La única[^]*?(?=<!-- agent-context-skill:section=blocked)/;

  /** La Tarea 7 empezada a mano: figura en el handoff y, por un descuido, también quedó en el backlog que se pasa. */
  async function leftover(backlogText: string): Promise<Project> {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_ONE, "history.md": "# History\n" } });
    await exec(["start", "7", "--apply"], p);
    writeFileSync(join(p.agents, "gersom", "backlog.md"), backlogText);
    return p;
  }

  test("se saca de «libres» (Regla 6) y la sección queda con «Ninguna.»", async () => {
    const p = await leftover(BACKLOG_ONE);
    const { code, err } = await exec([...DONE, "--apply"], p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(backlog(p)).toBe(BACKLOG_ONE.replace(UNIQUE_BLOCK, "Ninguna.\n\n"));
  });

  test("y hay que agregar tareas a «libres» en la misma operación: error claro, sin escribir", async () => {
    const p = await leftover(BACKLOG_ONE);
    const before = snapshot(p.root);
    const { code, err } = await exec([...DONE, "--new", "Otra", "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("sigue en «Tareas libres» de backlog.md");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("si sigue en «bloqueadas», se saca de ahí junto con las que se desbloquean", async () => {
    const blocked = [
      "## Tareas bloqueadas / pospuestas",
      "",
      "### Tarea 7 — La única",
      "",
      "- **Bloqueos:** `[postergada]` no sé.",
      "",
      "### Tarea 9 — Depende de la 7",
      "",
      "- **Bloqueos:** `[dependencia]` espera a la Tarea 7.",
    ].join("\n");
    const p = await leftover(BACKLOG_ONE.replace(UNIQUE_BLOCK, "Ninguna.\n\n").replace("## Tareas bloqueadas / pospuestas\n\nNinguna.", blocked));
    const { code, err, out } = await exec([...DONE, "--apply"], p);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(out).toContain("**Tareas desbloqueadas:**\n- Tarea 9 — Depende de la 7");
    const text = backlog(p);
    expect(text).not.toContain("### Tarea 7 — La única");
    expect(text).toContain(
      "## Tareas libres\n\n### Tarea 9 — Depende de la 7\n\n- **Bloqueos:** `[Resuelto el 2026-10-07]` — era `[dependencia]` espera a la Tarea 7.\n\n<!-- agent-context-skill:section=blocked -->\n## Tareas bloqueadas / pospuestas\n\nNinguna.",
    );
  });

  test("figura además en «Tareas agrupadas»: error, hay que sacarla a mano", async () => {
    const grouped = BACKLOG_ONE.replace("No aplica todavía — ningún grupo formado.", "### Grupo — G (Tareas 7, 8)\n\n#### Tarea 7 — Repetida\n\n- **Descripción:** x");
    const p = await leftover(grouped);
    const before = snapshot(p.root);
    const { code, err } = await exec([...DONE, "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("«Tareas agrupadas»");
    expect(snapshot(p.root)).toEqual(before);
  });
});

describe("--json", () => {
  test("sin --apply: lo pendiente; con --apply: el reporte estructurado", async () => {
    const p = await started("3");
    const pending = JSON.parse((await exec([...DONE, "--new", "Algo", "--json"], p)).out);
    expect(pending).toMatchObject({ command: "close", applied: false, pending: true, task: { number: 3, outcome: "done", from: "current" } });
    const applied = JSON.parse((await exec([...DONE, "--new", "Algo", "--json", "--apply"], p)).out);
    expect(applied).toMatchObject({
      applied: true,
      task: { number: 3, title: "Exportar como skill", outcome: "done", date: "2026-10-07", origin: null },
      report: {
        resolved: [{ number: 3, title: "Exportar como skill" }],
        discarded: [],
        unblocked: [
          { number: 6, title: "Publicar el sitio" },
          { number: 7, title: "Rehacer el README" },
          { number: 16, title: "Revisar la licencia" },
        ],
        created: [{ number: 20, title: "Algo" }],
      },
      manualReview: [{ number: 17 }],
      stillBlocked: [],
      freeTasks: 8,
    });
    expect(applied.unblocked[2]).toMatchObject({ number: 16, noActiveBlock: true });
  });

  test("descartada: el motivo breve va en el reporte", async () => {
    const p = await started();
    const out = JSON.parse((await exec(["close", "--discarded", "--reason", "No hace falta.", "--json", "--apply"], p)).out);
    expect(out.report.discarded).toEqual([{ number: 1, title: "Probar el flujo completo", reason: "No hace falta." }]);
    expect(out.report.resolved).toEqual([]);
  });
});

describe("--verbose", () => {
  const MANUAL = "Para revisar a mano (el motivo no nombra una tarea propia): si ya no aplica, `unblock <N>`:\n  Tarea 17 — Migrar a otro host [postergada] → hasta nuevo aviso del operador.";

  test("sin --verbose no imprime «Para revisar a mano»; con --verbose sí, tras el reporte", async () => {
    const quiet = await exec([...DONE, "--apply"], await started());
    expect(quiet.out).toContain("**Tareas desbloqueadas:**\n- Tarea 6 — Publicar el sitio\n- Tarea 16 — Revisar la licencia");
    expect(quiet.out).not.toContain("Para revisar a mano");
    expect(quiet.out).not.toContain("Tarea 17");
    const verbose = await exec([...DONE, "--verbose", "--apply"], await started());
    expect(verbose.out).toContain("- Tarea 16 — Revisar la licencia\n" + MANUAL);
  });

  test("con --discarded rige igual", async () => {
    const discarded = ["close", "--discarded", "--reason", "No hace falta."];
    expect((await exec([...discarded, "--apply"], await started())).out).not.toContain("Para revisar a mano");
    expect((await exec([...discarded, "--verbose", "--apply"], await started())).out).toContain(MANUAL);
  });

  test("--json es igual con y sin --verbose", async () => {
    const without = JSON.parse((await exec([...DONE, "--json", "--apply"], await started("3"))).out);
    const withFlag = JSON.parse((await exec([...DONE, "--verbose", "--json", "--apply"], await started("3"))).out);
    expect(without.manualReview.map((t: { number: number }) => t.number)).toEqual([17]);
    expect(withFlag).toEqual(without);
  });

  test("sin bloqueadas con motivo sin tarea, --verbose no imprime nada", async () => {
    const p = await started();
    await exec(["unblock", "17", "--apply"], p);
    const { out } = await exec([...DONE, "--verbose", "--apply"], p);
    expect(out).not.toContain("Para revisar a mano");
    expect(out).toContain("**Tareas resueltas:**");
  });
});

describe("proyecto en inglés y CRLF", () => {
  test("usa `Task`, los títulos del reporte en inglés y conserva los finales de línea", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": crlf(HANDOFF_IDLE_EN), "backlog.md": crlf(BACKLOG_EN), "history.md": crlf(HISTORY_EN) } });
    await exec(["start", "4", "--apply"], p);
    const { code, out } = await exec(["close", "--done", "--summary", "Translated.", "--new", "Review it", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toContain("**Resolved tasks:**\n- Task 4 — Translate the glossary");
    expect(out).toContain("**New tasks:**\n- Task 6 — Review it");
    const text = history(p);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("## 2026-10-07 — ✅ Task 4 — Translate the glossary\r\n\r\n- Translated.\r\n\r\n## 2026-10-02 — ✅ Task 5");
    expect(backlog(p)).toContain("### Task 6 — Review it\r\n\r\n- **Description:** Raised when closing Task 4; still to be detailed.\r\n");
    expect(handoff(p)).toContain("No task in progress");
  });
});

describe("flags en español", () => {
  test("--resumen, --motivo y --nueva son desconocidos: código 2 y no se escribe nada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    for (const argv of [
      ["close", "--done", "--resumen", "x"],
      ["close", "--discarded", "--motivo", "x"],
      ["close", "--done", "--summary", "x", "--nueva", "Otra"],
    ]) {
      const { code, err } = await exec([...argv, "--apply"], p);
      expect(code).toBe(2);
      expect(err).toMatch(/Flag desconocido: --(resumen|motivo|nueva)\./);
    }
    expect(snapshot(p.root)).toEqual(before);
  });
});
