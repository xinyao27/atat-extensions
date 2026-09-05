// A fake AtAt host: `pnpm smoke <identifier> [scenario.json]`.
//
// It loads the built `main.js` the way the runtime does — one CommonJS file, `require`
// resolving `@atat/api` and nothing else — and calls one hook or one action with a scenario's
// input against a host context whose storage is a Map, whose granted folder is a temporary
// directory, and whose `files.search`, `fetch`, `agent.ask` and `ocr` answer from the
// scenario. Nothing here touches the real AtAt, the real filesystem outside the temporary
// directory, or the network.
//
// It also enforces the host rules a plugin only discovers after installing: entitlement
// gates, the granted-directory boundary, the 10 MB read and 5 MB storage ceilings, the
// exactly-one-of-text-and-filePaths shape of a context item, and the named-section limits.
// A plugin that passes here is a plugin whose first run in AtAt is about behaviour rather
// than about contract violations.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS = join(ROOT, "extensions");

/// Per-plugin wall clock for each hook. Every plugin subscribed to one hook shares roughly
/// twice this, so a hook that spends its whole budget is a hook that starves its neighbours.
const HOOK_BUDGET_MS = {
  clipboardIngest: 1000,
  capture: 5000,
  contextAssembled: 1500,
  response: 10000,
};
const ENTITLEMENTS = ["network", "secrets", "automation", "agent"];
const MAXIMUM_READ_BYTES = 10_000_000;
const MAXIMUM_STORAGE_BYTES = 5_000_000;
const MAXIMUM_SECTIONS = 4;
const MAXIMUM_SECTION_CHARACTERS = 16_000;
const SECTION_NAME = /^[a-z0-9-]{1,32}$/;

const USAGE = `usage: pnpm smoke <identifier> [scenario.json]

Runs every extensions/<identifier>/smoke/*.json, or the one scenario file given.

A scenario is one hook call or one action call, with the world it happens in:

{
  "description": "what this proves, in one line",
  "locale": "en",                      // ctx.locale; default "en"
  "options": { "folderOption": "{folder}", "switch": true },
  "secrets": { "apiKey": "test-key" }, // ctx.secrets.get, needs the secrets entitlement
  "storage": { "key": { "any": "json" } },        // ctx.storage before the call
  "files":  { "inbox/note.md": "text seeded into the granted folder" },
  "inputFiles": { "shot.png": "bytes as text" },  // reachable as {input}/shot.png
  "search": [ { "path": "{folder}/inbox/note.md", "snippet": "…", "score": 0.9 } ],
  "fetch":  { "https://host/path": { "status": 200, "body": "…" } },  // or "*" for any URL
  "agent":  "the reply agent.ask returns",        // or { "substring of prompt": "reply" }
  "appleScript": "the text runAppleScript returns", // default null
  "ocr":    "the text ocr() returns",
  "call":   { "hook": "contextAssembled", "input": { … } },   // or { "action": "name", … }
  "expect": {
    "result":        { "addItems": [ { "label": "Memory · …" } ] },  // deep subset, null = nothing
    "contains":      ["substring of the returned JSON"],
    "files":         [ { "path": "inbox/*.md", "count": 1, "contains": ["## Request"] } ],
    "notifications": ["substring of a ctx.notify message"],
    "log":           ["substring of a ctx.log message"],
    "copied":        ["substring of ctx.clipboard.copy"],
    "pasted":        ["substring of ctx.paste"],
    "favorites":     ["substring of ctx.favorites.add"],
    "appleScripts":  ["substring of a runAppleScript source or input"],
    "storage":       { "key": { "any": "json" } }              // deep subset, after the call
  }
}

{folder} is the granted folder, {input} the directory holding "inputFiles", {data} the
plugin's own data directory. Every string in the scenario is substituted.
`;

// --------------------------------------------------------------------------- utilities

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function substitute(value, replacements) {
  if (typeof value === "string") {
    let result = value;
    for (const [token, path] of Object.entries(replacements)) {
      result = result.split(`{${token}}`).join(path);
    }
    return result;
  }
  if (Array.isArray(value)) return value.map((entry) => substitute(entry, replacements));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = substitute(entry, replacements);
    }
    return result;
  }
  return value;
}

