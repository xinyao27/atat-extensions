import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS = join(ROOT, "extensions");
const IDENTIFIER = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ENTITLEMENTS = new Set(["network", "secrets", "automation", "agent"]);
const HOOKS = new Set(["clipboardIngest", "capture", "contextAssembled", "response"]);
const SURFACES = new Set(["selectionBar", "clipboardHistory", "captureQuickAccess"]);
const ROUTES = new Set(["paste", "copy", "show", "composer", "none"]);
// No `heading`: options numerous enough to need grouping are a design mistake, not a
// formatting problem (decision 52).
const OPTION_TYPES = new Set(["string", "boolean", "choice", "secret", "folder"]);
const OPTION_FIELDS = new Set([
  "identifier",
  "type",
  "label",
  "description",
  "defaultValue",
  "defaultPath",
  "values",
]);
/// Where the host creates and grants a `folder` option's directory at install time.
const FOLDER_DEFAULT_PATHS = new Set(["shortcuts", "icloud", "documents"]);
const ACTION_FIELDS = new Set([
  "identifier",
  "title",
  "icon",
  "surfaces",
  "requirements",
  "after",
  "url",
  "requiresApp",
]);
const ROOT_FIELDS = new Set([
  "identifier",
  "name",
  "description",
  "version",
  "apiVersion",
  "minimumAppVersion",
  "author",
  "entitlements",
  "networkHosts",
  "hooks",
  "actions",
  "options",
  "views",
  "panels",
]);
const STORE_CATEGORIES = new Set([
  "productivity",
  "writing",
  "developer-tools",
  "capture",
  "clipboard",
  "utilities",
]);
const STORE_FIELDS = new Set(["category", "keywords", "releaseNotes"]);
const LOCALES = new Set(["en", "zh-hans"]);

