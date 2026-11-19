import { describe, expect, test } from "bun:test";
import { hasSuiteBlock, RulesBlockError, SUITE_BLOCK, SUITE_BLOCK_END, SUITE_BLOCK_START, upsertSuiteBlock } from "../rules-block.ts";

const MARKER = "<!-- agent-context-skill:version 2.0.7 — marcador de versión -->";

const SPANISH = `${MARKER}
# Reglas

## Reglas por defecto

1. Una regla.

## Reglas específicas de este proyecto

- Algo propio.

## Al cerrar una tarea (fijas — leer solo al cerrar)

6. Cierre.
`;

const ENGLISH = `# Rules

## Default rules

1. A rule.

## When closing a task

6. Closing.
`;

describe("SUITE_BLOCK", () => {
  test("va entre sus marcas y no lleva encabezados de nivel 2", () => {
    const lines = SUITE_BLOCK.split("\n");
    expect(lines[0]).toBe(SUITE_BLOCK_START);
    expect(lines.at(-1)).toBe(SUITE_BLOCK_END);
    expect(lines[1]).toBe("### Herramientas de la suite");
    expect(lines.filter((line) => line.startsWith("## "))).toEqual([]);
  });

  test("menciona el modo del plan y las etiquetas", () => {
    for (const piece of ["--mode", "task mode", "--labels", "--label"]) expect(SUITE_BLOCK).toContain(piece);
  });

  test("no depende de «Al cerrar una tarea»", () => {
    expect(SUITE_BLOCK).not.toContain("Al cerrar");
    expect(SUITE_BLOCK).not.toContain("Con una herramienta de tareas");
  });
});

describe("upsertSuiteBlock: insertar", () => {
  test("después del título y antes del primer `##`; la línea 1 y el título no se tocan", () => {
    const { text, action } = upsertSuiteBlock(SPANISH);
    expect(action).toBe("inserted");
    expect(text).toBe(SPANISH.replace("## Reglas por defecto", `${SUITE_BLOCK}\n\n## Reglas por defecto`));
    expect(text.split("\n").slice(0, 2)).toEqual([MARKER, "# Reglas"]);
    expect(text.indexOf(SUITE_BLOCK)).toBeGreaterThan(text.indexOf("# Reglas"));
    expect(text.indexOf(SUITE_BLOCK)).toBeLessThan(text.indexOf("## Reglas por defecto"));
  });

  test("no toca nada más del archivo", () => {
    const { text } = upsertSuiteBlock(SPANISH);
    expect(text.replace(`${SUITE_BLOCK}\n\n`, "")).toBe(SPANISH);
  });

  test("funciona con encabezados en otro idioma", () => {
    const { text, action } = upsertSuiteBlock(ENGLISH);
    expect(action).toBe("inserted");
    expect(text).toBe(`# Rules\n\n${SUITE_BLOCK}\n\n## Default rules\n\n1. A rule.\n\n## When closing a task\n\n6. Closing.\n`);
  });

  test("deja una línea en blanco antes y después aunque el título esté pegado al primer `##`", () => {
    const { text } = upsertSuiteBlock("# R\n## Uno\nx\n");
    expect(text).toBe(`# R\n\n${SUITE_BLOCK}\n\n## Uno\nx\n`);
  });

  test("no duplica la línea en blanco que ya había antes del primer `##`", () => {
    const { text } = upsertSuiteBlock("# R\n\n## Uno\nx\n");
    expect(text).toBe(`# R\n\n${SUITE_BLOCK}\n\n## Uno\nx\n`);
    expect(text).not.toContain("\n\n\n");
  });

  test("el primer `##` en la primera línea: no antepone una línea en blanco", () => {
    const { text } = upsertSuiteBlock("## Uno\nx\n");
    expect(text).toBe(`${SUITE_BLOCK}\n\n## Uno\nx\n`);
  });

  test("lo que haya entre el título y el primer `##` queda antes del bloque", () => {
    const { text } = upsertSuiteBlock("# R\n\nIntro.\n\n## Uno\nx\n");
    expect(text).toBe(`# R\n\nIntro.\n\n${SUITE_BLOCK}\n\n## Uno\nx\n`);
  });

  test("sin ningún `##`, va al final con una línea en blanco antes", () => {
    expect(upsertSuiteBlock("# R\n\nTexto.\n").text).toBe(`# R\n\nTexto.\n\n${SUITE_BLOCK}\n`);
    expect(upsertSuiteBlock("# R\n\nTexto.").text).toBe(`# R\n\nTexto.\n\n${SUITE_BLOCK}`);
    expect(upsertSuiteBlock("# R\n\nTexto.\n\n").text).toBe(`# R\n\nTexto.\n\n${SUITE_BLOCK}\n`);
  });

  test("un archivo vacío recibe solo el bloque", () => {
    expect(upsertSuiteBlock("").text).toBe(`${SUITE_BLOCK}\n`);
  });

  test("un `###` no cuenta como el primer `##`", () => {
    const { text } = upsertSuiteBlock("# R\n\n### Sub\nx\n");
    expect(text).toBe(`# R\n\n### Sub\nx\n\n${SUITE_BLOCK}\n`);
  });
});

