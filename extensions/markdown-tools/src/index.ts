// markdown-tools — the entry point.
//
// Four actions that add Markdown structure and take it away again: a second click on the
// same button undoes the first, so a list or a quote is one button rather than two. Blank
// lines stay blank lines; a list marker lands after whatever indentation a line already has.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

const MARKER = /^(\s*)(?:[-*+] |\d+\. )/;
const NUMBERED = /^(\s*)\d+\. /;
const QUOTED = /^(\s*)> ?/;

function isItem(line: string): boolean {
  return line.trim().length > 0;
}

function stripMarker(line: string): string {
  return line.replace(MARKER, "$1");
}

function bulletList(text: string): string {
  const lines = linesOf(text);
  const items = lines.filter(isItem);
  if (items.length > 0 && items.every((line) => MARKER.test(line))) {
    return lines.map(stripMarker).join("\n");
  }
  return lines
    .map((line) => (isItem(line) ? stripMarker(line).replace(/^(\s*)/, "$1- ") : line))
    .join("\n");
}

function numberedList(text: string): string {
  const lines = linesOf(text);
  const items = lines.filter(isItem);
  if (items.length > 0 && items.every((line) => NUMBERED.test(line))) {
    return lines.map((line) => line.replace(NUMBERED, "$1")).join("\n");
  }
  let number = 0;
  return lines
    .map((line) => {
      if (!isItem(line)) return line;
      number += 1;
      return stripMarker(line).replace(/^(\s*)/, `$1${number}. `);
    })
    .join("\n");
}

function blockquote(text: string): string {
  const lines = linesOf(text);
  const items = lines.filter(isItem);
  if (items.length > 0 && items.every((line) => QUOTED.test(line))) {
    return lines.map((line) => line.replace(QUOTED, "$1")).join("\n");
  }
  return lines.map((line) => (isItem(line) ? "> " + line : ">")).join("\n");
}

/// Inline code for one line, a fenced block for several, and a second click takes either
/// apart. The fence is always longer than any run of backticks inside the text.
function code(text: string): string {
  const wrapped = text.match(/^(`+)([\s\S]*)\1$/);
  const wrapper = wrapped?.[1];
  const inner = wrapped?.[2];
  if (wrapper !== undefined && inner !== undefined && !inner.includes(wrapper)) {
    return inner.replace(/^\n/, "").replace(/\n$/, "");
  }
  const longest = (text.match(/`+/g) ?? []).reduce(
    (length, run) => Math.max(length, run.length),
    0
  );
  const ticks = "`".repeat(longest + 1);
  if (!text.includes("\n")) return ticks + text + ticks;
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

const bulletListAction: ExtensionAction = async (input) => bulletList(input.text ?? "");
const numberedListAction: ExtensionAction = async (input) => numberedList(input.text ?? "");
const codeAction: ExtensionAction = async (input) => code(input.text ?? "");
const blockquoteAction: ExtensionAction = async (input) => blockquote(input.text ?? "");

export default defineExtension({
  actions: {
    bulletList: bulletListAction,
    numberedList: numberedListAction,
    code: codeAction,
    blockquote: blockquoteAction,
  },
});
