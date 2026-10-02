// Writing into an Obsidian vault: nothing but Markdown files in a folder the user granted.
//
// Obsidian keeps no database of its own — a vault is a directory of `.md` files and it
// watches them — so saving a note is writing a file, and the app picks it up the moment it
// lands. Everything here is pure except `saveNote`, and even that takes its file access as
// an argument, so the view, the smoke harness and any future hook run the same code.

/// Where a saved piece goes: appended to today's daily note, or a note of its own.
export type Destination = "daily" | "note";

export interface VaultSettings {
  vault: string;
  dailyFolder: string;
  dailyFormat: string;
  inboxFolder: string;
}

export interface SaveRequest {
  destination: Destination;
  /// A new note's title, which becomes its file name. Ignored for the daily note.
  title: string;
  text: string;
  /// The moment of saving, as ISO 8601. Passed in rather than read from the clock so a
  /// scenario is repeatable; the view passes `new Date().toISOString()`.
  now: string;
}

export interface SaveResult {
  path: string;
  /// The path inside the vault, as Obsidian shows it.
  relativePath: string;
  destination: Destination;
}

export interface VaultFiles {
  read(path: string): Promise<{ base64: string }>;
  write(path: string, data: { base64: string }): Promise<void>;
  list(path: string): Promise<{ name: string; isDirectory: boolean }[]>;
}

export class VaultError extends Error {
  constructor(readonly kind: "noVault" | "emptyText" | "badFolder") {
    super(kind);
  }
}

/// Saves one piece of text and answers where it went.
export async function saveNote(
  request: SaveRequest,
  settings: VaultSettings,
  files: VaultFiles
): Promise<SaveResult> {
  const vault = settings.vault.replace(/\/+$/, "");
  if (vault.length === 0) throw new VaultError("noVault");
  const text = request.text.trim();
  if (text.length === 0) throw new VaultError("emptyText");
  const now = new Date(request.now);

  if (request.destination === "daily") {
    const folder = folderPath(settings.dailyFolder);
    const relativePath = joinPath(folder, `${formatDate(now, settings.dailyFormat)}.md`);
    const path = `${vault}/${relativePath}`;
    const existing = await readText(files, path);
    await files.write(path, { base64: encodeUtf8(appendEntry(existing, text, now)) });
    return { path, relativePath, destination: "daily" };
  }

  const folder = folderPath(settings.inboxFolder);
  const base = fileName(request.title) || fileName(firstLine(text)) || formatDate(now, "YYYY-MM-DD");
  const taken = await existingNames(files, folder.length > 0 ? `${vault}/${folder}` : vault);
  const name = uniqueName(base, taken);
  const relativePath = joinPath(folder, `${name}.md`);
  const path = `${vault}/${relativePath}`;
  await files.write(path, { base64: encodeUtf8(newNote(text, now)) });
  return { path, relativePath, destination: "note" };
}

// ------------------------------------------------------------------------ content

/// Today's note grows by one timestamped block per save, under whatever it already holds.
export function appendEntry(existing: string, text: string, now: Date): string {
  const block = `### ${formatTime(now)}\n\n${text.trim()}\n`;
  if (existing.trim().length === 0) return block;
  return `${existing.replace(/\s+$/, "")}\n\n${block}`;
}

/// A note of its own: when it was made and where it came from, then the text.
export function newNote(text: string, now: Date): string {
  return `---\ncreated: ${formatDate(now, "YYYY-MM-DD")}T${formatTime(now)}\nsource: AtAt\n---\n\n${text.trim()}\n`;
}

/// A title as a file name Obsidian accepts: none of the characters it refuses in a link or
/// on disk, one line, and short enough to read in the sidebar.
export function fileName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
}

export function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").replace(/^#+\s*/, "").slice(0, 60);
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// -------------------------------------------------------------------------- dates

/// The five formats the Daily notes plugin is most often set to. `YYYY`, `MM` and `DD` are
/// replaced wherever they stand, which covers every one of them.
export function formatDate(date: Date, format: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return format
    .replace("YYYY", String(date.getFullYear()))
    .replace("MM", pad(date.getMonth() + 1))
    .replace("DD", pad(date.getDate()));
}

function formatTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// -------------------------------------------------------------------------- paths

/// A folder inside the vault, as the user typed it: slashes trimmed, and never a path that
/// climbs out of the vault.
function folderPath(folder: string): string {
  const parts = folder.split("/").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.some((part) => part === ".." || part === ".")) throw new VaultError("badFolder");
  return parts.join("/");
}

function joinPath(folder: string, name: string): string {
  return folder.length > 0 ? `${folder}/${name}` : name;
}

async function existingNames(files: VaultFiles, directory: string): Promise<Set<string>> {
  try {
    const entries = await files.list(directory);
    return new Set(
      entries
        .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith(".md"))
        .map((entry) => entry.name.slice(0, -3).toLowerCase())
    );
  } catch {
    // The folder does not exist yet; the write creates it.
    return new Set();
  }
}

async function readText(files: VaultFiles, path: string): Promise<string> {
  try {
    return decodeUtf8((await files.read(path)).base64);
  } catch {
    return "";
  }
}

// ----------------------------------------------------------------------- encoding

/// `files` carries base64, and `btoa` only takes Latin-1: a Chinese note would throw. The
/// bytes go through UTF-8 by hand, in both directions.
export function encodeUtf8(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}
