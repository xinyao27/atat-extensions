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
    README.md
```

## Plugin format

A plugin is a directory with a `plugin.json` manifest and an optional single-file
JavaScript bundle. Capabilities are gated by entitlements (`network`, `secrets`,
`automation`, `agent`) declared in the manifest and confirmed by the user at
install time. Panels (plugin UI shown as a tab in AtAt's Settings) are written in
React + JSX against `@atat/ui` and built with `atat plugin build` (rolldown;
`react` and `@atat/ui` are provided by the host at runtime).

The format specification lives in the AtAt repository at
`docs/internal/features/plugin-system.md` until a public developer guide ships.

## Status

Private while the plugin system is in dark launch. Do not depend on anything in
here yet — manifests and APIs may change without notice.
