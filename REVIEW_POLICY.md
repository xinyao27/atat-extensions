# Review policy

What a pull request to this repository carries, what a reviewer checks, and what is
deliberately left out. It is the contract the authoring skill's step 8 points at: smaller
than Raycast's review policy, because an extension here is a manifest, a bundle, a README
and an icon — and the repository owns the toolchain, not the author.

## Every submission carries

- `extension.json` — with `entitlements`, `networkHosts`, `reads`, options, hooks and action
  surfaces exactly the ones the code uses. Zero entitlements is the strong position.
- `src/` and one smoke scenario per hook and action.
- `store.json` — one category, 1–12 lowercase keywords, and release notes for this version
  in English and Simplified Chinese.
- `README.md` — what the extension does and what it touches.
- `icon.png` — a 256×256 PNG, at most 128 KB.
- A pull request description that names every outbound request, destructive operation and
  new dependency, and says why each one is needed.

`pnpm verify` and `pnpm smoke <identifier>` pass on the branch — the same gate CI runs.

## Nothing a submission carries

- `main.js` or a built archive: CI builds from source and publishes the Store release.
- A lint, format or editor configuration of the author's own, or hunks that only reformat
  code. Code standards belong to the repository — VitePlus for format and lint,
  `pnpm typecheck` for types — not to a submission.
- Analytics, a bundled or downloaded binary, or a wrapper that asks the user to install
  something else. An extension computes over what the host hands it.

## Suggested, never required

Screenshots of the extension in use, more than one scenario per action, a longer README.
A submission is complete without them.

## What the listing shows

| The submission | Where the user meets it |
|---|---|
| icon, name, one-line description | the store row and the listing header |
| `author` | the listing's "by …" line |
| action titles and surfaces, hooks, entitlements, `reads` | the listing's "Affects" section — the same sentences the install dialog uses |
| `README.md` | the listing's "About" section |
| category and keywords | the store's filter and search |
| release notes | the update prompt |

## What sends a submission back

- Value the app, another extension or the user's own agent already covers. An extension
  earns its place by doing something an agent cannot do exactly, or something the app does
  not do locally.
- Declarations that promise more than the code uses, or code that reaches past its
  declarations.
- Copy that reads like a machine wrote it, in either language.

## Keeping the extension alive

The author keeps their extension working and answers issues. An extension that breaks and
is abandoned may be fixed by a maintainer without the author; a `@@` extension is the
repository's own and is maintained here.
