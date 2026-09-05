import { definePlugin } from "@atat/api";
import type { PluginAction } from "@atat/api";

// The same script a user could paste into Text Selection → Add action → AppleScript: one
// `atatSelection(selectedText)` handler, which the host calls with the selected text. Bob shows
// the translation itself, so the action has nothing to hand back and returns nothing.
const SCRIPT = `on atatSelection(selectedText)
    tell application id "com.hezongyidev.Bob"
        launch
        translate selectedText
    end tell
end atatSelection`;

const translateWithBob: PluginAction = async (input, ctx) => {
  const text = input.text ?? "";
  if (text.trim().length === 0) return;
  await ctx.runAppleScript(SCRIPT, text);
};

export default definePlugin({ actions: { translateWithBob } });
