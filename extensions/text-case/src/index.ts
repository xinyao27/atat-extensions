// text-case — the entry point.
//
// Four actions over the same English casing rules. Uppercase and lowercase transform the
// entire selection; title and sentence case preserve deliberate capitals inside names.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

/// Words a title leaves lowercase unless they open or close it.
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "en", "for", "if", "in",
  "nor", "of", "on", "or", "per", "the", "to", "v", "via", "vs", "with",
]);

function upperCase(text: string): string {
  return text.toUpperCase();
}

function lowerCase(text: string): string {
  return text.toLowerCase();
}

/** The first letter of each word, small words left alone unless they open or close it. */
function titleCase(text: string): string {
  const words = [...text.matchAll(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g)];
  const first = words[0]?.index;
  const last = words[words.length - 1]?.index;
  return text.replace(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g, (word, index: number) => {
    if (/[a-z][A-Z]/.test(word)) return word;
    const lowered = word.toLowerCase();
    if (index !== first && index !== last && SMALL_WORDS.has(lowered)) return lowered;
    return lowered.replace(/^[a-z]/, (letter) => letter.toUpperCase());
  });
}

/** Lowercase ordinary words, keeping embedded capitals in names and sentence starts. */
function sentenceCase(text: string): string {
  let startsSentence = true;
  return text.replace(/[A-Za-z]+(?:[’'-][A-Za-z]+)*|[.!?][”"'’)]*|[^A-Za-z.!?]+/g, (piece) => {
    if (/^[.!?]/.test(piece)) {
      startsSentence = true;
      return piece;
    }
    if (!/^[A-Za-z]/.test(piece)) return piece;
    const isName = /[a-z][A-Z]/.test(piece);
    const word = isName ? piece : piece.toLowerCase();
    if (!startsSentence) return word;
    startsSentence = false;
    return isName ? word : word.replace(/^[a-z]/, (letter) => letter.toUpperCase());
  });
}

const uppercase: ExtensionAction = async (input) => upperCase(input.text ?? "");
const lowercase: ExtensionAction = async (input) => lowerCase(input.text ?? "");
const titleCaseAction: ExtensionAction = async (input) => titleCase(input.text ?? "");
const sentenceCaseAction: ExtensionAction = async (input) => sentenceCase(input.text ?? "");

export default defineExtension({
  actions: {
    uppercase,
    lowercase,
    titleCase: titleCaseAction,
    sentenceCase: sentenceCaseAction,
  },
});
