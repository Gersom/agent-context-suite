// Utilidades de markdown compartidas por el parseo de handoff.md y backlog.md: comentarios
// HTML y placeholders de plantilla. Funciones puras sobre strings.

const PLACEHOLDER_RE = /\[Placeholder/i;
const COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g;

/**
 * Quita los comentarios HTML (inline y multilínea). Un comentario sin cerrar se descarta
 * hasta el final del texto.
 */
export function stripComments(text: string): string {
  return text.replace(COMMENT_RE, "");
}

/**
 * Tramos `[inicio, fin)` de los comentarios HTML de un texto: exactamente los que quita
 * `stripComments` (mismo regex), para poder traducir posiciones del texto sin comentarios al
 * original.
 */
export function commentSpans(text: string): [number, number][] {
  return [...text.matchAll(COMMENT_RE)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

export function isPlaceholder(value: string | null | undefined): boolean {
  return PLACEHOLDER_RE.test(value ?? "");
}

/** Quita acentos y mayúsculas y colapsa espacios, para comparar títulos. */
export function normalizeTitle(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Estado "dentro de un comentario HTML" al terminar la línea. */
export function commentStateAfter(line: string, inComment: boolean): boolean {
  let pos = 0;
  let state = inComment;
  while (pos < line.length) {
    if (state) {
      const close = line.indexOf("-->", pos);
      if (close === -1) return true;
      state = false;
      pos = close + 3;
    } else {
      const open = line.indexOf("<!--", pos);
      if (open === -1) return false;
      state = true;
      pos = open + 4;
    }
  }
  return state;
}