describe("upsertSuiteBlock: idempotencia y actualización", () => {
  test("una segunda pasada no cambia nada", () => {
    for (const source of [SPANISH, ENGLISH, "# R\n\nTexto.\n"]) {
      const first = upsertSuiteBlock(source);
      const second = upsertSuiteBlock(first.text);
      expect(second.action).toBe("unchanged");
      expect(second.text).toBe(first.text);
    }
  });

  test("reemplaza un bloque desactualizado sin tocar lo de alrededor", () => {
    const stale = SPANISH.replace("## Reglas por defecto", `${SUITE_BLOCK_START}\n### Herramientas de la suite\n\nTexto viejo.\n${SUITE_BLOCK_END}\n\n## Reglas por defecto`);
    const { text, action } = upsertSuiteBlock(stale);
    expect(action).toBe("updated");
    expect(text).toBe(upsertSuiteBlock(SPANISH).text);
    expect(upsertSuiteBlock(text).action).toBe("unchanged");
  });

  test("el bloque de la versión anterior (sin modo ni etiquetas) se reconoce y se reemplaza por el nuevo", () => {
    const old = `${SUITE_BLOCK_START}\n### Herramientas de la suite\n\nEste proyecto usa [agent-context-suite](https://github.com/Gersom/agent-context-suite). No edites a mano \`handoff.md\`, \`backlog.md\` ni \`history.md\`: usa \`acsuite task\` (el detalle: \`acsuite task --help\`). Para verificar la documentación, \`acsuite check\`; para ver el tablero, \`acsuite board\`.\n${SUITE_BLOCK_END}`;
    const source = SPANISH.replace("## Reglas por defecto", `${old}\n\n## Reglas por defecto`);
    expect(hasSuiteBlock(source)).toBe(true);
    const { text, action } = upsertSuiteBlock(source);
    expect(action).toBe("updated");
    expect(text).toBe(source.replace(old, SUITE_BLOCK));
    expect(upsertSuiteBlock(text).action).toBe("unchanged");
  });

  test("reemplaza el bloque donde esté (también al final o antes de «Al cerrar»), sin moverlo", () => {
    for (const source of [
      SPANISH.replace("## Al cerrar", `${SUITE_BLOCK_START}\nviejo\n${SUITE_BLOCK_END}\n\n## Al cerrar`),
      `${SPANISH}\n${SUITE_BLOCK_START}\nviejo\n${SUITE_BLOCK_END}\n`,
    ]) {
      const { text, action } = upsertSuiteBlock(source);
      expect(action).toBe("updated");
      expect(text).toBe(source.replace(`${SUITE_BLOCK_START}\nviejo\n${SUITE_BLOCK_END}`, SUITE_BLOCK));
    }
  });

  test("un bloque en una posición cualquiera, ya al día, queda unchanged", () => {
    const text = SPANISH.replace("## Al cerrar", `${SUITE_BLOCK}\n\n## Al cerrar`);
    expect(upsertSuiteBlock(text)).toEqual({ text, action: "unchanged" });
  });

  test("un bloque desactualizado se reemplaza donde esté, sin `##` en el archivo", () => {
    const { text, action } = upsertSuiteBlock(`# R\n\n${SUITE_BLOCK_START}\nviejo\n${SUITE_BLOCK_END}\n\nfin\n`);
    expect(action).toBe("updated");
    expect(text).toBe(`# R\n\n${SUITE_BLOCK}\n\nfin\n`);
  });
});

