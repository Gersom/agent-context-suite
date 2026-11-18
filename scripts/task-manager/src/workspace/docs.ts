// Lectura de los archivos del operador (handoff, backlog, history y, en modo multi, el
// team-backlog) para poder editarlos de forma quirúrgica: se guarda el texto CRUDO (con sus
// finales de línea) y el parseo se hace siempre sobre el texto normalizado a LF, cuyos rangos
// se traducen al crudo con `EolInfo` (ver `scripts/_shared/parse/positions.ts`).

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseBacklog } from "../../../_shared/parse/backlog.ts";
import { parseHandoff } from "../../../_shared/parse/handoff.ts";
import { parseHistory } from "../../../_shared/parse/history.ts";
import { type EolInfo, normalizeEol } from "../../../_shared/parse/positions.ts";
import { BACKLOG_SECTIONS, HANDOFF_SECTIONS } from "../../../_shared/parse/sections.ts";
import { parseTeamBacklog, TEAM_BACKLOG_SECTIONS } from "../../../_shared/parse/team-backlog.ts";
import type { ParsedBacklog, ParsedHandoff, ParsedHistory, ParsedTeamBacklog } from "../../../_shared/types.ts";
import { CliError } from "../cli/errors.ts";
import type { Workspace } from "./workspace.ts";

/** Cuál de los archivos es (`rules.md` solo lo lee `acsuite init`, para escribirle el bloque de la suite). */
export type DocKind = "handoff" | "backlog" | "history" | "team-backlog" | "rules";

/** Ids de las secciones con ancla que se esperan en cada archivo (`history.md` y `rules.md` no usan anclas). */
export const DOC_SECTIONS: Record<DocKind, string[]> = {
  handoff: HANDOFF_SECTIONS,
  backlog: BACKLOG_SECTIONS,
  history: [],
  "team-backlog": TEAM_BACKLOG_SECTIONS,
  rules: [],
};

/** Un archivo leído. Si no existe, `exists` es `false` y `raw`/`text` están vacíos (se parsea como vacío). */
export interface Doc<P> {
  kind: DocKind;
  /** Nombre del archivo (`handoff.md`). */
  fileName: string;
  path: string;
  exists: boolean;
  /** Texto tal como está en disco (puede traer CRLF o BOM). */
  raw: string;
  /** Finales de línea del crudo y traducción de offsets (`rawSpan`, `toRaw`, `eol`). */
  eol: EolInfo;
  /** `raw` con todos los finales de línea en LF: el texto que parsean los parsers y al que apuntan los `Range`. */
  text: string;
  parsed: P;
}

export interface Docs {
  handoff: Doc<ParsedHandoff>;
  backlog: Doc<ParsedBacklog>;
  history: Doc<ParsedHistory>;
  /** `null` en el repo plano (no hay equipo); en modo multi puede no existir (`exists: false`). */
  teamBacklog: Doc<ParsedTeamBacklog> | null;
  /** Texto de `rules.md` (de la carpeta de agentes, con LF) para saber el idioma de la documentación; `""` si falta o no se pudo leer. */
  rulesText: string;
}

/** `rules.md` solo informa el idioma: si falta o no se puede leer no es un error, queda vacío. */
function readRulesText(agentsRoot: string | undefined): string {
  if (!agentsRoot) return "";
  try {
    return normalizeEol(readRaw(join(agentsRoot, "rules.md")) ?? "").text;
  } catch {
    return "";
  }
}

/**
 * Lee un archivo sin normalizar. `null` si no existe. Cualquier otro fallo (permisos, archivo
 * trabado, es una carpeta) se lanza como error, para no confundirlo con un archivo ausente.
 */
export function readRaw(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (caught) {
    const err = caught as { code?: string; message?: string };
    if (err.code === "ENOENT") return null;
    throw new CliError(`No se pudo leer ${basename(path)} (${path}): ${err.message ?? err}`);
  }
}

/** Lee y parsea un archivo; el ausente se parsea como texto vacío (`exists: false`). */
export function readDoc<P>(kind: DocKind, path: string, parse: (text: string) => P): Doc<P> {
  const raw = readRaw(path);
  const eol = normalizeEol(raw ?? "");
  return { kind, fileName: basename(path), path, exists: raw !== null, raw: raw ?? "", eol, text: eol.text, parsed: parse(eol.text) };
}

/** Lee los archivos del espacio de trabajo. Los ausentes quedan con `exists: false` (no es un error). */
export function readDocs(workspace: Pick<Workspace, "files"> & Partial<Pick<Workspace, "agentsRoot">>): Docs {
  const { files } = workspace;
  return {
    rulesText: readRulesText(workspace.agentsRoot),
    handoff: readDoc("handoff", files.handoff, parseHandoff),
    backlog: readDoc("backlog", files.backlog, parseBacklog),
    history: readDoc("history", files.history, parseHistory),
    teamBacklog: files.teamBacklog ? readDoc("team-backlog", files.teamBacklog, parseTeamBacklog) : null,
  };
}

/**
 * El archivo, o un error claro si no existe. Para los comandos que lo necesitan para trabajar
 * (el script no crea archivos que faltan: ese es el trabajo de la skill).
 */
export function requireDoc<P>(doc: Doc<P> | null, what: string): Doc<P> {
  if (!doc) throw new CliError(`${what} no aplica en este repo (es plano, sin modo multi-operador).`);
  if (!doc.exists) throw new CliError(`Falta ${doc.fileName} en ${doc.path}; este script no lo crea.`);
  return doc;
}
