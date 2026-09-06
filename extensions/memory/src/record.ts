// `response` — the trajectory.
//
// One markdown file per interaction, in `trajectory/` inside the granted folder. This is the
// half of the extension that depends on nothing: it keeps writing whether or not anything is
// searching, so recall that starts working next month finds a month of history already there.
//
// The consent is the switch. `recordsInteractions` is on by default and is the one thing in
// this extension's settings that answers a question a user actually has — “I don't want to be
// recorded” — so it is checked before anything is read, let alone written.

import type { ContextItemSnapshot, HostContext, ResponseInput } from "@atat/api";
import { readConfiguration, trajectoryDirectory } from "./library.js";
import { buildNote, encodeText, joinPath, stamp, token, truncate } from "./notes.js";

const MAXIMUM_PROMPT_CHARACTERS = 4000;
const MAXIMUM_RESPONSE_CHARACTERS = 8000;
const MAXIMUM_ITEMS = 20;
const MAXIMUM_ITEM_EXCERPT = 200;

export async function record(input: ResponseInput, ctx: HostContext): Promise<void> {
  const configuration = readConfiguration(ctx.options);
  if (!configuration.recordsInteractions) return;
  if (configuration.memoryDirectory.length === 0) {
    ctx.log("recording skipped: no memory folder granted");
    return;
  }

  const prompt = String(input.prompt ?? "").trim();
  const responseText = String(input.responseText ?? "").trim();
  if (prompt.length === 0 && responseText.length === 0) return;

  const at = stamp();
  const title = headline(prompt, responseText);
  const note = buildNote(
    {
      date: at.iso,
      interactionSource: String(input.interactionSource ?? "").length > 0
        ? input.interactionSource
        : "unknown",
      title,
    },
    body(prompt, responseText, input.items ?? [])
  );
  // `files.write` creates the directories along the way, so `trajectory/` comes into being on
  // the first recorded interaction and nothing has to prepare it.
  const path = joinPath(trajectoryDirectory(configuration), at.compact + "-" + token() + ".md");

  try {
    await ctx.files.write(path, { base64: encodeText(note) });
    ctx.log("recorded one interaction");
  } catch (error) {
    // Fire and forget by contract: the response has already been shown, and a failed note is
    // not something to interrupt the user about.
    ctx.log("recording failed: " + messageOf(error));
  }
}

function headline(prompt: string, responseText: string): string {
  const source = prompt.length > 0 ? prompt : responseText;
  for (const line of source.split(/\r?\n/)) {
    const text = line.trim();
    if (text.length > 0) return truncate(text, 100);
  }
  return "AtAt interaction";
}

function body(prompt: string, responseText: string, items: ContextItemSnapshot[]): string {
  const parts: string[] = ["# " + headline(prompt, responseText)];

  if (prompt.length > 0) {
    parts.push("## Request", truncate(prompt, MAXIMUM_PROMPT_CHARACTERS));
  }
  if (responseText.length > 0) {
    parts.push("## Response", truncate(responseText, MAXIMUM_RESPONSE_CHARACTERS));
  }

  const context = contextLines(items);
  if (context.length > 0) {
    parts.push("## Context", context.join("\n"));
  }
  return parts.join("\n\n");
}

/**
 * The context as a summary, not as a copy.
 *
 * A pill's whole text can be a screenshot's worth of recognised writing, and a trajectory note
 * is a record of what happened rather than a second copy of everything attached to it. Paths
 * are recorded as names for the same reason a log records metadata: the file may well be gone
 * by the time anyone reads this.
 */
function contextLines(items: ContextItemSnapshot[]): string[] {
  const lines: string[] = [];
  for (const item of items.slice(0, MAXIMUM_ITEMS)) {
    const label = item.label && item.label.length > 0 ? item.label : item.source;
    const detail = item.text
      ? summarize(item.text)
      : (item.filePaths ?? []).map(fileName).join(", ");
    lines.push("- **" + label + "** — " + (detail.length > 0 ? detail : item.source));
  }
  if (items.length > MAXIMUM_ITEMS) {
    lines.push("- _(" + String(items.length - MAXIMUM_ITEMS) + " more attachments)_");
  }
  return lines;
}

function summarize(text: string): string {
  return truncate(text.replace(/\s+/g, " ").trim(), MAXIMUM_ITEM_EXCERPT);
}

function fileName(path: string): string {
  const parts = String(path ?? "").split("/");
  return parts[parts.length - 1] ?? "";
}

function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
