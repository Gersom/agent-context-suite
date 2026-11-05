// `start`: empieza una tarea (del backlog propio o, con `--team`, del team-backlog.md). Contra
// proyectos temporales: nunca se tocan los docs reales.

import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APPLY_NOTICE, run } from "../../src/cli/dispatch.ts";
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
import { captureIo, makeProject, type Project } from "../helpers.ts";

const projects: Project[] = [];
function project(options: Parameters<typeof makeProject>[0]): Project {
  const p = makeProject(options);
  projects.push(p);
  return p;
}
afterAll(() => projects.forEach((p) => p.cleanup()));

function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    try {
      result[name] = readFileSync(join(root, name), "utf8");
    } catch {
      // carpetas
    }
  }
  return result;
}

async function exec(argv: string[], p: Project, options: { email?: string | null; stdin?: string } = {}) {
  const cap = captureIo();
  const code = await run(argv, {
    io: cap.io,
    email: options.email === undefined ? "gersom@mail.com" : options.email,
    baseDir: p.root,
    now: () => new Date(2026, 9, 7, 15, 30),
    readStdin: async () => options.stdin ?? "",
  });
  return { code, out: cap.text(), err: cap.err.join("\n") };
}

const IDLE = { contents: { "handoff.md": HANDOFF_IDLE, "backlog.md": BACKLOG_RICH, "history.md": HISTORY_RICH }, teamBacklogText: TEAM_RICH };
const read = (p: Project, ...parts: string[]) => readFileSync(join(p.agents, ...parts), "utf8");

/** El bloque de la tarea 1 de BACKLOG_RICH tal como está en el archivo (con su línea en blanco final). */
const TAREA_1 =
  "### Tarea 1 — Probar el flujo completo\n\n- **Descripción:** CUERPO-1\n- **Bloqueos:** Ninguno.\n- **Disparador:** cuando el operador pregunte por tareas pendientes.\n\n";

