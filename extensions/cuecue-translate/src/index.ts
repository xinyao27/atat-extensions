import { defineExtension } from "@atat/api";
import type { ActionInput, ExtensionAction, ExtensionHooks, HostContext } from "@atat/api";
import { TRANSLATE_SCRIPT } from "./cuecue";
import { strings } from "./text";

/** One member per hook declared in extension.json. */
const hooks: ExtensionHooks = {};

/** One member per action declared in extension.json that is not a URL template. */
const actions: Record<string, ExtensionAction> = {
  /** The selected text — or the text read out of a screenshot — is translated by CueCue,
   *  and `after: "show"` puts the answer on AtAt's result card, where it can be copied or
   *  written back over the selection. */
  translate: async (input: ActionInput, ctx: HostContext) => {
    const text = await readText(input, ctx);
    if (text.length === 0) {
      // Nothing to hand over: an empty selection, or a screenshot with no words in it.
      ctx.notify(strings(ctx.locale).empty);
      return;
    }

    // CueCue missing, or the translation failing, both land here. Name what the user can
    // do rather than relaying an Apple Event error number.
    let translated = "";
    try {
      translated = (await ctx.runAppleScript(TRANSLATE_SCRIPT, text))?.trim() ?? "";
    } catch {
      translated = "";
    }
    if (!translated) {
      ctx.notify(strings(ctx.locale).failed);
      return;
    }
    return translated;
  },
};

/** What to translate: the text the surface already holds — a selection, or a capture's own
 *  text — or, for a screenshot, what its pixels say. The selection bar and the quick-access
 *  card hand over different things, and this is the one place that difference is resolved,
 *  so the handoff itself never has to care which surface it came from. */
async function readText(input: ActionInput, ctx: HostContext): Promise<string> {
  const text = (input.text ?? "").trim();
  if (text.length > 0) return text;

  const path = input.filePaths?.[0];
  if (!path) return "";

  try {
    return (await ctx.ocr(path)).trim();
  } catch {
    // A screenshot with no words in it, or one the host would not read, is not an error
    // worth a toast: there is simply nothing to translate.
    return "";
  }
}

export default defineExtension({ hooks, actions });