function isInside(root, path) {
  return path === root || path.startsWith(`${root}/`);
}

/** `inbox/*.md`, `**\/*.png`. Enough to name a file a plugin was supposed to write. */
function globToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern.charAt(index);
    if (character === "*") {
      if (pattern.charAt(index + 1) === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

async function walk(directory, prefix = "") {
  const found = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await walk(join(directory, entry.name), relativePath)));
    else found.push(relativePath);
  }
  return found;
}

/** Every difference between what a scenario declared and what the plugin produced. */
function subsetErrors(actual, expected, path, errors) {
  if (expected === null || typeof expected !== "object") {
    if (actual !== expected) {
      errors.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    return errors;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push(`${path}: expected an array, got ${JSON.stringify(actual)}`);
      return errors;
    }
    if (actual.length < expected.length) {
      errors.push(`${path}: expected at least ${expected.length} entries, got ${actual.length}`);
      return errors;
    }
    expected.forEach((entry, index) => subsetErrors(actual[index], entry, `${path}[${index}]`, errors));
    return errors;
  }
  if (!actual || typeof actual !== "object") {
    errors.push(`${path}: expected an object, got ${JSON.stringify(actual)}`);
    return errors;
  }
  for (const [key, entry] of Object.entries(expected)) {
    subsetErrors(actual[key], entry, `${path}.${key}`, errors);
  }
  return errors;
}

// ---------------------------------------------------------------------- the fake host

/**
 * The bundle, evaluated the way the runtime evaluates it.
 *
 * `@atat/api` is the only module a plugin may import. In a hook invocation the host's module
 * table carries `definePlugin` and nothing else — the panel half of a bundle resolves to
 * no-ops here, exactly as it does in a real hook context, so a plugin that carries a view
 * still runs its hooks.
 */
function loadDefinition(code, identifier) {
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
    throw new Error(`${identifier}: the bundle imports ${specifier}; only @atat/api is provided`);
  };
  const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
  Function("exports", "module", "require", "sleep", code)(module.exports, module, require, sleep);
  const definition = module.exports.default ?? module.exports;
  if (!definition || typeof definition !== "object") {
    throw new Error(`${identifier}: main.js exports no plugin definition`);
  }
  return definition;
}

