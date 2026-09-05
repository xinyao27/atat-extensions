# AtAt Extensions

The official directory of AtAt plugins — and the Store the app's Plugins pane reads from.
Maintained the way Raycast maintains its extensions: one monorepo, one directory per plugin,
contributions by pull request.

## Layout

```
extensions/
  <identifier>/          # one plugin per directory, named by its identifier
    plugin.json          # manifest (required)
    store.json           # category, keywords, and release notes
    src/                 # TypeScript / TSX sources
    main.js              # build output; ignored and removed after verification
    icon.png             # 256×256 (optional)
    README.md
    smoke/               # fake-host scenarios, run by `pnpm smoke <identifier>`
scripts/build.mjs        # the builder, `atat plugin build` in prototype form
scripts/new.mjs          # `pnpm new <identifier>` scaffold
scripts/smoke.mjs        # `pnpm smoke <identifier>` fake host
scripts/package.mjs      # `pnpm package`: deterministic .atatpluginz archives + catalog.json
skills/atat-plugin/      # the authoring skill every coding agent reads first
types/                   # temporary @atat/api declaration mirror until its first npm release
```

## Building

```sh
pnpm install
pnpm new <identifier>    # scaffold a new extension directory
pnpm build               # every extension, or `pnpm build <identifier>` for one
pnpm typecheck
pnpm smoke <identifier>  # run that extension's smoke scenarios against a fake host
pnpm verify              # policy, types, deterministic bundles, and export parity
pnpm package             # what the release publishes, under dist/artifacts
```

`main.js` is always rebuilt from reviewed source; pull requests never supply a bundle.

## The Store

Every push to `main` runs `pnpm package` and publishes the result to one rolling GitHub
Release tagged **`store`**: a `catalog.json` naming every plugin, and one
`<identifier>-<version>.atatpluginz` per plugin. AtAt's Settings → Plugins pane reads that
catalog, shows what is available, and installs an archive by downloading it and checking its
SHA-256 against the catalog. Everything is free; there is no server behind it but GitHub.

Local plugins — a folder dropped into the Plugins pane — stay unreviewed and are never
updated automatically.

## Plugins

- `memory`: context recall over the host's folder search, response recording, three action
  surfaces, and a native management panel — with no entitlements at all.
- `bob-translate`: one action that hands selected text to Bob through AppleScript; the
  smallest plugin here, and the one that shows `requiresApp` and the `automation` entitlement.

Every plugin imports only `@atat/api`. The checked-in `types/` directory is a temporary
declaration bridge until the package is published; after publication CI installs the pinned
public package and this bridge goes in the same change.

## Plugin format

A plugin is a directory with a `plugin.json` manifest and an optional single-file JavaScript
bundle. Capabilities are gated by entitlements (`network`, `secrets`, `automation`, `agent`)
declared in the manifest and confirmed by the user at install — and confirmed again when a
plugin grows. Panels are React + JSX against `@atat/api`, built by `scripts/build.mjs`
(rolldown; `react` and `@atat/api` are provided by the host), and rendered natively from a
fixed vocabulary of components.

The format specification lives in the AtAt repository at
`docs/internal/features/plugin-system.md` until a public developer guide ships.

## Contributing

Start from [`skills/atat-plugin/SKILL.md`](skills/atat-plugin/SKILL.md): it takes a request for
a plugin through extension points, scaffold, implementation, build, smoke test, local install
and the review checklist, and any coding agent can follow it end to end.
