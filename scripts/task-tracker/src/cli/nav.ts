// Navegación de la vista de equipo (modo multi-operador): qué vista se muestra (el equipo o el
// panel de un operador) y qué operador está elegido. Es una función pura de estado y teclas, sin
// pantalla ni terminal, para poder probarla sola. El operador elegido se guarda por su carpeta (no
// por posición) para que siga siendo el mismo si `operators.md` cambia mientras se mira.

import type { NavKey } from "./keys.ts";

export type View = { kind: "team" } | { kind: "operator"; folder: string };

export interface NavState {
  view: View;
  /** Carpeta del operador elegido en la lista del equipo; `null` si no hay ninguno abrible. */
  selected: string | null;
}

/** Lo que la navegación necesita saber de cada operador de la lista. */
export interface NavRow {
  folder: string;
  /** `(solo team-backlog)`: no tiene panel que abrir. */
  folderless: boolean;
}

/** Carpetas de los operadores que se pueden elegir y abrir. */
export function selectable(rows: NavRow[]): string[] {
  return rows.filter((row) => !row.folderless).map((row) => row.folder);
}

/**
 * Estado inicial: el panel de `operator` si se pidió uno; si no, el del operador activo (`preferred`,
 * el del correo de git) cuando figura con carpeta; si no, la vista de equipo con elegido el primero abrible.
 */
export function initialNav({ operator, preferred }: { operator?: string; preferred: string | null }, rows: NavRow[]): NavState {
  if (operator) return { view: { kind: "operator", folder: operator }, selected: operator };
  const options = selectable(rows);
  if (preferred && options.includes(preferred)) return { view: { kind: "operator", folder: preferred }, selected: preferred };
  return { view: { kind: "team" }, selected: options[0] ?? null };
}

/** Aplica una tecla de navegación (`quit` y `redraw` no cambian el estado). */
export function navReduce(state: NavState, key: NavKey, rows: NavRow[]): NavState {
  const options = selectable(rows);
  if (state.view.kind === "operator") {
    return key === "team" ? { view: { kind: "team" }, selected: state.view.folder } : state;
  }
  if (key === "up" || key === "down") {
    if (!options.length) return state;
    const at = state.selected ? options.indexOf(state.selected) : -1;
    const next = key === "down" ? (at + 1) % options.length : at <= 0 ? options.length - 1 : at - 1;
    return { ...state, selected: options[next] };
  }
  if (key === "enter" && state.selected && options.includes(state.selected)) {
    return { view: { kind: "operator", folder: state.selected }, selected: state.selected };
  }
  return state;
}

/** `false` si la tecla `c` (compactar/expandir) no hace nada: en la vista de equipo. `nav` es `null` fuera del modo multi-operador. */
export function compactApplies(nav: NavState | null): boolean {
  return nav?.view.kind !== "team";
}

/** `false` si la tecla `t` (filtrar por etiqueta) no hace nada: en la vista de equipo, que es un resumen. `nav` es `null` fuera del modo multi-operador. */
export function labelApplies(nav: NavState | null): boolean {
  return nav?.view.kind !== "team";
}

/**
 * Ajusta el estado a la lista actual: si el operador que se mira ya no figura (o ya no tiene
 * carpeta), vuelve a la vista de equipo y lo informa en `lost`; si el elegido desapareció, elige
 * otro.
 */
export function reconcileNav(state: NavState, rows: NavRow[]): { state: NavState; lost: string | null } {
  const options = selectable(rows);
  let lost: string | null = null;
  let { view, selected } = state;
  if (view.kind === "operator" && !options.includes(view.folder)) {
    lost = view.folder;
    view = { kind: "team" };
  }
  if (!selected || !options.includes(selected)) selected = options[0] ?? null;
  return { state: { view, selected }, lost };
}