function makeContext(manifest, scenario, roots, state) {
  const entitlements = new Set(manifest.entitlements ?? []);
  const networkHosts = new Set(manifest.networkHosts ?? []);

  const gate = (entitlement) => {
    if (!entitlements.has(entitlement)) {
      throw new Error(
        `${manifest.identifier} is not entitled to ${entitlement}. ` +
          `Add "${entitlement}" to entitlements in plugin.json, or do without it.`
      );
    }
  };

  const resolvePath = (path, operation, allowed) => {
    const text = String(path ?? "");
    const absolute = text.startsWith("/") ? text : join(roots.data, text);
    if (!allowed.some((root) => isInside(root, absolute))) {
      throw new Error(
        `files.${operation} refused ${absolute}: a path has to be one this call was handed, ` +
          "inside the plugin's own data directory, or inside a granted folder."
      );
    }
    return absolute;
  };

  const readable = [roots.folder, roots.input, roots.data];
  const grantedOnly = [roots.folder];

  return {
    plugin: { identifier: manifest.identifier, version: manifest.version },
    locale: scenario.locale ?? "en",
    options: scenario.options ?? {},

    storage: {
      async get(key) {
        const value = state.storage.get(String(key));
        return value === undefined ? null : JSON.parse(value);
      },
      async set(key, value) {
        const encoded = JSON.stringify(value ?? null);
        state.storage.set(String(key), encoded);
        let total = 0;
        for (const entry of state.storage.values()) total += entry.length;
        if (total > MAXIMUM_STORAGE_BYTES) {
          state.storage.delete(String(key));
          throw new Error("storage is limited to 5 MB per plugin; large data belongs in files");
        }
      },
      async remove(key) {
        state.storage.delete(String(key));
      },
    },

    secrets: {
      async get(key) {
        gate("secrets");
        const value = (scenario.secrets ?? {})[String(key)];
        return value === undefined ? null : String(value);
      },
      async set(key, value) {
        gate("secrets");
        state.secrets.set(String(key), String(value));
      },
    },

    async fetch(url, init) {
      gate("network");
      const target = new URL(String(url));
      if (target.protocol !== "https:" && target.hostname !== "127.0.0.1" && target.hostname !== "localhost") {
        throw new Error(`fetch refused ${url}: https, or plain http to the loopback host`);
      }
      if (target.protocol === "https:" && !networkHosts.has(target.hostname)) {
        throw new Error(
          `fetch refused ${target.hostname}: add it to networkHosts in plugin.json`
        );
      }
      state.requests.push({ url: String(url), method: init?.method ?? "GET" });
      const canned =
        (scenario.fetch ?? {})[String(url)] ??
        (scenario.fetch ?? {})[target.hostname] ??
        (scenario.fetch ?? {})["*"];
      if (canned === undefined) {
        throw new Error(`no canned response for ${url}: add it under "fetch" in the scenario`);
      }
      const body = canned.body === undefined ? JSON.stringify(canned.json ?? null) : String(canned.body);
      return {
        status: canned.status ?? 200,
        headers: canned.headers ?? {},
        async text() {
          return body;
        },
        async json() {
          return canned.json === undefined ? JSON.parse(body) : canned.json;
        },
      };
    },

    clipboard: {
      async copy(text) {
        state.copied.push(String(text));
      },
    },
    favorites: {
      async add(text) {
        state.favorites.push(String(text));
      },
    },
    async paste(text) {
      state.pasted.push(String(text));
    },
    notify(message) {
      state.notifications.push(String(message));
      process.stdout.write(`    notify: ${String(message)}\n`);
    },
    progress(message) {
      process.stdout.write(`    progress: ${String(message)}\n`);
    },

    files: {
      async read(path) {
        const absolute = resolvePath(path, "read", readable);
        const info = await stat(absolute);
        if (info.size > MAXIMUM_READ_BYTES) throw new Error("files.read is limited to 10 MB");
        return { base64: (await readFile(absolute)).toString("base64") };
      },
      async write(path, data) {
        const absolute = resolvePath(path, "write", readable);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, Buffer.from(String(data?.base64 ?? ""), "base64"));
        state.written.add(absolute);
      },
      async list(dirPath) {
        const absolute = resolvePath(dirPath, "list", grantedOnly);
        const entries = await readdir(absolute, { withFileTypes: true });
        return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
      },
      async remove(path) {
        const absolute = resolvePath(path, "remove", grantedOnly);
        await rm(absolute, { force: true });
        state.removed.push(absolute);
      },
      async search(dirPath, query, opts) {
        const absolute = resolvePath(dirPath, "search", grantedOnly);
        state.searches.push({ directory: absolute, query: String(query) });
        const hits = (scenario.search ?? []).filter((hit) => isInside(absolute, String(hit.path)));
        return hits.slice(0, opts?.limit ?? hits.length);
      },
    },

    async ocr(path) {
      resolvePath(path, "read", readable);
      if (scenario.ocr === undefined) {
        throw new Error('no canned text for ocr(): add "ocr" to the scenario');
      }
      return String(scenario.ocr);
    },

    async openUrl(url) {
      gate("automation");
      state.opened.push(String(url));
    },
    async runShortcut(name, input) {
      gate("automation");
      state.shortcuts.push({ name: String(name), input: input === undefined ? null : String(input) });
      return null;
    },
    async runAppleScript(source, input) {
      gate("automation");
      const script = String(source);
      if (script.trim().length === 0) throw new Error("runAppleScript needs a script");
      if (Buffer.byteLength(script, "utf8") > 64 * 1024) throw new Error("runAppleScript source is limited to 64 KB");
      const hasInput = input !== undefined && input !== null;
      if (hasInput && !/^\s*(?:on|to)\s+atatSelection\s*\(/im.test(script)) {
        throw new Error(
          "runAppleScript with input calls the script's `on atatSelection(selectedText)` handler; add one"
        );
      }
      state.appleScripts.push({ source: script, input: hasInput ? String(input) : null });
      return scenario.appleScript === undefined ? null : String(scenario.appleScript);
    },

    agent: {
      async ask(prompt, opts) {
        gate("agent");
        if (opts?.skill !== undefined && opts?.skill !== null) state.skills.push(String(opts.skill));
        state.asked.push(String(prompt));
        if (typeof scenario.agent === "string") return scenario.agent;
        if (scenario.agent && typeof scenario.agent === "object") {
          for (const [needle, reply] of Object.entries(scenario.agent)) {
            if (String(prompt).includes(needle)) return String(reply);
          }
        }
        throw new Error('no canned reply for agent.ask: add "agent" to the scenario');
      },
    },

    log(message) {
      state.log.push(String(message));
      process.stdout.write(`    log: ${String(message)}\n`);
    },
  };
}

