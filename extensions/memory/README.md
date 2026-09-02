# Memory

Your memory is a folder of markdown files. AtAt writes into it and reads back out of it.
Nothing about it is a database inside an app, and nothing about it leaves your Mac.

Installing it is one confirmation. There is no dependency to install, no service to run, no
port to open, no setup script: search comes from AtAt itself, over the folder you granted.

This is an official plugin, and it is deliberately a plugin: it declares no entitlements at
all and uses only the documented extension points. A memory system did not need to be built
into AtAt's core, and this is the proof.

## What it does

**Recall.** Before a request goes out, the plugin asks AtAt what in your memory folder is
relevant and attaches at most five matches. Each one arrives as a visible pill you can delete
before sending, and the excerpts also travel as a `<memory>` section addressed to the agent.
Recall gives up quietly when the index has nothing to say or is still building — a request
never waits on memory.

**Recording.** After each response, the plugin writes one markdown note into `trajectory/`:
your request, the answer, and a summary of what was attached. Turn it off with the one switch
in the plugin's settings and nothing is recorded.

**Saving.** A “Save to memory” button appears on the selection bar, on a clipboard entry and
on a capture in Quick Access — one declaration, three surfaces. Text becomes a note; a capture
is copied into `assets/` with its recognised text in the note beside it, so a screenshot is
searchable by what it says.

**The Memory tab.** A panel in AtAt's Settings: search your memory, browse it newest-first,
preview a note, send one to the composer, delete one.

## Where memories live

One folder, granted once. AtAt creates it in iCloud Drive at install time
(`iCloud Drive/AtAt/Memory/`, or `~/Documents/AtAt/Memory/` when iCloud Drive is unavailable)
and you can point the option somewhere else afterwards in Settings → Plugins → Memory.

```
<memory folder>/
  inbox/       20260824-011500-a3f9.md    notes, from “Save to memory” and from your phone
  assets/      20260824-011500-a3f9.png   images a note points at
  trajectory/  20260824-011500-a3f9.md    one note per interaction, written automatically
```

The subfolders are created the first time something is written into them. `trajectory/` is a
subfolder rather than a second grant on purpose: one folder is one question asked of you, and
there is no version of “yes” that means one of these and not the other. If the trajectory
grows faster than you want to sync, exclude that one subfolder in iCloud's own settings.

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

Nothing reads a proprietary format, including this plugin. Open the folder in any editor and
it is all there.

## Three ways to run it

The same plugin, three levels of ambition. The first one is the whole experience; the other
two add reach.

| | Memory folder | You get |
|---|---|---|
| Local | anywhere on this Mac | AtAt interactions become memory, and memory comes back |
| Synced | iCloud Drive (the default) | the same memory on every Mac you use |
| Captured | iCloud, plus a Shortcut on your phone writing into `inbox/` | anything you see anywhere becomes memory |

A phone Shortcut writes a markdown file into `inbox/` of the iCloud folder, in the same shape
this plugin writes — front matter and a body. Nothing special is required of it: whatever
lands there is indexed and recalled like everything else.

## Settings

Two options, because there are two questions a user actually has.

- **Memory folder** — “I want it somewhere else” or “I want it on my phone too”.
- **Record interactions automatically** — “I don't want to be recorded”.

That is the whole list. There is no port, no recall limit, no second folder.

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
