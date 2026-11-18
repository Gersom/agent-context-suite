// Teclas de la terminal interactiva: `q` o Ctrl+C salen, `r` redibuja, `c` compacta o expande los
// recuadros, `f` oculta o muestra las flechas del flujo y `t` filtra las tareas por etiqueta. En la vista de equipo (modo
// multi-operador) y en la lista de proyectos, ↑/↓ eligen y Enter abre; `e` lleva de un panel de
// operador a la vista de equipo; `p` lleva a la lista de proyectos desde cualquier vista de un repo,
// `a` agrega un repo a ella y `x` quita de ella el elegido (pide confirmación: ver `parseConfirm`).
// `o` activa o desactiva el modo observador (abre solo el proyecto que marca el mod de Claude: ver
// observer.ts).

export type NavKey = "quit" | "redraw" | "up" | "down" | "enter" | "team" | "compact" | "flow" | "label" | "projects" | "add" | "remove" | "observe";

/**
 * Teclas de lo que llegó de la terminal en modo raw. Las flechas llegan como secuencias de varios
 * caracteres (`ESC [ A`, o `ESC O A` en algunas terminales); un Esc suelto (sin nada después) no es
 * una tecla del tablero. Las secuencias que no se conocen (otras teclas especiales) se ignoran enteras.
 */
export function parseKeys(chunk: string): NavKey[] {
  const keys: NavKey[] = [];
  for (let i = 0; i < chunk.length; i++) {
    const char = chunk[i];
    if (char === "\u001b") {
      const next = chunk[i + 1];
      if (next !== "[" && next !== "O") continue;
      const end = sequenceEnd(chunk, i);
      const final = chunk[end];
      if (final === "A") keys.push("up");
      else if (final === "B") keys.push("down");
      i = end;
      continue;
    }
    const key = singleKey(char);
    if (key) keys.push(key);
  }
  return keys;
}

/** Índice del último carácter de la secuencia `ESC [ …` o `ESC O …` que empieza en `start`. */
function sequenceEnd(chunk: string, start: number): number {
  let end = start + 2;
  while (end < chunk.length && !/[@-~]/.test(chunk[end])) end++;
  return end;
}

/**
 * Respuesta a una confirmación («¿Quitar…? [Enter] sí · [Esc] no»): Enter acepta, Esc suelto o `n`
 * cancelan y Ctrl+C sale. Cualquier otra tecla (también las flechas) se ignora; gana la primera
 * respuesta del bloque, y `null` si no hay ninguna.
 */
export function parseConfirm(chunk: string): "accept" | "cancel" | "quit" | null {
  for (let i = 0; i < chunk.length; i++) {
    const char = chunk[i];
    if (char === "\u001b") {
      const next = chunk[i + 1];
      if (next !== "[" && next !== "O") return "cancel";
      i = sequenceEnd(chunk, i);
    } else if (char === "\u0003") return "quit";
    else if (char === "\r" || char === "\n") return "accept";
    else if (char === "n" || char === "N") return "cancel";
  }
  return null;
}

function singleKey(char: string): NavKey | null {
  if (char === "\u0003" || char === "q" || char === "Q") return "quit";
  if (char === "r" || char === "R") return "redraw";
  if (char === "c" || char === "C") return "compact";
  if (char === "f" || char === "F") return "flow";
  if (char === "t" || char === "T") return "label";
  if (char === "p" || char === "P") return "projects";
  if (char === "a" || char === "A") return "add";
  if (char === "x" || char === "X") return "remove";
  if (char === "o" || char === "O") return "observe";
  if (char === "\r" || char === "\n") return "enter";
  if (char === "e" || char === "E") return "team";
  return null;
}