// ------------------------------------------------------------------ result inspection

/** The host rules a returned value has to satisfy, checked here instead of after installing. */
function contractErrors(result, roots) {
  const errors = [];
  if (!result || typeof result !== "object") return errors;

  for (const [index, item] of (result.addItems ?? []).entries()) {
    const hasText = typeof item?.text === "string" && item.text.length > 0;
    const hasFiles = Array.isArray(item?.filePaths) && item.filePaths.length > 0;
    if (hasText === hasFiles) {
      errors.push(
        `addItems[${index}]: an item carries exactly one of text and filePaths; ` +
          "the host drops anything else"
      );
    }
    if (!item?.label) errors.push(`addItems[${index}]: every item needs a label — it is the pill`);
    for (const path of item?.filePaths ?? []) {
      const absolute = String(path);
      if (![roots.folder, roots.input, roots.data].some((root) => isInside(root, absolute))) {
        errors.push(
          `addItems[${index}]: ${absolute} is outside every path this call was handed, ` +
            "the plugin's data directory and the granted folder — the host drops the item " +
            "and counts a failure"
        );
      }
    }
  }

  const sections = result.promptSections ?? [];
  if (sections.length > MAXIMUM_SECTIONS) {
    errors.push(`promptSections: at most ${MAXIMUM_SECTIONS} per call, got ${sections.length}`);
  }
  let total = 0;
  for (const [index, section] of sections.entries()) {
    if (!SECTION_NAME.test(String(section?.name ?? ""))) {
      errors.push(`promptSections[${index}].name: must match [a-z0-9-]{1,32}`);
    }
    total += String(section?.content ?? "").length;
  }
  if (total > MAXIMUM_SECTION_CHARACTERS) {
    errors.push(`promptSections: ${total} characters, over the ${MAXIMUM_SECTION_CHARACTERS} limit`);
  }
  return errors;
}

async function expectationErrors(expected, result, state, roots) {
  const errors = [];
  if (expected.result !== undefined) subsetErrors(result, expected.result, "result", errors);

  for (const needle of expected.contains ?? []) {
    if (!JSON.stringify(result ?? null).includes(needle)) {
      errors.push(`result does not contain ${JSON.stringify(needle)}`);
    }
  }

  const written = await walk(roots.folder);
  for (const rule of expected.files ?? []) {
    const pattern = globToRegExp(String(rule.path));
    const matches = written.filter((path) => pattern.test(path));
    if (rule.count !== undefined && matches.length !== rule.count) {
      errors.push(
        `files ${rule.path}: expected ${rule.count}, found ${matches.length}` +
          (written.length > 0 ? ` (folder holds ${written.join(", ")})` : " (folder is empty)")
      );
      continue;
    }
    if (matches.length === 0) {
      errors.push(`files ${rule.path}: nothing matched` + (written.length > 0 ? ` (folder holds ${written.join(", ")})` : " (folder is empty)"));
      continue;
    }
    for (const needle of rule.contains ?? []) {
      const bodies = await Promise.all(
        matches.map((path) => readFile(join(roots.folder, path), "utf8").catch(() => ""))
      );
      if (!bodies.some((body) => body.includes(needle))) {
        errors.push(`files ${rule.path}: no match contains ${JSON.stringify(needle)}`);
      }
    }
  }

  const collections = {
    notifications: state.notifications,
    log: state.log,
    copied: state.copied,
    pasted: state.pasted,
    favorites: state.favorites,
    appleScripts: state.appleScripts.map((run) => `${run.source}\n${run.input ?? ""}`),
  };
  for (const [key, values] of Object.entries(collections)) {
    for (const needle of expected[key] ?? []) {
      if (!values.some((value) => value.includes(needle))) {
        errors.push(`${key}: nothing contains ${JSON.stringify(needle)} (saw ${values.length})`);
      }
    }
  }

  if (expected.storage !== undefined) {
    const snapshot = {};
    for (const [key, value] of state.storage.entries()) snapshot[key] = JSON.parse(value);
    subsetErrors(snapshot, expected.storage, "storage", errors);
  }
  return errors;
}

