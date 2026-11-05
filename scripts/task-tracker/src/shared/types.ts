// Tipos propios del task-tracker: el modelo que se pinta en pantalla y los resultados de leer
// archivos y resolver rutas. Los tipos del dominio (tareas, secciones, historial) viven en
// `scripts/_shared/types.ts`.

import type { ExecutionMode } from "../../../_shared/parse/plan-mode.ts";
import type {
  BlockInfo,
  CurrentTaskLine,
  Group,
  HistoryEntry,
  OperatorEntry,
  ParsedPausedTask,
  PlanStep,
  Subsection,
  Task,
  TaskRef,
} from "../../../_shared/types.ts";

/** Tarea referenciada por un grupo pero sin detalle en "Tareas agrupadas". */
export interface MissingTaskRef {
  number: number;
  label: null;
  title: null;
}

/** Grupo de "Tareas libres" con sus tareas enlazadas desde "Tareas agrupadas". */
export type FreeGroup = Omit<Group, "tasks"> & { tasks: Array<Task | MissingTaskRef> };

export interface BlockedTask extends Task {
  block: BlockInfo;
  /** Tareas de las que depende, según lo que menciona el motivo del bloqueo. */
  dependsOn: TaskRef[];
}

export interface Plan {
  steps: PlanStep[];
  done: number;
  total: number;
  currentStep: PlanStep | null;
}

/**
 * Lo que la pantalla muestra de una tarea con plan (en progreso o pausada); el resto de sus
 * subsecciones o campos (ej. «Qué falta», «Próximo paso concreto») no se muestra.
 */
interface TaskView {
  plan: Plan;
  /** Modo de ejecución del plan; `null` si no hay línea de modo, está vacía o trae texto legado (solo cuentan los cuatro modos). */
  mode: ExecutionMode | null;
  /** De qué trata, tal como está escrito (con sus saltos de línea); `null` si no trae. */
  description: string | null;
  /** «Decisiones a medio camino»; `null` si no hay o dice «Ninguna.»/«None». */
  decisions: string | null;
}

/** Tarea pausada con el avance de su plan (vacío si no traía plan) y sus campos propios. */
export interface PausedTask extends ParsedPausedTask, TaskView {
  /** «Por qué se pausó»; `null` si no lo trae. */
  why: string | null;
  /** «Qué espera para retomarse»; `null` si no lo trae. */
  waits: string | null;
}

export interface CurrentTask extends CurrentTaskLine, TaskView {
  subsections: Subsection[];
}

/** Modelo completo para la pantalla. */
export interface Model {
  hasBacklog: boolean;
  hasHistory: boolean;
  /** Últimas entradas de history.md (las más nuevas primero). */
  completed: HistoryEntry[];
  current: CurrentTask | null;
  paused: PausedTask[];
  free: { tasks: Task[]; groups: FreeGroup[] };
  blocked: BlockedTask[];
  grouped: Group[];
  counts: { paused: number; free: number; blocked: number };
  warnings: string[];
  notes: string[];
}

/** Resultado de leer un archivo sin cortar el programa. */
export interface ReadResult {
  /** `null` si no existe o no se pudo leer. */
  text: string | null;
  error: string | null;
  /** Código del error de lectura (ej. `EBUSY`), si lo hubo. */
  code: string | null;
}

export type ReadFile = (path: string) => ReadResult;

export interface SnapshotRead {
  handoffText: string | null;
  backlogText: string | null;
  historyText: string | null;
  warnings: string[];
  needsRetry: boolean;
}

/**
 * Modo multi-operador: `agentsDir` es la raíz de agentes (con `operators.md`) y `multi` dice qué
 * abrir. `operator`: panel que se abre de frente (segundo argumento); `preferred`: carpeta del
 * operador del correo de git, o `null` si no figura con carpeta.
 */
export interface MultiInfo {
  operator?: string;
  preferred: string | null;
}
export type ResolveOk = { ok: true; agentsDir: string; projectName: string; projectDir: string; multi?: MultiInfo };
export type ResolveError = { ok: false; error: string; tried: string[] };
export type ResolveResult = ResolveOk | ResolveError;

/**
 * Qué provocó el redibujo, para el encabezado: el primer pintado, un cambio en un archivo
 * (`file: null` si el SO no informó cuál) o un redibujo sin cambio de archivos (atajo `r`,
 * cambio de tamaño de la terminal, error del watcher).
 */
export type DrawTrigger = { kind: "start" } | { kind: "change"; file: string | null } | { kind: "redraw" };

/** Qué atajos se muestran al pie: los de teclado, solo Ctrl+C, o ninguno (`--once`). */
export type Controls = "keys" | "ctrl-c" | "none";

