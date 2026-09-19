// counts — the entry point.
//
// One action that answers with numbers, shown in the Orb's preview: words, characters,
// lines. Each CJK character counts as a word of its own — the way editors that serve both
// Chinese and English count them — and every other run of letters and digits counts once.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

/// Hiragana, katakana, CJK ideographs (all planes) and hangul: one word apiece.
const CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/g;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;

/** The app's language, not the text's: Chinese for any `zh*` locale, English otherwise. */
function isChinese(locale: string): boolean {
  return String(locale ?? "").toLowerCase().startsWith("zh");
}

/** 1234 → 1,234. Both languages read the same grouping. */
function grouped(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function countWords(text: string): number {
  const characters = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, " ").match(WORD)?.length ?? 0;
  return characters + words;
}

function summarise(text: string, locale: string): string {
  const normalised = text.replace(/\r\n?/g, "\n");
  const words = countWords(normalised);
  const characters = [...normalised].length;
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
