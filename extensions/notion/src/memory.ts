// Reading a Notion workspace into memory.md's external-import contract.
//
// An internal integration sees only the pages and databases the user shared with it — the
// same collection the save view already searches — and a `memorySources` handler is the read
// side of that. It pages through everything the integration can reach and hands each page's
// text over as an item for the user to review. Nothing here writes, and nothing here knows
// that a row it returns is also a place AtAt can save into.
//
// The traversal has two halves, because that is how the API answers. `search` returns the
// roots the integration can see — pages and data sources — most recently edited first, and
// a page's blocks are read one level at a time beneath it. Each item that goes out is one
// page's whole text rather than one block: its title, then its blocks top to bottom, a row's
// cells joined with a pipe, and the page's own URL as the link back to it. Two positions
// carry the walk through a page boundary: where `search` had got to, and which blocks of
// the current page are still to visit.
//
// `since` is honoured the way the API allows rather than ignored. `search` sorts by
// `last_edited_time` descending, so the walk stops asking for roots the moment a page's date
// is at or before the last complete import — everything behind it is older still. A page
// that crosses the line is read whole rather than filtered by block, because the API has no
// "the blocks that changed" call; a root that did not change simply is not returned, which
// is the API's own answer rather than a guess the walk made.

import type { FetchInit, FetchResponse } from "@atat/api";
import { NotionError, type Fetch } from "./notion.js";

/// What the host hands a page request.
export interface MemorySourceRequest {
  cursor?: string;
  since?: string;
  limit: number;
}

export interface MemoryItem {
  externalKey: string;
  title: string;
  body: string;
  url?: string;
  locator?: string;
  kind?: "fact" | "preference" | "decision" | "state" | "reference" | "procedure" | "conversation";
  observedAt?: string;
  updatedAt?: string;
}

export interface MemoryPage {
  items: MemoryItem[];
  nextCursor?: string;
  complete: boolean;
}

const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";
/// Notion refuses more than this in one `search` or block-children page.
const MAXIMUM_PAGE = 100;

// ----------------------------------------------------------------------------- pages

/// Where the whole-workspace walk had got to.
///
/// `searchCursor` is Notion's own cursor for the `search` call; `searchDone` says the last
/// page reached the end. `pageID`, `pageURL` and `pageTitle` name the root being consumed —
/// nil between pages — and `blocks` holds the block IDs whose children are still to visit,
/// innermost first, so the walk inside one page is depth-first. `blockCursor` is the
/// in-flight `children` call's own cursor: a page's blocks come back a page at a time too.
interface WalkState {
  searchCursor: string | null;
  searchDone: boolean;
  pageID: string | null;
  pageURL: string;
  pageTitle: string;
  /// The block whose children are being listed, or empty when a new one comes off `blocks`.
  listing: string | null;
  blockCursor: string | null;
  blocks: string[];
  lines: string[];
}

/**
 * One page of the shared pages' contents, in the order `search` returns them.
 *
 * Each item is one Notion page's full text. A page that yields no text is passed over rather
 * than failing the walk: the workspace is the user's own, and one unreadable or empty page
 * in it is not a reason to import none of it.
 */
export async function listPages(
  request: MemorySourceRequest,
  token: string,
  fetch: Fetch
): Promise<MemoryPage> {
  if (token.trim().length === 0) throw new NotionError("missingToken");
  const limit = Math.max(1, Math.floor(request.limit));
  const state = stateFrom(request.cursor);
  const items: MemoryItem[] = [];

  while (items.length < limit) {
    if (state.pageID === null) {
      if (state.searchDone) return { items, complete: true };
      const page = await searchPage(token, state.searchCursor, request.since, fetch);
      state.searchCursor = page.nextCursor;
      state.searchDone = !page.hasMore;
      for (const root of page.roots) {
        if (items.length >= limit) break;
        state.pageID = root.id;
        state.pageURL = root.url;
        state.pageTitle = root.title;
        state.blocks = [root.id];
        state.listing = null;
        state.blockCursor = null;
        state.lines = [];
        const item = await readRoot(state, token, fetch);
        if (item) items.push(item);
        state.pageID = null;
        state.blocks = [];
        state.lines = [];
      }
      continue;
    }
    // The current page is resumed mid-walk: it had started, and the blocks say where.
    const item = await readRoot(state, token, fetch);
    if (item) items.push(item);
    state.pageID = null;
    state.blocks = [];
    state.lines = [];
  }

  return { items, nextCursor: cursorFrom(state), complete: false };
}

