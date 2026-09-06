// The bit of AtAt the import routine needs, and how it reads somebody else's folder.
//
// The routine runs from the panel, where host capabilities arrive as named imports, and from
// the smoke harness, where they arrive as a hook's `ctx`. Both shapes fit this interface, so
// the routine takes it as an argument instead of importing anything itself — which is also
// what makes every converter testable against a directory of fixtures.
//
// Another assistant's folder is read-only by construction: the manifest's `reads` block gets
// `files.read` and `files.list` and nothing else. No write, no delete, no search, and no path
// outside the directories the user agreed to at install.

import { decodeText, joinPath, sanitizeText } from "../notes.js";

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  /** ISO 8601. For most assistants this is the only date a memory has. */
  modifiedAt?: string;
}

export interface MemoryHost {
  files: {
    read(path: string): Promise<{ base64: string }>;
    write(path: string, data: { base64: string }): Promise<void>;
    list(dirPath: string): Promise<DirectoryEntry[]>;
    /** Moves the file to the Trash; `trashed` is false when it had to be deleted outright. */
    remove(path: string): Promise<{ trashed: boolean }>;
    /** The directories one `reads` declaration found on this Mac. Empty means “not here”. */
    roots(identifier: string): Promise<string[]>;
  };
  storage: {
    get(key: string): Promise<unknown | null>;
    set(key: string, value: unknown): Promise<void>;
  };
  options: Record<string, string | boolean>;
  log(message: string): void;
}

/** One file out of another assistant's folder, already decoded and sanitized. */
export interface SourceFile {
  /** Absolute, and inside the read root it came from. */
  path: string;
  name: string;
  /** Where it sits under the root: `memory/2026-08-14.md`. */
  relativePath: string;
  modifiedAt?: string;
  text: string;
}

/** How deep a walk goes. Every assistant keeps memories within three levels of its root. */
const MAXIMUM_DEPTH = 3;
/** A ceiling on one assistant, so a folder nobody expected cannot become a long wait. */
const MAXIMUM_FILES = 600;
/** Reads in flight. Enough to be quick, few enough that the panel stays responsive. */
const CONCURRENCY = 8;

export interface WalkRules {
  /** Whether a file is one this assistant keeps memories in. */
  wantsFile(relativePath: string, name: string): boolean;
  /** Whether to walk into a subdirectory. */
  entersDirectory(relativePath: string, name: string): boolean;
}

/**
 * Every file under a read root that the rules want, read and decoded.
 *
 * A directory that cannot be listed and a file that cannot be read are both normal: another
 * app is writing into this folder while we read it, and iCloud may not have brought a file
 * down yet. Either way it is one memory missing, not a failed import.
 */
export async function collectFiles(
  host: MemoryHost,
  root: string,
  rules: WalkRules
): Promise<SourceFile[]> {
  const found: { path: string; name: string; relativePath: string; modifiedAt?: string }[] = [];
  const queue: { path: string; relativePath: string; depth: number }[] = [
    { path: root, relativePath: "", depth: 0 },
  ];

  while (queue.length > 0 && found.length < MAXIMUM_FILES) {
    const directory = queue.shift();
    if (!directory) break;
    let entries: DirectoryEntry[] = [];
    try {
      entries = await host.files.list(directory.path);
    } catch (error) {
      host.log("skipped a folder while importing: " + messageOf(error));
      continue;
    }
    for (const entry of entries) {
      const name = String(entry?.name ?? "");
      if (name.length === 0 || name.charAt(0) === ".") continue;
      const relativePath =
        directory.relativePath.length === 0 ? name : directory.relativePath + "/" + name;
      if (entry.isDirectory) {
        if (directory.depth + 1 >= MAXIMUM_DEPTH) continue;
        if (!rules.entersDirectory(relativePath, name)) continue;
        queue.push({
          path: joinPath(directory.path, name),
          relativePath,
          depth: directory.depth + 1,
        });
        continue;
      }
      if (!rules.wantsFile(relativePath, name)) continue;
      if (found.length >= MAXIMUM_FILES) break;
      found.push({
        path: joinPath(directory.path, name),
        name,
        relativePath,
        modifiedAt: typeof entry.modifiedAt === "string" ? entry.modifiedAt : undefined,
      });
    }
  }

  const files: SourceFile[] = [];
  for (let index = 0; index < found.length; index += CONCURRENCY) {
    const batch = found.slice(index, index + CONCURRENCY);
    const texts = await Promise.all(
      batch.map(async (entry) => {
        try {
          return sanitizeText(decodeText((await host.files.read(entry.path)).base64));
        } catch (error) {
          host.log("skipped a file while importing: " + messageOf(error));
          return null;
        }
      })
    );
    batch.forEach((entry, offset) => {
      const text = texts[offset];
      if (text === null || text === undefined) return;
      files.push({ ...entry, text });
    });
  }
  // Stable order, so a re-run splits a file the same way it did last time.
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}

export function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
