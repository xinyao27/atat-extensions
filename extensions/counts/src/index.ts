// counts — the entry point.
//
// One action that answers with numbers, shown in the Orb's preview: words, characters,
// lines. Each Han character, kana or Hangul syllable counts as a word, and a run of
// other letters and digits counts once. Visible characters follow grapheme boundaries.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

/// Han (including supplementary planes), kana, and Hangul syllables count individually.
/// Combining marks and Hangul jamo stay attached to the word they form.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\uAC00-\uD7A3]/gu;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’][\p{L}\p{N}\p{M}]+)*/gu;

/** The app's language, not the text's: Chinese for any `zh*` locale, English otherwise. */
function isChinese(locale: string): boolean {
  return String(locale ?? "").toLowerCase().startsWith("zh");
}

/** 1234 → 1,234. Both languages read the same grouping. */
function grouped(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function countWords(text: string): number {
  const cjkWords = text.match(CJK)?.length ?? 0;
  const otherWords = text.replace(CJK, " ").match(WORD)?.length ?? 0;
  return cjkWords + otherWords;
}

function summarise(text: string, locale: string): string {
  const normalised = text.replace(/\r\n?/g, "\n");
  const words = countWords(normalised);
  // Visible characters, not UTF-16 units or separate combining marks/emoji joiners.
  const characters = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(normalised)].length;
  const lines = normalised.length === 0 ? 0 : normalised.split("\n").length;
  if (isChinese(locale)) {
    return [
      `${grouped(words)} 个词`,
      `${grouped(characters)} 个字符`,
      `${grouped(lines)} 行`,
    ].join("\n");
  }
  return [
    `${grouped(words)} ${words === 1 ? "word" : "words"}`,
    `${grouped(characters)} ${characters === 1 ? "character" : "characters"}`,
    `${grouped(lines)} ${lines === 1 ? "line" : "lines"}`,
  ].join("\n");
}

const count: ExtensionAction = async (input, ctx) =>
  summarise(input.text ?? "", ctx.locale);

export default defineExtension({ actions: { count } });
