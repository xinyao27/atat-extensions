import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS = join(ROOT, "extensions");
const IDENTIFIER = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/// A System Settings pane's bundle identifier, as `systemSettingsLink.pane` carries it.
const SETTINGS_PANE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ENTITLEMENTS = new Set(["network", "secrets", "automation", "agent", "translation", "clipboardRead", "favoritesRead", "capturesRead", "memorySource"]);
const HOOKS = new Set(["clipboardIngest", "capture", "contextAssembled", "answerAssembled", "response"]);
/// The host's compiled-in format handlers, and the capabilities each one claims. A plugin's
/// `format` has to be one of these or the install is refused, so the same list is the gate
/// here — a manifest naming a format no build ships is a manifest that cannot install.
const MODEL_FORMATS = new Map([["gpu-pii-format-1", new Set(["pii"])]]);
const MODEL_HINT_FIELDS = new Set(["prefer", "maxResidentBytes"]);
const MODEL_FIELDS = new Set(["capability", "format", "bundled", "remote", "hint"]);
/// The ceiling `ModelStore` enforces on a remote weight file.
const MAXIMUM_REMOTE_WEIGHT_BYTES = 256 * 1024 * 1024;
/// A model weight file is the one source file allowed past the 2 MB source ceiling: the
/// directory ships model bytes on purpose, and a PII classifier is megabytes, not kilobytes.
/// Still bounded, so a manifest cannot turn the repository into a file host.
const MAXIMUM_WEIGHT_BYTES = 32 * 1024 * 1024;
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
  "visibleWhen",
  "icon",
  "group",
  "systemSettingsLink",
  "oauth",
  "help",
]);
/// The services the host can sign a user into, and the scopes each lets a plugin ask for. The
/// host owns the client ID and the endpoints, so a manifest only chooses among these — the list
/// mirrors `ExtensionOAuthProvider` in the app, and a provider the app does not ship cannot install.
const OAUTH_PROVIDERS = new Map([["github", new Set(["repo", "public_repo", "gist", "read:user"])]]);
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
  "view",
  "requiresApp",
]);
const HOOK_FIELDS = new Set(["hook", "requirements"]);
const READ_FIELDS = new Set(["identifier", "paths", "title"]);
/// One collection a extension hands to Memory. Fixed shape: an identifier the host writes into
/// `sources.adapter`, a title the source list shows, and a scope it implements.
const MEMORY_SOURCE_FIELDS = new Set(["identifier", "title", "icon", "scope"]);
/// The scopes the host implements. `perProject` is stated here as unsupported on purpose: a
/// manifest that asks for it must be refused rather than silently imported as global.
const MEMORY_SOURCE_SCOPES = new Set(["global"]);
/// Directories the host refuses whatever a extension says it wants them for: the home folder
/// and `~/Library` are not a folder but every folder, and the rest hold credentials.
const REFUSED_READ_PATHS = new Set(["~", "~/library"]);
const REFUSED_READ_TREES = ["~/.ssh", "~/.gnupg", "~/.aws", "~/library/keychains"];
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
  "models",
  "actions",
  "options",
  "views",
  "panels",
  "reads",
  "memorySources",
]);
const LISTING_CATEGORIES = new Set([
  "productivity",
  "writing",
  "developer-tools",
  "capture",
  "clipboard",
  "utilities",
]);
const LISTING_FIELDS = new Set(["category", "keywords", "releaseNotes"]);
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

