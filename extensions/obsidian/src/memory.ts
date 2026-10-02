// Reading a vault into memory.md's external-import contract.
//
// A vault is Markdown files in a folder the user granted, which is the same material
// `vault.ts` writes. This is the other direction: page through every note and hand each one
// over as an item for the user to review. Nothing here writes, and nothing here knows that
// the notes it reads are also notes AtAt can save into.
//
// The traversal is the part worth stating. The host asks for a page, hands back whatever
// cursor it got, and may stop at an item budget — so a page that dropped its place would lose
// notes. The cursor therefore carries the traversal's own position: the directories still to
// visit and how far into the current one the walk got. It is JSON rather than a path because
// a single path cannot say "and then continue with the directory I was in".
//
// Directories are named relative to the vault throughout, and every listing is sorted, because
// the cursor is an index into a listing: an order that changed between one page and the next
// would skip notes or repeat them.

import { decodeUtf8, type VaultFiles } from "./vault.js";

/// What the host hands a page request.
export interface MemorySourceRequest {
  cursor?: string;
  since?: string;
  limit: number;
}

export interface MemoryItem {
  externalKey: string;
  title: string;
  body: string;
  url?: string;
  locator?: string;
  kind?: "fact" | "preference" | "decision" | "state" | "reference" | "procedure" | "conversation";
  observedAt?: string;
  updatedAt?: string;
}

export interface MemoryPage {
  items: MemoryItem[];
  nextCursor?: string;
  complete: boolean;
}

/// Where the walk had got to.
///
/// `stack` holds the directories still to visit, innermost first, so the walk is depth-first.
/// `directory` is the one being consumed — nil between directories — and `index` is how many
/// of its notes are already behind us.
interface WalkState {
  stack: string[];
  directory: string | null;
  index: number;
}

const NOTE_EXTENSION = ".md";

/// Folders Obsidian itself keeps, and anything else hidden. Never the user's notes.
const SKIPPED_NAME = /^\./;

/**
 * One page of the vault's notes, in a stable depth-first order.
 *
 * `since` is deliberately unused, and that is a choice rather than an omission. A vault is a
 * directory listing, so the walk costs what it costs whether or not everything is wanted — and
 * skipping unchanged notes would make the page omit items the walk actually saw, which the host
 * cannot tell apart from the user having deleted them. Every note is handed over instead, and
 * the host's own content hash decides what really moved.
 */
export async function listNotes(
  request: MemorySourceRequest,
  vault: string,
  files: VaultFiles
): Promise<MemoryPage> {
  const root = vault.replace(/\/+$/, "");
  if (root.length === 0) throw new VaultError("noVault");
  const limit = Math.max(1, Math.floor(request.limit));
  const state = stateFrom(request.cursor);
  const items: MemoryItem[] = [];

  while (items.length < limit) {
    if (state.directory === null) {
      const next = state.stack.shift();
      // Nothing left to visit: the walk saw the whole vault, which is what lets the host treat
      // a note it no longer finds as one the user deleted.
      if (next === undefined) return { items, complete: true };
      state.directory = next;
      state.index = 0;
    }

    const listing = await listDirectory(at(root, state.directory), state.directory, files);
    while (state.index < listing.notes.length && items.length < limit) {
      const entry = listing.notes[state.index];
      state.index += 1;
      if (!entry) continue;
      const item = await note(entry, files);
      // A note that will not open is passed over rather than failing the page: the vault is the
      // user's own folder, and one unreadable file in it is not a reason to import none of it.
      if (item) items.push(item);
    }

    if (state.index >= listing.notes.length) {
      // Finished with this directory. Its children go ahead of its siblings, and the walk
      // remembers the position rather than the listing, so a page boundary can fall anywhere.
      state.stack.unshift(...listing.directories);
      state.directory = null;
      state.index = 0;
    }
  }

  return { items, nextCursor: cursorFrom(state), complete: false };
}

interface NoteEntry {
  /// Absolute, inside the granted vault folder.
  path: string;
  /// Relative to the vault. The note's identity, and what a row shows as its origin.
  relativePath: string;
  modifiedAt?: string;
}

