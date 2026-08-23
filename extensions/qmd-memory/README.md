# qmd-memory

Your memory is a folder of markdown files. AtAt writes into it and reads back out of it;
[qmd](https://github.com/tobi/qmd) — which you install and run yourself — makes it
searchable. Nothing about it is a database inside an app, and nothing about it leaves your
Mac.

This is an official example plugin, and it is deliberately a plugin: it uses only the
documented extension points, with one entitlement (`network`, for the loopback connection to
qmd) and no privileged access of any kind. A memory system did not need to be built into
AtAt's core, and this is the proof.

## What it does

**Recall.** Before a request goes out, the plugin asks qmd what in your memory is relevant
and attaches at most a few matches. Each one arrives as a visible pill you can delete before
sending, and the excerpts also travel as a `<memory>` section addressed to the agent. Recall
gives itself 800 milliseconds and gives up quietly if qmd is slow or absent — a request never
waits on memory.

**Recording.** After each response, the plugin writes one markdown note into the trajectory
folder: your request, the answer, and a summary of what was attached. Front matter carries the
date, the source and the interaction it came from, so qmd indexes it like anything else. This
half never needs qmd at all.

**Saving.** A “Save to memory” button appears on the selection bar, on a clipboard entry and on
a capture — one declaration, three surfaces. Text becomes a note; a capture is copied into
`assets/` with its recognised text in the note beside it, so a screenshot is searchable by what
it says.

**The Memory tab.** A panel in AtAt's Settings: search your memory through qmd, browse the
folder when you would rather not search, preview a note, send one to the composer, delete one.
Browsing works whether or not qmd is running.

## Three ways to run it

The same plugin, three levels of ambition. The first one is the whole experience; the other two
add reach.

| | Memory folder | You get |
|---|---|---|
| Local | anywhere on this Mac | AtAt interactions become memory, and memory comes back |
| Synced | a folder in iCloud Drive | the same memory on every Mac you use |
| Captured | iCloud, plus a Shortcut on your phone writing into `inbox/` | anything you see anywhere becomes memory |

## Installing

**1. The plugin.** Copy this directory into
`~/Library/Application Support/AtAt/Plugins/qmd-memory/`. AtAt picks it up without a restart
and asks you to confirm what it can do.

**2. qmd and the automation.** Run the setup script:

```sh
./setup/setup.sh
```

It checks for qmd, asks for the two folders and the port, creates
`inbox/`, `assets/` and `atat/`, registers two qmd collections (`atat-memory` and
`atat-trajectory`), and installs two launchd agents:

- `com.atat.memory.qmd-server` keeps `qmd mcp --http` running, because that is what recall
  talks to.
- `com.atat.memory.indexer` runs `setup/memory-sync.sh` whenever a memory folder changes, and
  every ten minutes regardless. The script pulls down iCloud placeholders with `brctl
  download`, then runs `qmd update` and `qmd embed`. A file your phone wrote is indexed within
  seconds of arriving, with nobody watching.

Both agents belong to your machine, not to AtAt: the app starts nothing and keeps nothing
running. `./setup/setup.sh --dry-run` shows what it would install without touching anything,
and `./setup/uninstall.sh` removes the two agents and no data.

**3. The folder grants, in AtAt.** Settings → Plugins → qmd-memory, and choose the two folders
there. No script can do this step: a plugin gets a directory only from your own hand in that
panel, which is what makes the grant worth anything. The port goes in the same panel if you
changed it.

## Without qmd

Everything except search keeps working. Recording writes notes, “Save to memory” saves, the
Memory tab browses the folder, and recall returns nothing and says so only in the log — no
toast, no error, no delay. Install qmd a month from now and that month of memory becomes
searchable at once, because the memory was never inside qmd to begin with.

## The files it writes

```
<memory folder>/
  inbox/    20260824-011500-a3f9.md      notes, from your phone and from “Save to memory”
  assets/   20260824-011500-a3f9.png     images a note points at
  atat/                                  reserved for AtAt's own files
<trajectory folder>/
  atat-20260824-011500-a3f9.md           one note per interaction
```

Every note is front matter plus markdown:

```markdown
---
date: 2026-08-24T01:15:00+08:00
source: atat
interactionSource: composer
title: Why the deploy failed on Friday
---

# Why the deploy failed on Friday
...
```

Nothing reads a proprietary format, including this plugin. Open the folder in any editor and
it is all there.

## Logs

- `~/Library/Logs/atat-memory-sync.log` — every index run, truncated at a megabyte
- `~/Library/Logs/atat-qmd-server.log` — the search server
- `~/Library/Logs/atat-memory-indexer.log` — what launchd saw

## Building it

From the repository root:

```sh
pnpm install
pnpm build          # rebuilds every extension's main.js
pnpm typecheck
```

`src/` is TypeScript and TSX; `main.js` is the committed single-file bundle AtAt evaluates, with
`react` and `@atat/ui` left external because the host supplies both.
