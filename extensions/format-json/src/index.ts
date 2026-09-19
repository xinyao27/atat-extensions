// format-json — the entry point.
//
// One action: the selection is parsed and printed again with two-space indentation. Parsing
// is the whole check — a selection the filter let through but JSON.parse still refuses gets
// a toast rather than a wrong answer, and key order is preserved because JSON.parse keeps it.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

const NOTICES = {
  en: "That isn’t valid JSON.",
  zh: "这段文字不是有效的 JSON。",
};

/** The app's language, not the text's: Chinese for any `zh*` locale, English otherwise. */
function notice(locale: string): string {
  return String(locale ?? "").toLowerCase().startsWith("zh") ? NOTICES.zh : NOTICES.en;
}

const formatJson: ExtensionAction = async (input, ctx) => {
  const text = input.text ?? "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    ctx.notify(notice(ctx.locale));
    return;
  }
};

export default defineExtension({ actions: { formatJson } });