function number(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${field} must be a number`);
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

/// A choice option's values, as the host parses them: a bare string — the value, shown as
/// itself — or an object with the stored `value` and the localized `title` the user reads.
function optionValues(value, field) {
  const result = [];
  for (const [index, entry] of array(value ?? [], field).entries()) {
    const itemField = `${field}[${index}]`;
    if (typeof entry === "string") {
      result.push(string(entry, itemField));
      continue;
    }
    const record = object(entry, itemField);
    for (const key of Object.keys(record)) {
      if (key !== "value" && key !== "title") fail(`${itemField}: unsupported value field ${key}`);
    }
    string(record.value, `${itemField}.value`);
    localizable(record.title, `${itemField}.title`);
    result.push(record.value);
  }
  if (new Set(result).size !== result.length) fail(`${field} contains duplicate values`);
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

/**
 * One `reads` declaration: somebody else's directory, read-only, agreed to once at install.
 *
 * Narrow or refused, with nothing in between. A whole segment may be a star, so a declaration
 * can name the memory folder inside every Claude Code project without naming the folder that
 * holds the conversations too; a partial wildcard would glob names rather than walk a level,
 * and nothing needs it. The paths are shown to the user verbatim in the install
 * confirmation, so a path that means something else once resolved is a path that lied.
 */
function validateReads(value, identifier) {
  const declarations = array(value ?? [], `${identifier}.reads`);
  const seen = new Set();
  for (const [index, entry] of declarations.entries()) {
    const field = `${identifier}.reads[${index}]`;
    const declaration = object(entry, field);
    for (const key of Object.keys(declaration)) {
      if (!READ_FIELDS.has(key)) fail(`${identifier}: unsupported reads field ${key}`);
    }
    const name = string(declaration.identifier, `${field}.identifier`);
    if (!IDENTIFIER.test(name)) fail(`${field}.identifier must be kebab-case`);
    if (seen.has(name)) fail(`${identifier}: duplicate reads declaration ${name}`);
    seen.add(name);
    localizable(declaration.title, `${field}.title`);

    const paths = uniqueStrings(declaration.paths, `${field}.paths`);
    if (paths.length === 0) fail(`${field}.paths must name at least one directory`);
    for (const declared of paths) {
      const path = declared.replace(/\/+$/, "");
      if (!path.startsWith("~/")) fail(`${field}.paths: ${declared} must start with "~/"`);
      const segments = path.split("/");
      if (segments.some((segment) => segment === "." || segment === "..")) {
        fail(`${field}.paths: ${declared} must name where it goes, not walk there`);
      }
      if (segments.some((segment) => segment !== "*" && segment.includes("*"))) {
        fail(`${field}.paths: ${declared} may use * only as a whole segment`);
      }
      const lowered = path.toLowerCase();
      // `~/Library/*` reaches every folder in `~/Library`, so it is the same request as
      // `~/Library` with an extra character.
      const withoutWildcards = lowered.replace(/(?:\/\*)+$/, "");
      for (const candidate of [lowered, withoutWildcards]) {
        if (REFUSED_READ_PATHS.has(candidate)) fail(`${field}.paths: ${declared} is too wide`);
        if (REFUSED_READ_TREES.some((tree) => candidate === tree || candidate.startsWith(`${tree}/`))) {
          fail(`${field}.paths: ${declared} names somewhere credentials live`);
        }
      }
    }
  }
}

function validateManifest(manifest, directoryName) {
  const value = object(manifest, `${directoryName}/extension.json`);
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
    const field = `${identifier}.hooks[${index}]`;
    const declaration = object(entry, field);
    for (const key of Object.keys(declaration)) {
      if (!HOOK_FIELDS.has(key)) fail(`${identifier}: unsupported hook field ${key}`);
    }
    const hook = string(declaration.hook, `${field}.hook`);
    if (!HOOKS.has(hook) || hooks.has(hook)) fail(`${identifier}: unsupported or duplicate hook ${hook}`);
    hooks.add(hook);
    requirements(declaration.requirements, `${field}.requirements`);
  }

  validateModels(value.models, identifier, entitlements, networkHosts);

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
    if (action.view !== undefined) {
      // One action walks exactly one mode — URL, JS handler, React view — and a view opens
      // an interface rather than returning a string for an `after` route to consume.
      const view = string(action.view, `${identifier}.actions[${index}].view`);
      if (!views.has(view)) fail(`${identifier}: action ${name} names a view that was not declared: ${view}`);
      if (action.url !== undefined) fail(`${identifier}: action ${name} cannot declare both a URL and a view`);
      if (route !== "none") fail(`${identifier}: a view action cannot also declare an after route`);
    }
  }

  const optionNames = new Map();
  const optionDeclarations = [];
  for (const [index, entry] of array(value.options ?? [], `${identifier}.options`).entries()) {
    const field = `${identifier}.options[${index}]`;
    const option = object(entry, field);
    for (const key of Object.keys(option)) {
      if (!OPTION_FIELDS.has(key)) fail(`${identifier}: unsupported option field ${key}`);
    }
    const name = string(option.identifier, `${field}.identifier`);
    if (optionNames.has(name)) fail(`${identifier}: duplicate option ${name}`);
    const type = string(option.type, `${field}.type`);
    if (!OPTION_TYPES.has(type)) fail(`${identifier}: unsupported option type ${type}`);
    if (option.icon !== undefined) {
      // An @@ icon name or a file inside the package, exactly as an action's icon.
      string(option.icon, `${field}.icon`);
    }
    if (option.group !== undefined) {
      // Options that share a group render as one service: a row on the left, the rest of
      // the group's options as that row's detail on the right.
      string(option.group, `${field}.group`);
      if (!IDENTIFIER.test(option.group)) fail(`${field}.group must be kebab-case`);
    }
    localizable(option.label, `${field}.label`);
    if (option.description !== undefined) localizable(option.description, `${field}.description`);
    const values = optionValues(option.values, `${field}.values`);
    if (type === "choice" && values.length === 0) fail(`${identifier}: choice ${name} needs values`);
    if (["secret", "folder"].includes(type) && option.defaultValue !== undefined) fail(`${identifier}: ${type} cannot have a default`);
    if (option.defaultValue !== undefined && type === "choice" && !values.includes(option.defaultValue)) fail(`${identifier}: ${name} default is not one of its values`);
    if (option.defaultPath !== undefined) {
      if (type !== "folder") fail(`${identifier}: only a folder option can declare defaultPath`);
      if (!FOLDER_DEFAULT_PATHS.has(option.defaultPath)) fail(`${identifier}: unsupported defaultPath ${option.defaultPath}`);
    }
    if (option.visibleWhen !== undefined) {
      const visibility = object(option.visibleWhen, `${field}.visibleWhen`);
      for (const key of Object.keys(visibility)) {
        if (key !== "option" && key !== "equals") fail(`${identifier}: unsupported visibleWhen field ${key}`);
      }
      string(visibility.option, `${field}.visibleWhen.option`);
      string(visibility.equals, `${field}.visibleWhen.equals`);
    }
    if (option.systemSettingsLink !== undefined) {
      const link = object(option.systemSettingsLink, `${field}.systemSettingsLink`);
      for (const key of Object.keys(link)) {
        if (key !== "title" && key !== "pane") fail(`${identifier}: unsupported systemSettingsLink field ${key}`);
      }
      localizable(link.title, `${field}.systemSettingsLink.title`);
      const pane = string(link.pane, `${field}.systemSettingsLink.pane`);
      if (!SETTINGS_PANE.test(pane)) fail(`${field}.systemSettingsLink.pane must be a settings pane identifier`);
    }
    if (option.oauth !== undefined) {
      if (type !== "secret") fail(`${identifier}: only a secret option can declare oauth`);
      const oauth = object(option.oauth, `${field}.oauth`);
      for (const key of Object.keys(oauth)) {
        if (key !== "provider" && key !== "scopes") fail(`${identifier}: unsupported oauth field ${key}`);
      }
      const provider = string(oauth.provider, `${field}.oauth.provider`);
      const allowed = OAUTH_PROVIDERS.get(provider);
      if (allowed === undefined) fail(`${field}.oauth.provider ${provider} is not a service the host signs into`);
      for (const scope of array(oauth.scopes ?? [], `${field}.oauth.scopes`)) {
        if (!allowed.has(scope)) fail(`${field}.oauth.scopes: ${provider} does not allow ${scope}`);
      }
    }
    if (option.help !== undefined) {
      if (type !== "secret") fail(`${identifier}: only a secret option can declare help`);
      const help = object(option.help, `${field}.help`);
      for (const key of Object.keys(help)) {
        if (!["url", "title", "steps"].includes(key)) fail(`${identifier}: unsupported help field ${key}`);
      }
      let url;
      try {
        url = new URL(string(help.url, `${field}.help.url`));
      } catch {
        fail(`${field}.help.url must be a URL`);
      }
      if (url.protocol !== "https:") fail(`${field}.help.url must be https`);
      if (help.title !== undefined) localizable(help.title, `${field}.help.title`);
      for (const [stepIndex, step] of array(help.steps ?? [], `${field}.help.steps`).entries()) {
        localizable(step, `${field}.help.steps[${stepIndex}]`);
      }
    }
    optionNames.set(name, { values });
    optionDeclarations.push({ name, option, field });
  }

  // A condition names a sibling, and a choice's condition names one of its values. Checked
  // after the loop so an option can wait on one declared below it.
  for (const { name, option, field } of optionDeclarations) {
    if (option.visibleWhen === undefined) continue;
    const visibility = option.visibleWhen;
    const referenced = optionNames.get(visibility.option);
    if (visibility.option === name || referenced === undefined) {
      fail(`${field}.visibleWhen must name another option`);
    }
    if (referenced.values.length > 0 && !referenced.values.includes(visibility.equals)) {
      fail(`${field}.visibleWhen.equals must be one of ${visibility.option}'s values`);
    }
  }

  validateReads(value.reads, identifier);
  validateMemorySources(value.memorySources, identifier, entitlements);

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

/**
 * One `memorySources` declaration: a collection the extension hands to Memory to import.
 *
 * The identifier becomes half of `sources.adapter` and a settings key fragment, so it is
 * kebab-case and unique the way every other identifier here is. The entitlement is required
 * rather than merely expected: without it the host never calls the handlers, so a manifest that
 * declared a source anyway would put a row in front of the user that fails on its first refresh.
 */
function validateMemorySources(value, identifier, entitlements) {
  const declarations = array(value ?? [], `${identifier}.memorySources`);
  if (declarations.length > 0 && !entitlements.includes("memorySource")) {
    fail(`${identifier}: memorySources needs the memorySource entitlement`);
  }
  const seen = new Set();
  for (const [index, entry] of declarations.entries()) {
    const field = `${identifier}.memorySources[${index}]`;
    const declaration = object(entry, field);
    for (const key of Object.keys(declaration)) {
      if (!MEMORY_SOURCE_FIELDS.has(key)) fail(`${identifier}: unsupported memorySources field ${key}`);
    }
    const name = string(declaration.identifier, `${field}.identifier`);
    if (!IDENTIFIER.test(name)) fail(`${field}.identifier must be kebab-case`);
    if (seen.has(name)) fail(`${identifier}: duplicate memorySource ${name}`);
    seen.add(name);
    localizable(declaration.title, `${field}.title`);
    if (declaration.icon !== undefined) string(declaration.icon, `${field}.icon`);
    const scope = declaration.scope ?? "global";
    if (!MEMORY_SOURCE_SCOPES.has(scope)) {
      fail(`${field}.scope must be one of ${[...MEMORY_SOURCE_SCOPES].join(", ")}`);
    }
  }
}

/**
 * One `models` declaration: a local model the extension brings, and the host runs.
 *
 * Capability routes a `ctx.model.run` call and format selects a compiled-in handler, so both
 * have to name something this build actually ships — a plugin cannot invent either. Exactly
 * one of `bundled` and `remote`, because a declaration that could resolve two ways has no
 * single answer to "where do these bytes come from".
 */
function validateModels(value, identifier, entitlements, networkHosts) {
  const declarations = array(value ?? [], `${identifier}.models`);
  const seen = new Set();
  for (const [index, entry] of declarations.entries()) {
    const field = `${identifier}.models[${index}]`;
    const declaration = object(entry, field);
    for (const key of Object.keys(declaration)) {
      if (!MODEL_FIELDS.has(key)) fail(`${identifier}: unsupported model field ${key}`);
    }
    const capability = string(declaration.capability, `${field}.capability`);
    if (seen.has(capability)) fail(`${identifier}: duplicate model capability ${capability}`);
    seen.add(capability);

    const format = string(declaration.format, `${field}.format`);
    const capabilities = MODEL_FORMATS.get(format);
    if (!capabilities) fail(`${field}.format: ${format} is not a format this build runs`);
    if (!capabilities.has(capability)) {
      fail(`${field}.capability: ${format} does not answer for ${capability}`);
    }

    const hasBundled = declaration.bundled !== undefined && declaration.bundled !== null;
    const hasRemote = declaration.remote !== undefined && declaration.remote !== null;
    if (hasBundled === hasRemote) {
      fail(`${field}: exactly one of bundled and remote, never both and never neither`);
    }

    if (hasBundled) {
      const bundled = object(declaration.bundled, `${field}.bundled`);
      for (const key of Object.keys(bundled)) {
        if (key !== "weights" && key !== "layout") fail(`${field}.bundled: unsupported field ${key}`);
      }
      modelRelativePath(bundled.weights, `${field}.bundled.weights`);
      modelRelativePath(bundled.layout, `${field}.bundled.layout`);
    } else {
      if (!entitlements.includes("network")) {
        fail(`${field}.remote: a remote model needs the network entitlement`);
      }
      const remote = object(declaration.remote, `${field}.remote`);
      for (const key of Object.keys(remote)) {
        if (!["url", "layoutUrl", "size", "sha256"].includes(key)) {
          fail(`${field}.remote: unsupported field ${key}`);
        }
      }
      modelRemoteURL(remote.url, `${field}.remote.url`, networkHosts);
      modelRemoteURL(remote.layoutUrl, `${field}.remote.layoutUrl`, networkHosts);
      const size = number(remote.size, `${field}.remote.size`);
      if (!Number.isInteger(size) || size <= 0 || size > MAXIMUM_REMOTE_WEIGHT_BYTES) {
        fail(`${field}.remote.size must be a positive integer no larger than ${MAXIMUM_REMOTE_WEIGHT_BYTES}`);
      }
      const sha256 = string(remote.sha256, `${field}.remote.sha256`).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sha256)) fail(`${field}.remote.sha256 must be 64 lowercase hex`);
    }

    if (declaration.hint !== undefined && declaration.hint !== null) {
      const hint = object(declaration.hint, `${field}.hint`);
      for (const key of Object.keys(hint)) {
        if (!MODEL_HINT_FIELDS.has(key)) fail(`${field}.hint: unsupported field ${key}`);
      }
      if (hint.prefer !== undefined) {
        const prefer = string(hint.prefer, `${field}.hint.prefer`);
        if (prefer !== "metal") fail(`${field}.hint.prefer: ${prefer} is not a backend this build prefers`);
      }
      if (hint.maxResidentBytes !== undefined) {
        const bytes = number(hint.maxResidentBytes, `${field}.hint.maxResidentBytes`);
        if (!Number.isInteger(bytes) || bytes <= 0) fail(`${field}.hint.maxResidentBytes must be a positive integer`);
      }
    }
  }
}

