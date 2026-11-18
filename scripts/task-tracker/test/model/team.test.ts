import { describe, expect, test } from "bun:test";
import { buildTeamBacklog, buildTeamModel } from "../../src/model/team.ts";
import type { SnapshotRead, TeamRead } from "../../src/shared/types.ts";
import { fixture } from "../../../_shared/test/helpers.ts";

const snap = (name: string, overrides: Partial<SnapshotRead> = {}): SnapshotRead => ({
  handoffText: fixture(name, "handoff.md"),
  backlogText: fixture(name, "backlog.md"),
  historyText: fixture(name, "history.md"),
  warnings: [],
  needsRetry: false,
  ...overrides,
});

const TEAM_BACKLOG = `<!-- agent-context-skill:section=free -->
## Tareas libres

### Revisar el copy

- **Descripción:** x
- **Bloqueos:** Ninguno.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Integrar la pasarela

- **Bloqueos:** \`[dependencia]\` espera la cuenta.

### Sin bloqueo vigente

- **Bloqueos:** Ninguno.
`;

function read(overrides: Partial<TeamRead> = {}): TeamRead {
  return {
    operators: [
      { entry: { folder: "gersom", emails: ["g@mail.com"], folderless: false }, snapshot: snap("es-anchors") },
      { entry: { folder: "ana", emails: ["ana@mail.com"], folderless: false }, snapshot: snap("es-anchors", { handoffText: null }) },
      { entry: { folder: "luis", emails: ["luis@mail.com"], folderless: true }, snapshot: null },
    ],
    teamBacklogText: TEAM_BACKLOG,
    warnings: [],
    needsRetry: false,
    ...overrides,
  };
}

describe("buildTeamModel", () => {
  test("una fila por operador: tarea en curso con el avance del plan, conteos y última completada", () => {
    const [gersom] = buildTeamModel(read()).rows;
    expect(gersom.folder).toBe("gersom");
    expect(gersom.current).toMatchObject({ label: "Tarea", number: expect.any(Number), title: expect.any(String), done: expect.any(Number), total: expect.any(Number) });
    expect(gersom.counts.free).toBeGreaterThan(0);
    expect(gersom.lastCompleted).not.toBeNull();
    expect(gersom.missing).toBe(false);
  });

  test("operador sin handoff legible: fila marcada como faltante y aviso con su carpeta", () => {
    const model = buildTeamModel(read());
    expect(model.rows[1]).toMatchObject({ folder: "ana", missing: true, current: null });
    expect(model.warnings.some((w) => w.startsWith("[ana] handoff.md no existe"))).toBe(true);
  });

  test("operador «solo team-backlog»: fila sin carpeta, sin tarea ni conteos", () => {
    const luis = buildTeamModel(read()).rows[2];
    expect(luis).toMatchObject({ folder: "luis", folderless: true, current: null, counts: { free: 0, blocked: 0 }, lastCompleted: null });
  });

  test("incluye los avisos de lectura y los del team-backlog", () => {
    const model = buildTeamModel(read({ warnings: ["operators.md: línea sin leer: rota"] }));
    expect(model.warnings).toContain("operators.md: línea sin leer: rota");
    expect(model.warnings.some((w) => w.includes('"Sin bloqueo vigente" está en "bloqueadas"'))).toBe(true);
  });
});

describe("buildTeamBacklog", () => {
  test("libres y bloqueadas por título, con el tag de bloqueo", () => {
    const backlog = buildTeamBacklog(TEAM_BACKLOG);
    expect(backlog.present).toBe(true);
    expect(backlog.free.map((t) => t.title)).toEqual(["Revisar el copy"]);
    expect(backlog.blocked[0]).toEqual({ title: "Integrar la pasarela", labels: [], block: { tag: "dependencia", reason: "espera la cuenta." } });
  });

  test("sin archivo: no está presente; vacío: aviso", () => {
    expect(buildTeamBacklog(null)).toEqual({ present: false, free: [], blocked: [], warnings: [] });
    expect(buildTeamBacklog("  \n").warnings).toEqual(["team-backlog.md está vacío (¿se está reescribiendo?)."]);
  });

  test("ignora las tareas placeholder de la plantilla y avisa", () => {
    const text = "<!-- agent-context-skill:section=free -->\n## Tareas libres\n\n### [Placeholder — título]\n\n- **Descripción:** [Placeholder]\n\n<!-- agent-context-skill:section=blocked -->\n## Tareas bloqueadas\n";
    const backlog = buildTeamBacklog(text);
    expect(backlog.free).toEqual([]);
    expect(backlog.warnings).toContain("team-backlog.md tiene placeholders sin completar.");
  });
});