describe("start <N>", () => {
  test("sin --apply muestra el diff de los dos archivos y no escribe nada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { code, out } = await exec(["start", "1"], p);
    expect(code).toBe(0);
    expect(out).toContain("handoff.md");
    expect(out).toContain("+Tarea 1 — Probar el flujo completo");
    expect(out).toContain("-### Tarea 1 — Probar el flujo completo");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("--dry-run + --apply tampoco escribe", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { out } = await exec(["start", "1", "--apply", "--dry-run"], p);
    expect(out).toContain("--dry-run: no se escribió nada.");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("sin plan: saca el bloque del backlog y arma «Tarea en progreso» según la plantilla", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, out } = await exec(["start", "1", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe("Tarea 1 empezada: sacada de «Tareas libres» y puesta en «Tarea en progreso» de docs/agents/gersom/handoff.md.");
    expect(read(p, "gersom", "backlog.md")).toBe(BACKLOG_RICH.replace(TAREA_1, ""));
    expect(read(p, "gersom", "handoff.md")).toBe(
      HANDOFF_IDLE.replace(
        "Sin tarea en curso",
        [
          "Tarea 1 — Probar el flujo completo",
          "",
          "CUERPO-1",
          "",
          "### Qué falta",
          "",
          "Toda la tarea.",
          "",
          "### Decisiones a medio camino",
          "",
          "Ninguna.",
          "",
          "### Próximo paso concreto",
          "",
          "Empezar la tarea.",
        ].join("\n"),
      ),
    );
    expect(read(p, "gersom", "history.md")).toBe(HISTORY_RICH);
  });

  test("con plan por stdin y modo: un paso por línea, el paso de cierre al final y el modo", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "T-3", "--plan", "-", "--mode", "step-by-step", "--apply"], p, {
      stdin: "Paso 1 — Escribir\n- [ ] Paso 2 — Probar\n\nPaso 3 — Cerrar\n",
    });
    const handoff = read(p, "gersom", "handoff.md");
    expect(handoff).toContain(
      [
        "### Plan",
        "",
        "- [ ] Paso 1 — Escribir",
        "- [ ] Paso 2 — Probar",
        "- [ ] Paso 3 — Cerrar",
        "- [ ] Documentar cierre de tarea",
        "",
        "**Modo de ejecución acordado:** step-by-step",
        "",
        "### Qué falta",
        "",
        "Todos los pasos del plan.",
      ].join("\n"),
    );
    expect(handoff).toContain("### Próximo paso concreto\n\nPaso 1 — Escribir\n");
    expect(handoff.indexOf("### Plan")).toBeGreaterThan(handoff.indexOf("Tarea 3 — Exportar como skill"));
    expect(handoff).toContain("<!-- agent-context-skill:section=paused -->\n## Tareas pausadas");
    expect(handoff).toContain("### Tarea 8 — Migrar la documentación vieja"); // las pausadas, intactas
  });

  test("lo que escribe lo lee el parser: tarea, plan y próximo paso", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "1", "--plan", "Paso 1 — a\nPaso 2 — b", "--apply"], p);
    const { out } = await exec(["status", "--json"], p);
    const state = JSON.parse(out);
    expect(state.current).toMatchObject({ number: 1, plan: { done: 0, total: 3, nextStep: "Paso 1 — a" } });
    expect(state.current.nextConcreteStep.text).toBe("Paso 1 — a");
    expect(state.free.map((t: { number: number }) => t.number)).not.toContain(1);
  });

  test("conserva lo que el handoff no tiene dónde poner (Detalles, Desbloquea) y las decisiones pendientes", async () => {
    const backlog = BACKLOG_ONE.replace(
      "- **Decisiones/temas a definir antes de empezar:** Ninguno.",
      "- **Decisiones/temas a definir antes de empezar:**\n  - elegir A\n  - elegir B",
    ).replace("- **Agregada:** 2026-10-01.", "- **Desbloquea:** Tarea 4.\n- **Detalles:** contexto largo\n- **Agregada:** 2026-10-01.");
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": backlog, "history.md": "# History\n" } });
    await exec(["start", "7", "--apply"], p);
    const handoff = read(p, "gersom", "handoff.md");
    expect(handoff).toContain("Hacer lo único.\n\n- **Desbloquea:** Tarea 4.\n- **Detalles:** contexto largo\n\n### Qué falta");
    expect(handoff).toContain("### Decisiones a medio camino\n\n- elegir A\n- elegir B\n\n### Próximo paso concreto");
    expect(handoff).not.toContain("Disparador");
    expect(handoff).not.toContain("Agregada");
  });

  test("si era la única libre, la sección queda con «Ninguna.» y sin huecos", async () => {
    const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_EMPTY, "backlog.md": BACKLOG_ONE, "history.md": "# History\n" } });
    await exec(["start", "7", "--apply"], p);
    expect(read(p, "gersom", "backlog.md")).toBe(
      BACKLOG_ONE.replace(
        /### Tarea 7 — La única[^]*?2026-10-01\./,
        "Ninguna.",
      ),
    );
  });

  test("quita una del medio sin dejar líneas en blanco dobles", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "3", "--apply"], p);
    const text = read(p, "gersom", "backlog.md");
    expect(text).not.toContain("Exportar como skill\n\n- **Bloqueos:** `[Resuelto el 2026-09-24]`"); // la «Tarea 3» ya no está
    expect(text).not.toMatch(/\n\n\n/);
    expect(text).toContain("- **Resumen:** todo lo de `plans/`.\n\n### Tarea 18 — Revisar los links");
  });

  test("repetir el mismo `start --apply` falla limpio (ya hay una tarea en curso) y no cambia nada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    expect((await exec(["start", "1", "--apply"], p)).code).toBe(0);
    const after = snapshot(p.root);
    const again = await exec(["start", "1", "--apply"], p);
    expect(again.code).toBe(1);
    expect(again.err).toContain("Ya hay una tarea en curso (Tarea 1 — Probar el flujo completo)");
    expect(snapshot(p.root)).toEqual(after);
  });

  describe("errores: no se escribe nada", () => {
    test("ya hay una tarea en curso: sugiere pausarla", async () => {
      const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "handoff.md": HANDOFF_CURRENT } });
      const before = snapshot(p.root);
      const { code, err } = await exec(["start", "1", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("Ya hay una tarea en curso (Tarea 12 — Implementar el parser)");
      expect(err).toContain("pausa");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("bloqueada: error salvo --force, que además deja constancia en la salida", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      const before = snapshot(p.root);
      const refused = await exec(["start", "6", "--apply"], p);
      expect(refused.code).toBe(1);
      expect(refused.err).toContain("está en «bloqueadas / pospuestas» (dependencia: depende de la Tarea 11.)");
      expect(refused.err).toContain("--force");
      expect(snapshot(p.root)).toEqual(before);

      const forced = await exec(["start", "6", "--force", "--apply"], p);
      expect(forced.code).toBe(0);
      expect(forced.out).toContain("Tarea 6 empezada: sacada de «Tareas bloqueadas / pospuestas»");
      expect(forced.out).toContain("Aviso: se empezó una tarea bloqueada por --force; su bloqueo era: depende de la Tarea 11.");
      expect(read(p, "gersom", "handoff.md")).toContain("Tarea 6 — Publicar el sitio");
      expect(read(p, "gersom", "backlog.md")).not.toContain("### Tarea 6 —");
      expect(read(p, "gersom", "backlog.md")).toContain("### Tarea 7 — Rehacer el README");
    });

    test("agrupada: error que explica que sacarla del grupo es otro paso", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      const before = snapshot(p.root);
      const { code, err } = await exec(["start", "14", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("tarea agrupada (grupo «Documentar los planes»)");
      expect(err).toContain("acsuite task group-eject 14");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("pausada, cerrada o inexistente: error claro", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      const before = snapshot(p.root);
      expect((await exec(["start", "8", "--apply"], p)).err).toContain("está pausada");
      expect((await exec(["start", "11", "--apply"], p)).err).toContain("ya está cerrada");
      const missing = await exec(["start", "99", "--apply"], p);
      expect(missing.err).toContain("No existe la Tarea 99");
      expect(missing.err).toContain("Números conocidos");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("argumento mal formado o de otro operador", async () => {
      const p = project({ folders: ["gersom", "ana"], ...IDLE });
      expect((await exec(["start", "--apply"], p)).code).toBe(2);
      const title = await exec(["start", "Una tarea del equipo", "--apply"], p);
      expect(title.code).toBe(2);
      expect(title.err).toContain("start --team");
      const other = await exec(["start", "1@ana", "--apply"], p);
      expect(other.code).toBe(1);
      expect(other.err).toContain("de otro operador");
    });

    test("--mode sin --plan, o un plan sin pasos", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      expect((await exec(["start", "1", "--mode", "auto", "--apply"], p)).err).toContain("--mode solo tiene sentido con --plan");
      expect((await exec(["start", "1", "--plan", "-", "--apply"], p, { stdin: "- [ ] \n\n" })).err).toContain("--plan no trae ningún paso");
    });

    test("--mode solo acepta los cuatro modos; `extreme` exige --confirm", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      const before = snapshot(p.root);
      const free = await exec(["start", "1", "--plan", "-", "--mode", "uno a la vez", "--apply"], p, { stdin: "Paso 1" });
      expect(free.code).toBe(2);
      expect(free.err).toContain("«uno a la vez» no es un modo de ejecución válido");
      expect(free.err).toContain("guided");
      const extreme = await exec(["start", "1", "--plan", "-", "--mode", "extreme", "--apply"], p, { stdin: "Paso 1" });
      expect(extreme.code).toBe(2);
      expect(extreme.err).toContain("exige --confirm");
      expect(snapshot(p.root)).toEqual(before);
      expect((await exec(["start", "1", "--plan", "-", "--mode", "extreme", "--confirm", "--apply"], p, { stdin: "Paso 1" })).code).toBe(0);
      expect(read(p, "gersom", "handoff.md")).toContain("**Modo de ejecución acordado:** extreme\n");
    });

    test("--confirm con otro modo se ignora", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      expect((await exec(["start", "1", "--plan", "-", "--mode", "guided", "--confirm", "--apply"], p, { stdin: "Paso 1" })).code).toBe(0);
      expect(read(p, "gersom", "handoff.md")).toContain("**Modo de ejecución acordado:** guided\n");
    });

    test("«Tarea en progreso» con contenido que no es una tarea: no lo sobrescribe", async () => {
      const handoff = HANDOFF_IDLE.replace("Sin tarea en curso", "Sin tarea en curso\n\n### Plan\n\n- [ ] Algo suelto");
      const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "handoff.md": handoff } });
      const before = snapshot(p.root);
      const { code, err } = await exec(["start", "1", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("no lo sobrescribo");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("sin handoff.md o sin backlog.md", async () => {
      expect((await exec(["start", "1", "--apply"], project({ folders: ["gersom"], omit: ["handoff.md"] }))).err).toContain("no tiene handoff.md");
      expect((await exec(["start", "1", "--apply"], project({ folders: ["gersom"], omit: ["backlog.md"] }))).err).toContain("Falta backlog.md");
    });

    test("la Tarea en más de un lugar: error", async () => {
      const backlog = BACKLOG_RICH.replace("### Tarea 18 — Revisar los links", "### Tarea 1 — Repetida\n\n- **Disparador:** x\n\n### Tarea 18 — Revisar los links");
      const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "backlog.md": backlog } });
      const { code, err } = await exec(["start", "1", "--apply"], p);
      expect(code).toBe(1);
      expect(err).toContain("aparece en 2 lugares");
    });

    test("carpeta de otro operador o sin verificar: se niega, con y sin --apply", async () => {
      const p = project({ folders: ["gersom", "ana"], ...IDLE, folderContents: { ana: IDLE.contents } });
      const before = snapshot(p.root);
      for (const extra of [[], ["--apply"]]) {
        const { code, err, out } = await exec(["start", "1", "--operator", "ana", ...extra], p);
        expect(code).toBe(1);
        expect(err).toContain("«ana» no es la tuya");
        expect(out).toBe("");
      }
      expect((await exec(["start", "1", "--operator", "gersom", "--apply"], p, { email: null })).err).toContain("No se pudo verificar");
      expect(snapshot(p.root)).toEqual(before);
    });

    test("un operador «solo team-backlog» no tiene tareas que empezar", async () => {
      const p = project({ folders: ["gersom"], ...IDLE });
      const { code, err } = await exec(["start", "--team", "Migrar el CI", "--apply"], p, { email: "luis@mail.com" });
      expect(code).toBe(1);
      expect(err).toContain("solo team-backlog");
    });
  });

  describe("finales de línea e idioma", () => {
    test("archivos CRLF siguen siendo CRLF", async () => {
      const crlf = (text: string) => text.replace(/\n/g, "\r\n");
      const p = project({
        folders: ["gersom"],
        contents: { "handoff.md": crlf(HANDOFF_IDLE), "backlog.md": crlf(BACKLOG_RICH), "history.md": crlf(HISTORY_RICH) },
      });
      expect((await exec(["start", "3", "--plan", "Paso 1 — a", "--apply"], p)).code).toBe(0);
      for (const file of ["handoff.md", "backlog.md"]) {
        const text = read(p, "gersom", file);
        expect(text).toContain("\r\n");
        expect(text.replace(/\r\n/g, "")).not.toContain("\n");
        expect(text.replace(/\r\n/g, "")).not.toContain("\r");
      }
      expect(read(p, "gersom", "handoff.md")).toContain("Tarea 3 — Exportar como skill\r\n\r\n### Plan\r\n\r\n- [ ] Paso 1 — a\r\n- [ ] Documentar cierre de tarea\r\n");
      const { out } = await exec(["status", "--json"], p);
      expect(JSON.parse(out).current.number).toBe(3);
    });

    test("un proyecto en inglés: `Task`, títulos de subsección en inglés y «None.» al quedar vacía", async () => {
      const p = project({ folders: ["gersom"], contents: { "handoff.md": HANDOFF_IDLE_EN, "backlog.md": BACKLOG_EN, "history.md": HISTORY_EN } });
      const { code, out } = await exec(["start", "4", "--plan", "Step 1 — write", "--apply"], p);
      expect(code).toBe(0);
      expect(out).not.toContain("Aviso");
      expect(read(p, "gersom", "handoff.md")).toBe(
        HANDOFF_IDLE_EN.replace(
          "No task in progress",
          [
            "Task 4 — Translate the glossary",
            "",
            "translate `glossary.md`.",
            "",
            "### Plan",
            "",
            "- [ ] Step 1 — write",
            "- [ ] Document task closure",
            "",
            "### What's left",
            "",
            "All the plan steps.",
            "",
            "### Decisions along the way",
            "",
            "None.",
            "",
            "### Next concrete step",
            "",
            "Step 1 — write",
          ].join("\n"),
        ),
      );
      expect(read(p, "gersom", "backlog.md")).toContain("## Free tasks\n\nNone.\n\n<!-- agent-context-skill:section=blocked -->");
    });
  });

  test("repo plano: funciona sin operadores", async () => {
    const p = project({ flat: true, contents: IDLE.contents });
    const { code } = await exec(["start", "1", "--apply"], p, { email: null });
    expect(code).toBe(0);
    expect(read(p, "handoff.md")).toContain("Tarea 1 — Probar el flujo completo");
    expect(read(p, "backlog.md")).not.toContain("### Tarea 1 —");
  });
});