interface RootRef {
  id: string;
  title: string;
  url: string;
}

interface SearchPage {
  roots: RootRef[];
  nextCursor: string | null;
  hasMore: boolean;
}

/// One `search` page: the roots the integration can see, most recently edited first.
///
/// `since` narrows the walk to what changed after the last complete import. The results come
/// back newest first, so a root whose date is at or before `since` ends the search page —
/// everything after it is older still — rather than being walked. That is the cheapest walk
/// that still sees every changed page, and it is the API's own ordering doing the work.
async function searchPage(
  token: string,
  cursor: string | null,
  since: string | undefined,
  fetch: Fetch
): Promise<SearchPage> {
  const body: Record<string, unknown> = {
    page_size: MAXIMUM_PAGE,
    sort: { timestamp: "last_edited_time", direction: "descending" },
  };
  if (cursor !== null) body.start_cursor = cursor;
  const response = await request(fetch, token, "POST", "/search", body);
  const payload = (await response.json()) as {
    results?: unknown[];
    has_more?: boolean;
    next_cursor?: string | null;
  };
  const cutoff = since ? Date.parse(since) : Number.NaN;
  const roots: RootRef[] = [];
  let hasMore = payload.has_more === true;
  for (const value of payload.results ?? []) {
    const root = toRoot(value);
    if (root === null) continue;
    if (!Number.isNaN(cutoff) && root.lastEdited <= cutoff) {
      // This root and every root after it are older than the last complete import: the walk
      // is done, whatever `has_more` says.
      hasMore = false;
      break;
    }
    roots.push(root);
  }
  return {
    roots,
    nextCursor: typeof payload.next_cursor === "string" ? payload.next_cursor : null,
    hasMore,
  };
}

interface RootCandidate extends RootRef {
  lastEdited: number;
}

/// A page or data source `search` returned, as a root the walk can open.
///
/// A data source is returned for what it is — a database the integration can see — and its
/// rows are read in the page walk that follows; a page's own title is on its properties, and
/// a data source's is on `title`.
function toRoot(value: unknown): RootCandidate | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as {
    object?: unknown;
    id?: unknown;
    url?: unknown;
    in_trash?: unknown;
    last_edited_time?: unknown;
    title?: { plain_text?: unknown }[];
    properties?: Record<string, { type?: unknown; title?: { plain_text?: unknown }[] }>;
  };
  if (entry.in_trash === true || typeof entry.id !== "string") return null;
  const lastEdited = Date.parse(String(entry.last_edited_time ?? ""));
  const edited = Number.isNaN(lastEdited) ? 0 : lastEdited;
  if (entry.object === "page") {
    const titleProperty = Object.values(entry.properties ?? {}).find((p) => p.type === "title");
    return {
      id: entry.id,
      title: plainText(titleProperty?.title) || "Untitled",
      url: String(entry.url ?? ""),
      lastEdited: edited,
    };
  }
  if (entry.object === "data_source") {
    return {
      id: entry.id,
      title: plainText(entry.title) || "Untitled",
      url: String(entry.url ?? ""),
      lastEdited: edited,
    };
  }
  return null;
}

