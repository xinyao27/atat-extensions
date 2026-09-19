// text-case — the entry point.
//
// Four actions over the same rules, English only. A word that already carries a capital of
// its own — iPhone, McDonald’s — is a name, and a name is not the action’s to respell.

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
  const pieces = text.split(/(\s+)/);
  const wordIndexes = pieces
    .map((piece, index) => (piece.trim().length > 0 ? index : -1))
    .filter((index) => index >= 0);
  const first = wordIndexes[0];
  const last = wordIndexes[wordIndexes.length - 1];
  return pieces
    .map((piece, index) => {
      if (piece.trim().length === 0) return piece;
      if (/[A-Z]/.test(piece.slice(1))) return piece;
      const lowered = piece.toLowerCase();
      const bare = lowered.replace(/[^a-z']/g, "");
      if (index !== first && index !== last && SMALL_WORDS.has(bare)) return lowered;
      return lowered.replace(/[a-z]/, (letter) => letter.toUpperCase());
    })
    .join("");
}

/** Everything lowercase, then the first letter of every sentence put back up. */
function sentenceCase(text: string): string {
  return text
    .toLowerCase()
    .replace(
      /(^\s*|[.!?]\s+)([^a-z]*)([a-z])/g,
      (_, lead: string, between: string, letter: string) =>
        lead + between + letter.toUpperCase()
    );
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
