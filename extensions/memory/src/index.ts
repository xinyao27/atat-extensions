// memory — the entry point.
//
// One bundle carries the two worlds AtAt can start this extension in: a hook or action
// invocation, and a panel session. They share this file and nothing else — each hook call
// gets its own JavaScriptCore context, so there is no state here to share even if there were
// a reason to.
//
// `defineExtension` keeps hooks, actions and named views in the same versioned public
// contract. The panel's import routines ride along under `routines`, which the host ignores
// and the smoke harness calls by name: running a converter against a folder of fixtures is
// the only way to check it without the assistant it converts installed on the machine.

import { defineExtension } from "@atat/api";
import type { ExtensionAction, ExtensionHooks } from "@atat/api";
import { detectAssistants, forgetImported, importFromAssistant } from "./import/run.js";
import MemoryPanel from "./panel.js";
import { recall } from "./recall.js";
import { saveToMemory } from "./save.js";

const hooks: ExtensionHooks = {
  contextAssembled: recall,
};

const actions: Record<string, ExtensionAction> = {
  saveToMemory,
};

export default defineExtension({
  hooks,
  actions,
  views: { memory: MemoryPanel },
  routines: { detectAssistants, importFromAssistant, forgetImported },
});
