# Apple Notes

Saves what you select or copy as a new note in Notes.

## What it does

**Save to Notes** appears on selected text, on a Clipboard History entry and on a capture's
recognized text. The window shows a title your agent suggests (or the text's first line), a
folder picker listing every folder in every account — named with the account when you have
more than one — and the text that will be saved. **Save** makes the note; the title becomes
its first line, which is what Notes uses as its name.

The button greys out when Notes is not on this Mac.

## What it touches

- **Notes** (`automation`), through two fixed AppleScripts: one reads your folder names, one
  makes the note. What you wrote is handed to the script as data, escaped so any `<` or `&`
  you copied shows up as written. It never edits or deletes an existing note. The first
  time, macOS asks whether @@ may use Notes.
- **Your agent** (`agent`), once per window, to suggest a title. Turn **Suggest a title** off
  and it is never asked.