/** No absolute path, no `..`, no NUL: a model file lives inside the directory. */
function modelRelativePath(value, field) {
  const path = string(value, field);
  if (path.startsWith("/") || path.includes("\u0000")) fail(`${field}: ${path} must be a package-relative path`);
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    fail(`${field}: ${path} must name where it is, not walk there`);
  }
  if (path.trim().length === 0) fail(`${field} must name a file`);
  return path;
}

/** HTTPS, or plain HTTP to the loopback host, and the host has to be declared. */
function modelRemoteURL(value, field, networkHosts) {
  const text = string(value, field);
  let parsed;
  try { parsed = new URL(text); } catch { fail(`${field}: ${text} is not a URL`); }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"];
  if (parsed.protocol === "https:") {
    if (!networkHosts.includes(parsed.hostname)) {
      fail(`${field}: ${parsed.hostname} is not in networkHosts`);
    }
    return text;
  }
  if (parsed.protocol === "http:" && loopback.includes(parsed.hostname)) return text;
  fail(`${field}: ${text} must be https, or http to the loopback host`);
}

function validateListingMetadata(value, identifier) {
  const metadata = object(value, `${identifier}/listing.json`);
  for (const key of Object.keys(metadata)) {
    if (!LISTING_FIELDS.has(key)) fail(`${identifier}: unsupported listing field ${key}`);
  }
  const category = string(metadata.category, `${identifier}.listing.category`);
  if (!LISTING_CATEGORIES.has(category)) fail(`${identifier}: unsupported listing category ${category}`);
  const keywords = uniqueStrings(metadata.keywords, `${identifier}.listing.keywords`);
  if (keywords.length === 0 || keywords.length > 12) fail(`${identifier}: listing keywords must contain 1–12 values`);
  for (const keyword of keywords) if (keyword !== keyword.toLowerCase() || keyword.length > 32) fail(`${identifier}: listing keywords must be lowercase and at most 32 characters`);
  localizable(metadata.releaseNotes, `${identifier}.listing.releaseNotes`);
}

