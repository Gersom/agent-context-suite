// Ciclo del tracker: leer los archivos → armar el modelo → pintar, y redibujar cuando cambian
// (watcher), cuando cambia el tamaño de la terminal, con el atajo `r`, o terminar con `q`/Ctrl+C.
// En modo multi-operador hay además dos vistas (el equipo y el panel de un operador) y una
// navegación con ↑/↓, Enter y `e` (ver cli/nav.ts). Sin un repo al que abrir de frente, se
// muestra la lista de proyectos (ver cli/projects-nav.ts): Enter abre uno y `p` vuelve a ella.

import { mkdirSync } from "node:fs";
import { basename } from "node:path";
import { gitToplevel } from "../../_shared/git.ts";
import { parseKeys } from "./cli/keys.ts";
import { compactApplies, initialNav, type NavRow, navReduce, type NavState, reconcileNav } from "./cli/nav.ts";
import { ignoredWithObserver, type ObserverState, observerFailureNotice, observerStep, startObserver } from "./cli/observer.ts";
import { projectsKeysReduce } from "./cli/projects-keys.ts";
import { initialProjectsNav, neighborAfterRemove, type ProjectsNavState, reconcileProjects } from "./cli/projects-nav.ts";
import { ACTIVE_PROJECT_FILE, clearActiveProject, readActiveProject } from "./io/active-project.ts";
import { resolveAgentsDir } from "./io/paths.ts";
import { createProjectList, defaultProjects, type ProjectsProvider, readProjectRows } from "./io/projects.ts";
import { createSnapshotReader, RETRY_MS } from "./io/snapshot.ts";
import { type BoardSettings, saveBoardSettings } from "./io/settings.ts";
import { createTeamReader, ROOT_WATCHED_FILES } from "./io/team.ts";
import { configDir, failureMessage, removeProject, samePath, saveProject } from "./io/user-config.ts";
import { watchDir } from "./io/watch.ts";
import { buildModel } from "./model/model.ts";
import { buildTeamModel } from "./model/team.ts";
import type { Controls, DrawTrigger, MultiInfo, ProjectRow, RenderMeta, ResolveOk } from "./shared/types.ts";
import { displayProjectName } from "./ui/format.ts";
import { render, renderObserver, renderProjects, renderTeam } from "./ui/render.ts";

/** El repo que se vigila: lo que resuelve `resolveAgentsDir`. */
type Target = Omit<ResolveOk, "ok">;

/**
 * Arranca el tracker sobre una carpeta de agentes ya resuelta.
 * `target`: el repo a vigilar (`multi`: modo multi-operador, `agentsDir` es la raíz con
 * `operators.md`); `null` abre la lista de proyectos.
 * `listProjects`: de dónde sale la lista de proyectos (se lee al abrir la vista y con `r`).
 * `once`: pinta una sola vez y no vigila (sin atajos de teclado).
 * `follow`: arranca con el modo observador activo, en su vista de espera aunque haya un `target` (solo
 * en una sesión interactiva; con `once` o sin terminal se ignora). La tecla `o` lo alterna.
 * Las teclas `c`, `f` y `o` guardan el nuevo valor en `settings.json` (solo en una sesión interactiva);
 * arrancar con una opción ya puesta por lo guardado no escribe nada.
 * `settingsWarning`: aviso de que `settings.json` no se pudo leer (ver `loadBoardSettings`), para mostrarlo.
 * `projectsNotice`: aviso para la lista de proyectos con la que se arranca (solo si `target` es `null`).
 */
