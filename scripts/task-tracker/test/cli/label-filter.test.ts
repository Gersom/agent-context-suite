import { describe, expect, test } from "bun:test";
import { createLabelFilter } from "../../src/cli/label-filter.ts";

describe("createLabelFilter", () => {
  test("empieza en «todas» y sin etiquetas", () => {
    const filter = createLabelFilter();
    expect(filter.active).toBeNull();
    expect(filter.available).toEqual([]);
  });

  test("sin etiquetas en el proyecto, la tecla no hace nada", () => {
    const filter = createLabelFilter();
    filter.sync([]);
    expect(filter.cycle()).toBe(false);
    expect(filter.active).toBeNull();
  });

  test("con etiquetas recorre todas → cada una → todas, y vuelve a empezar", () => {
    const filter = createLabelFilter();
    filter.sync(["empresa1", "trabajo"]);
    const seen: Array<string | null> = [];
    for (let i = 0; i < 4; i++) {
      expect(filter.cycle()).toBe(true);
      seen.push(filter.active);
    }
    expect(seen).toEqual(["empresa1", "trabajo", null, "empresa1"]);
  });

  test("con una sola etiqueta alterna entre ella y «todas»", () => {
    const filter = createLabelFilter();
    filter.sync(["unica"]);
    filter.cycle();
    expect(filter.active).toBe("unica");
    filter.cycle();
    expect(filter.active).toBeNull();
  });

  test("al redibujar, si la etiqueta filtrada ya no existe vuelve a «todas»; si sigue, se mantiene", () => {
    const filter = createLabelFilter();
    filter.sync(["empresa1", "trabajo"]);
    filter.cycle();
    filter.cycle();
    expect(filter.active).toBe("trabajo");
    filter.sync(["empresa1", "trabajo", "zeta"]);
    expect(filter.active).toBe("trabajo");
    filter.sync(["empresa1", "zeta"]);
    expect(filter.active).toBeNull();
    expect(filter.available).toEqual(["empresa1", "zeta"]);
  });

  test("si la etiqueta cambia de mayúsculas se conserva con su forma nueva", () => {
    const filter = createLabelFilter();
    filter.sync(["empresa1"]);
    filter.cycle();
    filter.sync(["Empresa1"]);
    expect(filter.active).toBe("Empresa1");
  });

  test("reset (cambio de proyecto): vuelve a «todas» y olvida las etiquetas", () => {
    const filter = createLabelFilter();
    filter.sync(["empresa1"]);
    filter.cycle();
    filter.reset();
    expect(filter.active).toBeNull();
    expect(filter.available).toEqual([]);
    expect(filter.cycle()).toBe(false);
  });
});
