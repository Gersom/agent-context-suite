import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { VERSION_MARKER_RE } from "../_shared/markers.ts";
import { hasSkill, readSkill, SKILL_DIR } from "./skill-dir.ts";

// La versión de la skill vive en cuatro sitios que deben coincidir: .claude-plugin/plugin.json,
// la línea «Versión de esta skill» de SKILL.md y el marcador de template/agents/rules.md y de template/office/rules.md.

const SEMVER = /^\d+\.\d+\.\d+$/;

type Version = [number, number, number];

const parse = (version: string): Version => version.split(".").map(Number) as Version;

/** Compara por componentes numéricos: negativo si a < b, 0 si son iguales, positivo si a > b. */
function compare(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

const pluginVersion = (): string => (JSON.parse(readSkill(".claude-plugin/plugin.json")) as { version: string }).version;

/** Tags `vX.Y.Z` del repo de la skill; `null` si no es un repo git o el comando falla. */
function skillTags(): string[] | null {
  const result = spawnSync("git", ["-C", SKILL_DIR, "tag"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
}

describe.skipIf(!hasSkill)("versión de la skill: coherencia entre plugin.json, SKILL.md y la plantilla", () => {
  test("plugin.json declara una versión semver X.Y.Z", () => {
    expect(pluginVersion()).toMatch(SEMVER);
  });

  test("SKILL.md declara la misma versión que plugin.json", () => {
    const match = readSkill("SKILL.md").match(/Versión de esta skill: \*\*(\d+\.\d+\.\d+)\*\*/);
    expect(match, "SKILL.md no tiene la línea «Versión de esta skill: **X.Y.Z**»").not.toBeNull();
    expect(match?.[1]).toBe(pluginVersion());
  });

  test("el marcador de la línea 1 de template/agents/rules.md declara la misma versión", () => {
    const first = readSkill("template/agents/rules.md").split("\n")[0];
    const match = first.match(VERSION_MARKER_RE);
    expect(match, "template/agents/rules.md no lleva el marcador de versión en la línea 1").not.toBeNull();
    expect(match?.[1]).toBe(pluginVersion());
  });

  test("el marcador de la línea 1 de template/office/rules.md declara la misma versión", () => {
    const first = readSkill("template/office/rules.md").split("\n")[0];
    const match = first.match(VERSION_MARKER_RE);
    expect(match, "template/office/rules.md no lleva el marcador de versión en la línea 1").not.toBeNull();
    expect(match?.[1]).toBe(pluginVersion());
  });

  test("ningún tag vX.Y.Z de la skill es mayor que la versión de plugin.json", () => {
    const tags = skillTags();
    if (tags === null) return; // no es un repo git (o git no está): no hay tags que comparar
    const version = pluginVersion();
    // El tag de la versión actual puede no existir todavía (se crea al publicar).
    const ahead = tags.filter((tag) => compare(tag.slice(1), version) > 0);
    expect(ahead, `Hay tags más nuevos que la versión ${version} de plugin.json: ${ahead.join(", ")}`).toEqual([]);
  });

  test("el README no fija un ejemplo @vX.Y.Z mayor que la versión de plugin.json", () => {
    const version = pluginVersion();
    const examples = [...readSkill("README.md").matchAll(/@v(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    const ahead = examples.filter((example) => compare(example, version) > 0);
    expect(ahead, `El README fija @v${ahead.join(", @v")}, mayor que ${version}`).toEqual([]);
  });
});
