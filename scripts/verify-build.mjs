import { createHash } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS = join(ROOT, "extensions");
const identifiers = (await readdir(EXTENSIONS, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();

function runBuild() {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts/build.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "build failed");
}

async function readProducts() {
  const products = new Map();
  for (const identifier of identifiers) {
    const path = join(EXTENSIONS, identifier, "main.js");
    const code = await readFile(path, "utf8");
    products.set(identifier, {
      path,
      code,
      hash: createHash("sha256").update(code).digest("hex"),
    });
  }
  return products;
}

function exportedDefinition(code, identifier) {
  const module = { exports: {} };
  const hostAPI = new Proxy(
    { definePlugin: (definition) => definition },
    { get: (target, property) => target[property] ?? (() => undefined) }
  );
  const require = (specifier) => {
    if (specifier === "@atat/api") return hostAPI;
    if (specifier === "react") return {};
    if (specifier === "react/jsx-runtime" || specifier === "react/jsx-dev-runtime") {
      return { jsx: () => null, jsxs: () => null, Fragment: Symbol("Fragment") };
    }
    throw new Error(`${identifier}: bundle imports forbidden module ${specifier}`);
  };
  Function("exports", "module", "require", code)(module.exports, module, require);
  const candidate = module.exports.default ?? module.exports;
  if (!candidate || typeof candidate !== "object") throw new Error(`${identifier}: bundle has no default plugin definition`);
  return candidate;
}

function verifyExports(identifier, definition, manifest) {
  for (const hook of manifest.hooks ?? []) {
    if (typeof definition.hooks?.[hook.hook] !== "function") {
      throw new Error(`${identifier}: missing exported hook ${hook.hook}`);
    }
  }
  for (const action of manifest.actions ?? []) {
    if (action.url || action.presentation) continue;
    if (typeof definition.actions?.[action.identifier] !== "function") {
      throw new Error(`${identifier}: missing exported action ${action.identifier}`);
    }
  }
  for (const view of manifest.views ?? []) {
    if (typeof definition.views?.[view.identifier] !== "function") {
      throw new Error(`${identifier}: missing exported view ${view.identifier}`);
    }
  }
}

try {
  runBuild();
  const first = await readProducts();
  runBuild();
  const second = await readProducts();
  for (const identifier of identifiers) {
    if (first.get(identifier).hash !== second.get(identifier).hash) {
      throw new Error(`${identifier}: build is not deterministic`);
    }
    const manifest = JSON.parse(await readFile(join(EXTENSIONS, identifier, "plugin.json"), "utf8"));
    verifyExports(identifier, exportedDefinition(second.get(identifier).code, identifier), manifest);
    process.stdout.write(`Verified ${identifier} (${second.get(identifier).hash})\n`);
  }
} finally {
  await Promise.all(identifiers.map((identifier) => rm(join(EXTENSIONS, identifier, "main.js"), { force: true })));
}