async function rejectUnsafeEntries(directory, relative = "", weightPaths = new Set()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "main.js", ".DS_Store"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    const label = join(relative, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) fail(`${label}: symlinks are not allowed`);
    if (info.isDirectory()) await rejectUnsafeEntries(path, label, weightPaths);
    if (info.isFile()) {
      // A declared model weight is the one file allowed past the source ceiling — it is
      // bytes, not source, and it is named in the manifest where the reviewer can see it.
      // Everything else stays a source-sized file.
      const ceiling = weightPaths.has(label) ? MAXIMUM_WEIGHT_BYTES : 2_000_000;
      if (info.size > ceiling) {
        fail(`${label}: file exceeds ${Math.round(ceiling / 1_000_000)} MB`);
      }
      if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        const source = await readFile(path, "utf8");
        if (/(?:\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(|\bimport\s*\(|\bWebAssembly\s*\.)/.test(source)) {
          fail(`${label}: a directory source cannot evaluate or import code at runtime`);
        }
      }
    }
  }
}

const requested = process.argv.slice(2);
const identifiers = requested.length > 0 ? requested : (await readdir(EXTENSIONS)).sort();
for (const identifier of identifiers) {
  const directory = join(EXTENSIONS, basename(identifier));
  const manifest = JSON.parse(await readFile(join(directory, "extension.json"), "utf8"));
  const result = validateManifest(manifest, basename(directory));
  const listingMetadata = JSON.parse(await readFile(join(directory, "listing.json"), "utf8"));
  validateListingMetadata(listingMetadata, result.identifier);
  // The weight paths the manifest declared, so the size gate can tell bytes from source and
  // only the former may exceed the source ceiling.
  const weightPaths = new Set();
  for (const model of manifest.models ?? []) {
    const bundled = model?.bundled;
    if (!bundled) continue;
    for (const key of ["weights", "layout"]) {
      if (typeof bundled[key] === "string") {
        // Same shape `rejectUnsafeEntries` builds for `label`: identifier/relative.
        weightPaths.add(join(result.identifier, bundled[key].replace(/^\.\/+/, "")));
      }
    }
  }
  await rejectUnsafeEntries(directory, result.identifier, weightPaths);
  process.stdout.write(`Valid ${result.identifier} ${result.version} (API 1, free extension policy)\n`);
}