export function startApp({
  target: initialTarget,
  listProjects = defaultProjects,
  compact = false,
  arrows = true,
  follow = false,
  once,
  settingsWarning = null,
  projectsNotice = null,
}: {
  target: Target | null;
  listProjects?: ProjectsProvider;
  /** Arranca con los recuadros compactos (una sola tarea por recuadro); la tecla `c` lo alterna. */
  compact?: boolean;
  /** Arranca con las flechas del flujo; la tecla `f` las alterna. */
  arrows?: boolean;
  /** Arranca con el modo observador activo; la tecla `o` lo alterna. */
  follow?: boolean;
  once: boolean;
  settingsWarning?: string | null;
  projectsNotice?: string | null;
}): void {
  const ui = { compact, arrows };
  const watcherErrors: string[] = [];
  // El repo abierto (`null`: la lista de proyectos) y lo que depende de él; `open` los intercambia.
  let target: Target | null = null;
  let snapshot: ReturnType<typeof createSnapshotReader> | null = null;
  let teamReader: ReturnType<typeof createTeamReader> | null = null;
  let nav: NavState | null = null;
  let navRows: NavRow[] = [];
  let projectRows: ProjectRow[] = [];
  let projectsNav: ProjectsNavState = initialProjectsNav([]);
  let projectsNotices: string[] = [];
  // Lista de proyectos: la del proveedor más los repos agregados con `a` (que además se guardan en
  // disco), menos los quitados con `x` (que además se quitan del disco).
  const projectList = createProjectList(listProjects, { save: saveProject, remove: removeProject });
  // Texto de la ruta que se escribe para agregar un repo; `null` si no se está agregando.
  let adding: string | null = null;
  // Ruta del proyecto que se pide quitar de la lista, a la espera de confirmar; `null` si no hay nada que confirmar.
  let confirmRemove: string | null = null;
  // Modo observador: `null` si está apagado. Es independiente de `stops` (que `open` vacía al cambiar
  // de repo): sigue vigilando `active-project.json` aunque se abra otro repo.
  let observer: ObserverState | null = null;
  let stopObserver: (() => void) | null = null;
  // Último aviso del observador (ej. el proyecto marcado no se pudo abrir); `null` si no hay.
  let observerNotice: string | null = null;
  // `true` desde que se activa el observador hasta que una marca abre un repo: la pantalla es solo la
  // de espera (`renderObserver`), sin repo ni lista de proyectos (`target` es `null`).
  let observerWaiting = false;
  // Atajos solo con una terminal interactiva de verdad (no con salida o entrada redirigida).
  const interactive = !once && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
  const controls: Controls = once ? "none" : interactive ? "keys" : "ctrl-c";

  /** Cambia lo que se muestra: un repo (con sus lectores y vigilantes nuevos) o la lista de proyectos. */
  function open(next: Target | null): void {
    for (const stop of stops.values()) stop();
    stops.clear();
    watcherErrors.length = 0;
    target = next;
    snapshot = next && !next.multi ? createSnapshotReader(next.agentsDir) : null;
    teamReader = next?.multi ? createTeamReader(next.agentsDir) : null;
    nav = null;
    navRows = [];
    // Esperando una marca la lista no se ve: se lee al salir del observador.
    if (!next && !observerWaiting) loadProjects();
    if (process.stdout.isTTY && !next?.multi) setTitle();
  }

  /** Vuelve a leer la lista de proyectos y todos sus repos (solo al abrir la vista y con `r`). */
  function loadProjects(): void {
    projectRows = readProjectRows(projectList.list());
    projectsNav = reconcileProjects(projectsNav, projectRows.map((row) => row.path));
    // Si la lista guardada no se pudo leer, se avisa (y se ignora): ver `ProjectsProvider.warning`.
    const warning = listProjects.warning?.() ?? null;
    projectsNotices = warning ? [warning] : [];
  }

  /** Enter con una ruta escrita (`text`): la agrega y la elige; si no sirve, avisa y deja la entrada abierta. */
  function submitAdding(text: string): void {
    const result = projectList.add(text);
    if (!result.ok) {
      projectsNotices = [result.error];
      return;
    }
    adding = null;
    loadProjects();
    projectsNav = { selected: result.path, opened: null };
    if (!result.added) projectsNotices.push("Ese repo ya estaba en la lista.");
    if (result.warning) projectsNotices.push(result.warning);
  }

  /**
   * Enter al confirmar: quita el proyecto `path` de la lista y de lo guardado (no borra nada del repo).
   * La selección pasa al vecino (el siguiente, o el anterior si era el último); si no se pudo quitar,
   * avisa y la lista queda como estaba.
   */
  function submitRemove(path: string): void {
    const error = projectList.remove(path);
    if (error) {
      projectsNotices = [error];
      return;
    }
    // Sin releer los repos (eso es de `r`): se saca la fila y la selección pasa al vecino.
    const neighbor = neighborAfterRemove(projectRows.map((row) => row.path), path);
    projectRows = projectRows.filter((row) => !samePath(row.path, path));
    projectsNav = reconcileProjects({ selected: projectsNav.selected && samePath(projectsNav.selected, path) ? neighbor : projectsNav.selected, opened: null }, projectRows.map((row) => row.path));
    projectsNotices = [];
  }

  /** Enter en la lista: abre ese repo en el tablero; si ya no se puede abrir, lo avisa y se queda. */
  function openProject(path: string): void {
    observerNotice = null;
    projectsNav = { ...projectsNav, opened: null };
    const resolved = resolveAgentsDir(path);
    if (!resolved.ok) {
      projectsNotices = [`No se pudo abrir ${path}: ${resolved.error.replace(/:$/, "")}.`];
      return draw({ kind: "redraw" });
    }
    open(resolved);
    draw({ kind: "start" });
    syncWatchers();
  }

  /**
   * Lee los archivos, arma el modelo y redibuja la pantalla. Si un archivo que se venía leyendo
   * bien falla (un agente puede estar reescribiéndolo justo ahora), se reintenta una vez antes de
   * pintar; si sigue fallando, se muestra su última versión buena con un aviso (ver snapshot.ts).
   */
  function draw(trigger: DrawTrigger, { isRetry = false }: { isRetry?: boolean } = {}): void {
    const allowRetry = !once && !isRetry;
    const common = {
      updatedAt: new Date(),
      trigger,
      controls,
      compact: ui.compact,
      arrows: ui.arrows,
      ...(observer ? { observer: { notice: observerNotice } } : {}),
    };
    let screen: string;
    // Alto de la terminal para recortar la lista de proyectos y el equipo; con `--once` o salida redirigida no se recorta.
    const rows = interactive ? process.stdout.rows || undefined : undefined;

    if (observerWaiting) return write(renderObserver(common));

    if (!target) {
      // La lista no se relee al redibujar (cambio de tamaño): solo con `r` o al abrir la vista.
      projectsNav = reconcileProjects(projectsNav, projectRows.map((row) => row.path));
      const confirm = confirmRemove ? { name: projectRows.find((row) => row.path === confirmRemove)?.name ?? confirmRemove, path: confirmRemove } : null;
      screen = renderProjects(projectRows, { ...common, selected: projectsNav.selected, multiView: "projects", input: adding, confirmRemove: confirm, rows }, projectsNotices);
      return write(screen);
    }

    const { agentsDir, projectName, projectDir, multi } = target;
    const meta: RenderMeta = { ...common, projectName, projectDir };

    if (teamReader && multi) {
      const read = teamReader.read({ allowRetry });
      if (read.needsRetry) {
        setTimeout(() => draw(trigger, { isRetry: true }), RETRY_MS);
        return;
      }
      const team = buildTeamModel({ ...read, warnings: [...read.warnings, ...watcherErrors] });
      navRows = team.rows.map((row) => ({ folder: row.folder, folderless: row.folderless }));
      const reconciled = reconcileNav(nav ?? initialNav(multi, navRows), navRows);
      nav = reconciled.state;
      const lost = reconciled.lost ? [`El operador «${reconciled.lost}» ya no figura con carpeta en operators.md: se vuelve a la vista de equipo.`] : [];
      const view = nav.view;
      const opened = view.kind === "operator" ? read.operators.find((o) => o.entry.folder === view.folder) : null;

      if (opened?.snapshot) {
        const model = buildModel({
          handoffText: opened.snapshot.handoffText,
          backlogText: opened.snapshot.backlogText,
          historyText: opened.snapshot.historyText,
          readErrors: [...opened.snapshot.warnings, ...watcherErrors, ...lost],
        });
        screen = render(model, { ...meta, operator: opened.entry.folder, teamBacklog: team.teamBacklog, multiView: "operator" });
      } else {
        screen = renderTeam(
          { ...team, warnings: [...team.warnings, ...lost] },
          { ...meta, selected: nav.selected, preferred: multi.preferred, multiView: "team", rows },
        );
      }
      if (process.stdout.isTTY) setTitle(nav.view.kind === "operator" ? nav.view.folder : "equipo");
      syncWatchers();
    } else if (snapshot) {
      const snap = snapshot.read({ allowRetry });
      if (snap.needsRetry) {
        setTimeout(() => draw(trigger, { isRetry: true }), RETRY_MS);
        return;
      }
      const model = buildModel({
        handoffText: snap.handoffText,
        backlogText: snap.backlogText,
        historyText: snap.historyText,
        readErrors: [...snap.warnings, ...watcherErrors],
      });
      screen = render(model, meta);
    } else {
      return;
    }

    write(screen);
  }

  function write(screen: string): void {
    if (!once && process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
    process.stdout.write(screen);
  }

  function setTitle(suffix?: string): void {
    const name = observerWaiting ? "observador" : target ? displayProjectName(target.projectName) : "proyectos";
    process.stdout.write(`\x1b]0;tareas · ${name}${suffix ? ` · ${suffix}` : ""}\x07`);
  }

  // Una instancia de watcher por carpeta vigilada: la de agentes (modo plano) o la raíz y la de
  // cada operador con carpeta (modo multi-operador; se agregan al aparecer en operators.md).
  // La lista de proyectos no vigila nada.
  const stops = new Map<string, () => void>();
  const onChange = (file: string | null) => draw({ kind: "change", file });
  const onError = (message: string) => {
    watcherErrors.splice(0, watcherErrors.length, message);
    draw({ kind: "redraw" });
  };
  function syncWatchers(): void {
    if (once || !target) return;
    const { agentsDir, multi } = target;
    if (!stops.has(agentsDir)) stops.set(agentsDir, watchDir(agentsDir, onChange, onError, undefined, multi ? ROOT_WATCHED_FILES : undefined));
    if (!multi) return;
    for (const row of navRows) {
      if (row.folderless) continue;
      const dir = `${agentsDir}/${row.folder}`;
      if (!stops.has(dir)) stops.set(dir, watchDir(dir, onChange, onError));
    }
  }

  // Último aviso de un fallo al guardar los ajustes, para quitarlo de los canales si un guardado posterior sale bien.
  let settingsFailure: string | null = null;

  /**
   * Guarda `patch` en `settings.json` (solo en modo interactivo). Si falla, suma el aviso (sin repetirlo)
   * a los que ya tiene la vista actual; si sale bien, quita el aviso de un fallo anterior. Devuelve `true`
   * si el aviso cambió (quien llama redibuja); el tablero sigue como estaba.
   */
  function persist(patch: Partial<BoardSettings>): boolean {
    if (!interactive) return false;
    const error = saveBoardSettings(patch);
    const previous = settingsFailure;
    settingsFailure = error ? failureMessage("guardar", "ajustes del board", error) : null;
    if (previous && previous !== settingsFailure) {
      if (observerNotice === previous) observerNotice = null;
      else if (observerNotice) observerNotice = observerNotice.replace(` ${previous}`, "");
      for (const list of [watcherErrors, projectsNotices]) {
        const at = list.indexOf(previous);
        if (at >= 0) list.splice(at, 1);
      }
    }
    if (settingsFailure) {
      if (observer) {
        if (!observerNotice?.includes(settingsFailure)) observerNotice = observerNotice ? `${observerNotice} ${settingsFailure}` : settingsFailure;
      } else {
        const list = target ? watcherErrors : projectsNotices;
        if (!list.includes(settingsFailure)) list.push(settingsFailure);
      }
    }
    return Boolean(settingsFailure) || Boolean(previous);
  }

  /** `o`: activa el modo observador, o lo desactiva si ya estaba activo; guarda el nuevo valor. */
  function toggleObserver(): void {
    if (observer) exitObserver();
    else enterObserver();
    if (persist({ follow: observer != null })) draw({ kind: "redraw" });
  }

  /**
   * Activa el modo observador: borra el `active-project.json` que haya (lo marcado antes no cuenta) y
   * vigila la carpeta de config hasta que el mod de Claude escriba uno nuevo. Mientras tanto la
   * pantalla es la de espera: se cierra el repo abierto (sin lectores ni vigilantes) y no hay tareas.
   * `notice`: aviso con el que arranca la pantalla de espera.
   */
  function enterObserver(notice: string | null = null): void {
    stopObserver?.();
    // El watcher necesita la carpeta; puede no existir si nunca se guardó nada.
    try {
      mkdirSync(configDir(), { recursive: true });
    } catch {
      // Si no se puede crear, `watchDir` lo avisa por `onError`.
    }
    clearActiveProject();
    observer = startObserver(Date.now());
    observerNotice = notice;
    // Un fallo del watcher se avisa en el propio observador: `watcherErrors` no sale en la lista de proyectos.
    const onObserverError = (message: string) => {
      observerNotice = message;
      draw({ kind: "redraw" });
    };
    stopObserver = watchDir(configDir(), onActiveChange, onObserverError, undefined, [ACTIVE_PROJECT_FILE]);
    // No queda una ruta a medio escribir ni una confirmación pendiente de la lista.
    adding = null;
    confirmRemove = null;
    observerWaiting = true;
    open(null);
    draw({ kind: "redraw" });
  }

  /**
   * Desactiva el modo observador. Si todavía esperaba la primera marca, no hay repo al que volver:
   * queda la lista de proyectos (se vuelve a leer).
   */
  function exitObserver(): void {
    stopObserver?.();
    stopObserver = null;
    observer = null;
    observerNotice = null;
    if (observerWaiting) {
      observerWaiting = false;
      open(null);
    }
    draw({ kind: "redraw" });
  }

  /** Cambió `active-project.json`: si trae un proyecto marcado más nuevo que el último atendido, lo abre. */
  function onActiveChange(): void {
    if (!observer) return;
    const step = observerStep(observer, readActiveProject());
    observer = step.state;
    if (step.open) followProject(step.open);
  }

  /**
   * Abre el proyecto marcado `path` (agregándolo a la lista si no estaba) y termina la espera. Si no
   * se puede, lo avisa en la pantalla actual (la de espera, si todavía no se abrió ninguno) y se
   * sigue observando.
   */
  function followProject(path: string): void {
    const result = projectList.add(path);
    if (!result.ok) {
      observerNotice = observerFailureNotice(path, result.error);
      return draw({ kind: "redraw" });
    }
    let resolved = resolveAgentsDir(result.path);
    if (!resolved.ok) {
      observerNotice = observerFailureNotice(path, resolved.error, result.warning);
      return draw({ kind: "redraw" });
    }
    // Repo multi-operador: se abre de frente el tablero del operador actual (el del correo de git),
    // como `board <ruta> X`. Si no figura, queda la vista de equipo; si no se puede, también.
    if (resolved.multi?.preferred && !resolved.multi.operator) {
      const own = resolveAgentsDir(result.path, undefined, { operator: resolved.multi.preferred });
      if (own.ok) resolved = own;
    }
    observerNotice = result.warning ?? null;
    if (target && samePath(target.projectDir, result.path)) return draw({ kind: "redraw" });
    // La vista de la lista se reemplaza: no queda una ruta a medio escribir ni una confirmación pendiente.
    adding = null;
    confirmRemove = null;
    observerWaiting = false;
    open(resolved);
    draw({ kind: "start" });
    syncWatchers();
  }

  open(initialTarget);
  if (initialTarget && !once) {
    // Un repo abierto de frente se agrega solo a la lista guardada (con `--once` no se escribe nada).
    // El aviso de un fallo viaja por el canal de avisos de la vista del repo.
    const root = gitToplevel(initialTarget.projectDir);
    const failure = saveProject(root);
    if (failure) watcherErrors.push(failureMessage("guardar", basename(root), failure));
  }
  if (follow && interactive) {
    // El modo observador solo vale en una sesión interactiva. La primera pantalla es la de espera, aunque
    // haya un repo inicial: ese repo se cierra sin pintarse. Entrar así no guarda nada en settings.json.
    enterObserver(settingsWarning);
  } else {
    // Un settings.json que no se pudo leer se avisa por el canal de la vista con que se arranca.
    if (settingsWarning) {
      if (initialTarget) watcherErrors.push(settingsWarning);
      else projectsNotices.push(settingsWarning);
    }
    if (projectsNotice && !initialTarget) projectsNotices.push(projectsNotice);
    draw({ kind: "start" });
    if (once) return;
    syncWatchers();
  }

  const quit = () => {
    for (const stop of stops.values()) stop();
    stopObserver?.();
    if (interactive) process.stdin.setRawMode(false);
    process.stdout.write("\n");
    process.exit(0);
  };

  process.stdout.on("resize", () => draw({ kind: "redraw" }));
  process.on("SIGINT", quit);

  if (interactive) {
    // En modo raw Ctrl+C no genera SIGINT: llega como el carácter \u0003 (ver keys.ts).
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    /**
     * Atiende un bloque de teclas en la lista de proyectos (ver projects-keys.ts), desde la tecla
     * `from`. Devuelve desde qué tecla sigue el bloque, o `null` si no queda nada (o se salió).
     */
    function projectsKeys(chunk: string, from: number): number | null {
      const result = projectsKeysReduce({ nav: projectsNav, adding, confirmRemove }, chunk, { paths: projectRows.map((row) => row.path) }, from);
      projectsNav = result.state.nav;
      adding = result.state.adding;
      confirmRemove = result.state.confirmRemove;
      for (const action of result.actions) {
        if (action.kind === "quit") {
          quit();
          return null;
        }
        if (action.kind === "redraw") draw({ kind: "redraw" });
        else if (action.kind === "reload") loadProjects();
        else if (action.kind === "clearNotices") projectsNotices = [];
        else if (action.kind === "open") openProject(action.path);
        else if (action.kind === "observe") toggleObserver();
        else if (action.kind === "submitAdd") submitAdding(action.text);
        else submitRemove(action.path);
      }
      return result.resume;
    }

    process.stdin.on("data", (chunk: string) => {
      // Cada tecla va a la lista de proyectos o al repo abierto según lo que haya en pantalla en ese
      // momento: una tecla puede cambiarlo (Enter abre un repo; `p` vuelve a la lista).
      const keys = parseKeys(chunk);
      let at = 0;
      while (true) {
        if (observerWaiting) {
          // Esperando la primera marca solo valen salir, `r` y `o` (que deja la lista de proyectos: lo que
          // siga en el bloque va a ella); lo demás se ignora.
          if (at >= keys.length) return;
          const key = keys[at++];
          if (key === "quit") return quit();
          if (key === "observe") toggleObserver();
          else if (key === "redraw") draw({ kind: "redraw" });
          continue;
        }
        if (!target) {
          const resume = projectsKeys(chunk, at);
          if (resume == null) return;
          at = resume;
          continue;
        }
        if (at >= keys.length) return;
        const key = keys[at++];
        if (key === "quit") return quit();
        // Con el observador activo no se sale de la vista del tablero: ni a proyectos (`p`) ni al equipo (`e`); `o` primero.
        if (observer && ignoredWithObserver(key)) continue;
        if (key === "redraw") {
          draw({ kind: "redraw" });
        } else if (key === "observe") {
          toggleObserver();
        } else if (key === "projects") {
          // Desde cualquier vista de un repo, a la lista de proyectos (se vuelve a leer al abrirla).
          open(null);
          draw({ kind: "redraw" });
        } else if (key === "compact" || key === "flow") {
          // En la vista de equipo `c` no hace nada (ni cambia `ui.compact`).
          if (key === "compact" && !compactApplies(nav)) continue;
          if (key === "compact") ui.compact = !ui.compact;
          else ui.arrows = !ui.arrows;
          persist(key === "compact" ? { compact: ui.compact } : { arrows: ui.arrows });
          draw({ kind: "redraw" });
        } else if (target.multi && nav) {
          const next = navReduce(nav, key, navRows);
          if (next !== nav) {
            nav = next;
            draw({ kind: "redraw" });
          }
        }
      }
    });
    process.stdin.resume();
  }
}