/// The current root's whole text, or nil when it cannot be read or holds no words.
///
/// Reading is all or nothing: a page whose block listing fails partway emits no item at all,
/// rather than a body that looks complete but is not — the host keeps items by their keys,
/// and a partial body stored under the page's own key would stay partial on the next refresh
/// if the page was not edited again.
async function readRoot(state: WalkState, token: string, fetch: Fetch): Promise<MemoryItem | null> {
  try {
    await drainPage(state, token, fetch);
  } catch {
    // A page that will not open — the integration lost it, or Notion refused it — is passed
    // over rather than failing the walk: the workspace is the user's own, and one unreadable
    // page in it is not a reason to import none of it.
    return null;
  }
  return pageItem(state);
}

/// Every block of the current page, appended to `state.lines` as one line each.
///
/// The walk is depth-first and resumable: a page boundary can fall anywhere, so the position
/// lives in `state` rather than on the stack of this one call.
async function drainPage(state: WalkState, token: string, fetch: Fetch): Promise<void> {
  while (state.listing !== null || state.blocks.length > 0) {
    if (state.listing === null) {
      state.listing = state.blocks.shift() ?? null;
      state.blockCursor = null;
    }
    if (state.listing === null) break;
    const page = await childrenPage(state.listing, state.blockCursor, token, fetch);
    for (const block of page.blocks) {
      const line = block.text.trim();
      if (line.length > 0) state.lines.push(line);
      if (block.hasChildren) state.blocks.unshift(block.id);
    }
    state.blockCursor = page.nextCursor;
    if (state.blockCursor === null) state.listing = null;
  }
}

/// The current page as an item, or nil when it held no words.
function pageItem(state: WalkState): MemoryItem | null {
  const body = state.lines.join("\n").trim();
  if (body.length === 0 || state.pageID === null) return null;
  return {
    externalKey: `notion:${state.pageID}`,
    title: state.pageTitle,
    body,
    url: state.pageURL,
    locator: state.pageURL,
  };
}

interface BlockPage {
  blocks: { id: string; hasChildren: boolean; text: string }[];
  nextCursor: string | null;
}

/// One page of a block's children, or of a page's top-level blocks.
async function childrenPage(
  blockID: string,
  cursor: string | null,
  token: string,
  fetch: Fetch
): Promise<BlockPage> {
  const body: Record<string, unknown> = { page_size: MAXIMUM_PAGE };
  if (cursor !== null) body.start_cursor = cursor;
  const response = await request(fetch, token, "GET", `/blocks/${blockID}/children`, body);
  const payload = (await response.json()) as {
    results?: {
      id?: unknown;
      has_children?: unknown;
      type?: unknown;
      paragraph?: { rich_text?: { plain_text?: unknown }[] };
      heading_1?: { rich_text?: { plain_text?: unknown }[] };
      heading_2?: { rich_text?: { plain_text?: unknown }[] };
      heading_3?: { rich_text?: { plain_text?: unknown }[] };
      bulleted_list_item?: { rich_text?: { plain_text?: unknown }[] };
      numbered_list_item?: { rich_text?: { plain_text?: unknown }[] };
      to_do?: { rich_text?: { plain_text?: unknown }[] };
      toggle?: { rich_text?: { plain_text?: unknown }[] };
      quote?: { rich_text?: { plain_text?: unknown }[] };
      callout?: { rich_text?: { plain_text?: unknown }[] };
      code?: { rich_text?: { plain_text?: unknown }[] };
      table_row?: { cells?: { plain_text?: unknown }[][] };
      child_page?: { title?: unknown };
      child_database?: { title?: unknown };
    }[];
    has_more?: boolean;
    next_cursor?: string | null;
  };
  const blocks = (payload.results ?? []).map((block) => ({
    id: String(block.id ?? ""),
    hasChildren: block.has_children === true,
    text: blockText(block),
  }));
  return {
    blocks,
    nextCursor:
      payload.has_more === true && typeof payload.next_cursor === "string"
        ? payload.next_cursor
        : null,
  };
}

