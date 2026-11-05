// Pintado del modelo en la terminal con picocolors. render() devuelve un string (testeable);
// src/app.ts se encarga de limpiar la pantalla y escribirlo.
//
// Debajo del encabezado, un recuadro por tipo de tarea (ver ui/box.ts), con el archivo del que
// sale en el borde superior: completadas (history.md, compacto), en progreso y pausadas
// (handoff.md, en detalle, con los pasos ya hechos del plan tachados) y libres y bloqueadas
// (backlog.md, compacto con `T-N: título`). Todos los recuadros tienen el ancho de la terminal.

import picocolors from "picocolors";
import { formatTime } from "../shared/time.ts";
import type {
  BlockedTask,
  CurrentTask,
  DrawTrigger,
  Model,
  ObserverRenderMeta,
  Plan,
  ProjectRow,
  ProjectsRenderMeta,
  RenderMeta,
  TeamBacklogModel,
  TeamModel,
  TeamRenderMeta,
  TeamRow,
} from "../shared/types.ts";
import type { ExecutionMode } from "../../../_shared/parse/plan-mode.ts";
import type { HistoryEntry, TaskRef } from "../../../_shared/types.ts";
import { BOX_PADDING, boxBottom, boxRow, boxTop, type Paint, type Segment } from "./box.ts";
import { displayProjectName, plainText, progressBar, shortTaskName, truncate, visibleLength, wrapText } from "./format.ts";
import { currentText, OPERATOR_MAX_WIDTH, PROJECT_GAP, projectColumns, projectViewMode, truncateStart } from "./project-columns.ts";
import { fitToHeight, type LineRange } from "./viewport.ts";

/** Ancho mínimo de la pantalla, aunque la terminal sea más angosta. */
const MIN_WIDTH = 40;
/** Ancho cuando no hay terminal que lo informe (salida redirigida, `--once`) ni `COLUMNS`. */
const DEFAULT_WIDTH = 100;
/** Líneas que se muestran de cada texto largo de una tarea (descripción, decisiones...); si hay más, la última termina en «…». */
const TEXT_MAX_LINES = 3;
/** Sangría de esos textos respecto de su subtítulo. */
const TEXT_INDENT = 2;
/** Colores de la paleta de 256 colores que no están en picocolors. */
/** Tareas completadas (nombre y fecha). Los bordes usan el gris de picocolors. */
const COMPLETED_GRAY_256 = 245;
/** Textos secundarios (rutas, campos, "Ninguna", pie…). */
const SECONDARY_GRAY_256 = 250;
/** Título de "tareas completadas" y prefijo `T-N` de cada una: #6DB07B (elegido por el operador). */
const COMPLETED_GREEN_RGB = [0x6d, 0xb0, 0x7b] as const;
/** Título y viñeta de "sin dueño": un azul pálido, #8FB3D9 (elegido por el operador). */
const UNOWNED_BLUE_RGB = [0x8f, 0xb3, 0xd9] as const;

/** Cómo se muestra cada modo de ejecución del plan (los valores en inglés son los del handoff). */
const EXECUTION_MODE_TEXT: Record<ExecutionMode, string> = {
  guided: "✏️ Guiado",
  "step-by-step": "📋 Paso a paso",
  auto: "🤖 Auto",
  extreme: "🔥 Extremo",
};

type Colors = ReturnType<typeof picocolors.createColors>;
/** Agrega una fila al recuadro abierto: sangría + tramos con estilo. */
type Row = (indent: number, ...segments: Segment[]) => void;
/** Lo que el lienzo necesita de los metadatos: la lista de proyectos no tiene repo en el encabezado. */
type CanvasMeta = Omit<RenderMeta, "projectName" | "projectDir"> & Partial<Pick<RenderMeta, "projectName" | "projectDir">>;

/** Separación entre el nombre del proyecto (y operador) y su ruta en el encabezado. */
const LOCATION_GAP = "   ";
/** Lo que se suma al título con el observador activo (`TAREAS · MODO OBSERVADOR`), y título de su vista de espera. */
const OBSERVER_TITLE = "MODO OBSERVADOR";

/**
 * Encabezado de una pantalla: `title` en mayúsculas; `location`, si la pantalla es de un repo, agrega
 * la línea con el nombre del proyecto, el operador (si lo hay) y la ruta; `observerLine: false`
 * quita el sufijo del modo observador (la vista de espera ya lo lleva como título).
 */
interface Header {
  title: string;
  location?: { operator?: string };
  observerLine?: boolean;
}

/**
 * Lienzo de una pantalla: las líneas, los recuadros y el encabezado ya escrito (ver `Header`).
 */