function fail(message) {
  throw new Error(message);
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`);
  return value;
}

function string(value, field) {
  if (typeof value !== "string" || value.length === 0) fail(`${field} must be a non-empty string`);
  return value;
}

function array(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
}

function localizable(value, field) {
  if (typeof value === "string") {
    if (string(value, field).length > 4_000) fail(`${field} exceeds 4,000 characters`);
    return;
  }
  const translations = object(value, field);
  string(translations.en, `${field}.en`);
  for (const [locale, text] of Object.entries(translations)) {
    if (!LOCALES.has(locale)) fail(`${field}: unsupported locale ${locale}`);
    string(locale, `${field} locale`);
    if (string(text, `${field}.${locale}`).length > 4_000) {
      fail(`${field}.${locale} exceeds 4,000 characters`);
    }
  }
}

function validateURLTemplate(value, field) {
  const template = string(value, field);
  if (!template.includes("{text}")) fail(`${field} must contain {text}`);
  let probe = template.replaceAll("{text}", "text");
  while (true) {
    const start = probe.indexOf("{option:");
    if (start < 0) break;
    const end = probe.indexOf("}", start + 8);
    if (end < 0) fail(`${field} has an unterminated option placeholder`);
    probe = `${probe.slice(0, start)}option${probe.slice(end + 1)}`;
  }
  let url;
  try { url = new URL(probe); } catch { fail(`${field} must produce an absolute URL`); }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (["file", "javascript"].includes(scheme)) fail(`${field} cannot use the ${scheme} scheme`);
  if (["http", "https"].includes(scheme) && !url.hostname) fail(`${field} must include a host`);
}

function uniqueStrings(value, field, allowed) {
  const result = array(value ?? [], field).map((entry, index) => string(entry, `${field}[${index}]`));
  if (new Set(result).size !== result.length) fail(`${field} contains duplicate values`);
  for (const entry of result) if (allowed && !allowed.has(entry)) fail(`${field} contains unsupported value ${entry}`);
  return result;
}

function requirements(value, field) {
  if (value === undefined) return;
  const condition = object(value, field);
  if (condition.contentTypes !== undefined) {
    uniqueStrings(condition.contentTypes, `${field}.contentTypes`, new Set(["text", "url", "email", "filePath", "image", "files"]));
  }
  if (condition.regex !== undefined) {
    try { new RegExp(string(condition.regex, `${field}.regex`)); } catch { fail(`${field}.regex is invalid`); }
  }
  if (condition.sourceApps !== undefined) uniqueStrings(condition.sourceApps, `${field}.sourceApps`);
  if (condition.excludedApps !== undefined) uniqueStrings(condition.excludedApps, `${field}.excludedApps`);
  if (condition.optionEquals !== undefined) {
    for (const [key, expected] of Object.entries(object(condition.optionEquals, `${field}.optionEquals`))) {
      string(key, `${field}.optionEquals key`);
      string(expected, `${field}.optionEquals.${key}`);
    }
  }
}

function validateManifest(manifest, directoryName) {
  const value = object(manifest, `${directoryName}/plugin.json`);
  for (const key of Object.keys(value)) if (!ROOT_FIELDS.has(key)) fail(`${directoryName}: unsupported manifest field ${key}`);
  const identifier = string(value.identifier, `${directoryName}.identifier`);
  if (!IDENTIFIER.test(identifier) || identifier !== directoryName) fail(`${directoryName}: identifier must equal its directory name`);
  localizable(value.name, `${identifier}.name`);
  localizable(value.description, `${identifier}.description`);
  const version = string(value.version, `${identifier}.version`);
  if (!SEMVER.test(version)) fail(`${identifier}: version must be semver`);
  if (value.apiVersion !== 1) fail(`${identifier}: apiVersion must be 1`);
  if (value.minimumAppVersion !== undefined && !SEMVER.test(string(value.minimumAppVersion, `${identifier}.minimumAppVersion`))) {
    fail(`${identifier}: minimumAppVersion must be semver`);
  }
  if (value.author !== undefined && string(value.author, `${identifier}.author`).length > 200) {
    fail(`${identifier}: author exceeds 200 characters`);
  }

  const entitlements = uniqueStrings(value.entitlements, `${identifier}.entitlements`, ENTITLEMENTS);
  const networkHosts = uniqueStrings(value.networkHosts, `${identifier}.networkHosts`);
  for (const host of networkHosts) {
    if (host !== host.toLowerCase() || host.includes("*") || host.includes(":") || host.includes("/") || host.endsWith(".")) {
      fail(`${identifier}: networkHosts must contain exact lowercase hostnames`);
    }
    let parsed;
    try { parsed = new URL(`https://${host}`); } catch { fail(`${identifier}: invalid network hostname ${host}`); }
    if (parsed.hostname !== host) fail(`${identifier}: invalid network hostname ${host}`);
  }
  if (entitlements.includes("network") !== (networkHosts.length > 0)) {
    fail(`${identifier}: networkHosts is required exactly with the network entitlement`);
  }

  const hooks = new Set();
  for (const [index, entry] of array(value.hooks ?? [], `${identifier}.hooks`).entries()) {
    const hook = string(object(entry, `${identifier}.hooks[${index}]`).hook, `${identifier}.hooks[${index}].hook`);
    if (!HOOKS.has(hook) || hooks.has(hook)) fail(`${identifier}: unsupported or duplicate hook ${hook}`);
    hooks.add(hook);
    requirements(entry.requirements, `${identifier}.hooks[${index}].requirements`);
  }

  const views = new Set();
  for (const [index, entry] of array(value.views ?? [], `${identifier}.views`).entries()) {
    const view = string(object(entry, `${identifier}.views[${index}]`).identifier, `${identifier}.views[${index}].identifier`);
    if (views.has(view)) fail(`${identifier}: duplicate view ${view}`);
    views.add(view);
  }

  const actions = new Set();
  for (const [index, entry] of array(value.actions ?? [], `${identifier}.actions`).entries()) {
    const action = object(entry, `${identifier}.actions[${index}]`);
    for (const key of Object.keys(action)) {
      if (!ACTION_FIELDS.has(key)) fail(`${identifier}: unsupported action field ${key}`);
    }
    const name = string(action.identifier, `${identifier}.actions[${index}].identifier`);
    if (actions.has(name)) fail(`${identifier}: duplicate action ${name}`);
    actions.add(name);
    localizable(action.title, `${identifier}.actions[${index}].title`);
    const surfaces = uniqueStrings(action.surfaces, `${identifier}.actions[${index}].surfaces`, SURFACES);
    if (surfaces.length === 0) fail(`${identifier}: action ${name} has no surface`);
    // The selection bar is icon-only: a button there without an icon of its own is a puzzle
    // piece the user has to click to identify.
    if (surfaces.includes("selectionBar") && action.icon === undefined) {
      fail(`${identifier}: action ${name} appears on the selection bar and needs an icon`);
    }
    if (action.icon !== undefined) string(action.icon, `${identifier}.actions[${index}].icon`);
    requirements(action.requirements, `${identifier}.actions[${index}].requirements`);
    const route = action.after ?? "none";
    if (!ROUTES.has(route)) fail(`${identifier}: unsupported action route ${route}`);
    if (action.requiresApp !== undefined) {
      const field = `${identifier}.actions[${index}].requiresApp`;
      const requirement = object(action.requiresApp, field);
      string(requirement.name, `${field}.name`);
      if (uniqueStrings(requirement.bundleIdentifiers, `${field}.bundleIdentifiers`).length === 0) {
        fail(`${field}.bundleIdentifiers must name at least one bundle identifier`);
      }
      if (requirement.website !== undefined) {
        let website;
        try { website = new URL(string(requirement.website, `${field}.website`)); } catch { fail(`${field}.website must be an absolute URL`); }
        if (!["http:", "https:"].includes(website.protocol) || !website.hostname) fail(`${field}.website must be http(s)`);
      }
    }
    if (action.url !== undefined) {
      validateURLTemplate(action.url, `${identifier}.actions[${index}].url`);
      if (route !== "none") fail(`${identifier}: URL action cannot also declare an after route`);
    }
  }

  const optionNames = new Set();
  for (const [index, entry] of array(value.options ?? [], `${identifier}.options`).entries()) {
    const option = object(entry, `${identifier}.options[${index}]`);
    for (const key of Object.keys(option)) {
      if (!OPTION_FIELDS.has(key)) fail(`${identifier}: unsupported option field ${key}`);
    }
    const name = string(option.identifier, `${identifier}.options[${index}].identifier`);
    if (optionNames.has(name)) fail(`${identifier}: duplicate option ${name}`);
    optionNames.add(name);
    const type = string(option.type, `${identifier}.options[${index}].type`);
    if (!OPTION_TYPES.has(type)) fail(`${identifier}: unsupported option type ${type}`);
    localizable(option.label, `${identifier}.options[${index}].label`);
    if (option.description !== undefined) localizable(option.description, `${identifier}.options[${index}].description`);
    const values = option.values === undefined ? [] : uniqueStrings(option.values, `${identifier}.options[${index}].values`);
    if (type === "choice" && values.length === 0) fail(`${identifier}: choice ${name} needs values`);
    if (["secret", "folder"].includes(type) && option.defaultValue !== undefined) fail(`${identifier}: ${type} cannot have a default`);
    if (option.defaultPath !== undefined) {
      if (type !== "folder") fail(`${identifier}: only a folder option can declare defaultPath`);
      if (!FOLDER_DEFAULT_PATHS.has(option.defaultPath)) fail(`${identifier}: unsupported defaultPath ${option.defaultPath}`);
    }
  }

  const panels = array(value.panels ?? [], `${identifier}.panels`);
  if (panels.length > 1) fail(`${identifier}: API v1 allows one panel`);
  for (const [index, entry] of panels.entries()) {
    const panel = object(entry, `${identifier}.panels[${index}]`);
    string(panel.identifier, `${identifier}.panels[${index}].identifier`);
    const view = string(panel.view, `${identifier}.panels[${index}].view`);
    if (!views.has(view)) fail(`${identifier}: panel references undeclared view ${view}`);
    localizable(panel.title, `${identifier}.panels[${index}].title`);
  }

  return { identifier, version };
}

