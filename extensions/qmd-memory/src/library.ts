// The memory library: what the user's options mean, and how a qmd hit becomes a real file.
//
// Two directories, two qmd collections, one plugin. The split is the point: the library is
// what the user chose to keep (a phone Shortcut writing into `inbox/`, the “Save to memory”
// action) and the trajectory is what AtAt wrote down by itself. High-density and low-density
// data, one worth syncing through iCloud and one usually not, so they are two grants and two
// collections that recall happens to read together.

import { joinPath, isInside } from "./notes.js";

/** Created by `setup/setup.sh`, and the names recall filters on. */
export const MEMORY_COLLECTION = "atat-memory";
export const TRAJECTORY_COLLECTION = "atat-trajectory";

/** Where a memory lands: the same folder a phone Shortcut appends to. */
export const INBOX_DIRECTORY = "inbox";
/** Where a captured image lands, next to the note that references it. */
export const ASSETS_DIRECTORY = "assets";

export const OPTION_MEMORY_FOLDER = "memoryFolder";
export const OPTION_TRAJECTORY_FOLDER = "trajectoryFolder";
export const OPTION_PORT = "qmdPort";
export const OPTION_RECORDS = "recordsInteractions";
export const OPTION_RECALL_LIMIT = "recallLimit";

export type LibraryKind = "memory" | "trajectory";

export interface Configuration {
  /** Empty when the user has not granted the folder yet, which is the only required option. */
  memoryDirectory: string;
  /** Empty when the user has not granted it. Recording is off in that case, by construction. */
  trajectoryDirectory: string;
  port: string;
  recordsInteractions: boolean;
  recallLimit: number;
}

export function readConfiguration(
  options: Record<string, string | boolean>
): Configuration {
  return {
    memoryDirectory: readPath(options[OPTION_MEMORY_FOLDER]),
    trajectoryDirectory: readPath(options[OPTION_TRAJECTORY_FOLDER]),
    port: typeof options[OPTION_PORT] === "string" ? (options[OPTION_PORT] as string) : "8181",
    // Absent means on: the manifest's default is `true`, and a missing value should not be
    // the difference between recording and not.
    recordsInteractions: options[OPTION_RECORDS] !== false,
    recallLimit: readLimit(options[OPTION_RECALL_LIMIT]),
  };
}

function readPath(value: string | boolean | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.charAt(0) === "/" ? trimmed.replace(/\/+$/, "") : "";
}

function readLimit(value: string | boolean | undefined): number {
  const parsed = typeof value === "string" ? parseInt(value, 10) : NaN;
  if (!(parsed > 0)) return 3;
  return Math.min(10, parsed);
}

export interface Collection {
  name: string;
  root: string;
  kind: LibraryKind;
}

/** The collections recall should ask for: the library always, the trajectory when granted. */
export function collections(configuration: Configuration): Collection[] {
  const result: Collection[] = [];
  if (configuration.memoryDirectory.length > 0) {
    result.push({
      name: MEMORY_COLLECTION,
      root: configuration.memoryDirectory,
      kind: "memory",
    });
  }
  if (configuration.trajectoryDirectory.length > 0) {
    result.push({
      name: TRAJECTORY_COLLECTION,
      root: configuration.trajectoryDirectory,
      kind: "trajectory",
    });
  }
  return result;
}

export interface ResolvedHitPath {
  path: string;
  kind: LibraryKind;
}

/**
 * A qmd result path to an absolute one inside a granted directory.
 *
 * qmd reports `<collection>/<path relative to the collection root>`, sometimes wrapped as a
 * `qmd://` URI. Mapping it back needs the collection roots, which is why the collection names
 * are fixed by `setup.sh` rather than configurable — a name the plugin cannot map is a hit it
 * has to throw away.
 *
 * Anything that does not land inside a granted directory returns `null`. The host's allow list
 * would refuse such a path anyway; refusing it here means a mistake shows up as a missing
 * result rather than as a hook failure counted against the plugin.
 */
export function resolveHitPath(
  configuration: Configuration,
  file: string
): ResolvedHitPath | null {
  const roots = collections(configuration);
  if (roots.length === 0) return null;
  let text = String(file == null ? "" : file).trim();
  if (text.length === 0) return null;
  if (text.indexOf("qmd://") === 0) text = text.slice("qmd://".length);
  text = decodeSegments(text);

  for (const collection of roots) {
    const prefix = collection.name + "/";
    if (text.indexOf(prefix) === 0) {
      return { path: joinPath(collection.root, text.slice(prefix.length)), kind: collection.kind };
    }
  }

  // An absolute path is used as it stands, if it is somewhere the plugin may look.
  if (text.charAt(0) === "/") {
    for (const collection of roots) {
      if (isInside(collection.root, text)) return { path: text, kind: collection.kind };
    }
    return null;
  }

  // One collection and no prefix: the path can only be relative to that one root. With two
  // there is nothing to disambiguate on, and guessing would attach the wrong file.
  const only = roots[0];
  if (roots.length === 1 && only) {
    return { path: joinPath(only.root, text), kind: only.kind };
  }
  return null;
}

function decodeSegments(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

export function inboxDirectory(configuration: Configuration): string {
  return joinPath(configuration.memoryDirectory, INBOX_DIRECTORY);
}

export function assetsDirectory(configuration: Configuration): string {
  return joinPath(configuration.memoryDirectory, ASSETS_DIRECTORY);
}
