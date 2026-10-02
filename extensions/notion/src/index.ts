import { defineExtension } from "@atat/api";
import type { ExtensionAction, ExtensionHooks } from "@atat/api";

/** One member per hook declared in extension.json. */
const hooks: ExtensionHooks = {};

/** One member per action declared in extension.json that is not a URL template. */
const actions: Record<string, ExtensionAction> = {};

export default defineExtension({ hooks, actions });
