---
name: atat-extension
description: Write an AtAt extension in this repository — pick its extension points, scaffold it, implement it, build, smoke-test, install and open a pull request. Use when asked to write or create an AtAt extension, to add an action, hook, view or panel to an existing one, or to debug a extension that fails or gets paused inside AtAt.
---

# Writing an AtAt extension

AtAt collects context on a Mac — a text selection, a clipboard entry, a screen capture — turns
each piece into a **pill**, assembles the pills into a prompt, and sends it to whichever coding
agent the user already pays for. A extension taps that pipeline at one of its stations: it can
transform what is collected, put a button on a **surface**, contribute context to a request, or
read the answer afterwards.

The runtime is JavaScriptCore with zero capability by default. A extension is one manifest plus one
bundled JavaScript file that imports exactly one module, `@atat/api`. Everything it can do
beyond computing arrives in the `HostContext` it is handed, and the powerful parts of that
context are gated by **entitlements** the user confirms once, at install.

Run `pnpm install` once before the steps below. Work through them in order.

## Step 1 — Turn the request into extension points

Read the request for what the *user* does and when, then name the smallest set of declarations
that serves it. Two questions decide almost everything: **when does this run** (an event the
host already has, or a button the user presses?) and **what does the user get back**.

| The request says | Declare |
|---|---|
| "when I copy X, clean it up / expand it / retitle it" | `clipboardIngest` hook |
| "when I take a screenshot, do X to it first" | `capture` hook |
| "every time I ask AtAt something, bring in X" | `contextAssembled` hook |
| "after AtAt answers, record / send / count X" | `response` hook (fire and forget) |
| a button on selected text | action, `surfaces: ["selectionBar"]` |
| a button on a clipboard history entry | action, `surfaces: ["clipboardHistory"]` |
| a button on the finished capture | action, `surfaces: ["captureQuickAccess"]` |
| "…and put the result back where I was typing" | `after: "paste"` |
| "…and copy it" / "…just show it" | `after: "copy"` / `after: "show"` |
| "…and let me keep talking to the agent about it" | `after: "composer"` |
| "open <site> with whatever I selected" | action with a `url` template — no code at all |
| "let me browse or clean up what it saved" | a `views` entry + a `panels` entry (one Settings tab per extension) |
| the user picks where files go | `folder` option, plus `defaultPath` so it works on install |
| the user supplies an API key or token | `secret` option |
| "use AI to …" | `ctx.agent.ask` and the `agent` entitlement |
| "call <service>" | `ctx.fetch`, the `network` entitlement, and exact `networkHosts` |
| "open a URL" / "run my Shortcut" / "run this AppleScript" | the `automation` entitlement — `ctx.openUrl`, `ctx.runShortcut`, `ctx.runAppleScript` |
| "save it to my Favorites" | `ctx.favorites.add` — no entitlement |
| "use AI with my <skill>" | `ctx.agent.ask(prompt, { skill })` and the `agent` entitlement |
| "it drives <app>" (Bob, Things, …) | the action's `requiresApp` — the button greys out with the reason while the app is missing |
| remember a few kilobytes between runs | `ctx.storage` — no entitlement |
| keep the user's own documents | a `folder` option and `ctx.files` — no entitlement |

Zero entitlements is the default and the strong position: `memory`, the largest extension here,
declares none. Reach for one only when the request cannot be served without it, and expect to
justify it in review.