// ------------------------------------------------------------------------- the runner

async function runScenario(manifest, definition, scenarioPath) {
  const raw = JSON.parse(await readFile(scenarioPath, "utf8"));
  const temporaryRoot = await mkdtemp(join(tmpdir(), `atat-smoke-${manifest.identifier}-`));
  const roots = {
    folder: join(temporaryRoot, "folder"),
    input: join(temporaryRoot, "input"),
    data: join(temporaryRoot, "data"),
  };
  await mkdir(roots.folder, { recursive: true });
  await mkdir(roots.input, { recursive: true });
  await mkdir(roots.data, { recursive: true });

  const scenario = substitute(raw, roots);
  for (const [path, content] of Object.entries(scenario.files ?? {})) {
    const absolute = join(roots.folder, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, String(content), "utf8");
  }
  for (const [path, content] of Object.entries(scenario.inputFiles ?? {})) {
    const absolute = join(roots.input, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, String(content), "utf8");
  }

  const state = {
    storage: new Map(
      Object.entries(scenario.storage ?? {}).map(([key, value]) => [key, JSON.stringify(value)])
    ),
    secrets: new Map(),
    written: new Set(),
    removed: [],
    searches: [],
    requests: [],
    asked: [],
    opened: [],
    shortcuts: [],
    appleScripts: [],
    favorites: [],
    skills: [],
    notifications: [],
    copied: [],
    pasted: [],
    log: [],
  };

  const inRepository = relative(ROOT, scenarioPath);
  const label = `${manifest.identifier} · ${
    inRepository.startsWith("..") ? scenarioPath : inRepository
  }`;
  process.stdout.write(
    `\n${label}${scenario.description ? ` — ${scenario.description}` : ""}\n`
  );

  const call = scenario.call ?? {};
  let invoke;
  let budget;
  if (call.hook) {
    invoke = definition.hooks?.[call.hook];
    budget = HOOK_BUDGET_MS[call.hook];
    if (typeof invoke !== "function") {
      return [`${label}: the bundle exports no hook "${call.hook}"`];
    }
  } else if (call.action) {
    invoke = definition.actions?.[call.action];
    if (typeof invoke !== "function") {
      return [`${label}: the bundle exports no action "${call.action}"`];
    }
  } else {
    return [`${label}: the scenario needs a "call" naming a hook or an action`];
  }

  const input = { ...(call.input ?? {}) };
  if (call.action && !Array.isArray(input.modifiers)) input.modifiers = [];

  const context = makeContext(manifest, scenario, roots, state);
  const started = Date.now();
  let result;
  try {
    result = await invoke(input, context);
  } catch (error) {
    process.stdout.write(`  threw: ${error?.message ?? String(error)}\n`);
    return [
      `${label}: the call threw. ` +
        (call.hook
          ? "A hook failure counts against this plugin, and three in a row pause it — catch " +
            "the expected conditions, ctx.log them, and return nothing."
          : "An action that throws leaves the user with an error and no result — catch it and " +
            "ctx.notify what went wrong."),
    ];
  }
  const elapsed = Date.now() - started;
  // A hook that returns nothing returns `null` over the bridge: the host serializes the result
  // as JSON, where there is no `undefined`. A scenario says so with `"result": null`.
  if (result === undefined) result = null;

  const errors = [];
  process.stdout.write(`  returned: ${JSON.stringify(result ?? null)}\n`);
  for (const [index, item] of (result?.addItems ?? []).entries()) {
    const payload = item?.text ? JSON.stringify(item.text.slice(0, 120)) : (item?.filePaths ?? []).join(", ");
    process.stdout.write(`  item[${index}] ${item?.label ?? "(no label)"} — ${payload}\n`);
  }
  for (const section of result?.promptSections ?? []) {
    process.stdout.write(
      `  section <${section?.name}> ${String(section?.content ?? "").length} characters\n`
    );
  }
  const written = await walk(roots.folder);
  const seeded = new Set(Object.keys(scenario.files ?? {}));
  const created = written.filter((path) => !seeded.has(path));
  process.stdout.write(
    created.length > 0 ? `  wrote: ${created.join(", ")}\n` : "  wrote: nothing\n"
  );
  if (budget) {
    process.stdout.write(`  took ${elapsed}ms of the ${budget}ms ${call.hook} budget\n`);
    if (elapsed > budget) {
      process.stdout.write(
        `  warning: over budget on a fake host — the real one is slower and shares the budget\n`
      );
    }
  }

  errors.push(...contractErrors(result, roots).map((message) => `${label}: ${message}`));
  errors.push(
    ...(await expectationErrors(scenario.expect ?? {}, result, state, roots)).map(
      (message) => `${label}: ${message}`
    )
  );
  process.stdout.write(errors.length === 0 ? "  ok\n" : "  FAILED\n");
  await rm(temporaryRoot, { recursive: true, force: true });
  return errors;
}

