// Tipos del dominio compartidos por los scripts: lo que produce el parseo de handoff.md,
// backlog.md y history.md (tareas, secciones, campos, entradas de historial).

/**
 * Posición de un fragmento en el texto ORIGINAL del archivo, para que un editor pueda reemplazar
 * o borrar ese rango exacto sin tocar el resto (edición quirúrgica).
 *
 * - Los offsets (`start`, `end`) son índices de caracteres (UTF-16, como `String.slice`) en el
 *   texto con saltos de línea LF que se le pasó al parser. Si el archivo trae CRLF, se normaliza
 *   con `normalizeEol` (`parse/positions.ts`), que además traduce los offsets al texto crudo.
 * - `start` es inclusivo y `end` es EXCLUSIVO: el fragmento es `text.slice(start, end)`.
 * - `startLine` y `endLine` son 1-based; `endLine` es la última línea que toca el rango
 *   (inclusive), o `startLine - 1` si el rango está vacío.
 * - Rangos de UNA línea (header `##`, ancla, línea de la tarea en curso, checkbox): de su primer
 *   carácter hasta ANTES del salto de línea (no lo incluyen).
 * - Rangos de VARIAS líneas (cuerpo de sección, bloque de tarea, campo, entrada de historial,
 *   subsección): empiezan al inicio de su primera línea y terminan al inicio de la línea
 *   siguiente, es decir, INCLUYEN el salto de línea final.
 * - Si una línea trae comentarios HTML inline, el rango llega hasta el último carácter visible.
 */
export interface Range {
  startLine: number;
  endLine: number;
  start: number;
  end: number;
}

/** Campo `- **Etiqueta:** valor` de una tarea; la etiqueta queda tal cual (está traducida). */
export interface Field {
  label: string;
  value: string;
  isPlaceholder: boolean;
  /**
   * Rango (varias líneas) del campo: su línea `- **Etiqueta:** valor` más las líneas de
   * continuación indentadas, sin las líneas en blanco que lo siguen. Solo si el parser recibió
   * posiciones.
   */
  range?: Range;
}

/** Tarea con header `### Tarea N — título` (`####` dentro de un grupo). */
export interface Task {
  number: number;
  /** Palabra del header tal como está escrita (ej. "Tarea", "Task"). */
  label: string;
  title: string;
  level: number;
  fields: Field[];
  body: string;
  isPlaceholder: boolean;
  /**
   * Rango (varias líneas) del bloque: desde su header hasta antes del siguiente header que el
   * parser reconoce (otra tarea o un `### `) o el fin de la sección. Incluye las líneas en
   * blanco y los comentarios que haya antes de ese siguiente header.
   */
  range?: Range;
}

/** Grupo de tareas: referencia en "Tareas libres" o contenedor en "Tareas agrupadas". */
export interface Group {
  label: string;
  title: string;
  taskNumbers: number[];
  tasks: Task[];
  body: string;
  /** Rango (varias líneas) del grupo completo: su header y todas sus tareas `####`. */
  range?: Range;
}

export interface ParsedBlocks {
  tasks: Task[];
  groups: Group[];
}

/** Sección `## ` ubicada por su ancla (o por posición, en el plan B). */
export interface Section {
  header: string;
  body: string;
  /** Línea del header `## ...` (una línea, sin el salto de línea). */
  headerRange: Range;
  /**
   * Cuerpo de la sección (varias líneas): desde la línea siguiente al header hasta antes del ancla
   * de la sección siguiente (o de su header si no tiene ancla) o el fin del texto. Por eso no
   * incluye el ancla de la que viene después, pero sí las líneas en blanco previas a ella.
   * Puede estar vacío (`start === end`).
   */
  bodyRange: Range;
  /**
   * Línea del ancla `<!-- agent-context-skill:section=... -->` (una línea). `null` si la sección
   * se ubicó por orden (plan B, sin anclas) o su header no tiene ancla: no se inventa.
   */
  anchorRange: Range | null;
}

export interface SectionsResult {
  sections: Record<string, Section>;
  usedFallback: boolean;
  missing: string[];
}

