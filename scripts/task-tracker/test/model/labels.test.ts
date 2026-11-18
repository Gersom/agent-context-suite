import { describe, expect, test } from "bun:test";
import { filterModel, filterTeamBacklog, modelLabels, nextLabel, reconcileLabel } from "../../src/model/labels.ts";
import { buildModel } from "../../src/model/model.ts";
import { buildTeamBacklog } from "../../src/model/team.ts";

// Un proyecto con etiquetas repartidas por todas las cajas (con distintas mayúsculas) y tareas sin etiquetas.
const HANDOFF = `# Handoff

<!-- agent-context-skill:section=in-progress -->
## Tarea en progreso

**Tarea:** Tarea 12 — Implementar el parser

- **Etiquetas:** otra

### Plan

- [ ] Paso 1 — Escribir

<!-- agent-context-skill:section=paused -->
## Tareas pausadas

### Tarea 8 — Revisar la API

- **Etiquetas:** Empresa1 trabajo

### Tarea 9 — Ordenar la carpeta

- **Etiquetas:** zeta
`;

const BACKLOG = `# Backlog

<!-- agent-context-skill:section=free -->
## Tareas libres

### Tarea 1 — Probar el flujo

- **Etiquetas:** empresa1

### Tarea 2 — Sin etiquetas

- **Descripción:** nada.

### Grupo — Documentar los planes (Tareas 14, 15, 16)

- **Resumen:** todo lo de plans.

### Grupo — Solo zeta (Tarea 17)

- **Resumen:** nada de empresa1.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Tarea 4 — Deploy

- **Bloqueos:** \`[postergada]\` después.
- **Etiquetas:** EMPRESA1

### Tarea 5 — Rehacer el README

- **Bloqueos:** \`[postergada]\` después.
- **Etiquetas:** zeta

<!-- agent-context-skill:section=grouped -->
## Tareas agrupadas

### Grupo — Documentar los planes

#### Tarea 14 — Redactar costs

- **Etiquetas:** empresa1

#### Tarea 15 — Redactar limits

- **Etiquetas:** zeta

### Grupo — Solo zeta

#### Tarea 17 — Redactar zeta

- **Etiquetas:** zeta
`;

const HISTORY = `# Historial

## 2026-10-06 — ✅ Tarea 11 — Escribir el parser

- **Etiquetas:** empresa1
- Listo.

## 2026-10-05 — ✅ Tarea 10 — Sin etiquetas

- Listo.

## 2026-10-04 — ✅ Tarea 9 — Con zeta

- **Etiquetas:** zeta
- Listo.
`;

const TEAM_BACKLOG = `<!-- agent-context-skill:section=free -->
## Tareas libres

### Revisar el copy

- **Etiquetas:** empresa1

### Sin etiquetas del equipo

- **Descripción:** nada.

<!-- agent-context-skill:section=blocked -->
## Tareas bloqueadas / pospuestas

### Migrar datos

- **Bloqueos:** \`[postergada]\` después.
- **Etiquetas:** zeta
`;

const model = buildModel({ handoffText: HANDOFF, backlogText: BACKLOG, historyText: HISTORY });
const teamBacklog = buildTeamBacklog(TEAM_BACKLOG);

describe("modelLabels", () => {
  test("únicas sin distinguir mayúsculas, con la primera forma, en orden alfabético sin distinguir mayúsculas", () => {
    expect(modelLabels(model, teamBacklog)).toEqual(["empresa1", "otra", "trabajo", "zeta"]);
  });

  test("la primera forma es la de la caja más alta en pantalla (sin dueño, libres, bloqueadas, en curso, pausadas, completadas)", () => {
    // Sin el team-backlog, la primera es la de la libre `empresa1` y no la de la bloqueada `EMPRESA1` ni la pausada `Empresa1`.
    expect(modelLabels(model)).toEqual(["empresa1", "otra", "trabajo", "zeta"]);
    const upper = buildModel({ handoffText: HANDOFF, backlogText: BACKLOG.replace("- **Etiquetas:** empresa1\n\n### Tarea 2", "- **Etiquetas:** EMPRESA1\n\n### Tarea 2"), historyText: HISTORY });
    expect(modelLabels(upper)).toContain("EMPRESA1");
    expect(modelLabels(upper)).not.toContain("empresa1");
  });

  test("ordena sin distinguir mayúsculas: Alfa y beta van antes que empresa1 aunque la A sea mayúscula", () => {
    const mixed = buildModel({ handoffText: HANDOFF, backlogText: BACKLOG.replace("- **Etiquetas:** zeta\n\n<!-- agent-context-skill:section=grouped", "- **Etiquetas:** Alfa beta\n\n<!-- agent-context-skill:section=grouped"), historyText: HISTORY });
    expect(modelLabels(mixed)).toEqual(["Alfa", "beta", "empresa1", "otra", "trabajo", "zeta"]);
  });

  test("las tareas de un grupo de libres cuentan", () => {
    const onlyGroups = { ...model, free: { tasks: [], groups: model.free.groups }, blocked: [], paused: [], current: null, completed: [] };
    expect(modelLabels(onlyGroups)).toEqual(["empresa1", "zeta"]);
  });

  test("sin etiquetas en el proyecto: lista vacía", () => {
    const bare = buildModel({ handoffText: HANDOFF.replace(/- \*\*Etiquetas:\*\*.*\n/g, ""), backlogText: BACKLOG.replace(/- \*\*Etiquetas:\*\*.*\n/g, ""), historyText: HISTORY.replace(/- \*\*Etiquetas:\*\*.*\n/g, "") });
    expect(modelLabels(bare)).toEqual([]);
  });
});

