# AtAt Extensions

The official directory of AtAt plugins, maintained the way Raycast maintains its
extensions: one monorepo, one directory per plugin, contributions by pull request.

## Layout

```
extensions/
  <identifier>/          # one plugin per directory, named by its identifier
    plugin.json          # manifest (required)
    src/                 # TypeScript / TSX sources
    main.js              # built single-file bundle (committed until CI builds)
    icon.png             # 256×256 (optional)
    setup/               # anything the plugin needs on the user's machine (optional)
    README.md
scripts/build.mjs        # the builder, `atat plugin build` in prototype form
types/                   # @atat/ui and @atat/plugin-types, until they ship on npm
```

## Building

```sh
pnpm install
pnpm build               # every extension, or `pnpm build <identifier>` for one
pnpm typecheck
```

`main.js` is committed alongside its sources, so a plugin directory can be copied into
`~/Library/Application Support/AtAt/Plugins/` exactly as it stands.

## Plugin format

A plugin is a directory with a `plugin.json` manifest and an optional single-file
JavaScript bundle. Capabilities are gated by entitlements (`network`, `secrets`,
`automation`, `agent`) declared in the manifest and confirmed by the user at
install time. Panels (plugin UI shown as a tab in AtAt's Settings) are written in
React + JSX against `@atat/ui` and built by `scripts/build.mjs` (rolldown; `react` and
`@atat/ui` are provided by the host at runtime).

The format specification lives in the AtAt repository at
`docs/internal/features/plugin-system.md` until a public developer guide ships.

## Status

Private while the plugin system is in dark launch. Do not depend on anything in
here yet — manifests and APIs may change without notice.
