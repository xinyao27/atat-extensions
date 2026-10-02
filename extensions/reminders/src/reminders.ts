// Talking to Reminders through AppleScript.
//
// Two scripts, both fixed: one lists the lists, one makes a reminder. What the user wrote
// never becomes part of a script's source — it travels as the handler's input, its fields
// separated by the ASCII unit separator, and the script splits them back apart. Quotes, a
// backslash or a line that reads like AppleScript are all just text that way.

/// U+001F, the unit separator: a character no title or note contains.
export const FIELD_SEPARATOR = "\u001f";

export interface ReminderList {
  id: string;
  name: string;
}

export interface NewReminder {
  listID: string;
  title: string;
  notes: string;
  /// ISO 8601, or empty for a reminder with no date.
  due: string;
}

export type RunAppleScript = (source: string, input?: string) => Promise<string | null>;

/// One list per line: its id, a tab, its name. The default list comes first so it is what
/// the picker starts on.
export const LIST_SCRIPT = `tell application "Reminders"
  set output to ""
  set firstID to id of default list
  set output to output & firstID & tab & (name of default list) & linefeed
  repeat with aList in lists
    if id of aList is not firstID then
      set output to output & (id of aList) & tab & (name of aList) & linefeed
    end if
  end repeat
  return output
end tell`;

/// Fields: list id, title, notes, then the due date as year, month, day, hours, minutes —
/// or five empty fields for no date. The date is assembled field by field because
/// AppleScript's own date parsing follows the system's region settings.
export const CREATE_SCRIPT = `on atatSelection(selectedText)
  set AppleScript's text item delimiters to (ASCII character 31)
  set fields to text items of selectedText
  set AppleScript's text item delimiters to ""
  set listID to item 1 of fields
  set reminderTitle to item 2 of fields
  set reminderNotes to item 3 of fields
  tell application "Reminders"
    set targetList to first list whose id is listID
    set reminderProperties to {name:reminderTitle}
    if reminderNotes is not "" then set reminderProperties to reminderProperties & {body:reminderNotes}
    set newReminder to make new reminder at end of targetList with properties reminderProperties
    if item 4 of fields is not "" then
      set dueDate to current date
      set day of dueDate to 1
      set year of dueDate to (item 4 of fields) as integer
      set month of dueDate to (item 5 of fields) as integer
      set day of dueDate to (item 6 of fields) as integer
      set hours of dueDate to (item 7 of fields) as integer
      set minutes of dueDate to (item 8 of fields) as integer
      set seconds of dueDate to 0
      set due date of newReminder to dueDate
      set remind me date of newReminder to dueDate
    end if
    return name of targetList
  end tell
end atatSelection`;

export function parseLists(output: string | null): ReminderList[] {
  return (output ?? "")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => (parts[0] ?? "").length > 0)
    .map(([id, ...name]) => ({ id: id ?? "", name: name.join("\t").trim() }));
}

export async function listReminderLists(run: RunAppleScript): Promise<ReminderList[]> {
  return parseLists(await run(LIST_SCRIPT));
}

/// Adds one reminder and answers with the name of the list it went into.
export async function addReminder(reminder: NewReminder, run: RunAppleScript): Promise<string> {
  const title = oneLine(reminder.title);
  if (title.length === 0) throw new Error("emptyTitle");
  const input = [
    reminder.listID,
    title,
    clean(reminder.notes),
    ...dueFields(reminder.due),
  ].join(FIELD_SEPARATOR);
  return (await run(CREATE_SCRIPT, input)) ?? "";
}

/// The date the user picked, in the Mac's own time zone, as the five fields the script
/// reads. The picker hands over an instant; the reminder is due at that moment wherever the
/// Mac is, which is what the user saw when they picked it.
export function dueFields(due: string): string[] {
  if (!due) return ["", "", "", "", ""];
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return ["", "", "", "", ""];
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1),
    String(date.getDate()),
    String(date.getHours()),
    String(date.getMinutes()),
  ];
}

/// A title is one line; a reminder's title field does not keep line breaks.
function oneLine(text: string): string {
  return clean(text).replace(/\s*\n\s*/g, " ").trim().slice(0, 250);
}

/// The separator is the one character that would split a field in two, so it never
/// survives into one.
function clean(text: string): string {
  return text.split(FIELD_SEPARATOR).join(" ").trim();
}