export interface RenderMeta {
  /** Nombre de la carpeta del repo, tal cual (se formatea al pintar). */
  projectName: string;
  /** Ruta del repo (o la carpeta vigilada, si no sigue la estructura `docs/agents`). */
  projectDir: string;
  /** Carpeta del operador vigilado (modo multi-operador); se muestra en el encabezado. */
  operator?: string;
  /** Tareas sin dueño (modo multi-operador): se pintan en el recuadro "SIN DUEÑO" debajo de las bloqueadas. */
  teamBacklog?: TeamBacklogModel;
  /** Qué vista es, si no es el panel de un repo plano (cambia las teclas que indica el pie). */
  multiView?: "team" | "operator" | "projects" | "observer";
  /** Lista de proyectos: texto de la ruta que se escribe para agregar un repo; `null` si no se agrega. */
  input?: string | null;
  /** Lista de proyectos: nombre y ruta del proyecto cuya salida de la lista se pide confirmar; `null` si no se confirma nada. */
  confirmRemove?: { name: string; path: string } | null;
  /** Lista de proyectos: `true` si hay filas (sin ellas el pie no ofrece `[x] quitar`); `renderProjects` lo completa. */
  hasRows?: boolean;
  /**
   * Modo observador: presente si está activo (ausente = apagado). `notice`: el último aviso, por
   * ejemplo que el proyecto marcado no se pudo abrir; `null` si no hay.
   */
  observer?: { notice: string | null };
  /**
   * `true`: los recuadros de tareas, salvo en progreso y pausadas, muestran una sola tarea (la más
   * reciente) y cuántas más hay, para ocupar menos pantalla.
   */
  compact?: boolean;
  /** `false`: sin las líneas de flecha entre recuadros. Por defecto `true`. */
  arrows?: boolean;
  updatedAt: Date;
  trigger: DrawTrigger;
  /** Por defecto `"ctrl-c"`. */
  controls?: Controls;
  width?: number;
  /** `false` para salida sin códigos ANSI (tests); por defecto, lo que detecte picocolors. */
  color?: boolean;
}

/** Lo leído de un operador en la vista de equipo; `snapshot: null` si no tiene carpeta (`solo team-backlog`). */
export interface TeamOperatorRead {
  entry: OperatorEntry;
  snapshot: SnapshotRead | null;
}

/** Lo leído para la vista de equipo: cada operador, el `team-backlog.md` y los avisos de lectura. */
export interface TeamRead {
  operators: TeamOperatorRead[];
  teamBacklogText: string | null;
  warnings: string[];
  needsRetry: boolean;
}

/** Fila del recuadro EQUIPO: un operador, lo que está haciendo y sus conteos. */
export interface TeamRow {
  folder: string;
  /** `(solo team-backlog)`: no tiene carpeta propia, así que no se puede abrir. */
  folderless: boolean;
  /** `true` si su carpeta no tiene `handoff.md` legible (la fila lo indica). */
  missing: boolean;
  current: { label: string; number: number; title: string; done: number; total: number } | null;
  counts: { free: number; blocked: number };
  /** Última entrada de su `history.md` (las más nuevas van primero). */
  lastCompleted: HistoryEntry | null;
}

/** Tarea del `team-backlog.md` lista para pintar (sin número). */
export interface TeamBacklogTask {
  title: string;
  /** Tag y motivo del bloqueo vigente; `tag: null` si no está bloqueada. */
  block: BlockInfo;
}

/** Tareas sin dueño: libres primero, después las bloqueadas. */
export interface TeamBacklogModel {
  /** `false` si no existe `team-backlog.md` (no se pinta el recuadro). */
  present: boolean;
  free: TeamBacklogTask[];
  blocked: TeamBacklogTask[];
  warnings: string[];
}

/** Modelo de la vista de equipo. */
export interface TeamModel {
  rows: TeamRow[];
  teamBacklog: TeamBacklogModel;
  warnings: string[];
}

/**
 * Fila de la lista de proyectos: un repo, el operador de su correo de git y lo que está haciendo.
 * `work: null` cuando no se sabe (el correo no figura en operators.md o el repo no se pudo leer):
 * la fila muestra `—` en la tarea y los conteos.
 */
export interface ProjectRow {
  /** Nombre de la carpeta del repo. */
  name: string;
  /** Ruta tal como llegó de la lista: con ella se abre el repo y se guarda la selección. */
  path: string;
  /** Carpeta del operador del correo de git; `null` si no figura o el repo es plano. */
  operator: string | null;
  work: {
    current: { label: string; number: number; title: string } | null;
    counts: { free: number; blocked: number };
  } | null;
  /** Por qué el repo no se pudo leer; la fila lo muestra en lugar de sus datos. */
  warning: string | null;
}

/** Metadatos de la lista de proyectos: no hay un repo en el encabezado, solo qué fila está elegida. */
export interface ProjectsRenderMeta extends Omit<RenderMeta, "projectName" | "projectDir"> {
  /** Ruta del proyecto elegido en la lista. */
  selected: string | null;
  /** Alto de la terminal: si se indica, la pantalla se recorta a él manteniendo visible la fila elegida (ver `fitToHeight`). */
  rows?: number;
}

/**
 * Metadatos de la vista de espera del modo observador: sin repo en el encabezado. El aviso sale de
 * `observer.notice`; `renderObserver` pone la vista (`multiView`) por su cuenta.
 */
export type ObserverRenderMeta = Omit<RenderMeta, "projectName" | "projectDir" | "multiView">;

/** Metadatos de la vista de equipo: los de siempre más qué fila está elegida y cuál es "tú". */
export interface TeamRenderMeta extends RenderMeta {
  /** Carpeta del operador elegido en el selector. */
  selected: string | null;
  /** Carpeta del operador del correo de git (se marca con `(tú)`). */
  preferred: string | null;
  /** Alto de la terminal: si se indica, la pantalla se recorta a él manteniendo visible la fila elegida (ver `fitToHeight`). */
  rows?: number;
}