describe("start --team", () => {
  test("sin --apply muestra el diff de los tres archivos y no escribe nada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { out } = await exec(["start", "--team", "Migrar el CI"], p);
    expect(out).toContain("team-backlog.md");
    expect(out).toContain("+Tarea 20 — Migrar el CI");
    expect(out).toContain("+**Próximo número de tarea:** 21");
    expect(out).toContain(APPLY_NOTICE);
    expect(snapshot(p.root)).toEqual(before);
  });

  test("la quita del team-backlog, le da el siguiente número, y el handoff lleva `Origen: team-backlog` (todo a la vez)", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const { code, out } = await exec(["start", "--team", "migrar el ci", "--apply"], p);
    expect(code).toBe(0);
    expect(out).toBe(
      "«Migrar el CI» tomada de «Tareas libres» del team-backlog.md como Tarea 20 (próximo número: 21) y puesta en «Tarea en progreso» de docs/agents/gersom/handoff.md.",
    );
    expect(read(p, "team-backlog.md")).toBe(TEAM_RICH.replace("\n### Migrar el CI\n\n- **Descripción:** CUERPO-TEAM-2\n", ""));
    expect(read(p, "gersom", "backlog.md")).toBe(BACKLOG_RICH.replace("**Próximo número de tarea:** 20", "**Próximo número de tarea:** 21"));
    expect(read(p, "gersom", "handoff.md")).toContain(
      "Tarea 20 — Migrar el CI\n\nCUERPO-TEAM-2\n\n- **Origen:** team-backlog\n\n### Qué falta\n\nToda la tarea.\n",
    );
    const state = JSON.parse((await exec(["status", "--json"], p)).out);
    expect(state.current.number).toBe(20);
    expect(state.team.free.map((t: { title: string }) => t.title)).toEqual(["Revisar el copy del onboarding"]);
    expect(state.nextTaskNumber).toBe(21);
  });

  test("con plan y modo", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    await exec(["start", "--team", "Revisar el copy", "--plan", "Paso 1 — leer", "--mode", "auto", "--apply"], p);
    const handoff = read(p, "gersom", "handoff.md");
    expect(handoff).toContain("Tarea 20 — Revisar el copy del onboarding\n\nCUERPO-TEAM-1\n\n- **Origen:** team-backlog\n\n### Plan\n\n- [ ] Paso 1 — leer\n- [ ] Documentar cierre de tarea\n\n**Modo de ejecución acordado:** auto\n");
  });

  test("la única libre del team-backlog: la sección queda con «Ninguna.»", async () => {
    const team = TEAM_RICH.replace(/### Revisar el copy del onboarding[^]*?### Migrar el CI/, "### Migrar el CI");
    const p = project({ folders: ["gersom"], ...IDLE, teamBacklogText: team });
    await exec(["start", "--team", "Migrar el CI", "--apply"], p);
    expect(read(p, "team-backlog.md")).toContain("## Tareas libres\n\nNinguna.\n\n<!-- agent-context-skill:section=blocked -->");
  });

  test("una bloqueada del team-backlog necesita --force", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const refused = await exec(["start", "--team", "Cambiar de proveedor", "--apply"], p);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("está en «bloqueadas / pospuestas»");
    expect(snapshot(p.root)).toEqual(before);
    const forced = await exec(["start", "--team", "Cambiar de proveedor", "--force", "--apply"], p);
    expect(forced.code).toBe(0);
    expect(forced.out).toContain("del team-backlog.md como Tarea 20");
    expect(forced.out).toContain("Aviso: se empezó una tarea bloqueada por --force");
    expect(read(p, "team-backlog.md")).toContain("## Tareas bloqueadas / pospuestas\n\nNinguna.");
  });

  test("título que no existe, ambiguo, o sin team-backlog.md: error y no escribe", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    expect((await exec(["start", "--team", "no existe", "--apply"], p)).err).toContain("Ninguna tarea del team-backlog.md");
    const ambiguous = await exec(["start", "--team", "e", "--apply"], p);
    expect(ambiguous.err).toContain("coincide con");
    expect(ambiguous.err).toContain("Migrar el CI");
    expect(snapshot(p.root)).toEqual(before);
    const none = project({ folders: ["gersom"], contents: IDLE.contents });
    expect((await exec(["start", "--team", "algo", "--apply"], none)).err).toContain("No hay team-backlog.md");
  });

  test("contador incoherente: error y no escribe en ninguno de los tres archivos", async () => {
    const low = BACKLOG_RICH.replace("**Próximo número de tarea:** 20", "**Próximo número de tarea:** 18");
    const p = project({ folders: ["gersom"], ...IDLE, contents: { ...IDLE.contents, "backlog.md": low } });
    const before = snapshot(p.root);
    const { code, err } = await exec(["start", "--team", "Migrar el CI", "--apply"], p);
    expect(code).toBe(1);
    expect(err).toContain("no es mayor que la tarea más alta que ya existe (la 18)");
    expect(snapshot(p.root)).toEqual(before);
  });

  test("atomicidad: si el team-backlog cambia en disco mientras se prepara, no se escribe ni el handoff ni el backlog", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const cap = captureIo();
    const teamPath = join(p.agents, "team-backlog.md");
    const code = await run(["start", "--team", "Migrar el CI", "--apply"], {
      io: cap.io,
      email: "gersom@mail.com",
      baseDir: p.root,
      commands: [
        {
          // Lee y, antes de escribir, "otro proceso" toca el team-backlog.md.
          name: "start",
          summary: "",
          usage: "",
          writes: true,
          flags: { team: { type: "boolean", description: "" }, force: { type: "boolean", description: "" } },
          async run(ctx) {
            ctx.docs();
            writeFileSync(teamPath, TEAM_RICH + "\n<!-- otro -->\n");
            const { start } = await import("../../src/commands/start.ts");
            await start.run(ctx);
          },
        },
      ],
    });
    expect(code).toBe(1);
    expect(cap.err.join("\n")).toContain("cambió en disco");
    expect(cap.err.join("\n")).toContain("No se escribió ningún archivo");
    expect(read(p, "gersom", "handoff.md")).toBe(HANDOFF_IDLE);
    expect(read(p, "gersom", "backlog.md")).toBe(BACKLOG_RICH);
  });
});

describe("flags en español", () => {
  test("--modo es desconocido: código 2 y no se escribe nada", async () => {
    const p = project({ folders: ["gersom"], ...IDLE });
    const before = snapshot(p.root);
    const { code, err } = await exec(["start", "1", "--plan", "-", "--modo", "uno a la vez", "--apply"], p, { stdin: "Paso 1" });
    expect(code).toBe(2);
    expect(err).toContain("Flag desconocido: --modo.");
    expect(snapshot(p.root)).toEqual(before);
  });
});
