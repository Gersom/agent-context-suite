// Estado del filtro por etiqueta (tecla `t`) de una sesión del board: la etiqueta activa (`null` es
// «todas») y las que existen en lo último que se pintó. Solo vive en memoria: no se guarda en
// settings.json y se reinicia al cambiar de proyecto. Sin I/O, para poder probarlo solo.

import { nextLabel, reconcileLabel } from "../model/labels.ts";

export interface LabelFilter {
  /** Etiqueta filtrada, tal como figura en el proyecto; `null`: todas las tareas. */
  readonly active: string | null;
  /** Etiquetas que existen en lo último pintado (ordenadas, ver `modelLabels`). */
  readonly available: string[];
  /** Registra las etiquetas que hay ahora; si la filtrada ya no existe, el filtro vuelve a «todas». */
  sync(labels: string[]): void;
  /** `t`: pasa a la siguiente etiqueta (o de la última a «todas»). Devuelve `false` si no cambió nada (no hay etiquetas). */
  cycle(): boolean;
  /** Vuelve a «todas» y olvida las etiquetas (al cambiar de proyecto). */
  reset(): void;
}

export function createLabelFilter(): LabelFilter {
  let active: string | null = null;
  let available: string[] = [];
  return {
    get active() {
      return active;
    },
    get available() {
      return available;
    },
    sync(labels) {
      available = labels;
      active = reconcileLabel(labels, active);
    },
    cycle() {
      const next = nextLabel(available, active);
      if (next === active) return false;
      active = next;
      return true;
    },
    reset() {
      active = null;
      available = [];
    },
  };
}
