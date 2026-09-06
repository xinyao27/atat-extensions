// Builds every extension in `extensions/` into the single flat file AtAt evaluates.
//
// This is the prototype of `atat extension build`. The shape of the output is dictated by the
// runtime, not by taste: JavaScriptCore has no module loader, so a extension ships one CommonJS
// file that assigns to `exports`, and `react` / `@atat/api` stay external because the host
// vendors both and pins their versions.
//
// Products are generated and checked in CI. Store artifacts are never assembled from a
// contributor's prebuilt JavaScript.

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionsRoot = join(repositoryRoot, "extensions");

/// The two modules the host supplies, plus the JSX entry points that resolve to the first.
const EXTERNAL = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "@atat/api"];

/// Prepended to every bundle.
///
/// The `require` line is what lets one file carry both a extension's hooks and its panel. A
/// panel session has `require`, installed by the host's runtime blob before the bundle is
/// evaluated; a hook invocation does not, because a hook has no React and no `@atat/api`. A
/// bundle whose top-level `require("@atat/api")` threw would take every hook down with it, so
/// the call resolves to an empty object there instead and the panel half simply never runs.
const PREAMBLE = [
  "'use strict';",
  "var require = typeof require === 'function' ? require : function () { return {}; };",
  "",
].join("\n");

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function entryPoint(directory) {
  for (const candidate of ["src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js"]) {
    const path = join(directory, candidate);
    try {
      await stat(path);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

async function build(identifier) {
  const directory = join(extensionsRoot, identifier);
  const manifestPath = join(directory, "extension.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.identifier !== identifier) {
    throw new Error(
      `${identifier}/extension.json declares the identifier "${manifest.identifier}". ` +
        "A extension's directory name is its identifier."
    );
  }

  const input = await entryPoint(directory);
  if (!input) {
    process.stdout.write(`${identifier}: declarative only, nothing to build\n`);
    return;
  }

  const bundle = await rolldown({
    input,
    platform: "neutral",
    external: EXTERNAL,
    transform: {
      // The automatic runtime, so an author writes JSX without importing React by hand.
      // `react/jsx-runtime` is external like `react` itself, and the host's module table has
      // an entry for it.
      jsx: { runtime: "automatic", importSource: "react" },
    },
    resolve: { conditionNames: ["default", "require"] },
  });
  const { output } = await bundle.generate({
    format: "cjs",
    // Kept readable on purpose: a extension's bundle is the thing a user is asked to trust at
    // install time, and a minified blob is not something anyone can read before agreeing.
    minify: false,
  });
  await bundle.close();

  const header = [
    "// Built by scripts/build.mjs from src/. Do not edit.",
    `// ${manifest.identifier} ${manifest.version}`,
    "",
  ].join("\n");
  const code = header + PREAMBLE + output[0].code;
  const outputPath = join(directory, "main.js");
  await writeFile(outputPath, code, "utf8");
  process.stdout.write(`${identifier}: wrote main.js (${code.length} bytes)\n`);
}

const requested = process.argv.slice(2);
const candidates = requested.length > 0
  ? requested
  : (await readdir(extensionsRoot)).sort();

let built = 0;
for (const identifier of candidates) {
  if (identifier.startsWith(".")) continue;
  if (!(await isDirectory(join(extensionsRoot, identifier)))) continue;
  await build(identifier);
  built += 1;
}
if (built === 0) process.stdout.write("No extensions to build.\n");