interface Listing {
  notes: NoteEntry[];
  /// Subdirectories, relative to the vault, as `directory` names them.
  directories: string[];
}

/// Every note and subdirectory directly inside one directory, sorted by name.
async function listDirectory(
  directory: string,
  relativeDirectory: string,
  files: VaultFiles
): Promise<Listing> {
  let entries: { name: string; isDirectory: boolean; modifiedAt?: string }[];
  try {
    entries = await files.list(directory);
  } catch {
    // A directory that vanished between two pages: the walk is simply finished with it.
    return { notes: [], directories: [] };
  }
  const notes: NoteEntry[] = [];
  const directories: string[] = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (SKIPPED_NAME.test(entry.name)) continue;
    const relativePath = at(relativeDirectory, entry.name);
    if (entry.isDirectory) {
      directories.push(relativePath);
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(NOTE_EXTENSION)) continue;
    notes.push({
      path: at(directory, entry.name),
      relativePath,
      ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
    });
  }
  return { notes, directories };
}

/// One note as an item, or nil when it holds nothing to import.
async function note(entry: NoteEntry, files: VaultFiles): Promise<MemoryItem | null> {
  let text: string;
  try {
    text = decodeUtf8((await files.read(entry.path)).base64);
  } catch {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const parsed = unfrontmatter(trimmed);
  const content = parsed.content.trim();
  if (content.length === 0) return null;
  return {
    externalKey: entry.relativePath,
    title: parsed.title || heading(content) || baseName(entry.relativePath),
    body: content,
    locator: entry.relativePath,
    // What the file system says about the file, which is evidence about the file and not about
    // anything inside it — so this is `updatedAt`, and the item's `observedAt` stays unknown.
    ...(entry.modifiedAt ? { updatedAt: entry.modifiedAt } : {}),
  };
}

function at(parent: string, name: string): string {
  return parent.length > 0 ? `${parent}/${name}` : name;
}

// ------------------------------------------------------------------------ documents

/**
 * A note split into its title and its words.
 *
 * A YAML frontmatter block is metadata rather than the note, so it is not part of the body the
 * user is asked to keep; a `title` in it is the note's own name for itself and beats any guess.
 */
export function unfrontmatter(text: string): { title: string; content: string } {
  if (!text.startsWith("---")) return { title: "", content: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { title: "", content: text };
  const front = text.slice(3, end);
  const content = text.slice(text.indexOf("\n", end + 1) + 1).trim();
  const match = /^title:\s*(.+)$/m.exec(front);
  const title = match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return { title, content };
}

/// The note's first heading, which is how a note names itself when it has no frontmatter title.
export function heading(content: string): string {
  const match = /^#{1,6}\s+(.+)$/m.exec(content);
  return match?.[1]?.trim() ?? "";
}

function baseName(relativePath: string): string {
  const name = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return name.toLowerCase().endsWith(NOTE_EXTENSION) ? name.slice(0, -NOTE_EXTENSION.length) : name;
}

// --------------------------------------------------------------------------- cursor

function stateFrom(cursor: string | undefined): WalkState {
  if (!cursor) return { stack: [""], directory: null, index: 0 };
  try {
    const parsed = JSON.parse(cursor) as Partial<WalkState>;
    return {
      stack: Array.isArray(parsed.stack)
        ? parsed.stack.filter((entry): entry is string => typeof entry === "string")
        : [],
      directory: typeof parsed.directory === "string" ? parsed.directory : null,
      index:
        typeof parsed.index === "number" && parsed.index >= 0 ? Math.floor(parsed.index) : 0,
    };
  } catch {
    // An unreadable cursor restarts the walk. Repeating notes is recoverable — the host matches
    // them by their keys — while skipping them is not.
    return { stack: [""], directory: null, index: 0 };
  }
}

function cursorFrom(state: WalkState): string {
  return JSON.stringify({ stack: state.stack, directory: state.directory, index: state.index });
}

/// The one failure a read has, declared here so this module does not depend on the save path's
/// settings type.
class VaultError extends Error {
  constructor(readonly kind: "noVault") {
    super(kind);
  }
}
