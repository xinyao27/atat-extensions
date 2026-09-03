---
name: atat-plugin
description: Write an AtAt plugin in this repository — pick its extension points, scaffold it, implement it, build, smoke-test, install and open a pull request. Use when asked to write or create an AtAt plugin, to add an action, hook, view or panel to an existing one, or to debug a plugin that fails or gets paused inside AtAt.
---

# Writing an AtAt plugin

AtAt collects context on a Mac — a text selection, a clipboard entry, a screen capture — turns
each piece into a **pill**, assembles the pills into a prompt, and sends it to whichever coding
agent the user already pays for. A plugin taps that pipeline at one of its stations: it can
transform what is collected, put a button on a **surface**, contribute context to a request, or
read the answer afterwards.

The runtime is JavaScriptCore with zero capability by default. A plugin is one manifest plus one
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
| a button while capturing | action, `surfaces: ["captureBar"]` (declared here, not yet honoured by the current AtAt build — pick a shipped surface unless the user is targeting a future release) |
| "…and put the result back where I was typing" | `after: "paste"` |
| "…and copy it" / "…just show it" | `after: "copy"` / `after: "show"` |
| "…and let me keep talking to the agent about it" | `after: "composer"` |
| "open <site> with whatever I selected" | action with a `url` template — no code at all |
| "show me a card right there" | a `views` entry + the action's `presentation: { type: "selectionPopover" }` (declared here, not yet honoured by the current AtAt build — pick a shipped surface unless the user is targeting a future release) |
| "let me browse or clean up what it saved" | a `views` entry + a `panels` entry (one Settings tab per plugin) |
| the user picks where files go | `folder` option, plus `defaultPath` so it works on install |
| the user supplies an API key or token | `secret` option |
| "use AI to …" | `ctx.agent.ask` and the `agent` entitlement |
| "call <service>" | `ctx.fetch`, the `network` entitlement, and exact `networkHosts` |
| "open a URL" / "run my Shortcut" | the `automation` entitlement |
| remember a few kilobytes between runs | `ctx.storage` — no entitlement |
| keep the user's own documents | a `folder` option and `ctx.files` — no entitlement |

Zero entitlements is the default and the strong position: `memory`, the largest plugin here,
declares none. Reach for one only when the request cannot be served without it, and expect to
justify it in review.

One constraint reshapes designs at this step rather than later: `networkHosts` is a list of
exact hostnames fixed in the manifest, with no wildcards, so a plugin can call hosts that are
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

The identifier is the directory name *and* the plugin's id *and* the manifest's `identifier`
field: lowercase letters, digits and hyphens. Name it after what the user gets — `clean-links`,
`save-capture` — rather than after the mechanism.

**Done when** `pnpm validate <identifier>` passes on the untouched scaffold.

## Step 3 — Write the manifest

`plugin.json` is what the user agrees to at install and what a reviewer reads first.
`scripts/validate.mjs` enforces every field rule and runs in CI — it is the authority on the
schema. What it cannot tell you:

- **`name` and `description` carry `en` and `zh-hans`.** Write each language natively instead of
  translating one into the other. The description is one plain sentence about what the user
  gets, in their words; a reviewer checks it against the code.
