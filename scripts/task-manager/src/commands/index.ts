// Registro de comandos. Para agregar uno: crear su módulo en esta carpeta (exporta un `Command`,
// ver `../cli/types.ts`) e importarlo y sumarlo a la lista. El despachador y el resto del núcleo no
// se tocan.

import type { Command } from "../cli/types.ts";
import { add } from "./add.ts";
import { anchors } from "./anchors.ts";
import { block } from "./block.ts";
import { close } from "./close.ts";
import { edit } from "./edit.ts";
import { groupAdd } from "./group-add.ts";
import { groupCreate } from "./group-create.ts";
import { groupDissolve } from "./group-dissolve.ts";
import { groupEdit } from "./group-edit.ts";
import { groupEject } from "./group-eject.ts";
import { list } from "./list.ts";
import { mode } from "./mode.ts";
import { next } from "./next.ts";
import { pause } from "./pause.ts";
import { plan } from "./plan.ts";
import { resume } from "./resume.ts";
import { show } from "./show.ts";
import { start } from "./start.ts";
import { status } from "./status.ts";
import { step } from "./step.ts";
import { unblock } from "./unblock.ts";
import { whoami } from "./whoami.ts";

export const COMMANDS: Command[] = [whoami, anchors, status, next, show, list, add, start, step, plan, mode, pause, resume, block, unblock, close, edit, groupCreate, groupEject, groupAdd, groupEdit, groupDissolve];
