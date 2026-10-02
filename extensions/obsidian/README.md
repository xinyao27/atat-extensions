# Obsidian

Saves what you select or copy to today's note, or to a new note in your vault.

## What it does

**Save to Obsidian** appears on selected text, on a Clipboard History entry and on a capture's
recognized text. It opens a small window beside what you clicked:

- **Save to** — a new note, or today's daily note.
- **Title** — for a new note, a title your agent suggests from the text. Change it freely; if
  the agent is off or slow, the text's first line is used instead.

A new note lands in the **New notes folder** (Inbox by default) with a `created` date and
`source: AtAt` in its front matter. A name that is already taken gets a number rather than
replacing the older note. Today's note gets a timestamped block added under whatever it
already holds, and is created if it does not exist yet.

## What it touches

- **Your vault folder**, which you choose on the extension's page in Settings. It writes
  Markdown files there and reads today's note before adding to it. Nothing outside that
  folder is read or written, and a folder name that tries to climb out of the vault is
  refused.
- **Your agent** (`agent`), once per window, to suggest a title. Turn **Suggest a title** off
  and it is never asked.

It calls no network service of its own and needs no account: Obsidian reads the files the
moment they land.

## @@ Memory

The vault also appears in **Settings › Memory** as a source you can import from. Each note
becomes a review item — its title, its text, and where it sits in the vault — and you choose
which are kept. Importing reads your notes only; nothing is written back to the vault, and
unimporting removes them from Memory without touching the files.