function validateStoreMetadata(value, identifier) {
  const metadata = object(value, `${identifier}/store.json`);
  for (const key of Object.keys(metadata)) {
    if (!STORE_FIELDS.has(key)) fail(`${identifier}: unsupported Store field ${key}`);
  }
  const category = string(metadata.category, `${identifier}.store.category`);
  if (!STORE_CATEGORIES.has(category)) fail(`${identifier}: unsupported Store category ${category}`);
  const keywords = uniqueStrings(metadata.keywords, `${identifier}.store.keywords`);
  if (keywords.length === 0 || keywords.length > 12) fail(`${identifier}: Store keywords must contain 1–12 values`);
  for (const keyword of keywords) if (keyword !== keyword.toLowerCase() || keyword.length > 32) fail(`${identifier}: Store keywords must be lowercase and at most 32 characters`);
  localizable(metadata.releaseNotes, `${identifier}.store.releaseNotes`);
}

async function rejectUnsafeEntries(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "main.js", ".DS_Store"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    const label = join(relative, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) fail(`${label}: symlinks are not allowed`);
    if (info.isDirectory()) await rejectUnsafeEntries(path, label);
    if (info.isFile()) {
      if (info.size > 2_000_000) fail(`${label}: source file exceeds 2 MB`);
      if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        const source = await readFile(path, "utf8");
        if (/(?:\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(|\bimport\s*\(|\bWebAssembly\s*\.)/.test(source)) {
          fail(`${label}: Store source cannot evaluate or import code at runtime`);
        }
      }
    }
  }
}

const requested = process.argv.slice(2);
const identifiers = requested.length > 0 ? requested : (await readdir(EXTENSIONS)).sort();
for (const identifier of identifiers) {
  const directory = join(EXTENSIONS, basename(identifier));
  const manifest = JSON.parse(await readFile(join(directory, "plugin.json"), "utf8"));
  const result = validateManifest(manifest, basename(directory));
  const storeMetadata = JSON.parse(await readFile(join(directory, "store.json"), "utf8"));
  validateStoreMetadata(storeMetadata, result.identifier);
  await rejectUnsafeEntries(directory, result.identifier);
  process.stdout.write(`Valid ${result.identifier} ${result.version} (API 1, free Store policy)\n`);
}
