// `contextAssembled` — recall.
//
// This runs inside every request the user makes, which is the only fact that matters about its
// design. The hook's budget is 1.5 seconds for every plugin together, so recall is one
// `files.search` and a handful of reads, and anything that does not come back in time is the
// same silent nothing as no match at all — logged, never shown. A memory that interrupts you
// is worse than no memory.
//
// The search itself is the host's: `files.search` queries an index the host maintains over the
// granted folder, so this plugin needs no index, no daemon and no network. What it returns is a
// pill per hit and one `<memory>` section. The pills are what make recall honest — the user
// sees what was remembered and can delete it before the request goes out.

import type {
  ContextAssembledInput,
  ContextAssembledResult,
  HostContext,
  PluginContextItem,
} from "@atat/api";
import {
  isGranted,
  kindOf,
  readConfiguration,
  type Configuration,
  type MemoryKind,
} from "./library.js";
import {
  basename,
  decodeText,
  flatten,
  imageReferences,
  joinPath,
  titleOf,
  truncate,
} from "./notes.js";
import { strings } from "./text.js";

/** What one request may carry back. The spec's number, and a request is not a reading list. */
const RECALL_LIMIT = 5;
/**
 * How many hits get read in full.
 *
 * A snippet is a fragment around the match; the note it came from has a title in its front
 * matter and possibly an image beside it. Reading is worth it for the top few and not for the
 * tail, and every read is a bridge round trip inside a 1.5 second budget.
 */
const READ_BUDGET = 3;
/** The named section's ceiling. The host allows 16000 characters; a recall is not a document. */
const MAXIMUM_SECTION_CHARACTERS = 4000;
const MAXIMUM_EXCERPT_CHARACTERS = 700;
/** Enough query text to be specific, little enough to stay a query. */
const MAXIMUM_QUERY_CHARACTERS = 600;
/** A one or two character query matches everything, which is the same as matching nothing. */
const MINIMUM_QUERY_CHARACTERS = 3;

interface Recalled {
  path: string;
  kind: MemoryKind;
  title: string;
  excerpt: string;
  /** A relative image reference from the note, resolved and confirmed to exist. */
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
  if (query.length < MINIMUM_QUERY_CHARACTERS) return;

  const hits = await search(configuration, query, ctx);
  if (hits.length === 0) return;

  const recalled = await readHits(hits, configuration, ctx);
  if (recalled.length === 0) return;
  await attachImages(recalled, ctx);

  const words = strings(ctx.locale);
  const addItems: PluginContextItem[] = recalled.map((entry) => {
    const label =
      (entry.kind === "trajectory" ? words.trajectory : words.memory) +
      " · " +
      truncate(entry.title, 60);
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

/**
 * The host's search, or nothing.
 *
 * An index that is still building, a folder whose grant has gone, a query the index cannot
 * answer: all of them come back here as an empty list. Throwing would count as a hook failure
 * against this plugin and, three of those in a row, disable recall — for a condition that is
 * usually temporary and never the user's problem.
 */
async function search(
  configuration: Configuration,
  query: string,
  ctx: HostContext
): Promise<{ path: string; snippet: string }[]> {
  try {
    const results = await ctx.files.search(configuration.memoryDirectory, query, {
      limit: RECALL_LIMIT,
    });
    const kept: { path: string; snippet: string }[] = [];
    const seen: Record<string, boolean> = {};
    for (const hit of results ?? []) {
      const path = String(hit?.path ?? "");
      // The host would refuse an out-of-folder path anyway. Dropping it here means a surprise
      // in the index shows up as a missing result rather than as a hook failure.
      if (!isGranted(configuration, path) || seen[path]) continue;
      seen[path] = true;
      kept.push({ path, snippet: String(hit?.snippet ?? "") });
    }
    return kept;
  } catch (error) {
    ctx.log("recall unavailable: " + messageOf(error));
    return [];
  }
}

/**
 * Each hit as something worth attaching: a real title, and a body rather than a fragment.
 *
 * The snippet is the fallback, not the goal — it is a window around whichever words matched,
 * which reads as a sentence cut in half. The top few notes get read in full so the pill can
 * carry the note's own title and the section can carry a coherent excerpt.
 */
async function readHits(
  hits: { path: string; snippet: string }[],
  configuration: Configuration,
  ctx: HostContext
): Promise<Recalled[]> {
  const recalled: Recalled[] = [];
  for (const [index, hit] of hits.entries()) {
    const fallbackTitle = basename(hit.path).replace(/\.[^.]+$/, "");
    const snippet = truncate(flatten(hit.snippet), MAXIMUM_EXCERPT_CHARACTERS);
    const entry: Recalled = {
      path: hit.path,
      kind: kindOf(configuration, hit.path),
      title: fallbackTitle,
      excerpt: snippet.length > 0 ? snippet : fallbackTitle,
    };
    if (index < READ_BUDGET) {
      const content = await readNote(hit.path, ctx);
      if (content !== null) {
        entry.title = titleOf(content, fallbackTitle);
        const body = flatten(stripFrontMatterFence(content));
        if (body.length > 0) entry.excerpt = truncate(body, MAXIMUM_EXCERPT_CHARACTERS);
        const image = firstImageReference(content, hit.path);
        // A `../../..` in someone's note is not a path this plugin has any business
        // attaching, whatever the host would say about it.
        if (image && isGranted(configuration, image)) entry.imagePath = image;
      }
    }
    recalled.push(entry);
  }
  return recalled;
}

async function readNote(path: string, ctx: HostContext): Promise<string | null> {
  try {
    return decodeText((await ctx.files.read(path)).base64);
  } catch (error) {
    // A hit whose file has gone, or an iCloud placeholder that is not down yet. The snippet
    // the host already gave us is enough to attach.
    ctx.log("recall could not read a note: " + messageOf(error));
    return null;
  }
}

/** The excerpt is the note as a person wrote it, not its front matter. */
function stripFrontMatterFence(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function firstImageReference(content: string, notePath: string): string | null {
  const first = imageReferences(content)[0];
  if (!first) return null;
  return normalizeRelative(notePath.slice(0, notePath.lastIndexOf("/")), first);
}

function section(recalled: Recalled[]): string {
  const parts: string[] = [];
  let used = 0;
  for (const entry of recalled) {
    const heading =
      "## " + (entry.kind === "trajectory" ? "Trajectory" : "Memory") + ": " + entry.title;
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
 * Confirms the images recalled notes point at are really there.
 *
 * One `files.list` per directory rather than a read per candidate: the point is to know a file
 * exists, and reading it would haul ten megabytes of base64 across the bridge to learn that.
 * A note whose image has been deleted degrades to its text, which is the right answer anyway.
 */
async function attachImages(recalled: Recalled[], ctx: HostContext): Promise<void> {
  const listed: Record<string, Record<string, boolean>> = {};
  for (const entry of recalled) {
    const path = entry.imagePath;
    if (!path) continue;
    const directory = path.slice(0, path.lastIndexOf("/"));
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!listed[directory]) {
      const names: Record<string, boolean> = {};
      try {
        for (const item of await ctx.files.list(directory)) {
          if (!item.isDirectory) names[item.name] = true;
        }
      } catch (error) {
        ctx.log("recall could not list an assets directory: " + messageOf(error));
      }
      listed[directory] = names;
    }
    if (!listed[directory]?.[name]) entry.imagePath = undefined;
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