function createCanvas(meta: CanvasMeta, header: Header) {
  const pc: Colors = meta.color === undefined ? picocolors : picocolors.createColors(meta.color);
  const width = screenWidth(meta.width);
  const out: string[] = [];
  const line = (indent: number, text: string, color: Paint = (s) => s) =>
    out.push(" ".repeat(indent) + color(truncate(plainText(text), width - indent)));
  const blank = () => out.push("");

  const { secondary, completed, completedGreen, unownedBlue } = tones(pc);

  /** Recuadro completo: borde superior con título y archivo, filas y borde inferior. */
  const box = (title: string, file: string, color: Paint, fill: (row: Row) => void, border: Paint = pc.gray) => {
    out.push(boxTop(title, file, width, { border, file: secondary, title: (s) => pc.bold(color(s)) }));
    fill((indent, ...segments) => {
      const text = segments.map((s) => ({ ...s, text: plainText(s.text) }));
      out.push(boxRow([{ text: " ".repeat(indent) }, ...text], width, border));
    });
    out.push(boxBottom(width, border));
  };

  // Encabezado
  const title = (s: string) => pc.bold(pc.magenta(s));
  const observing = meta.observer && header.observerLine !== false;
  line(0, `▣ ${header.title}${observing ? ` · ${OBSERVER_TITLE}` : ""}`, title);
  if (header.location) {
    // El nombre se mantiene entero; si no cabe con la ruta, se recorta la ruta (si ni el nombre cabe, también).
    const name = plainText(
      [meta.projectName ? displayProjectName(meta.projectName) : "", header.location.operator ?? ""].filter(Boolean).join(" · "),
    );
    const dir = plainText(meta.projectDir ?? "");
    const room = width - 2 - visibleLength(name) - LOCATION_GAP.length;
    // Con menos de 2 caracteres de sitio, la ruta quedaría en un «…» suelto: mejor omitirla.
    if (name && dir && room >= 2) {
      out.push(`  ${name}${LOCATION_GAP}${secondary(truncate(dir, room))}`);
    } else if (name) {
      line(2, name);
    } else if (dir) {
      line(2, dir, secondary);
    }
  }
  line(2, `Última actualización ${formatTime(meta.updatedAt)} · ${triggerText(meta.trigger)}`, secondary);
  blank();

  return { pc, width, out, line, blank, box, secondary, completed, completedGreen, unownedBlue };
}

type Canvas = ReturnType<typeof createCanvas>;

/**
 * Avisos, notas y pie con las teclas; cierra la pantalla y la devuelve como texto. Con `view.rows`
 * (alto de la terminal) la recorta a ese alto, conservando el pie (y lo que siga a `view.pinFrom`)
 * y la fila `view.selected`.
 */
function finishCanvas(
  { out, line, blank, secondary, pc, width }: Canvas,
  meta: CanvasMeta,
  model: { notes?: string[]; warnings: string[]; observerNotice?: string | null },
  view: { rows?: number; selected: LineRange | null; pinFrom?: number } = { selected: null },
): string {
  const notes = model.notes ?? [];
  const notice = model.observerNotice ?? meta.observer?.notice;
  if (notes.length || meta.observer || notice || model.warnings.length) blank();
  for (const note of notes) line(0, `ℹ ${note}`, secondary);
  if (meta.observer) {
    // El estado fijo se parte en palabras si no entra, para no perder el final («o /board»).
    wrapWords(OBSERVER_STATUS, width - 2).forEach((text, i) => line(0, `${i === 0 ? "ℹ" : " "} ${text}`, pc.cyan));
  }
  // El aviso del observador también se parte en palabras (con la sangría de continuación de 2 espacios):
  // recortarlo con «…» perdería el final, donde va el enlace de la skill.
  if (notice) wrapWords(plainText(notice), width - 2).forEach((text, i) => line(0, `${i === 0 ? "!" : " "} ${text}`, pc.yellow));
  for (const warning of model.warnings) line(0, `! ${warning}`, pc.yellow);

  const footer = footerLines(meta, width);
  const footerStart = out.length;
  if (footer.length) {
    blank();
    for (const text of footer) line(0, text, secondary);
  }
  // `pinFrom`: desde esa línea todo queda fijo, como el pie (ej. la ruta que se escribe y los avisos).
  const pinned = out.length - Math.min(footerStart, view.pinFrom ?? footerStart);
  // Una línea menos que el alto: el salto de línea final deja el cursor en la última fila sin desplazar la pantalla.
  const lines = view.rows === undefined ? out : fitToHeight(out, { rows: view.rows - 1, selected: view.selected, footer: pinned, paint: secondary });
  return lines.join("\n") + "\n";
}

/** Línea de estado del modo observador (ver `RenderMeta.observer`). */
const OBSERVER_STATUS = "Observando: el board cambia solo de proyecto cuando pulsas el botón «Mark» del mod de Claude o escribes /board.";

/** Lo que dice la vista de espera del modo observador (ver `renderObserver`). */
const OBSERVER_WAITING = "Esperando: el board cambiará solo de proyecto cuando pulses el botón «Mark» del mod de Claude o escribas /board.";

