// Registro de checks: uno por familia, todos puros (`ctx => Finding[]`). Para agregar uno, créalo en
// su archivo y súmalo a `CHECKS`.

import type { Check, CheckContext, Finding } from "../types.ts";
import { checkAnchors } from "./anchors.ts";
import { checkDecisionsIndex } from "./decisions.ts";
import { checkFilesExist, checkOperatorsReadable, checkRootFiles } from "./files.ts";
import { checkGroups } from "./groups.ts";
import { checkCurrentPlanLines, checkCurrentTask } from "./handoff.ts";
import { checkHistoryEntries } from "./history.ts";
import { checkLegacyMarkers } from "./legacy-marker.ts";
import { checkPlaceholders } from "./placeholders.ts";
import { checkSuiteRules } from "./suite-rules.ts";
import { checkBlockTags, checkDuplicateNumbers, checkNextNumber, checkTaskFields, checkTaskHeadings } from "./tasks.ts";

export const CHECKS: Check[] = [
  checkFilesExist,
  checkOperatorsReadable,
  checkRootFiles,
  checkSuiteRules,
  checkLegacyMarkers,
  checkDecisionsIndex,
  checkAnchors,
  checkPlaceholders,
  checkNextNumber,
  checkDuplicateNumbers,
  checkTaskHeadings,
  checkTaskFields,
  checkBlockTags,
  checkGroups,
  checkCurrentTask,
  checkCurrentPlanLines,
  checkHistoryEntries,
];

/** Corre todos los checks sobre el contexto. El orden no importa: el reporte ordena. */
export function runChecks(ctx: CheckContext): Finding[] {
  return CHECKS.flatMap((check) => check(ctx));
}

export { checkRootFiles };
