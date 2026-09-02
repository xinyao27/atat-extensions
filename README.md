# AtAt Extensions

The official directory of AtAt plugins, maintained the way Raycast maintains its
extensions: one monorepo, one directory per plugin, contributions by pull request.

## Layout

```
extensions/
  <identifier>/          # one plugin per directory, named by its identifier
    plugin.json          # manifest (required)
    store.json           # reviewed category, keywords, and per-version release notes
    src/                 # TypeScript / TSX sources
    main.js              # temporary build output; ignored and removed after verification
    icon.png             # 256×256 (optional)
    README.md
scripts/build.mjs        # the builder, `atat plugin build` in prototype form
types/                   # temporary @atat/api declaration mirror until its first npm release
```

## Building

```sh
pnpm install
pnpm build               # every extension, or `pnpm build <identifier>` for one
pnpm typecheck
pnpm verify              # policy, types, deterministic bundles, and export parity
pnpm package             # deterministic Store review archives under dist/artifacts
```

`main.js` is always rebuilt from reviewed source. Pull requests never supply the Store bundle;
the protected release job creates the immutable `.atatpluginz` artifact after approval. A
plugin is its manifest, its bundle and its documentation — nothing in a package is ever a
script a user is asked to run.

## Acceptance plugins

- `dictionary`: controlled Selection Popover UI.
- `rewrite-text`: one agent action shared by Selection and Clipboard History.
- `capture-text`: OCR from the Capture Bar into Composer.
- `save-capture`: Quick Access destination using an explicitly granted folder.
- `clean-links`: background clipboard tracking-link cleanup.
- `memory`: context recall over the host's folder search, response recording, three action
  surfaces, and a native management View — with no entitlements at all.

Every plugin imports only `@atat/api`. The checked-in `types/` directory is a temporary
declaration bridge for the capabilities used here until version 0.1.0 is published; after
publication CI must install the pinned public package and remove that bridge in the same change.

## Plugin format

A plugin is a directory with a `plugin.json` manifest and an optional single-file
JavaScript bundle. Capabilities are gated by entitlements (`network`, `secrets`,
`automation`, `agent`) declared in the manifest and confirmed by the user on first use.
Plugin Views are written in React + JSX against `@atat/api` and built by
`scripts/build.mjs` (rolldown; `react` and `@atat/api` are provided by the host at runtime).
Views compose host-owned native primitives; they cannot inject HTML/CSS, SwiftUI/AppKit, or
create their own windows.

The format specification lives in the AtAt repository at
`docs/internal/features/plugin-system.md` until a public developer guide ships.

## Status

All Store plugins are free. Every version enters through a pull request, passes deterministic
build and policy checks, receives human review, and is published only by the protected release
workflow. Local plugins remain unreviewed and are never automatically updated.
