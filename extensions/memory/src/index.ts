// memory — the entry point.
//
// One bundle carries all three worlds AtAt can start this extension in: a hook invocation, an
// action, and a panel session. They share this file and nothing else — each hook call gets its
// own JavaScriptCore context, so there is no state here to share even if there were a reason to.
//
// `defineExtension` keeps hooks, actions and named views in the same versioned public contract.

import { defineExtension } from "@atat/api";
import type { ExtensionAction, ExtensionHooks } from "@atat/api";
import MemoryPanel from "./panel.js";
import { recall } from "./recall.js";
import { record } from "./record.js";
import { saveToMemory } from "./save.js";

const hooks: ExtensionHooks = {
  contextAssembled: recall,
  response: record,
};

const actions: Record<string, ExtensionAction> = {
  saveToMemory,
};

export default defineExtension({
  hooks,
  actions,
  views: { memory: MemoryPanel },
});