/** Línea de la tarea en progreso (`**Tarea:** Tarea 9 — título`). */
export interface CurrentTaskLine {
  label: string;
  number: number;
  title: string;
  /** Línea `Tarea N — título` (una línea). Solo si el parser recibió posiciones. */
  range?: Range;
}

export interface PlanStep {
  text: string;
  done: boolean;
  /** Línea completa del checkbox (una línea). */
  range?: Range;
  /** El carácter entre los corchetes (` `, `x` o `X`): se reemplaza para marcar o desmarcar. */
  markRange?: Range;
}

export interface Subsection {
  title: string;
  body: string;
  /** Subsección completa (varias líneas): su `### ` hasta antes del siguiente `### ` o el fin de la sección. */
  range?: Range;
}

export interface InProgress {
  task: CurrentTaskLine | null;
  /** Todos los checkboxes del cuerpo, estén donde estén (para detectar los que están fuera del plan). */
  steps: PlanStep[];
  /** Los pasos del plan: los checkboxes de su subsección o, sin ninguna, todos los del cuerpo. */
  planSteps: PlanStep[];
  subsections: Subsection[];
}

/** Lo que tienen en común handoff.md y backlog.md ya interpretados. */
export interface ParsedFile {
  /** Secciones ubicadas, con sus posiciones (ver `Section`). */
  sections: Record<string, Section>;
  usedFallback: boolean;
  missing: string[];
  placeholders: boolean;
}

/**
 * Tarea pausada: sus campos (sin el que solo contiene los checkboxes del plan, que se muestra
 * aparte) y los pasos del plan que traía al pausarse.
 */
export interface ParsedPausedTask extends Task {
  steps: PlanStep[];
}

export interface ParsedHandoff extends ParsedFile {
  inProgress: InProgress;
  paused: ParsedPausedTask[];
}

export interface ParsedBacklog extends ParsedFile {
  free: ParsedBlocks;
  blocked: Task[];
  grouped: Group[];
}

export interface BlockInfo {
  tag: string | null;
  reason: string | null;
}

/** Tarea mencionada en el motivo de un bloqueo (ej. "depende de la Tarea 3"). */
export interface TaskRef {
  number: number;
  /** Título si se encontró en backlog, handoff o history; `null` si no. */
  title: string | null;
  /** `true` si la tarea ya figura cerrada en history.md (pista para la Regla 8). */
  closed: boolean;
}

/** Entrada de history.md: `## <fecha> — ✅|❌ [Tarea N —] título`. */
export interface HistoryEntry {
  date: string;
  status: "done" | "discarded";
  /** `null` si la entrada no tiene número de tarea (ej. tareas anteriores a la numeración). */
  number: number | null;
  label: string | null;
  title: string;
  /**
   * Entrada completa (varias líneas): su header `## ` hasta antes del siguiente `## ` (sea o no
   * una entrada) o el fin del texto. `entries[0].range.start` es donde insertar una entrada
   * nueva arriba de todas. Solo si el parser recibió el texto completo (`parseHistory` siempre).
   */
  range?: Range;
}

export interface ParsedHistory {
  entries: HistoryEntry[];
}

/** Línea de operators.md: `- <carpeta>[ (solo team-backlog)]: <correo>, <correo>`. */
export interface OperatorEntry {
  folder: string;
  /** Correos de git en minúsculas. */
  emails: string[];
  /** `true` con la marca `(solo team-backlog)`: el operador no tiene carpeta propia. */
  folderless: boolean;
}

export interface ParsedOperators {
  operators: OperatorEntry[];
  /** Líneas de la lista que no se pudieron leer: se avisan, no se ignoran en silencio. */
  unreadable: string[];
}

/** Tarea del `team-backlog.md`: `### <título único>`, sin número (la numera quien la toma). */
export interface TeamTask {
  title: string;
  fields: Field[];
  body: string;
  isPlaceholder: boolean;
  /** Rango (varias líneas) de la tarea: su `### ` hasta antes del siguiente `### ` o el fin de la sección. */
  range?: Range;
}

export interface ParsedTeamBacklog {
  free: TeamTask[];
  blocked: TeamTask[];
  sections: Record<string, Section>;
  usedFallback: boolean;
  missing: string[];
  placeholders: boolean;
}
