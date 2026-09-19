// slugify — the entry point.
//
// One action: lowercase, strip accents, and keep only what a URL can carry. When nothing
// survives — Chinese text, an emoji, a line of punctuation — the user gets a short message
// instead of an empty line, because the filter in the manifest cannot catch every case.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

const NOTICES = {
  en: "There’s nothing to make a slug from.",
  zh: "这段话里没有能做成链接名的内容。",
};

/** The app's language, not the text's: Chinese for any `zh*` locale, English otherwise. */
function notice(locale: string): string {
  return String(locale ?? "").toLowerCase().startsWith("zh") ? NOTICES.zh : NOTICES.en;
}

/** “Über Café!” — accents fold to their letters, everything else becomes a dash. */
function toSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const slugify: ExtensionAction = async (input, ctx) => {
  const slug = toSlug(input.text ?? "");
  if (slug.length === 0) {
    ctx.notify(notice(ctx.locale));
    return;
  }
  return slug;
};

export default defineExtension({ actions: { slugify } });