describe("nextLabel (el ciclo de la tecla t)", () => {
  const labels = ["empresa1", "trabajo"];

  test("todas → cada etiqueta → todas", () => {
    expect(nextLabel(labels, null)).toBe("empresa1");
    expect(nextLabel(labels, "empresa1")).toBe("trabajo");
    expect(nextLabel(labels, "trabajo")).toBeNull();
  });

  test("compara sin distinguir mayúsculas", () => {
    expect(nextLabel(labels, "EMPRESA1")).toBe("trabajo");
  });

  test("sin etiquetas no hay nada que recorrer", () => {
    expect(nextLabel([], null)).toBeNull();
    expect(nextLabel([], "empresa1")).toBeNull();
  });

  test("una etiqueta que no está en la lista empieza el ciclo", () => {
    expect(nextLabel(labels, "otra")).toBe("empresa1");
  });
});

describe("reconcileLabel", () => {
  test("conserva la etiqueta (con la forma actual); si ya no existe, vuelve a «todas»", () => {
    expect(reconcileLabel(["empresa1", "zeta"], "zeta")).toBe("zeta");
    expect(reconcileLabel(["Empresa1"], "empresa1")).toBe("Empresa1");
    expect(reconcileLabel(["empresa1"], "zeta")).toBeNull();
    expect(reconcileLabel([], "zeta")).toBeNull();
    expect(reconcileLabel(["empresa1"], null)).toBeNull();
  });
});

describe("filterModel", () => {
  test("sin filtro devuelve el mismo modelo", () => {
    expect(filterModel(model, null)).toBe(model);
  });

  test("libres: solo las tareas sueltas con la etiqueta (sin distinguir mayúsculas)", () => {
    expect(filterModel(model, "empresa1").free.tasks.map((t) => t.number)).toEqual([1]);
    expect(filterModel(model, "EMPRESA1").free.tasks.map((t) => t.number)).toEqual([1]);
  });

  test("bloqueadas, pausadas y completadas: solo las que llevan la etiqueta", () => {
    const filtered = filterModel(model, "empresa1");
    expect(filtered.blocked.map((t) => t.number)).toEqual([4]);
    expect(filtered.paused.map((t) => t.number)).toEqual([8]);
    expect(filtered.completed.map((e) => e.number)).toEqual([11]);
    const zeta = filterModel(model, "zeta");
    expect(zeta.blocked.map((t) => t.number)).toEqual([5]);
    expect(zeta.paused.map((t) => t.number)).toEqual([9]);
    expect(zeta.completed.map((e) => e.number)).toEqual([9]);
  });

  test("la tarea en curso se ve siempre, aunque no lleve la etiqueta", () => {
    expect(model.current?.labels).toEqual(["otra"]);
    expect(filterModel(model, "empresa1").current).toBe(model.current);
    expect(filterModel(model, "zeta").current).toBe(model.current);
  });

  test("grupos: se filtran por sus tareas (con sus números) y uno sin tareas coincidentes desaparece", () => {
    const filtered = filterModel(model, "empresa1").free.groups;
    expect(filtered.map((g) => g.title)).toEqual(["Documentar los planes"]);
    expect(filtered[0].taskNumbers).toEqual([14]);
    expect(filtered[0].tasks.map((t) => t.number)).toEqual([14]);
    // La 16 no tiene detalle en «Tareas agrupadas»: nunca coincide con una etiqueta.
    expect(filterModel(model, "zeta").free.groups.map((g) => [g.title, g.taskNumbers])).toEqual([
      ["Documentar los planes", [15]],
      ["Solo zeta", [17]],
    ]);
  });

  test("los contadores reflejan lo filtrado: libres cuenta sueltas y tareas de grupos", () => {
    expect(model.counts).toEqual({ paused: 2, free: 6, blocked: 2 });
    expect(filterModel(model, "empresa1").counts).toEqual({ paused: 1, free: 2, blocked: 1 });
    expect(filterModel(model, "zeta").counts).toEqual({ paused: 1, free: 2, blocked: 1 });
    expect(filterModel(model, "trabajo").counts).toEqual({ paused: 1, free: 0, blocked: 0 });
  });

  test("una caja que queda vacía queda con 0 tareas y 0 en su contador", () => {
    const filtered = filterModel(model, "otra");
    expect(filtered.free).toEqual({ tasks: [], groups: [] });
    expect(filtered.blocked).toEqual([]);
    expect(filtered.paused).toEqual([]);
    expect(filtered.completed).toEqual([]);
    expect(filtered.counts).toEqual({ paused: 0, free: 0, blocked: 0 });
  });

  test("no toca el resto del modelo ni el original", () => {
    const filtered = filterModel(model, "zeta");
    expect(filtered.warnings).toBe(model.warnings);
    expect(filtered.hasBacklog).toBe(model.hasBacklog);
    expect(filtered.hasHistory).toBe(model.hasHistory);
    expect(model.counts).toEqual({ paused: 2, free: 6, blocked: 2 });
    expect(model.free.groups).toHaveLength(2);
  });
});

describe("filterTeamBacklog", () => {
  test("sin filtro devuelve el mismo", () => {
    expect(filterTeamBacklog(teamBacklog, null)).toBe(teamBacklog);
  });

  test("libres y bloqueadas del team-backlog: solo las que llevan la etiqueta", () => {
    const empresa = filterTeamBacklog(teamBacklog, "empresa1");
    expect(empresa.free.map((t) => t.title)).toEqual(["Revisar el copy"]);
    expect(empresa.blocked).toEqual([]);
    const zeta = filterTeamBacklog(teamBacklog, "zeta");
    expect(zeta.free).toEqual([]);
    expect(zeta.blocked.map((t) => t.title)).toEqual(["Migrar datos"]);
    expect(zeta.present).toBe(true);
  });
});
