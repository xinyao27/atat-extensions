# Memory

Memory keeps the things you tell @@ to remember, and brings them back when they fit what you
are asking. The folder is yours: plain markdown files, on your Mac, readable in any editor.

Installing it takes one confirmation. There is nothing to configure, no service to run and
no account to make. It never uses the network.

## What it does

**Saves what you point at.** A “Save to memory” button appears when you select text, on a
clipboard entry, and on a screenshot in Quick Access. Text becomes a note. A screenshot is
copied into the folder with the words in it written out beside it, so you can find the
picture by what it says. A Shortcut on your phone writes into the same folder, which is why
the folder starts inside iCloud Drive.

Nothing else is recorded. What you asked @@ and what came back belongs to History, and a
memory is only ever something you decided to keep.

**Brings notes back.** Before a question goes out, Memory looks through your folder and
attaches up to five notes that fit. Each one shows up as a pill you can delete before you
send. If there is nothing relevant, nothing is attached and your question goes out as usual.

**Brings over what another assistant remembers.** Claude Code, Codex and the rest have been
keeping notes about you for as long as you have used them. The Memory tab has one button for
that; see below.

**Gives you a place to look.** The Memory tab in Settings lists every memory — where it came
from, its title, how it starts, and when. Open one to read it, ask @@ about it, or forget it.

## Where your notes live

One folder, chosen once. Memory creates it in the Shortcuts folder in iCloud Drive when you
install it (`iCloud Drive/Shortcuts/AtAt Memory/`, or `~/Documents/AtAt/Memory/` if iCloud
Drive is off), and you can move it later in Settings → Extensions → Memory.

```
<memory folder>/
  inbox/     one file per memory, whoever saved it
  assets/    images a note points at
```

Every note is front matter plus markdown:

```markdown
---
title: Why the deploy failed on Friday
date: 2026-08-24T01:15:00+08:00
source: selection
app: com.apple.Safari
---
The release job ran against the old worker binding…
```

`source` says where it came from — `selection`, `clipboard`, `capture`, `phone`, or the
assistant it was brought over from. Put the folder in iCloud Drive and the same notes follow
you to your other Macs.

## Bringing memories from another assistant

In the Memory tab, **Bring memories from another assistant** lists the ones that have
memories on this Mac and how many. Pick one and it reads them, rewrites each as a note in
`inbox/`, and dates it the day the memory was made — so it lands in your list where it
belongs rather than at the top. Press it again whenever you like: it brings only what is new,
replaces anything that changed, and never brings back something you forgot.

It reads these folders, and nothing else:

| Assistant | Folder |
|---|---|
| Claude Code | `~/.claude/projects/*/memory` |
| Codex | `~/.codex/memories` |
| Hermes | `~/.hermes/memories`, `~/.hermes/profiles/*/memories` |
| OpenClaw | `~/.openclaw/workspace` |
| Gemini CLI | `~/.gemini/tmp/*/memory` |
| Qwen Code | `~/.qwen/memories`, `~/.qwen/projects/*/memory` |
| Trae | `~/.trae/memory`, `~/.trae-cn/memory` |
| Goose | `~/.config/goose/memory` |

Read-only, and only after you agree to it at install. Nothing is written back to the other
assistant, nothing is synchronised, and nothing runs unless you press the button.

Rules files — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the like — are instructions for an
agent rather than facts about you, so they stay where they are. Neither do notes tied to one
repository's progress, or an assistant's own copy of memories imported from somewhere else.

## Settings

- **Memory folder** — where the notes are kept.

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