One constraint reshapes designs at this step rather than later: `networkHosts` is a list of
exact hostnames fixed in the manifest, with no wildcards, so a extension can call hosts that are
the same for everyone (an API's own domain, `127.0.0.1` for a service the user runs) and cannot
call a host each user configures for themselves — their own Jira site, their own server. When a
request implies one of those, say so and pick the design that works without it.

**Done when** you can list every declaration the manifest will carry — each hook, each action
with its surfaces and `after` route, each option with its default, each view — and point at the
words in the request that force each one.

## Step 2 — Scaffold

```sh
pnpm new <identifier>
```

The identifier is the directory name *and* the extension's id *and* the manifest's `identifier`
field: lowercase letters, digits and hyphens. Name it after what the user gets — `clean-links`,
`save-capture` — rather than after the mechanism.

**Done when** `pnpm validate <identifier>` passes on the untouched scaffold.

## Step 3 — Write the manifest

`extension.json` is what the user agrees to at install and what a reviewer reads first.
`scripts/validate.mjs` enforces every field rule and runs in CI — it is the authority on the
schema. What it cannot tell you:

- **`name` and `description` carry `en` and `zh-hans`.** Write each language natively instead of
  translating one into the other. The description is one plain sentence about what the user
  gets, in their words; a reviewer checks it against the code.
- **Every string a user sees reads like a person wrote it** — this covers the manifest, toasts,
  panel text and the README. Lead with what the user gets or should do and cut the mechanism
  (`Saved in your Keychain.`, not `Goes to your Keychain, never to a settings file.`). One
  short sentence; no clause chains ending in `so …`; no sentence opening with `It`. No
  implementation words in front of a user: hook, entitlement, manifest, runtime, host API.
  English in sentence case with contractions welcome, the register of macOS Settings.
  简体中文像系统设置的中文：短句、直说，引用用「」，避免「该/此/进行/相关」的公文腔，
  不为对齐英文硬塞从句。Read each string aloud as if it sat on an Apple settings screen;
  if it would not be there, rewrite it.
- **The extension works the moment it is installed.** Every option either has a `defaultValue` or
  leaves the extension gracefully doing nothing when it is empty. `folder` and `secret` take no
  `defaultValue`: a folder declares `defaultPath: "icloud"` (or `"documents"`) and the host
  creates and grants that directory as part of the install confirmation, and a `secret` is the
  one thing a user must supply by hand.
- **Anything key-shaped is `type: "secret"`.** Secrets live in the Keychain, never appear in
  `ctx.options`, and are read by name through `ctx.secrets.get`.
- **`requirements` runs before any JavaScript.** `contentTypes`, `regex`, `sourceApps`,
  `excludedApps` and `optionEquals` are evaluated natively, so a filtered-out event costs
  nothing and a button appears only where it makes sense. Push every cheap precondition here.
  The regex lives in JSON, so its backslashes are doubled, and its capture groups reach the code
  as `regexMatches` — derive the same values from the text as well, so the code still holds when
  it is handed something the filter let through.
- **`entitlements` and `networkHosts` are a pair.** Exact lowercase hostnames, each one the code
  actually calls. Anything aspirational is a review finding.
- **Every selection-bar action names an `icon`.** The bar is icon-only; the tooltip shows the
  action's title and the extension's name, but the glyph is what the user reads first. Use a name
  from the bar's own set — `note`, `bookmark`, `translate`, `search`, `copy`, `download`,
  `pin`, `star`, `tag`, `summarize`, `explain`, `link`, `globe`, `mail`, `code`, `image`… — and
  anything else falls back to the generic extension glyph. `pnpm validate` refuses a
  `selectionBar` action without one.
- **`requiresApp` names the app an action drives.** `{ name, bundleIdentifiers, website? }` on the
  action. With the app missing, AtAt greys the button and says "<name> isn't installed", the
  click says the same, and the extension's page links to the website. Without it the click would
  fail inside the script. `extensions/bob-translate/extension.json` is the example.
- **`minimumAppVersion` is the oldest AtAt the extension runs on.** Bump it when you use a host API
  that arrived in a newer build — `runAppleScript`, `favorites.add` and `agent.ask`'s `skill`
  arrived in 0.10.0 — so an older AtAt lists the extension with "needs @@ x.y or newer" instead of
  failing at the first call.
- **Options are few or the design is wrong.** Each one answers a question a real user has ("I
  want it somewhere else", "I don't want to be recorded"). There is no grouping heading, because
  a list long enough to need grouping is the problem. `extensions/memory/extension.json` ships two
  options for a extension with four extension points.

**Done when** `pnpm validate <identifier>` passes and every declaration traces back to your
step 1 list.

## Step 4 — Implement `src/`

```ts
import { defineExtension } from "@atat/api";
import type { ExtensionAction, ExtensionHooks } from "@atat/api";

export default defineExtension({ hooks, actions, views });
```

`@atat/api` is the only module a extension imports; a view additionally gets JSX, with `react`
supplied by the host. Every exact shape is in `types/atat-extension.d.ts` (hook inputs and results,
`ActionInput`, `HostContext`) and `types/atat-ui.d.ts` (view components, and the same host
capabilities as named imports). Read them rather than guessing — they are short and they are the
contract.

Then the rules that bite:

- **A hook swallows its own failures.** No match, an index still building, a file that moved, a
  grant that has gone: catch it, `ctx.log()` a metadata-only line, return nothing. Three
  consecutive throws and AtAt pauses the extension, so a temporary condition raised as an error
  costs the user the whole feature. `extensions/memory/src/recall.ts` is the worked example.
- **Budgets are shared with every other extension on the same hook.** Per extension: `clipboardIngest`
  1s, `contextAssembled` 1.5s, `capture` 5s, `response` 10s. For every extension on one hook
  together: 2s, 3s and 8s respectively, `response` being fire and forget with no total. When the
  budget runs out the pipeline moves on without you. Spend it on one search and a handful of
  reads, not on a crawl. Actions are user-initiated and have no timeout.
- **What the user should be able to delete travels as a pill.** `addItems` entries each become a
  visible pill: a `label`, and exactly one of `text` and `filePaths` (both or neither and the
  host drops the item). `promptSections` is scaffolding addressed to the agent — at most 4 per
  call, 16,000 characters together, name matching `[a-z0-9-]{1,32}` — so it wraps content the
  pills already show rather than carrying content of its own.
- **File paths stay inside a grant.** `filePaths` on an item, and anything `ctx.files` touches,
  must be a path this call was handed, a path in the extension's own data directory (a relative
  path), or a path inside a folder the user granted. `list`, `remove` and `search` accept only
  the last. Anything else is refused, and an out-of-grant item counts as a hook failure.
- **`files.search` is how a extension searches its folder.** The host maintains the index; a
  sandbox cannot build one and reading a folder to grep it will not fit in the budget.
- **Every user-visible string is localized off `ctx.locale`** (`environment.locale` in a view).
  English and Simplified Chinese, each written natively. `extensions/memory/src/text.ts` is the
  pattern: one strings table, one lookup. Text addressed to the *agent* stays in English.
- **Nothing survives a call.** Each hook and action call gets a fresh JavaScriptCore context, so
  module-level state is gone by the next one. `ctx.storage` holds settings and small indexes up
  to the host's per-extension storage budget — `set` rejects past it, and the host says so in its
  log line; a granted folder holds the user's data.
- **`files.read` and `files.write` carry base64**, and `btoa` is Latin-1 only — it throws on
  Chinese text. Encode UTF-8 by hand; `extensions/memory/src/notes.ts` has both directions.

A view is a React component rendered natively by the host from the whitelist in
`types/atat-ui.d.ts` — no HTML, no CSS, no window of its own, and an unknown component is a
render error. A panel session lives as long as its Settings tab is open — the host kills a
session that stops making progress, and names it in its log line — React state dies with it, and
anything that must persist goes through `storage` or `files`. A panel is where a user *uses*
the feature, not a second settings page: the manifest's options are already rendered natively
above it. Credential and folder input
never appear in a panel — a extension cannot draw a trustworthy password field, so those stay in
the host's own option panel.

**Done when** `pnpm typecheck` is clean and every hook, action and view named in `extension.json`
has a same-named member in the default export.

## Step 5 — Build and verify

```sh
pnpm build <identifier>
pnpm verify
```

`pnpm verify` is validation, type checking, a double build that must be byte-identical, and a
check that the bundle really exports what the manifest declares — the same gate CI runs.
`main.js` is generated from `src/`: it is gitignored, `pnpm verify` deletes it when it finishes,
and it is never edited by hand.

**Done when** `pnpm verify` prints `Verified <identifier>` and exits 0.

## Step 6 — Smoke-test the request's own scenario

```sh
pnpm smoke <identifier>
```

This runs every `extensions/<identifier>/smoke/*.json` against a fake host: an in-memory
`storage`, a temporary directory as the granted folder, canned `files.search` hits, canned
`fetch` and `agent.ask` replies, and the real entitlement gates, grant boundaries, item shape and
section limits. A scenario is one hook or action call plus the world it happens in:

```json
{
  "description": "a copied Jira link is labelled with its issue key",
  "call": {
    "hook": "clipboardIngest",
    "input": { "text": "https://example.atlassian.net/browse/ENG-4211" }
  },
  "expect": { "result": { "action": "keep" }, "contains": ["ENG-4211"] }
}
```

`"result": null` is how a scenario says the call returned nothing — a hook's `void` crosses the
bridge as JSON null. `node scripts/smoke.mjs` prints the whole schema: seeded files, a granted
folder as `{folder}`, canned search hits, canned HTTP and agent replies, and every `expect` key.
`extensions/memory/smoke/` holds three worked scenarios covering two hooks and an action.

Write one scenario per declared hook and action, and make the first one the exact situation the
user described, with their input and their expected output.

**Done when** `pnpm smoke <identifier>` passes and the request's own scenario is among the ones
it ran.

## Step 7 — Install it locally and watch it run

```sh
pnpm build <identifier>
mkdir -p ~/Library/Application\ Support/AtAt/Extensions/<identifier>
cp extensions/<identifier>/extension.json \
   extensions/<identifier>/main.js \
   extensions/<identifier>/README.md \
   ~/Library/Application\ Support/AtAt/Extensions/<identifier>/
```

AtAt watches that directory and picks the extension up without a restart: copy the files again after
a rebuild and the change is live. That is the whole development loop.

Or skip the copy: **Settings → Extensions → Install…** takes the extension directory itself, and so
does dropping it onto that page.

What the user sees next, in AtAt: **Settings → Extensions** lists the extension under **Installed** —
name, the one-line description, an Enabled switch, Open — and the extension gets a page of its own
under Extensions in the sidebar, holding the manifest's options, any app it needs, Uninstall, and
its panel as the first segment when it declares one. The moment AtAt sees a extension that carries
code or an entitlement it raises the confirmation dialog, listing in plain language the hooks it
will run, the surfaces it appears on, the entitlements it wants, and any folder it will create.
Accepting the dialog is the grant — and a extension that later asks for more is asked again. If a
folder option has no `defaultPath`, the user chooses the directory on the extension's page before
anything can be written.

Watch what it does — and write `/usr/bin/log`, because plain `log` is a zsh builtin that exits
silently with no output:

```sh
/usr/bin/log stream --predicate 'subsystem == "com.atat.app" AND category BEGINSWITH "extension"' --info
```

Then trigger the scenario by hand: copy the link, select the text, take the capture.

When a extension misbehaves, the shape of the symptom names the cause:

- **The row says it was paused** — three consecutive hook failures. The log stream names the hook
  and the error; encode that input as a smoke scenario and it will throw there too.
- **The button never appears** — `requirements` did not match the content, or the action declares
  a different surface than the one being looked at.
- **An item never became a pill** — it carried both `text` and `filePaths`, or neither, or a path
  outside every grant.
- **Nothing is logged at all** — the extension is disabled, the manifest never declared that hook,
  or `log` resolved to the zsh builtin.

**Done when** the extension's own log line for the request's scenario appears in the stream, and
what the user sees in AtAt is what the request asked for.

## Step 8 — Store metadata, README, and the review checklist

`store.json` carries the Store listing: one `category` from the set `scripts/validate.mjs`
allows, 1–12 lowercase keywords, and `releaseNotes` in both languages describing *this* version.
`README.md` says what the extension does and what it touches — a extension is a manifest, a bundle and
its documentation, and a package never asks a user to run a script.

Before opening the pull request, check `REVIEW_POLICY.md` against the change:

- [ ] `identifier`, `version` and `apiVersion` are right, and the version is one nobody published
- [ ] `entitlements`, `networkHosts`, hooks, action surfaces, option requirements and view
      declarations are exactly what the code uses
- [ ] the English and the Simplified Chinese descriptions are both accurate about the behaviour
- [ ] outbound data, destructive operations and any new dependency are visible in the diff and
      explained in the pull request
- [ ] `pnpm verify` and `pnpm smoke <identifier>` pass
- [ ] the commit carries source only — no `main.js`, no archive; a maintainer dispatches
      `.github/workflows/release.yml`, which packages every extension on `main` and publishes the Store release

**Done when** every box is checked and `pnpm verify` is clean on the branch.

## Reference: which extension demonstrates what

| To see | Read |
|---|---|
| the smallest possible action, `requiresApp`, `runAppleScript` and the `automation` entitlement | `extensions/bob-translate/` |
| hooks, an action on three surfaces, a view, a panel, options with `defaultPath` — and zero entitlements | `extensions/memory/` |
| a hook that swallows its own failures, inside a budget | `extensions/memory/src/recall.ts` |
| UTF-8 base64, front matter, path joins | `extensions/memory/src/notes.ts` |
| localized user-visible strings | `extensions/memory/src/text.ts` |
| a panel: search, list, preview, confirmed delete | `extensions/memory/src/panel.tsx` |
| smoke scenarios | `extensions/memory/smoke/` |

## Reference: gotchas

- Three action surfaces exist — `selectionBar`, `clipboardHistory` and `captureQuickAccess` —
  and a view renders only as a Settings panel. There is no surface while capturing, on the
  agent's answer, or on a composer pill yet.
- The identifier appears three times — directory name, `extension.json`'s `identifier`, and the
  install directory. Renaming means all three, and `pnpm validate` fails until they agree.
- `after: "paste"` degrades to a copy plus a toast when the selection snapshot has expired.
  `ctx.paste` works only inside an action, only with a live selection.
- Several extensions on one hook run in install order, and a transforming hook's output is the next
  extension's input. Return `{ action: "ignore" }` from `clipboardIngest` and the entry is dropped
  and the rest of the chain skipped.
- `ctx.clipboard.copy` is registered with the host first, so a extension's own write never
  re-triggers its own `clipboardIngest`.
- Sensitive clipboard types and secure-input selections are filtered by AtAt before any hook
  runs. A extension never sees them and needs no guard of its own.
- `capture` transforms by writing the new file to `input.outputPath` and returning
  `{ action: "replace" }`; the original is left alone otherwise.
- `ctx.ocr` accepts only a path this call was handed.
- `networkHosts` is this directory's review rule — exact hostnames, no wildcards, each one the
  code calls — and `pnpm smoke` enforces it. The app itself enforces `https` everywhere, plus
  plain `http` to `127.0.0.1` and `localhost` for a service the user runs themselves.
- `ctx.runAppleScript(source, input?)` is the Text Selection AppleScript action reached from a
  extension: with `input` the host calls the script's `on atatSelection(selectedText)` handler, so
  the same script works in both places; without it the script runs top to bottom. Source is
  capped at 64 KB, the result comes back as text, and a script that never returns cannot be
  cancelled — keep it short and let the target app do the waiting.
- `ctx.favorites.add(text)` needs no entitlement; the Favorite is attributed to AtAt, not to
  the app the text came from.
- `ctx.agent.ask` borrows the user's own configured agent — hosted or CLI, no key of the
  extension's own — carries none of the request's context items, and is limited to 10 calls a
  minute per extension. `{ skill: "name" }` makes the agent follow one of the user's installed
  skills, expanded exactly as the selection bar's skill action expands it; a skill that is not
  installed rejects by name.
- The runtime is ES2023 plus `setTimeout`, `sleep`, `URL`, `URLSearchParams`, `TextEncoder`,
  `TextDecoder`, `atob`, `btoa`, `structuredClone` and `console`. There is no `fs`, `process`,
  `require`, `XMLHttpRequest` or DOM; `tsconfig.json` sets `lib: ["ES2022"]` so the type checker
  refuses to promise otherwise.
- `pnpm validate` refuses `eval`, `new Function`, dynamic `import()` and `WebAssembly` anywhere
  in a extension's source. A extension computes over data it was given.
- Calls that need an entitlement the manifest never declared reject at call time with a message
  naming it — they do not fail at import, so a missing entitlement looks like a runtime error in
  one code path rather than a broken extension.
