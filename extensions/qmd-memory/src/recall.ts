// `contextAssembled` — recall.
//
// This runs inside every request the user makes, which is the only fact that matters about its
// design. The hook's budget is 1.5 seconds for every plugin together, so this one gives itself
// 800 milliseconds for qmd and returns empty-handed rather than late. An unreachable qmd, a
// slow one, a folder the user has not granted yet: all of them are the same silent nothing,
// logged and never shown, because a memory that interrupts you is worse than no memory.
//
// What it returns is a pill per hit and one `<memory>` section. The pills are what make recall
// honest — the user sees what was remembered and can delete it before the request goes out.

import type {
  ContextAssembledInput,
  ContextAssembledResult,
  HostContext,
  PluginContextItem,
} from "@atat/plugin-types";
import { collections, readConfiguration, resolveHitPath, type LibraryKind } from "./library.js";
import { basename, imageReferences, joinPath, stripLineNumbers, truncate } from "./notes.js";
import { queryQmd } from "./qmd.js";

/** The plugin's own budget for qmd, inside the host's 1.5s for the whole hook. */
const QMD_DEADLINE_MS = 800;
/** The named section's ceiling. The host allows 16000 characters; a recall is not a document. */
const MAXIMUM_SECTION_CHARACTERS = 4000;
const MAXIMUM_EXCERPT_CHARACTERS = 700;
/** Enough query text to be specific, little enough to stay a query. */
const MAXIMUM_QUERY_CHARACTERS = 600;

interface Recalled {
  path: string;
  kind: LibraryKind;
  title: string;
  excerpt: string;
  /** A relative image reference from the excerpt, resolved and confirmed to exist. */
  imagePath?: string;
}

export async function recall(
  input: ContextAssembledInput,
  ctx: HostContext
): Promise<ContextAssembledResult | void> {
  const configuration = readConfiguration(ctx.options);
  if (configuration.memoryDirectory.length === 0) {
    ctx.log("recall skipped: no memory folder granted");
    return;
  }

  const query = queryText(input);
  if (query.length < 3) return;

  const searched = collections(configuration);
  const outcome = await queryQmd(ctx.fetch, {
    port: configuration.port,
    collections: searched.map((collection) => collection.name),
    text: query,
    // Ask for more than will be shown: hits outside the granted directories, and duplicates
    // of one document, are dropped after the fact.
    limit: Math.min(20, configuration.recallLimit * 2 + 2),
    deadlineMs: QMD_DEADLINE_MS,
  });
  if (!outcome.reachable) {
    ctx.log("recall unavailable: qmd " + outcome.reason);
    return;
  }
  if (outcome.hits.length === 0) return;

  const recalled: Recalled[] = [];
  const seen: Record<string, boolean> = {};
  for (const hit of outcome.hits) {
    if (recalled.length >= configuration.recallLimit) break;
    const resolved = resolveHitPath(configuration, hit.file);
    if (!resolved) continue;
    if (seen[resolved.path]) continue;
    seen[resolved.path] = true;
    const excerpt = truncate(stripLineNumbers(hit.snippet), MAXIMUM_EXCERPT_CHARACTERS);
    recalled.push({
      path: resolved.path,
      kind: resolved.kind,
      title: hit.title.length > 0 ? hit.title : basename(resolved.path),
      excerpt: excerpt.length > 0 ? excerpt : hit.title,
    });
  }
  if (recalled.length === 0) return;

  await attachImages(recalled, ctx);

  const addItems: PluginContextItem[] = recalled.map((entry) => {
    const label = labelFor(entry);
    // An image-bearing note travels as its image: a pill carries text or files, never both,
    // and the picture is the part a model cannot reconstruct from the excerpt. The excerpt
    // itself is still in the section below, so nothing is lost by choosing the file here.
    return entry.imagePath
      ? { label, filePaths: [entry.imagePath] }
      : { label, text: entry.excerpt };
  });

  return {
    addItems,
    promptSections: [{ name: "memory", content: section(recalled) }],
  };
}

function labelFor(entry: Recalled): string {
  const prefix = entry.kind === "memory" ? "Memory" : "Trajectory";
  return prefix + " · " + truncate(entry.title, 60);
}

function section(recalled: Recalled[]): string {
  const parts: string[] = [];
  let used = 0;
  for (const entry of recalled) {
    const heading =
      "## " + (entry.kind === "memory" ? "Memory" : "Trajectory") + ": " + entry.title;
    const block = [heading, "", entry.excerpt].join("\n");
    if (used + block.length > MAXIMUM_SECTION_CHARACTERS) {
      parts.push("_(further matches omitted)_");
      break;
    }
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join("\n\n");
}

function queryText(input: ContextAssembledInput): string {
  const parts: string[] = [String(input.prompt ?? "")];
  for (const item of input.items ?? []) {
    if (item.text) parts.push(item.text);
    else if (item.label) parts.push(item.label);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAXIMUM_QUERY_CHARACTERS);
}

/**
 * Resolves the images a recalled note points at, and confirms they are really there.
 *
 * One `files.list` per directory rather than a read per candidate: the point is to know a file
 * exists, and reading it would haul ten megabytes of base64 across the bridge to learn that.
 * A note whose image has been deleted degrades to its text, which is the right answer anyway.
 */
async function attachImages(recalled: Recalled[], ctx: HostContext): Promise<void> {
  const candidates: { entry: Recalled; directory: string; name: string; path: string }[] = [];
  for (const entry of recalled) {
    const references = imageReferences(entry.excerpt);
    const first = references[0];
    if (!first) continue;
    const noteDirectory = entry.path.slice(0, entry.path.lastIndexOf("/"));
    const path = normalizeRelative(noteDirectory, first);
    if (!path) continue;
    candidates.push({
      entry,
      directory: path.slice(0, path.lastIndexOf("/")),
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
    });
  }
  if (candidates.length === 0) return;

  const listed: Record<string, Record<string, boolean>> = {};
  for (const candidate of candidates) {
    if (listed[candidate.directory]) continue;
    const names: Record<string, boolean> = {};
    try {
      for (const entry of await ctx.files.list(candidate.directory)) {
        if (!entry.isDirectory) names[entry.name] = true;
      }
    } catch (error) {
      ctx.log("recall could not list an assets directory: " + messageOf(error));
    }
    listed[candidate.directory] = names;
  }
  for (const candidate of candidates) {
    if (listed[candidate.directory]?.[candidate.name]) {
      candidate.entry.imagePath = candidate.path;
    }
  }
}

/** Joins a relative reference onto a directory, resolving `.` and `..` rather than passing it on. */
function normalizeRelative(directory: string, reference: string): string | null {
  const segments = joinPath(directory, reference).split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (resolved.length <= 1) return null;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  const path = resolved.join("/");
  return path.charAt(0) === "/" ? path : null;
}

function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
