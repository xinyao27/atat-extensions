# Reminders

Turns what you select or copy into a reminder, with a due date if you want one.

## What it does

**Add to Reminders** appears on selected text, on a Clipboard History entry and on a
capture's recognized text. It opens a small window beside what you clicked:

- **Reminder** — the to-do. A short selection is used as it is; a longer one is shortened by
  your agent, and the full text is kept as the reminder's notes.
- **List** — any list in Reminders, starting with your default one.
- **Remind me on a day** — switch it on to pick a date and time.

The button greys out when Reminders is not on this Mac.

## What it touches

- **Reminders** (`automation`), through two fixed AppleScripts: one reads the names of your
  lists, one adds the reminder. What you wrote is handed to the script as data and is never
  part of the script itself. The first time, macOS asks whether @@ may use Reminders.
- **Your agent** (`agent`), only when the selection is longer than a short line and
  **Suggest a title** is on.

Nothing leaves your Mac beyond what your agent already sees.