describe("upsertSuiteBlock: errores (no escribe ni adivina)", () => {
  const fails = (text: string) => {
    try {
      upsertSuiteBlock(text);
    } catch (error) {
      expect(error).toBeInstanceOf(RulesBlockError);
      return (error as Error).message;
    }
    throw new Error("debía lanzar");
  };

  test("solo la marca de inicio", () => {
    expect(fails(`${SUITE_BLOCK_START}\n${SPANISH}`)).toContain("Falta la marca de cierre");
  });

  test("solo la marca de cierre", () => {
    expect(fails(`${SPANISH}${SUITE_BLOCK_END}\n`)).toContain("Falta la marca de inicio");
  });

  test("marcas invertidas", () => {
    expect(fails(`${SUITE_BLOCK_END}\n${SPANISH}${SUITE_BLOCK_START}\n`)).toContain("está antes que la de inicio");
  });

  test("marcas duplicadas", () => {
    const message = fails(`${SUITE_BLOCK}\n\n${SUITE_BLOCK}\n\n${SPANISH}`);
    expect(message).toContain("2 marca(s) de inicio y 2 de cierre");
  });
});

describe("upsertSuiteBlock: lo que está en bloques de código o comentarios no cuenta", () => {
  test("un `##` dentro de ``` se ignora: el bloque va antes del primer `##` real", () => {
    const text = "# R\n\n```md\n## Falso\n```\n\n## Real\nx\n";
    const { text: out } = upsertSuiteBlock(text);
    expect(out).toBe(`# R\n\n\`\`\`md\n## Falso\n\`\`\`\n\n${SUITE_BLOCK}\n\n## Real\nx\n`);
  });

  test("un `##` dentro de un comentario se ignora (en una o varias líneas)", () => {
    for (const comment of ["<!--\n## Falso\n-->", "<!-- ## Falso -->"]) {
      const { text } = upsertSuiteBlock(`# R\n\n${comment}\n\n## Real\nx\n`);
      expect(text).toBe(`# R\n\n${comment}\n\n${SUITE_BLOCK}\n\n## Real\nx\n`);
    }
  });

  test("si todos los `##` están en código o comentarios, el bloque va al final", () => {
    const code = "# R\n\n```md\n## Falso\n```\n";
    expect(upsertSuiteBlock(code).text).toBe(`${code}\n${SUITE_BLOCK}\n`);
    const comment = "# R\n\n<!--\n## Falso\n-->\n";
    expect(upsertSuiteBlock(comment).text).toBe(`${comment}\n${SUITE_BLOCK}\n`);
  });

  test("marcas dentro de un bloque de código no cuentan", () => {
    const fenced = `# R\n\n\`\`\`\n${SUITE_BLOCK}\n\`\`\`\n\n## Uno\nx\n`;
    expect(hasSuiteBlock(fenced)).toBe(false);
    expect(upsertSuiteBlock(fenced).action).toBe("inserted");
  });
});

describe("hasSuiteBlock", () => {
  test("detecta el bloque, también desactualizado", () => {
    expect(hasSuiteBlock(upsertSuiteBlock(SPANISH).text)).toBe(true);
    expect(hasSuiteBlock(`${SUITE_BLOCK_START}\nviejo\n${SUITE_BLOCK_END}\n`)).toBe(true);
  });

  test("sin marcas, con una sola o invertidas: no", () => {
    expect(hasSuiteBlock(SPANISH)).toBe(false);
    expect(hasSuiteBlock(`${SUITE_BLOCK_START}\nx\n`)).toBe(false);
    expect(hasSuiteBlock(`${SUITE_BLOCK_END}\nx\n${SUITE_BLOCK_START}\n`)).toBe(false);
    expect(hasSuiteBlock("")).toBe(false);
  });
});
