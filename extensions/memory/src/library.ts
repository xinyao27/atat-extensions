// The memory folder: what the user's one option means, and where things go inside it.
//
// One granted directory, two subfolders. `inbox/` holds every memory — the ones saved with
// “Save to memory”, the ones a phone Shortcut drops in, and the ones brought over from
// another assistant; `assets/` holds the images those notes point at. Nothing else is kept
// here, because memory is what the user decided to keep and nothing else.
//
// Neither subfolder has to exist. `files.write` creates the directories on the way to the
// file, so the first save is what brings `inbox/` into being.

import { isAssistantSource } from "./import/catalog.js";
import { isInside, joinPath } from "./notes.js";

/** Where a memory lands: the same folder a phone Shortcut appends to. */
export const INBOX_DIRECTORY = "inbox";
/** Where a captured image lands, referenced from the note beside it. */
export const ASSETS_DIRECTORY = "assets";

export const OPTION_MEMORY_FOLDER = "memoryFolder";

export interface Configuration {
  /**
   * The granted folder, or empty.
   *
   * The manifest declares `defaultPath: "shortcuts"`, so the host creates and grants this at
   * install time and it is normally set. Empty still has to be handled: a user may point the
   * option somewhere else, and a folder can be moved out from under a grant.
   */
  memoryDirectory: string;
}

export function readConfiguration(options: Record<string, string | boolean>): Configuration {
  return { memoryDirectory: readPath(options[OPTION_MEMORY_FOLDER]) };
}

function readPath(value: string | boolean | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.charAt(0) === "/" ? trimmed.replace(/\/+$/, "") : "";
}

export function inboxDirectory(configuration: Configuration): string {
  return joinPath(configuration.memoryDirectory, INBOX_DIRECTORY);
}

export function assetsDirectory(configuration: Configuration): string {
  return joinPath(configuration.memoryDirectory, ASSETS_DIRECTORY);
}

/** Whether a path the host returned is somewhere this extension is allowed to look. */
export function isGranted(configuration: Configuration, path: string): boolean {
  return configuration.memoryDirectory.length > 0 && isInside(configuration.memoryDirectory, path);
}

/**
 * Where a memory came from, written into every note as `source`.
 *
 * The three Mac surfaces, the phone, and — for a memory brought over — the assistant that
 * remembered it first. Old notes carry whatever they carried; nothing here is required to
 * read one.
 */
export function sourceForSurface(surface: string): string {
  if (surface === "clipboardHistory") return "clipboard";
  if (surface === "captureQuickAccess") return "capture";
  return "selection";
}

/** The row glyph for a note, by where it came from. Host icon names, not files. */
export function iconForSource(source: string): string {
  if (source === "clipboard") return "clipboard";
  if (source === "capture") return "camera01";
  if (source === "phone") return "share08";
  if (source === "selection") return "text";
  // Everything brought over from another assistant shares one glyph; the row's subtitle is
  // where the assistant's name is written.
  if (isAssistantSource(source)) return "bubble-chat";
  return "note";
}