/// One block's own words, in the one line a reader sees for it.
///
/// `table_row` carries no `rich_text` of its own — its words are the cells — so it is the
/// one block whose line is assembled rather than read. `child_page` and `child_database`
/// carry a title rather than text. Every other block type answers with its own rich text,
/// and a type this walk does not know yields an empty line rather than a crash on a shape
/// Notion added after this list was written.
function blockText(block: {
  type?: unknown;
  paragraph?: { rich_text?: { plain_text?: unknown }[] };
  heading_1?: { rich_text?: { plain_text?: unknown }[] };
  heading_2?: { rich_text?: { plain_text?: unknown }[] };
  heading_3?: { rich_text?: { plain_text?: unknown }[] };
  bulleted_list_item?: { rich_text?: { plain_text?: unknown }[] };
  numbered_list_item?: { rich_text?: { plain_text?: unknown }[] };
  to_do?: { rich_text?: { plain_text?: unknown }[] };
  toggle?: { rich_text?: { plain_text?: unknown }[] };
  quote?: { rich_text?: { plain_text?: unknown }[] };
  callout?: { rich_text?: { plain_text?: unknown }[] };
  code?: { rich_text?: { plain_text?: unknown }[] };
  table_row?: { cells?: { plain_text?: unknown }[][] };
  child_page?: { title?: unknown };
  child_database?: { title?: unknown };
}): string {
  const type = String(block.type ?? "");
  if (type === "table_row") {
    return (block.table_row?.cells ?? [])
      .map((cell) => plainText(cell))
      .filter((cell) => cell.length > 0)
      .join(" | ");
  }
  if (type === "child_page" || type === "child_database") {
    return String(block[type]?.title ?? "").trim();
  }
  const container = block[type as keyof typeof block] as
    | { rich_text?: { plain_text?: unknown }[] }
    | undefined;
  return plainText(container?.rich_text);
}

function plainText(runs: { plain_text?: unknown }[] | undefined): string {
  return (runs ?? []).map((run) => String(run.plain_text ?? "")).join("").trim();
}

// --------------------------------------------------------------------------- cursor

function stateFrom(cursor: string | undefined): WalkState {
  const empty: WalkState = {
    searchCursor: null,
    searchDone: false,
    pageID: null,
    pageURL: "",
    pageTitle: "",
    listing: null,
    blockCursor: null,
    blocks: [],
    lines: [],
  };
  if (!cursor) return empty;
  try {
    const parsed = JSON.parse(cursor) as Partial<WalkState>;
    return {
      searchCursor: typeof parsed.searchCursor === "string" ? parsed.searchCursor : null,
      searchDone: parsed.searchDone === true,
      pageID: typeof parsed.pageID === "string" ? parsed.pageID : null,
      pageURL: typeof parsed.pageURL === "string" ? parsed.pageURL : "",
      pageTitle: typeof parsed.pageTitle === "string" ? parsed.pageTitle : "",
      listing: typeof parsed.listing === "string" ? parsed.listing : null,
      blockCursor: typeof parsed.blockCursor === "string" ? parsed.blockCursor : null,
      blocks: Array.isArray(parsed.blocks)
        ? parsed.blocks.filter((entry): entry is string => typeof entry === "string")
        : [],
      lines: Array.isArray(parsed.lines)
        ? parsed.lines.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  } catch {
    // An unreadable cursor restarts the walk. Repeating pages is recoverable — the host
    // matches them by their keys — while skipping them is not.
    return empty;
  }
}

function cursorFrom(state: WalkState): string {
  return JSON.stringify(state);
}

// --------------------------------------------------------------------------- request

async function request(
  fetch: Fetch,
  token: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<FetchResponse> {
  const init: FetchInit = {
    method,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Notion-Version": VERSION,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    timeoutMs: 30_000,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${API}${path}`, init);
  if (response.status >= 200 && response.status < 300) return response;
  if (response.status === 401) throw new NotionError("tokenRejected");
  if (response.status === 403 || response.status === 404) throw new NotionError("notShared");
  throw new NotionError("failed");
}
