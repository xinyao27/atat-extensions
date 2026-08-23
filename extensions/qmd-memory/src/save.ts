// “Save to memory” — the action, on all three surfaces.
//
// One declaration, three places: selected text, a clipboard entry, a capture. That is the
// dividend of AtAt converging its three capture surfaces on one representation — this is not a
// selection plugin and a clipboard plugin and a screenshot plugin, it is a plugin that handles
// text and files.
//
// What it writes is the same shape a phone Shortcut writes into `inbox/`: one markdown file
// with front matter, and for a capture a copy of the image in `assets/` beside it, with
// recognised text in the note so the picture is searchable by what it says.

import type { ActionInput, HostContext } from "@atat/plugin-types";
import {
  ASSETS_DIRECTORY,
  assetsDirectory,
  inboxDirectory,
  readConfiguration,
  type Configuration,
} from "./library.js";
import {
  basename,
  buildNote,
  encodeText,
  extensionOf,
  isImagePath,
  joinPath,
  stamp,
  token,
  truncate,
} from "./notes.js";

/** A click saves what the user pointed at, not a folder's worth of attachments. */
const MAXIMUM_FILES = 4;
const MAXIMUM_TEXT_CHARACTERS = 20000;

export async function saveToMemory(input: ActionInput, ctx: HostContext): Promise<void> {
  const configuration = readConfiguration(ctx.options);
  if (configuration.memoryDirectory.length === 0) {
    ctx.notify("Choose a memory folder for qmd-memory in Settings → Plugins first.");
    return;
  }

  const files = (input.filePaths ?? []).filter((path) => typeof path === "string" && path.length > 0);
  const text = String(input.text ?? "").trim();

  try {
    if (files.length > 0) {
      const saved = await saveFiles(files.slice(0, MAXIMUM_FILES), input, configuration, ctx);
      ctx.notify(
        saved === 1 ? "Saved to memory." : "Saved " + String(saved) + " files to memory."
      );
      return;
    }
    if (text.length > 0) {
      const name = await saveText(text, input, configuration, ctx);
      ctx.notify("Saved to memory · " + name);
      return;
    }
    ctx.notify("Nothing to save.");
  } catch (error) {
    ctx.notify("Could not save to memory: " + messageOf(error));
  }
}

async function saveText(
  text: string,
  input: ActionInput,
  configuration: Configuration,
  ctx: HostContext
): Promise<string> {
  const at = stamp();
  const name = at.compact + "-" + token() + ".md";
  const note = buildNote(
    {
      date: at.iso,
      source: "atat",
      sourceBundleID: input.sourceBundleID ?? undefined,
      surface: input.surface,
      title: headline(text),
    },
    truncate(text, MAXIMUM_TEXT_CHARACTERS)
  );
  await ctx.files.write(joinPath(inboxDirectory(configuration), name), {
    base64: encodeText(note),
  });
  return name;
}

/**
 * Copies each file into `assets/` and writes a note beside it.
 *
 * The copy is what makes a saved capture outlive the capture: the path the action was handed
 * points into AtAt's own temporary storage, and a memory that referenced it would be a broken
 * link within the hour. `files.read` on that path is allowed because the host handed it to this
 * call, and `files.write` into `assets/` because the user granted the folder — two different
 * permissions, which is why the copy has to go through both.
 */
async function saveFiles(
  paths: string[],
  input: ActionInput,
  configuration: Configuration,
  ctx: HostContext
): Promise<number> {
  const assets = assetsDirectory(configuration);
  const inbox = inboxDirectory(configuration);
  let saved = 0;

  for (const path of paths) {
    const at = stamp();
    const stem = at.compact + "-" + token();
    const extension = extensionOf(path);
    const assetName = stem + (extension.length > 0 ? "." + extension : "");

    const data = await ctx.files.read(path);
    await ctx.files.write(joinPath(assets, assetName), { base64: data.base64 });

    const recognized = isImagePath(path) ? await recognize(path, ctx) : "";
    const body: string[] = [
      "# " + basename(path),
      "",
      "![" + basename(path) + "](../" + ASSETS_DIRECTORY + "/" + assetName + ")",
    ];
    if (recognized.length > 0) {
      body.push("", "## Recognized text", "", recognized);
    }
    const note = buildNote(
      {
        date: at.iso,
        source: "atat",
        sourceBundleID: input.sourceBundleID ?? undefined,
        surface: input.surface,
        asset: ASSETS_DIRECTORY + "/" + assetName,
        title: recognized.length > 0 ? headline(recognized) : basename(path),
      },
      body.join("\n")
    );
    await ctx.files.write(joinPath(inbox, stem + ".md"), { base64: encodeText(note) });
    saved += 1;
  }
  return saved;
}

/** Recognition is a bonus, not a requirement: a capture with no text in it still saves. */
async function recognize(path: string, ctx: HostContext): Promise<string> {
  try {
    return truncate(String((await ctx.ocr(path)) ?? "").trim(), MAXIMUM_TEXT_CHARACTERS);
  } catch (error) {
    ctx.log("could not recognize text in a capture: " + messageOf(error));
    return "";
  }
}

function headline(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (value.length > 0) return truncate(value, 100);
  }
  return "Memory";
}

function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
