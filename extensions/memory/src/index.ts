// memory — the entry point.
//
// One bundle carries all three worlds AtAt can start this plugin in: a hook invocation, an
// action, and a panel session. They share this file and nothing else — each hook call gets its
// own JavaScriptCore context, so there is no state here to share even if there were a reason to.
//
// `definePlugin` keeps hooks, actions and named views in the same versioned public contract.

import { definePlugin } from "@atat/api";
import type { PluginAction, PluginHooks } from "@atat/api";
import MemoryPanel from "./panel.js";
import { recall } from "./recall.js";
import { record } from "./record.js";
import { saveToMemory } from "./save.js";

const hooks: PluginHooks = {
  contextAssembled: recall,
  response: record,
};

const actions: Record<string, PluginAction> = {
  saveToMemory,
};

export default definePlugin({
  hooks,
  actions,
  views: { memory: MemoryPanel },
});