- **The plugin works the moment it is installed.** Every option either has a `defaultValue` or
  leaves the plugin gracefully doing nothing when it is empty. `folder` and `secret` take no
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
- **Options are few or the design is wrong.** Each one answers a question a real user has ("I
  want it somewhere else", "I don't want to be recorded"). There is no grouping heading, because
  a list long enough to need grouping is the problem. `extensions/memory/plugin.json` ships two
  options for a plugin with four extension points.

**Done when** `pnpm validate <identifier>` passes and every declaration traces back to your
step 1 list.

## Step 4 — Implement `src/`

```ts
import { definePlugin } from "@atat/api";
import type { PluginAction, PluginHooks } from "@atat/api";

export default definePlugin({ hooks, actions, views });
```

`@atat/api` is the only module a plugin imports; a view additionally gets JSX, with `react`
supplied by the host. Every exact shape is in `types/atat-plugin.d.ts` (hook inputs and results,
`ActionInput`, `HostContext`) and `types/atat-ui.d.ts` (view components, and the same host
capabilities as named imports). Read them rather than guessing — they are short and they are the
contract.

Then the rules that bite:

- **A hook swallows its own failures.** No match, an index still building, a file that moved, a
  grant that has gone: catch it, `ctx.log()` a metadata-only line, return nothing. Three
  consecutive throws and AtAt pauses the plugin, so a temporary condition raised as an error
  costs the user the whole feature. `extensions/memory/src/recall.ts` is the worked example.
- **Budgets are shared with every other plugin on the same hook.** Per plugin: `clipboardIngest`
  1s, `contextAssembled` 1.5s, `capture` 5s, `response` 10s. For every plugin on one hook
  together: 2s, 3s and 8s respectively, `response` being fire and forget with no total. When the
  budget runs out the pipeline moves on without you. Spend it on one search and a handful of
  reads, not on a crawl. Actions are user-initiated and have no timeout.
- **What the user should be able to delete travels as a pill.** `addItems` entries each become a
  visible pill: a `label`, and exactly one of `text` and `filePaths` (both or neither and the
  host drops the item). `promptSections` is scaffolding addressed to the agent — at most 4 per
  call, 16,000 characters together, name matching `[a-z0-9-]{1,32}` — so it wraps content the
  pills already show rather than carrying content of its own.
- **File paths stay inside a grant.** `filePaths` on an item, and anything `ctx.files` touches,
  must be a path this call was handed, a path in the plugin's own data directory (a relative
  path), or a path inside a folder the user granted. `list`, `remove` and `search` accept only
  the last. Anything else is refused, and an out-of-grant item counts as a hook failure.
- **`files.search` is how a plugin searches its folder.** The host maintains the index; a
  sandbox cannot build one and reading a folder to grep it will not fit in the budget.
- **Every user-visible string is localized off `ctx.locale`** (`environment.locale` in a view).
  English and Simplified Chinese, each written natively. `extensions/memory/src/text.ts` is the
  pattern: one strings table, one lookup. Text addressed to the *agent* stays in English.
- **Nothing survives a call.** Each hook and action call gets a fresh JavaScriptCore context, so
  module-level state is gone by the next one. `ctx.storage` holds settings and small indexes up
  to the host's per-plugin storage budget — `set` rejects past it, and the host says so in its
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
never appear in a panel — a plugin cannot draw a trustworthy password field, so those stay in
the host's own option panel.

**Done when** `pnpm typecheck` is clean and every hook, action and view named in `plugin.json`
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
mkdir -p ~/Library/Application\ Support/AtAt/Plugins/<identifier>
cp extensions/<identifier>/plugin.json \
   extensions/<identifier>/main.js \
   extensions/<identifier>/README.md \
   ~/Library/Application\ Support/AtAt/Plugins/<identifier>/
