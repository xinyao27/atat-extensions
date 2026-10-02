// The Notion API, as much of it as saving text needs.
//
// An internal integration's secret, read from the Keychain by the caller, is the whole
// credential; the integration only sees pages the user shared with it, which is why an
// empty search is a setup hint rather than an error. Text becomes paragraph blocks — one
// per line, each under Notion's 2,000-character rich-text limit, at most a hundred per
// request — so nothing the user saved is lost or silently cut.

import type { FetchInit, FetchResponse } from "@atat/api";

const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";
/// Notion refuses a rich-text run longer than this.
const MAXIMUM_RUN = 2_000;
/// Notion refuses more children than this in one request.
const MAXIMUM_BLOCKS = 100;

export type Fetch = (url: string, init?: FetchInit) => Promise<FetchResponse>;

export type NotionErrorKind = "missingToken" | "tokenRejected" | "notShared" | "tooLong" | "failed";

export class NotionError extends Error {
  constructor(readonly kind: NotionErrorKind) {
    super(kind);
  }
}

/// A place text can go: a page (append to it, or make a sub-page), or a database's data
/// source (add a row).
export interface Destination {
  id: string;
  kind: "page" | "dataSource";
  title: string;
  url: string;
  /// A data source's title property, which a new row's title is written into.
  titleProperty?: string;
}

export interface Saved {
  url: string;
  title: string;
}

/// Pages and databases the integration can see, most recently edited first.
export async function searchDestinations(token: string, query: string, fetch: Fetch): Promise<Destination[]> {
  const response = await request(fetch, token, "POST", "/search", {
    ...(query.trim().length > 0 ? { query: query.trim() } : {}),
    sort: { timestamp: "last_edited_time", direction: "descending" },
    page_size: 50,
  });
  const payload = (await response.json()) as { results?: unknown[] };
  return (payload.results ?? []).map(toDestination).filter((entry): entry is Destination => entry !== null);
}

/// Appends the text to the end of a page.
export async function appendToPage(
  token: string,
  page: Destination,
  text: string,
  fetch: Fetch
): Promise<Saved> {
  const blocks = paragraphs(text);
  if (blocks.length === 0) throw new NotionError("failed");
  if (blocks.length > MAXIMUM_BLOCKS) throw new NotionError("tooLong");
  await request(fetch, token, "PATCH", `/blocks/${page.id}/children`, { children: blocks });
  return { url: page.url, title: page.title };
}

/// Makes a new page — a sub-page of a page, or a row in a database — holding the text.
export async function createPage(
  token: string,
  parent: Destination,
  title: string,
  text: string,
  fetch: Fetch
): Promise<Saved> {
  const blocks = paragraphs(text);
  if (blocks.length > MAXIMUM_BLOCKS) throw new NotionError("tooLong");
  const name = title.replace(/\s+/g, " ").trim().slice(0, MAXIMUM_RUN) || "Untitled";
  const titleValue = { title: [{ type: "text", text: { content: name } }] };
  const body =
    parent.kind === "page"
      ? { parent: { page_id: parent.id }, properties: { title: titleValue }, children: blocks }
      : {
          parent: { data_source_id: parent.id },
          properties: { [parent.titleProperty ?? "Name"]: titleValue },
          children: blocks,
        };
  const response = await request(fetch, token, "POST", "/pages", body);
  const payload = (await response.json()) as { url?: unknown };
  return { url: String(payload.url ?? parent.url), title: name };
}

/// One paragraph block per line; a line longer than a run is split across several runs of
/// the same block, and a blank line stays a blank paragraph so spacing survives.
export function paragraphs(text: string): unknown[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "").split("\n");
  if (lines.length === 1 && (lines[0] ?? "").trim().length === 0) return [];
  return lines.map((line) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: runs(line) },
  }));
}

function runs(line: string): unknown[] {
  const characters = [...line];
  const result: unknown[] = [];
  for (let start = 0; start < characters.length; start += MAXIMUM_RUN) {
    result.push({ type: "text", text: { content: characters.slice(start, start + MAXIMUM_RUN).join("") } });
  }
  return result;
}

function toDestination(value: unknown): Destination | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as {
    object?: unknown;
    id?: unknown;
    url?: unknown;
    in_trash?: unknown;
    title?: { plain_text?: unknown }[];
    properties?: Record<string, { type?: unknown; title?: { plain_text?: unknown }[] }>;
  };
  if (entry.in_trash === true || typeof entry.id !== "string") return null;
  if (entry.object === "page") {
    const titleProperty = Object.values(entry.properties ?? {}).find((property) => property.type === "title");
    return {
      id: entry.id,
      kind: "page",
      title: plainText(titleProperty?.title) || "Untitled",
      url: String(entry.url ?? ""),
    };
  }
  if (entry.object === "data_source") {
    const titleProperty = Object.entries(entry.properties ?? {}).find(([, property]) => property.type === "title");
    return {
      id: entry.id,
      kind: "dataSource",
      title: plainText(entry.title) || "Untitled",
      url: String(entry.url ?? ""),
      titleProperty: titleProperty?.[0] ?? "Name",
    };
  }
  return null;
}

function plainText(runs: { plain_text?: unknown }[] | undefined): string {
  return (runs ?? []).map((run) => String(run.plain_text ?? "")).join("").trim();
}

async function request(
  fetch: Fetch,
  token: string,
  method: "POST" | "PATCH",
  path: string,
  body: unknown
): Promise<FetchResponse> {
  if (token.trim().length === 0) throw new NotionError("missingToken");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });
  if (response.status >= 200 && response.status < 300) return response;
  if (response.status === 401) throw new NotionError("tokenRejected");
  if (response.status === 403 || response.status === 404) throw new NotionError("notShared");
  throw new NotionError("failed");
}
