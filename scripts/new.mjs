// Scaffolds one extension directory: `pnpm new <identifier>`.
//
// The scaffold is the smallest thing `pnpm validate` already accepts — a manifest with no
// hooks, no actions and no entitlements, and an entry point that exports an empty definition.
// Everything a extension does is added on purpose from there, which is the point: zero
// entitlements is where every extension starts, and the scaffold should not hand out capability
// an author did not ask for.

import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS = join(ROOT, "extensions");
/// The same expression `scripts/validate.mjs` enforces, so a refusal here is a refusal there.
const IDENTIFIER = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function titleCase(identifier) {
  return identifier
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const identifier = process.argv[2];
if (!identifier || identifier === "--help") {
  process.stdout.write(
    [
      "usage: pnpm new <identifier>",
      "",
      "Creates extensions/<identifier>/ with a valid manifest, Store metadata, an entry",
      "point and a README. The identifier is the directory name and the extension's id:",
      "lowercase letters, digits and hyphens, 1–64 characters.",
      "",
      "Then follow skills/atat-extension/SKILL.md from step 3.",
      "",
    ].join("\n")
  );
  process.exit(identifier ? 0 : 1);
}

if (!IDENTIFIER.test(identifier)) {
  fail(
    `"${identifier}" is not a valid identifier: lowercase letters, digits and hyphens, ` +
      "starting and ending with a letter or digit, at most 64 characters."
  );
}

const directory = join(EXTENSIONS, identifier);
if (await exists(directory)) {
  fail(`extensions/${identifier}/ already exists. Pick another identifier or edit that one.`);
}

const title = titleCase(identifier);

const manifest = {
  identifier,
  name: { en: title, "zh-hans": title },
  description: {
    en: "One sentence about what this extension does, in the words a user would use.",
    "zh-hans": "一句话说明这个插件做什么，用用户自己的说法。",
  },
  version: "1.0.0",
  apiVersion: 1,
  minimumAppVersion: "0.10.0",
  author: "@@",
};

const storeMetadata = {
  category: "utilities",
  keywords: [identifier.slice(0, 32)],
  releaseNotes: { en: "Initial release.", "zh-hans": "首个版本。" },
};

const entryPoint = `import { definePlugin } from "@atat/api";
import type { PluginAction, PluginHooks } from "@atat/api";

/** One member per hook declared in plugin.json. */
const hooks: PluginHooks = {};

/** One member per action declared in plugin.json that is not a URL template. */
const actions: Record<string, PluginAction> = {};

export default definePlugin({ hooks, actions });
`;

const readme = `# ${title}

One sentence about what this extension does, in the words a user would use.

## What it does

What the user sees: each action and where it appears, each hook and when it runs.

## What it touches

The folder it reads or writes, the hosts it calls, and why each declared entitlement is
needed. A extension with no entitlements says so — that is the interesting fact about it.
`;

await mkdir(join(directory, "src"), { recursive: true });
await writeFile(join(directory, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(directory, "store.json"), `${JSON.stringify(storeMetadata, null, 2)}\n`);
await writeFile(join(directory, "src", "index.ts"), entryPoint);
await writeFile(join(directory, "README.md"), readme);

process.stdout.write(
  [
    `Created extensions/${identifier}/`,
    "  plugin.json   manifest — declare hooks, actions, options and views here",
    "  store.json    Store category, keywords and release notes",
    "  src/index.ts  the entry point, one member per declaration",
    "  README.md     what it does and what it touches",
    "",
    "Next:",
    `  1. plugin.json — name, description (en + zh-hans), and the declarations`,
    `  2. src/index.ts — a same-named member for each declaration`,
    `  3. pnpm validate ${identifier} && pnpm typecheck && pnpm build ${identifier}`,
    `  4. extensions/${identifier}/smoke/<name>.json, then pnpm smoke ${identifier}`,
    "",
    "skills/atat-extension/SKILL.md carries the rules for each of those steps.",
    "",
  ].join("\n")
);