```

AtAt watches that directory and picks the plugin up without a restart: copy the files again after
a rebuild and the change is live. That is the whole development loop.

What the user does next, in AtAt: **Settings → Plugins** lists one row — icon, name, the one-line
description, an Enabled toggle — with the manifest's options underneath it. Switching that toggle
on for the first time raises the confirmation dialog: because the plugin carries code, AtAt lists
in plain language the hooks it will run, the surfaces it appears on, the entitlements it wants,
and any folder it will create. Accepting the dialog is the grant. If a folder option has no
`defaultPath`, the user chooses the directory on that same row before anything can be written.

Watch what it does — and write `/usr/bin/log`, because plain `log` is a zsh builtin that exits
silently with no output:

```sh
/usr/bin/log stream --predicate 'subsystem == "com.atat.app" AND category BEGINSWITH "plugin"' --info
```

Then trigger the scenario by hand: copy the link, select the text, take the capture.

When a plugin misbehaves, the shape of the symptom names the cause:

- **The row says it was paused** — three consecutive hook failures. The log stream names the hook
  and the error; encode that input as a smoke scenario and it will throw there too.
- **The button never appears** — `requirements` did not match the content, or the action declares
  a different surface than the one being looked at.
- **An item never became a pill** — it carried both `text` and `filePaths`, or neither, or a path
  outside every grant.
- **Nothing is logged at all** — the plugin is disabled, the manifest never declared that hook,
  or `log` resolved to the zsh builtin.

**Done when** the plugin's own log line for the request's scenario appears in the stream, and
what the user sees in AtAt is what the request asked for.

## Step 8 — Store metadata, README, and the review checklist

`store.json` carries the Store listing: one `category` from the set `scripts/validate.mjs`
allows, 1–12 lowercase keywords, and `releaseNotes` in both languages describing *this* version.
`README.md` says what the plugin does and what it touches — a plugin is a manifest, a bundle and
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
      `.github/workflows/publish.yml`, which builds and publishes the artifact after approval

**Done when** every box is checked and `pnpm verify` is clean on the branch.

## Reference: which plugin demonstrates what

| To see | Read |
|---|---|
| the smallest possible action | `extensions/capture-text/src/index.ts` |
| one action on two surfaces, `after: "paste"`, the `agent` entitlement | `extensions/rewrite-text/` |
| a background hook that transforms clipboard content | `extensions/clean-links/` |
| a `folder` option and copying a file into it | `extensions/save-capture/` |
| a view rendered as a selection popover (not yet honoured — see gotchas) | `extensions/dictionary/src/index.tsx` |
| hooks, an action on three surfaces, a view, a panel, options with `defaultPath` — and zero entitlements | `extensions/memory/` |
| a hook that swallows its own failures, inside a budget | `extensions/memory/src/recall.ts` |
| UTF-8 base64, front matter, path joins | `extensions/memory/src/notes.ts` |
| localized user-visible strings | `extensions/memory/src/text.ts` |
| a panel: search, list, preview, confirmed delete | `extensions/memory/src/panel.tsx` |
| smoke scenarios | `extensions/memory/smoke/` |

## Reference: gotchas

- The shipped AtAt build honours three action surfaces — `selectionBar`, `clipboardHistory` and
  `captureQuickAccess` — and renders a view only as a Settings panel. `captureBar` and
  `presentation: { type: "selectionPopover" }` pass this repository's validator and types, and
  `capture-text` and `dictionary` declare them, but the current build ignores them. Pick a
  shipped surface unless the user is targeting a future release.
- The identifier appears three times — directory name, `plugin.json`'s `identifier`, and the
  install directory. Renaming means all three, and `pnpm validate` fails until they agree.
- `captureBar` is a button offered while capturing; `captureQuickAccess` is a button on the
  finished file. They are different surfaces and a plugin usually wants one of them.
- `after: "paste"` degrades to a copy plus a toast when the selection snapshot has expired.
  `ctx.paste` works only inside an action, only with a live selection.
- Several plugins on one hook run in install order, and a transforming hook's output is the next
  plugin's input. Return `{ action: "ignore" }` from `clipboardIngest` and the entry is dropped
  and the rest of the chain skipped.
- `ctx.clipboard.copy` is registered with the host first, so a plugin's own write never
  re-triggers its own `clipboardIngest`.
- Sensitive clipboard types and secure-input selections are filtered by AtAt before any hook
  runs. A plugin never sees them and needs no guard of its own.
- `capture` transforms by writing the new file to `input.outputPath` and returning
  `{ action: "replace" }`; the original is left alone otherwise.
- `ctx.ocr` accepts only a path this call was handed.
- `networkHosts` is fixed when the plugin is built and takes no wildcards, so a per-user host
  cannot be reached at all. `https` everywhere, plus plain `http` to `127.0.0.1` and `localhost`
  for a service the user runs themselves.
- `ctx.agent.ask` borrows the user's own configured agent — hosted or CLI, no key of the
  plugin's own — carries none of the request's context items, and is limited to 10 calls a
  minute per plugin.
- The runtime is ES2023 plus `setTimeout`, `sleep`, `URL`, `URLSearchParams`, `TextEncoder`,
  `TextDecoder`, `atob`, `btoa`, `structuredClone` and `console`. There is no `fs`, `process`,
  `require`, `XMLHttpRequest` or DOM; `tsconfig.json` sets `lib: ["ES2022"]` so the type checker
  refuses to promise otherwise.
- `pnpm validate` refuses `eval`, `new Function`, dynamic `import()` and `WebAssembly` anywhere
  in a plugin's source. A plugin computes over data it was given.
- Calls that need an entitlement the manifest never declared reject at call time with a message
  naming it — they do not fail at import, so a missing entitlement looks like a runtime error in
  one code path rather than a broken plugin.
