// qmd-memory — the entry point.
//
// One bundle carries all three worlds AtAt can start this plugin in: a hook invocation, an
// action, and a panel session. They share this file and nothing else — each hook call gets its
// own JavaScriptCore context, so there is no state here to share even if there were a reason to.
//
// `exports.hooks`, `exports.actions` and `exports.panel` are the three names the host looks up.
// The panel is exported under its own name rather than as a default so that one bundle can
// carry a panel and hooks at once without the two resolutions competing.

import type { PluginAction, PluginHooks } from "@atat/plugin-types";
import MemoryPanel from "./panel.js";
import { recall } from "./recall.js";
import { record } from "./record.js";
import { saveToMemory } from "./save.js";

export const hooks: PluginHooks = {
  contextAssembled: recall,
  response: record,
};

export const actions: Record<string, PluginAction> = {
  saveToMemory,
};

export const panel = MemoryPanel;
