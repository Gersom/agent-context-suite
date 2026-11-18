# History

Historial de tareas resueltas — hechas o descartadas: el "qué pasó y por qué". A diferencia de [`./handoff.md`](./handoff.md), **se acumula**: cada tarea resuelta agrega una entrada, sin sobrescribir las anteriores. La cola de pendientes vive en [`./backlog.md`](./backlog.md).

- **Entradas nuevas van arriba** (la más reciente primero). Cada una marca su tipo: ✅ **Hecha** o ❌ **Descartada** (el motivo del descarte queda para que no se vuelva a proponer sin verlo).
- **Formato:** `## <fecha> — ✅|❌ [Tarea N —] <título>` (el segmento `Tarea N —` solo si la tarea tenía número en `backlog.md`; ese número viaja con ella y no se reasigna; las entradas sin número no se numeran retroactivamente). Debajo, 3 a 5 líneas: qué se hizo y **por qué** (el motivo, no la descripción técnica), una línea de cómo y los commits que lo contienen, sin el recorrido de cambios ni decisiones (ese vive en el handoff). Si la tarea tenía `Etiquetas`, la entrada las conserva en una línea `- **Etiquetas:** …` antes del resumen.
- **Qué no va:** lo que ya dice el código, el diff o el commit, ni lo que explica otro archivo (`decisions/`, `architecture.md`): linkearlo.
- **Cómo leerlo:** no hace falta leerlo entero. Para una tarea puntual, buscar su entrada por número o título; para el contexto reciente, las primeras entradas.

---

<!-- Si la skill se agrega de forma retroactiva a un proyecto existente (Ronda 2 de questions-flow.md), esta primera carga se reconstruye con los hitos de `git log` (no un volcado literal), todos como ✅ Hecha. -->

## [Placeholder fecha] — ✅ [Placeholder título]

- [Placeholder]