// ------------------------------------------------------------------------------ entry

const [identifier, scenarioArgument] = process.argv.slice(2);
if (!identifier || identifier === "--help") {
  process.stdout.write(USAGE);
  process.exit(0);
}

const directory = join(EXTENSIONS, identifier);
if (!existsSync(directory)) fail(`extensions/${identifier}/ does not exist`);
const manifest = JSON.parse(await readFile(join(directory, "plugin.json"), "utf8"));
for (const entitlement of manifest.entitlements ?? []) {
  if (!ENTITLEMENTS.includes(entitlement)) fail(`unknown entitlement ${entitlement}`);
}

const build = spawnSync(process.execPath, [join(ROOT, "scripts/build.mjs"), identifier], {
  cwd: ROOT,
  encoding: "utf8",
});
if (build.status !== 0) fail(build.stderr || build.stdout || "build failed");
process.stdout.write(build.stdout);
const bundlePath = join(directory, "main.js");
if (!existsSync(bundlePath)) {
  fail(`${identifier} is declarative only: there is no code to smoke test`);
}

let scenarioPaths;
if (scenarioArgument) {
  scenarioPaths = [resolve(scenarioArgument)];
} else {
  const smokeDirectory = join(directory, "smoke");
  scenarioPaths = existsSync(smokeDirectory)
    ? (await readdir(smokeDirectory))
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => join(smokeDirectory, name))
    : [];
}
if (scenarioPaths.length === 0) {
  fail(
    `no scenarios for ${identifier}. Add extensions/${identifier}/smoke/<name>.json — ` +
      "one per hook and action. `node scripts/smoke.mjs` prints the schema."
  );
}

const code = await readFile(bundlePath, "utf8");
const failures = [];
for (const scenarioPath of scenarioPaths) {
  // A fresh definition per scenario: the host discards the JavaScriptCore context after every
  // call, so nothing a plugin leaves at module scope may carry from one scenario to the next.
  const definition = loadDefinition(code, identifier);
  failures.push(...(await runScenario(manifest, definition, scenarioPath)));
}

process.stdout.write("\n");
if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.stderr.write(`\n${failures.length} smoke failures in ${identifier}\n`);
  process.exit(1);
}
process.stdout.write(
  `${scenarioPaths.length} scenario${scenarioPaths.length === 1 ? "" : "s"} passed for ${identifier}\n`
);
