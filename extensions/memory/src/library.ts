// The memory folder: what the user's two options mean, and where things go inside it.
//
// One granted directory, three subfolders. `inbox/` is what was kept on purpose — the “Save to
// memory” action and whatever a phone Shortcut appends; `assets/` holds the images those notes
// point at; `trajectory/` is what AtAt wrote down by itself, one note per interaction. The
// trajectory is a subfolder rather than a second grant because one grant is one question asked
// of the user, and there is no version of “yes” that means one of these and not the other.
//
// None of the three has to exist. `files.write` creates the directories on the way to the file,
// so the first save is what brings `inbox/` into being.

import { isInside, joinPath } from "./notes.js";

/** Where a memory lands: the same folder a phone Shortcut appends to. */
export const INBOX_DIRECTORY = "inbox";
/** Where a captured image lands, referenced from the note beside it. */
export const ASSETS_DIRECTORY = "assets";
/** Where the `response` hook writes, one note per interaction. */
export const TRAJECTORY_DIRECTORY = "trajectory";

export const OPTION_MEMORY_FOLDER = "memoryFolder";
export const OPTION_RECORDS = "recordsInteractions";

/** Which half of the folder a note came from. Trajectory notes are labelled as such. */
export type MemoryKind = "memory" | "trajectory";

export interface Configuration {
  /**
   * The granted folder, or empty.
   *
   * The manifest declares `defaultPath: "icloud"`, so the host creates and grants this at
   * install time and it is normally set. Empty still has to be handled: a user may point the
   * option somewhere else, and a folder can be moved out from under a grant.
   */
  memoryDirectory: string;
  recordsInteractions: boolean;
}

export function readConfiguration(options: Record<string, string | boolean>): Configuration {
  return {
    memoryDirectory: readPath(options[OPTION_MEMORY_FOLDER]),
    // Absent means on: the manifest's default is `true`, and a missing value should not be the
    // difference between recording and not.
    recordsInteractions: options[OPTION_RECORDS] !== false,
  };
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

export function trajectoryDirectory(configuration: Configuration): string {
  return joinPath(configuration.memoryDirectory, TRAJECTORY_DIRECTORY);
}

/**
 * Whether a path the host returned is a trajectory note or a memory.
 *
 * Anything under `trajectory/` is the former; everything else in the folder — `inbox/`, a
 * markdown file the user dropped at the top level, a folder of their own — is the latter.
 */
export function kindOf(configuration: Configuration, path: string): MemoryKind {
  return isInside(trajectoryDirectory(configuration), path) ? "trajectory" : "memory";
}

/** Whether a path the host returned is somewhere this plugin is allowed to look. */
export function isGranted(configuration: Configuration, path: string): boolean {
  return configuration.memoryDirectory.length > 0 && isInside(configuration.memoryDirectory, path);
}