/**
 * Parte `text` en líneas de a lo sumo `width` caracteres, cortando en los espacios. Una palabra más
 * larga que `width` (una URL o una ruta) no tiene dónde cortarse: se parte en trozos de `width`, de
 * modo que no se pierde ni su inicio ni su final.
 */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const joined = current ? `${current} ${word}` : word;
    if (current && visibleLength(joined) > width) {
      lines.push(current);
      current = word;
    } else {
      current = joined;
    }
    while (visibleLength(current) > width) {
      const chars = [...current];
      lines.push(chars.slice(0, width).join(""));
      current = chars.slice(width).join("");
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Etapas por las que pasa una tarea, de arriba abajo en la pantalla (ver `arrowText`). */
export type Stage = "unowned" | "blocked" | "free" | "current" | "paused" | "completed";

/** Lo que dice la flecha entre una etapa y la siguiente que se muestra. */
const ARROWS: Partial<Record<`${Stage}>${Stage}`, string>> = {
  "unowned>free": "↓ se toma",
  "unowned>current": "↓ se toma",
  "free>blocked": "↓ bloquea · ↑ desbloquea",
  "free>current": "↓ empieza",
  // Una bloqueada no empieza directo: primero se desbloquea y pasa a libres, de donde empieza.
  "blocked>current": "↓ empieza (desde libres)",
  "current>paused": "↑ retoma · ↓ pausa",
  "current>completed": "↓ se cierra",
  "paused>completed": "↓ se cierra",
};

/** Texto de la flecha de `from` a `to`; sin una transición conocida entre esas etapas, solo `↓`. */
export function arrowText(from: Stage, to: Stage): string {
  return ARROWS[`${from}>${to}`] ?? "↓";
}

/**
 * Panel de un operador (o del proyecto, en modo plano). Los recuadros van en el orden del flujo
 * de una tarea, de arriba abajo: sin dueño → libres ⇅ bloqueadas → en progreso ⇅ pausadas →
 * completadas, con una línea de flecha entre los que se muestran. Ver `RenderMeta`.
 */
export function render(model: Model, meta: RenderMeta): string {
  const canvas = createCanvas(meta, { title: "TAREAS", location: { operator: meta.operator } });
  const { pc, width, box, line, secondary, completedGreen } = canvas;

  const stages: { id: Stage; shown: boolean; draw: () => void }[] = [
    // team-backlog.md (modo multi-operador): las tareas sin dueño
    { id: "unowned", shown: Boolean(meta.teamBacklog?.present), draw: () => meta.teamBacklog && teamBacklogBox(canvas, meta.teamBacklog, meta.compact) },

    // backlog.md (compacto): libres y, debajo, bloqueadas (solo si hay alguna)
    {
      id: "free",
      shown: model.hasBacklog,
      draw: () =>
        box(`LIBRES (${model.counts.free})`, "backlog.md", pc.cyan, (row) => {
          if (!model.free.tasks.length && !model.free.groups.length) row(0, { paint: secondary, text: "Ninguna" });
          if (meta.compact && (model.free.tasks.length || model.free.groups.length)) {
            // Solo la última: la última tarea suelta o, si no hay, el último grupo.
            const lastTask = model.free.tasks[model.free.tasks.length - 1];
            const lastGroup = model.free.groups[model.free.groups.length - 1];
            const text = lastTask
              ? shortTaskName(lastTask.number, lastTask.title)
              : `◇ Grupo: ${lastGroup.title} (${lastGroup.taskNumbers.map((n) => `T-${n}`).join(", ")})`;
            // Lo que se muestra cuenta como 1 tarea suelta o como las de su grupo; el resto, como en el título.
            const shown = lastTask ? 1 : lastGroup.taskNumbers.length;
            compactRow(row, text, pc.cyan, model.counts.free - shown, width, secondary);
            return;
          }
          for (const task of model.free.tasks) row(0, { paint: pc.cyan, text: shortTaskName(task.number, task.title) });
          for (const group of model.free.groups) {
            const refs = group.taskNumbers.map((n) => `T-${n}`).join(", ");
            row(0, { paint: pc.cyan, text: `◇ Grupo: ${group.title} (${refs})` });
            for (const task of group.tasks) {
              if (task.title) row(2, { paint: secondary, text: `· ${shortTaskName(task.number, task.title)}` });
            }
          }
        }),
    },
    {
      id: "blocked",
      shown: model.hasBacklog && model.blocked.length > 0,
      draw: () =>
        box(`BLOQUEADAS (${model.counts.blocked})`, "backlog.md", pc.red, (row) => {
          if (meta.compact) {
            // Solo la última (la más reciente de la lista), sin las tareas de las que depende.
            const last = model.blocked[model.blocked.length - 1];
            const tag = last.block.tag ? ` [${last.block.tag}]` : "";
            compactRow(row, `${shortTaskName(last.number, last.title)}${tag}`, pc.red, model.blocked.length - 1, width, secondary);
            return;
          }
          for (const task of model.blocked) blockedRows(task, row, pc);
        }),
    },

    // handoff.md (detallado): en progreso siempre; pausadas solo si hay alguna
    {
      id: "current",
      shown: true,
      draw: () =>
        box("EN PROGRESO", "handoff.md", pc.green, (row) => {
          const current = model.current;
          if (!current) {
            row(0, { paint: secondary, text: "Sin tarea en curso" });
            return;
          }
          row(0, { paint: (s) => pc.bold(pc.green(s)), text: fullTaskName(current) });
          taskRows(current, 0, row, pc, width);
        }, pc.green),
    },
    {
      id: "paused",
      shown: model.paused.length > 0,
      draw: () =>
        box(`PAUSADAS (${model.counts.paused})`, "handoff.md", pc.yellow, (row) => {
          for (const task of model.paused) {
            row(0, { paint: pc.yellow, text: `• ${fullTaskName(task)}` });
            taskRows(task, 4, row, pc, width);
            // Sus campos propios, al final.
            if (task.why) textRows("Por qué se pausó", task.why, 4, row, secondary, width);
            if (task.waits) textRows("Qué espera para retomarse", task.waits, 4, row, secondary, width);
          }
        }),
    },

    // history.md (compacto)
    {
      id: "completed",
      shown: model.hasHistory,
      draw: () =>
        box(`TAREAS COMPLETADAS (últimas ${model.completed.length})`, "history.md", completedGreen, (row) => {
          if (!model.completed.length) row(0, { paint: secondary, text: "Ninguna" });
          if (meta.compact && model.completed.length) {
            // Solo la última cerrada (las más nuevas van primero).
            const more = model.completed.length - 1;
            const suffix = more > 0 ? ` · +${more} más` : "";
            row(0, ...completedSegments(model.completed[0], width, pc, visibleLength(suffix)), ...(suffix ? [{ paint: secondary, text: suffix }] : []));
            return;
          }
          for (const entry of model.completed) row(0, ...completedSegments(entry, width, pc));
        }),
    },
  ];

  let previous: Stage | null = null;
  for (const stage of stages) {
    if (!stage.shown) continue;
    if (previous && meta.arrows !== false) line(3, arrowText(previous, stage.id), secondary);
    stage.draw();
    previous = stage.id;
  }

  return finishCanvas(canvas, meta, { notes: model.notes, warnings: [...model.warnings, ...(meta.teamBacklog?.warnings ?? [])] });
}

/**
 * Vista de equipo (modo multi-operador): el recuadro EQUIPO, que es el selector (una fila por
 * operador, con el elegido marcado con `›` y el del correo de git con `(tú)`), y las tareas sin dueño.
 */
export function renderTeam(team: TeamModel, meta: TeamRenderMeta): string {
  const canvas = createCanvas(meta, { title: "EQUIPO", location: {} });
  const { pc, box, secondary, out } = canvas;
  // Líneas de la fila elegida (la del operador y su resumen), para que `rows` la mantenga a la vista.
  let selected = null as LineRange | null;

  box(`EQUIPO (${team.rows.length})`, "operators.md", pc.green, (row) => {
    if (!team.rows.length) row(0, { paint: secondary, text: "Ningún operador registrado en operators.md" });
    // Nombres alineados en columna: la carpeta y, si es el operador del correo de git, "(tú)".
    const label = (op: TeamRow) => op.folder + (op.folder === meta.preferred ? " (tú)" : "");
    const nameWidth = Math.max(0, ...team.rows.map((op) => visibleLength(label(op))));
    for (const op of team.rows) {
      const chosen = op.folder === meta.selected && !op.folderless;
      const start = out.length;
      const mark = chosen ? "› " : "  ";
      const padded = label(op) + " ".repeat(nameWidth - visibleLength(label(op)));
      const name = { paint: (s: string) => (chosen ? pc.bold(pc.green(s)) : pc.bold(s)), text: `${mark}${padded}` };
      if (op.folderless) {
        row(0, name, { paint: secondary, text: "  (solo team-backlog)" });
      } else if (op.missing) {
        row(0, name, { paint: pc.yellow, text: "  (sin handoff.md)" });
      } else if (op.current) {
        const plan = op.current.total ? ` · plan ${op.current.done}/${op.current.total}` : "";
        row(0, name, { text: `  ${op.current.label} ${op.current.number} — ${op.current.title}${plan}` });
      } else {
        row(0, name, { paint: secondary, text: "  Sin tarea en curso" });
      }
      if (!op.folderless && !op.missing) row(4, { paint: secondary, text: summaryLine(op) });
      if (chosen) selected = { start, end: out.length - 1 };
    }
  });

  if (team.teamBacklog.present) teamBacklogBox(canvas, team.teamBacklog, meta.compact);
  return finishCanvas(canvas, meta, { warnings: team.warnings }, { rows: meta.rows, selected });
}

/**
 * Vista de espera del modo observador: mientras ninguna marca abre un repo, la pantalla es solo
 * esta (sin tareas): qué se espera, el aviso del observador si hay (`observer.notice`) y el pie.
 */
export function renderObserver(meta: ObserverRenderMeta): string {
  const canvas = createCanvas(meta, { title: OBSERVER_TITLE, observerLine: false });
  const { pc, width, line } = canvas;
  // El texto se parte en palabras si no entra, para no perder el final («o /board»).
  for (const text of wrapWords(OBSERVER_WAITING, width)) line(0, text, pc.cyan);
  // Sin la línea de estado de `finishCanvas` (que ya dice lo mismo): el aviso va como en las demás vistas.
  return finishCanvas(canvas, { ...meta, observer: undefined, multiView: "observer" }, { warnings: [], observerNotice: meta.observer?.notice });
}

/** Segunda línea de la fila de un operador: conteos y su última tarea completada. */
function summaryLine(op: TeamRow): string {
  const parts = [`libres ${op.counts.free}`, `bloqueadas ${op.counts.blocked}`];
  const done = op.lastCompleted;
  if (done) {
    const name = done.number == null ? done.title : shortTaskName(done.number, done.title);
    parts.push(`último cierre: ${name}${done.date ? ` (${done.date})` : ""}`);
  }
  return parts.join(" · ");
}

/**
 * Lista de proyectos: el recuadro PROYECTOS, que es el selector (un repo por entrada, con el elegido
 * marcado con `›`): nombre, ruta, operador del correo de git de ese repo, tarea en curso y cuántas
 * tareas libres y bloqueadas tiene ese operador. Lo que no se sabe sale como `—`; un repo que no
 * se pudo leer muestra su aviso en lugar de los datos. Con terminales anchas es una tabla (una fila
 * por repo); con angostas, una tarjeta de tres líneas por repo (ver `projectViewMode`). `warnings`:
 * avisos de la vista (ej. no se pudo abrir un proyecto).
 */
export function renderProjects(rows: ProjectRow[], meta: ProjectsRenderMeta, warnings: string[] = []): string {
  const canvas = createCanvas(meta, { title: "PROYECTOS" });
  const { pc, box, secondary, width, out } = canvas;
  // Líneas de la fila elegida, para que `rows` la mantenga a la vista.
  let selected = null as LineRange | null;
  // Primera línea de la entrada de ruta o la confirmación: desde ahí todo queda fijo, siempre a la vista.
  let pinFrom: number | undefined;
  // La ruta que se escribe se muestra por el final (donde está el cursor), no por el principio.
  const inputLine = (text: string): string => {
    const label = "Ruta del repo: ";
    const room = Math.max(1, width - BOX_PADDING - 2 - label.length - 1);
    const chars = Array.from(text);
    return `${label}${chars.length > room ? `…${chars.slice(Math.max(0, chars.length - (room - 1))).join("")}` : text}█`;
  };
  // La confirmación de quitar lleva el nombre y la ruta; si no cabe, la ruta se corta por el principio.
  const confirmLine = ({ name, path }: { name: string; path: string }): string => {
    const head = `¿Quitar ${name} (`;
    const tail = ") de la lista? [Enter] sí · [Esc] no";
    const room = Math.max(1, width - BOX_PADDING - 2 - visibleLength(head + tail));
    const chars = Array.from(path);
    return `${head}${chars.length > room ? `…${chars.slice(Math.max(0, chars.length - (room - 1))).join("")}` : path}${tail}`;
  };

  box(`PROYECTOS (${rows.length})`, "docs/agents", pc.green, (row) => {
    if (!rows.length) {
      row(0, { paint: secondary, text: "No hay proyectos para mostrar." });
      row(0, { paint: secondary, text: `Abre uno con: acsuite board <ruta>${meta.controls === "keys" ? ", o agrégalo con [a]" : ""}` });
      if (meta.input != null) {
        pinFrom = out.length;
        row(0, { text: inputLine(meta.input) });
      }
      return;
    }
    // Debajo de la tabla o de las tarjetas: la ruta que se escribe y la confirmación de quitar.
    const footer = () => {
      if (meta.input != null || meta.confirmRemove != null) pinFrom = out.length;
      if (meta.input != null) row(0, { text: inputLine(meta.input) });
      if (meta.confirmRemove != null) row(0, { paint: pc.yellow, text: confirmLine(meta.confirmRemove) });
    };
    if (projectViewMode(rows, width) === "cards") {
      selected = projectCards(rows, meta.selected, canvas, row);
      footer();
      return;
    }

    // Columnas de ancho fijo según su contenido; la ruta y la tarea en curso se reparten el resto.
    const { nameW, pathW, operatorW, currentW, freeW, blockedW } = projectColumns(rows, width);

    const fit = (text: string, w: number, alignRight = false): string => {
      const shown = truncate(plainText(text), w);
      const pad = " ".repeat(Math.max(0, w - visibleLength(shown)));
      return alignRight ? pad + shown : shown + pad;
    };

    const headers = [fit("nombre", nameW), fit("ruta", pathW), fit("operador", operatorW), fit("en curso", currentW), fit("libres", freeW, true), fit("bloqueadas", blockedW, true)];
    row(0, { paint: secondary, text: `  ${headers.join(PROJECT_GAP)}` });

    for (const project of rows) {
      const chosen = project.path === meta.selected;
      if (chosen) selected = { start: out.length, end: out.length };
      const name = { paint: (s: string) => (chosen ? pc.bold(pc.green(s)) : pc.bold(s)), text: `${chosen ? "› " : "  "}${fit(project.name, nameW)}${PROJECT_GAP}` };
      const path = { paint: secondary, text: fit(project.path, pathW) + PROJECT_GAP };
      if (project.warning != null) {
        row(0, name, path, { paint: pc.yellow, text: `! ${project.warning}` });
        continue;
      }
      const { work } = project;
      row(
        0,
        name,
        path,
        { paint: project.operator ? undefined : secondary, text: fit(project.operator ?? "—", operatorW) + PROJECT_GAP },
        { paint: work?.current ? undefined : secondary, text: fit(currentText(project), currentW) + PROJECT_GAP },
        { paint: work?.counts.free ? pc.cyan : secondary, text: fit(String(work?.counts.free ?? "—"), freeW, true) + PROJECT_GAP },
        { paint: work?.counts.blocked ? pc.red : secondary, text: fit(String(work?.counts.blocked ?? "—"), blockedW, true) },
      );
    }
    footer();
  });

  // Los avisos de la vista también quedan fijos: sin entrada ni confirmación, desde el cierre del recuadro.
  if (pinFrom === undefined && warnings.length) pinFrom = out.length;
  return finishCanvas(canvas, { ...meta, hasRows: rows.length > 0 }, { warnings }, { rows: meta.rows, selected, pinFrom });
}

/**
 * Lista de proyectos para terminales angostas: una tarjeta de tres líneas por repo, con una línea
 * en blanco entre una y otra y sin encabezados:
 *
 *   › nombre · 3 libres · 3 bloqueadas
 *     /ruta/del/repo
 *     operador · tarea en curso   (sin operador, solo la tarea en curso)
 *
 * Si algo no entra, se recorta el nombre (conservando los conteos), la ruta por el principio y la
 * tercera línea por el final. Un repo que no se pudo leer lleva solo el nombre y, en la tercera
 * línea, su aviso.
 *
 * Devuelve las líneas (índices en la pantalla) de la tarjeta elegida, o `null` si no hay ninguna.
 */
function projectCards(rows: ProjectRow[], selected: string | null, { pc, width, secondary, out }: Canvas, row: Row): LineRange | null {
  const inner = Math.max(1, width - BOX_PADDING);
  let range: LineRange | null = null;
  for (const [index, project] of rows.entries()) {
    if (index > 0) row(0, { text: "" });
    const chosen = project.path === selected;
    if (chosen) range = { start: out.length, end: out.length + 2 };
    const marker = chosen ? "› " : "  ";
    const paintName = (s: string) => (chosen ? pc.bold(pc.green(s)) : pc.bold(s));
    const name = plainText(project.name);
    const path = { paint: secondary, text: truncateStart(plainText(project.path), inner - 2) };

    if (project.warning != null) {
      row(0, { paint: paintName, text: marker + truncate(name, Math.max(1, inner - 2)) });
      row(2, path);
      row(2, { paint: pc.yellow, text: `! ${project.warning}` });
      continue;
    }

    const { work, operator } = project;
    const free = String(work?.counts.free ?? "—");
    const blocked = String(work?.counts.blocked ?? "—");
    const counts = ` · ${free} libres · ${blocked} bloqueadas`;
    row(
      0,
      { paint: paintName, text: marker + truncate(name, Math.max(1, inner - 2 - visibleLength(counts))) },
      { paint: secondary, text: " · " },
      { paint: work?.counts.free ? pc.cyan : secondary, text: `${free} libres` },
      { paint: secondary, text: " · " },
      { paint: work?.counts.blocked ? pc.red : secondary, text: `${blocked} bloqueadas` },
    );
    row(2, path);
    // Sin operador (repo plano o correo no registrado) la línea es solo la tarea en curso, sin «— ·».
    row(
      2,
      ...(operator ? [{ text: truncate(operator, OPERATOR_MAX_WIDTH) }, { paint: secondary, text: " · " }] : []),
      { paint: work?.current ? undefined : secondary, text: currentText(project) },
    );
  }
  return range;
}

/**
 * Recuadro "SIN DUEÑO": las tareas del team-backlog.md, libres primero y después las bloqueadas.
 * Título y viñeta en un azul pálido, texto de las tareas en el gris de las completadas; solo el
 * tag de bloqueo va en rojo, para no perder esa señal.
 */
function teamBacklogBox({ box, pc, width, secondary, completed, unownedBlue }: Canvas, backlog: TeamBacklogModel, compact = false): void {
  if (!backlog.present) return;
  const total = backlog.free.length + backlog.blocked.length;
  box(`SIN DUEÑO (${total})`, "team-backlog.md", unownedBlue, (row) => {
    if (!total) row(0, { paint: secondary, text: "Ninguna" });
    if (compact && total) {
      // Solo la última (la más reciente de la lista), sin el motivo del bloqueo.
      const last = [...backlog.free, ...backlog.blocked][total - 1];
      const tag = last.block.tag ? ` [${last.block.tag}]` : "";
      const suffix = total > 1 ? ` · +${total - 1} más` : "";
      const room = Math.max(1, width - BOX_PADDING - visibleLength(`• ${tag}${suffix}`));
      row(
        0,
        { paint: unownedBlue, text: "• " },
        { paint: completed, text: truncate(plainText(last.title), room) },
        ...(tag ? [{ paint: pc.red, text: tag }] : []),
        ...(suffix ? [{ paint: secondary, text: suffix }] : []),
      );
      return;
    }
    for (const task of [...backlog.free, ...backlog.blocked]) {
      row(0, { paint: unownedBlue, text: "• " }, { paint: completed, text: task.title }, ...(task.block.tag ? [{ paint: pc.red, text: ` [${task.block.tag}]` }] : []));
      if (task.block.reason) row(4, { paint: secondary, text: `→ ${task.block.reason}` });
    }
  });
}

/**
 * Ancho de la pantalla: el que se pide (tests), el de la terminal, o `COLUMNS` cuando la salida
 * no va a una terminal (ej. `--once` redirigido); si no hay ninguno, `DEFAULT_WIDTH`.
 */
export function screenWidth(requested?: number): number {
  const fromEnv = Number(process.env.COLUMNS);
  const width = requested ?? process.stdout.columns ?? (fromEnv > 0 ? fromEnv : DEFAULT_WIDTH);
  return Math.max(MIN_WIDTH, width);
}

/** Texto de la línea de actualización según qué provocó el redibujo. */
export function triggerText(trigger: DrawTrigger): string {
  if (trigger.kind === "start") return "al iniciar";
  if (trigger.kind === "redraw") return "redibujado";
  return trigger.file ? `se modificó ${trigger.file}` : "cambio detectado";
}

/**
 * Pie con las teclas que valen en esta vista, como `[tecla] acción` separadas por ` - `; `c` y `f`
 * dicen lo que harán según el estado actual. Si no entra en el ancho se parte en más líneas (así
 * "salir", lo último, nunca queda recortado).
 */
function footerLines(meta: CanvasMeta, width: number): string[] {
  const controls = meta.controls ?? "ctrl-c";
  if (controls === "ctrl-c") return ["[Ctrl+C] salir"];
  if (controls !== "keys") return [];
  const parts: string[] = [];
  const observe = meta.observer ? "[o] salir del modo observador" : "[o] observar";
  if (meta.multiView === "observer") {
    // La vista de espera del observador no tiene más teclas: `r` redibuja pero no se ofrece.
    parts.push("[o] salir del modo observador", "[Ctrl+C o q] salir");
  } else if (meta.multiView === "projects") {
    // La lista de proyectos no se compacta ni tiene flechas de flujo, y `r` la vuelve a leer.
    // Agregando o confirmando una salida de la lista, solo valen las teclas de ese paso.
    if (meta.input != null) parts.push("[Enter] agregar", "[Esc] cancelar", "[Ctrl+C] salir");
    else if (meta.confirmRemove != null) parts.push("[Enter] quitar", "[Esc] cancelar", "[Ctrl+C] salir");
    else parts.push("[↑/↓] elegir", "[Enter] abrir", "[a] agregar repo", ...(meta.hasRows ? ["[x] quitar"] : []), "[r] releer", observe, "[Ctrl+C o q] salir");
  } else {
    if (meta.multiView === "team") parts.push("[↑/↓] elegir", "[Enter] abrir");
    // Con el observador activo no se sale de la vista del tablero: ni `[e]` ni `[p]` (ver `ignoredWithObserver`).
    if (meta.multiView === "operator" && !meta.observer) parts.push("[e] equipo");
    if (!meta.observer) parts.push("[p] proyectos");
    // La vista de equipo no ofrece compactar (la tecla `c` no hace nada ahí) ni tiene flechas de flujo.
    if (meta.multiView !== "team") {
      parts.push(meta.compact ? "[c] expandir" : "[c] compactar");
      parts.push(meta.arrows === false ? "[f] mostrar flechas" : "[f] ocultar flechas");
    }
    parts.push("[r] redibujar", observe, "[Ctrl+C o q] salir");
  }

  const lines: string[] = [];
  let current = "";
  for (const part of parts) {
    const joined = current ? `${current} - ${part}` : part;
    if (current && visibleLength(joined) > width) {
      lines.push(current);
      current = part;
    } else {
      current = joined;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Fila de un recuadro compacto: una sola tarea y, aparte, cuántas más hay (`· +3 más`). El texto
 * de la tarea se recorta antes que el contador.
 */
function compactRow(row: Row, text: string, paint: Paint, more: number, width: number, secondary: Paint): void {
  const suffix = more > 0 ? ` · +${more} más` : "";
  const room = Math.max(1, width - BOX_PADDING - visibleLength(suffix));
  row(0, { paint, text: truncate(plainText(text), room) }, ...(suffix ? [{ paint: secondary, text: suffix }] : []));
}

/** `Tarea 9 — título`, con la etiqueta tal como está escrita en el documento. */
function fullTaskName(task: { label: string; number: number; title: string }): string {
  return `${task.label} ${task.number} — ${task.title}`;
}

/**
 * Tonos de la paleta de 256 colores que no están en picocolors (los bordes van en el gris de
 * picocolors, salvo el de "en progreso", que conserva el color de su tipo). Sin color, el texto
 * queda tal cual.
 */
function tones(pc: Colors): { completed: Paint; completedGreen: Paint; unownedBlue: Paint; secondary: Paint } {
  const ansi256 = (code: number): Paint => (s) => (pc.isColorSupported ? `\x1b[38;5;${code}m${s}\x1b[39m` : s);
  const rgb = ([r, g, b]: readonly [number, number, number]): Paint => (s) =>
    pc.isColorSupported ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m` : s;
  return {
    completed: ansi256(COMPLETED_GRAY_256),
    completedGreen: rgb(COMPLETED_GREEN_RGB),
    unownedBlue: rgb(UNOWNED_BLUE_RGB),
    secondary: ansi256(SECONDARY_GRAY_256),
  };
}

/**
 * Lo que se muestra de una tarea en progreso o pausada, bajo su título: el modo de ejecución, el
 * estado con los pasos del plan, la descripción y las decisiones (las dos últimas, bajo un
 * subtítulo gris y con salto de línea). Lo que no tiene, no se muestra.
 */
function taskRows(task: Pick<CurrentTask, "plan" | "mode" | "description" | "decisions">, indent: number, row: Row, pc: Colors, width: number): void {
  const { secondary } = tones(pc);
  if (task.mode) row(indent, { paint: pc.green, text: `Modo  ${EXECUTION_MODE_TEXT[task.mode]}` });
  planRows(task.plan, indent, row, pc);
  if (task.description) textRows("Descripción", task.description, indent, row, secondary, width);
  if (task.decisions) textRows("Decisiones a medio camino", task.decisions, indent, row, secondary, width);
}

/**
 * Subtítulo gris (`Descripción:`) y, debajo, su texto en color normal, partido en líneas del ancho
 * que queda (hasta `TEXT_MAX_LINES`, con «…» al final si hay más).
 */
function textRows(label: string, text: string, indent: number, row: Row, secondary: Paint, width: number): void {
  row(indent, { paint: secondary, text: `${label}:` });
  const room = width - BOX_PADDING - indent - TEXT_INDENT;
  for (const line of wrapText(plainText(text), room, TEXT_MAX_LINES)) row(indent + TEXT_INDENT, { text: line });
}

/** Cómo va el plan: `recién iniciado`, `Paso 2 de 7` con su barra o `pasos completos`; sin plan, `null`. */
function stateText({ done, total }: Plan): string | null {
  if (!total) return null;
  if (!done) return "recién iniciado";
  if (done >= total) return "pasos completos";
  return `Paso ${done + 1} de ${total} ${progressBar(done, total)}`;
}

/**
 * Estado y pasos de un plan (de la tarea en progreso o de una pausada): los hechos con el texto
 * tachado, el actual resaltado y el resto normales. Sin plan, no agrega nada.
 */
function planRows(plan: Plan, indent: number, row: Row, pc: Colors): void {
  const state = stateText(plan);
  if (state === null) return;
  const { secondary } = tones(pc);
  row(indent, { paint: pc.green, text: `Estado: ${state}` });
  for (const step of plan.steps) {
    if (step.done) row(indent + 2, { paint: secondary, text: "✔ " }, { paint: (s) => secondary(pc.strikethrough(s)), text: step.text });
    else if (step === plan.currentStep) row(indent + 2, { paint: (s) => pc.bold(pc.green(s)), text: `▸ ${step.text}` });
    else row(indent + 2, { text: `○ ${step.text}` });
  }
}

/**
 * Tramos de una tarea completada: el nombre y la fecha (los dos en el mismo gris) y, aparte, la
 * marca de descartada. Si no entra en el ancho del recuadro, se recorta el nombre (no la fecha).
 */
function completedSegments(entry: HistoryEntry, width: number, pc: Colors, reserve = 0): Segment[] {
  const { completed, completedGreen } = tones(pc);
  // El prefijo `T-N` va en el verde del título; el resto del nombre, en el gris de las completadas.
  const prefix = entry.number == null ? "" : `T-${entry.number}`;
  const rest = plainText(entry.number == null ? entry.title : shortTaskName(entry.number, entry.title).slice(prefix.length));
  const discarded = entry.status === "discarded" ? " ✖ (descartada)" : "";
  const date = entry.date ? ` · ${entry.date}` : "";
  const room = width - 4 - visibleLength(prefix + discarded + date) - reserve;
  const segments: Segment[] = [];
  if (prefix) segments.push({ paint: completedGreen, text: prefix });
  segments.push({ paint: completed, text: truncate(rest, Math.max(1, room)) });
  if (discarded) segments.push({ paint: pc.red, text: discarded });
  if (date) segments.push({ paint: completed, text: date });
  return segments;
}

/** Una tarea bloqueada y, debajo, las tareas de las que depende. */
function blockedRows(task: BlockedTask, row: Row, pc: Colors): void {
  const { secondary } = tones(pc);
  const tag = task.block.tag ? ` [${task.block.tag}]` : "";
  row(0, { paint: pc.red, text: `${shortTaskName(task.number, task.title)}${tag}` });
  for (const ref of task.dependsOn) row(5, { paint: ref.closed ? pc.yellow : secondary, text: dependencyText(ref) });
}

/** `→ espera T-3: título`, con la pista de la Regla 8 si esa tarea ya se cerró. */
export function dependencyText(ref: TaskRef): string {
  const base = `→ espera ${shortTaskName(ref.number, ref.title)}`;
  return ref.closed ? `${base} (cerrada ✔ — ¿moverla a libres?)` : base;
}
