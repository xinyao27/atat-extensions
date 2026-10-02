// Talking to Notes through AppleScript.
//
// Same rule as the Reminders extension: the scripts are fixed, and what the user wrote only
// ever travels as the handler's input, split by the unit separator. Notes stores a note's
// body as HTML and uses its first line as the title, so the body is built here — the title
// as a heading, then the text escaped and broken into lines — and never contains markup the
// user did not see.

export const FIELD_SEPARATOR = "\u001f";

export interface NotesFolder {
  id: string;
  /// "iCloud › Notes": the account says which of two same-named folders this is.
  name: string;
}

export type RunAppleScript = (source: string, input?: string) => Promise<string | null>;

/// Every folder in every account except the trash, as id, tab, account, tab, name.
export const FOLDER_SCRIPT = `tell application "Notes"
  set output to ""
  repeat with anAccount in accounts
    repeat with aFolder in folders of anAccount
      set output to output & (id of aFolder) & tab & (name of anAccount) & tab & (name of aFolder) & linefeed
    end repeat
  end repeat
  return output
end tell`;

/// Fields: folder id, then the note's HTML body. Answers with the new note's name.
export const CREATE_SCRIPT = `on atatSelection(selectedText)
  set AppleScript's text item delimiters to (ASCII character 31)
  set fields to text items of selectedText
  set AppleScript's text item delimiters to ""
  set folderID to item 1 of fields
  set noteBody to item 2 of fields
  tell application "Notes"
    set targetFolder to folder id folderID
    set newNote to make new note at targetFolder with properties {body:noteBody}
    return name of newNote
  end tell
end atatSelection`;

/// Folders Notes keeps for itself and that a new note should not go into.
const HIDDEN_FOLDERS = new Set(["Recently Deleted", "最近删除", "最近刪除"]);

export function parseFolders(output: string | null): NotesFolder[] {
  const folders = (output ?? "")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 3 && (parts[0] ?? "").length > 0)
    .map(([id, account, ...name]) => ({ id: id ?? "", account: account ?? "", name: name.join("\t").trim() }))
    .filter((folder) => !HIDDEN_FOLDERS.has(folder.name));
  // The account is only worth naming when more than one is there.
  const accounts = new Set(folders.map((folder) => folder.account));
  return folders.map((folder) => ({
    id: folder.id,
    name: accounts.size > 1 ? `${folder.account} › ${folder.name}` : folder.name,
  }));
}

export async function listFolders(run: RunAppleScript): Promise<NotesFolder[]> {
  return parseFolders(await run(FOLDER_SCRIPT));
}

/// Makes the note and answers with the name Notes gave it.
export async function createNote(
  note: { folderID: string; title: string; text: string },
  run: RunAppleScript
): Promise<string> {
  const text = note.text.trim();
  if (text.length === 0 && note.title.trim().length === 0) throw new Error("emptyText");
  const input = [note.folderID, noteBody(note.title, text)].join(FIELD_SEPARATOR);
  return (await run(CREATE_SCRIPT, input)) ?? "";
}

/// The title as the first line — Notes makes that the note's name — then each line of the
/// text as its own block, escaped so a `<` the user copied stays a `<`.
export function noteBody(title: string, text: string): string {
  const heading = oneLine(title);
  const lines = text.split(FIELD_SEPARATOR).join(" ").split(/\r?\n/);
  const paragraphs = lines.map((line) => `<div>${line.trim().length > 0 ? escapeHTML(line) : "<br>"}</div>`);
  return [heading.length > 0 ? `<div><h1>${escapeHTML(heading)}</h1></div>` : "", ...paragraphs]
    .filter((part) => part.length > 0)
    .join("");
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/ {2}/g, " &nbsp;");
}

function oneLine(text: string): string {
  return text.split(FIELD_SEPARATOR).join(" ").replace(/\s*\n\s*/g, " ").trim().slice(0, 200);
}
