// lines — the entry point.
//
// Three actions over one reading of the selection: its lines. CRLF and lone CR are
// normalised first, because text pasted out of a PDF or a Windows app is not something the
// user should have to fix before sorting it.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** Code-unit order, not the Mac's locale: one list sorts the same way on every machine. */
function compared(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Case-insensitive, with the original spelling breaking ties so two spellings hold still. */
function sortLines(text: string): string {
  return linesOf(text)
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const folded = compared(a.line.toLowerCase(), b.line.toLowerCase());
      if (folded !== 0) return folded;
      const exact = compared(a.line, b.line);
      return exact !== 0 ? exact : a.index - b.index;
    })
    .map((entry) => entry.line)
    .join("\n");
}

function reverseLines(text: string): string {
  return linesOf(text).reverse().join("\n");
}

/** One paragraph: each line trimmed, blank lines gone, single spaces between what is left. */
function joinLines(text: string): string {
  return linesOf(text)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
}

const sortLinesAction: ExtensionAction = async (input) => sortLines(input.text ?? "");
const reverseLinesAction: ExtensionAction = async (input) => reverseLines(input.text ?? "");
const joinLinesAction: ExtensionAction = async (input) => joinLines(input.text ?? "");

export default defineExtension({
  actions: {
    sortLines: sortLinesAction,
    reverseLines: reverseLinesAction,
    joinLines: joinLinesAction,
  },
});
