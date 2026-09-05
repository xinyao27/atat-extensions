# Memory

Memory keeps a folder of notes about what you do, and brings the right ones back when you
ask. The folder is yours: plain markdown files, on your Mac, readable in any editor.

Installing it takes one confirmation. There is nothing to configure, no service to run and
no account to make. It never uses the network.

## What it does

**Brings notes back.** Before a question goes out, Memory looks through your folder and
attaches up to five notes that fit. Each one shows up as a pill you can delete before you
send. If there is nothing relevant, nothing is attached and your question goes out as usual.

**Records what you do.** After each answer, Memory writes one note: what you asked, what
came back, and what was attached. One switch in the plugin's settings turns this off.

**Saves what you point at.** A "Save to memory" button appears when you select text, on a
clipboard entry, and on a screenshot in Quick Access. Text becomes a note. A screenshot is
copied into the folder with the words in it written out beside it, so you can find the
picture by what it says.

**Gives you a place to look.** The Memory tab in Settings lets you search your notes, read
one, send one to the composer, or delete one.

## Where your notes live

One folder, chosen once. Memory creates it in iCloud Drive when you install it
(`iCloud Drive/AtAt/Memory/`, or `~/Documents/AtAt/Memory/` if iCloud Drive is off), and you
can move it later in Settings → Extensions → Memory.

```
<memory folder>/
  inbox/       notes you saved, and anything your phone drops in
  assets/      images a note points at
  trajectory/  one note per question, written for you
```

Every note is front matter plus markdown:

```markdown
---
date: 2026-08-24T01:15:00+08:00
interactionSource: composer
title: Why the deploy failed on Friday
---

# Why the deploy failed on Friday
...
```

Put the folder in iCloud Drive and the same notes follow you to your other Macs. A Shortcut
on your phone can write a markdown file into `inbox/` and it gets read back like everything
else.

If the automatic notes sync more than you want, exclude `trajectory/` in iCloud's own
settings.

## Settings

- **Memory folder** — where the notes are kept.
- **Record my interactions** — turn it off and nothing is written for you.

## Building it

From the repository root:

```sh
pnpm install
pnpm build          # rebuilds every extension's main.js
pnpm typecheck
pnpm verify
```

`src/` is TypeScript and TSX; CI rebuilds the single-file `main.js` bundle AtAt evaluates, with
`react` and `@atat/api` left external because the host supplies both.
