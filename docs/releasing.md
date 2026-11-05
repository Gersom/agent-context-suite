# Versionado y releases

Cómo se versionan la suite y la skill. Se lee al publicar una versión; la decisión de fondo está en [`agents/rules.md`](./agents/rules.md) («Decisión no negociable»).

Versionado SemVer, con tags de git `vX.Y.Z` y releases manuales en GitHub, no por CI (los releases son poco frecuentes y son repos de documentación y herramientas chicas). Cada repo se versiona por separado:

- **La suite:** `package.json` (`version`) + tags en este repo. Versiona los scripts y la documentación de la suite. Las versiones y tags `v1.x` que ya existen son anteriores a la separación y cubren también la skill, que entonces vivía acá.
- **Tags (desde la `v1.8.1`):** cada vez que cambia la versión (`1.9.0` → `1.9.1`) se crea un tag **anotado** `vX.Y.Z` (`git tag -a vX.Y.Z -m "…"`) en el commit que la sube, y se sube junto con el push de ese commit usando `git push --follow-tags` (no `--tags`, que subiría también tags locales de prueba; `--follow-tags` ignora los tags ligeros, por eso son anotados). Un tag local sin subir no cuenta. Aplica a la suite y a la skill, cada una en su repo.
- **Changelog de la suite:** cada versión minor o major agrega su sección en [`CHANGELOG.md`](../CHANGELOG.md) (qué trae y qué hacer para pasar de la versión anterior); la de la skill vive en `docs/changelog/` de su repo.
- **La skill:** su propia versión y sus propios tags, en el repo [Gersom/agent-context-skill](https://github.com/Gersom/agent-context-skill); no se versiona desde la suite. La versión vive en `.claude-plugin/plugin.json`, en `SKILL.md` y en el marcador de la plantilla `template/agents/rules.md`; `scripts/skill-checks/version.test.ts` verifica que coincidan. Bump:
  - **patch** — fixes/ajustes de redacción en plantillas existentes.
  - **minor** — contenido nuevo que no rompe nada (nueva plantilla, nueva rama del árbol de preguntas).
  - **major** — cambios que rompen algo que un repo destino ya pudiera usar (mover/renombrar archivos de `template/` referenciados desde `questions-flow.md`, cambiar la estructura generada en `docs/agents`/`docs/project`).
