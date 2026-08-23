// The qmd client.
//
// qmd is the user's own local search engine, running as `qmd mcp --http` on the loopback
// interface. That is the whole reason this plugin declares `network`: the one host it talks to
// is 127.0.0.1, and the plugin's own `fetch` is the only exit it has.
//
// Two rules shape everything here. Recall is optional — a user who has not installed qmd still
// gets a working memory, so an unreachable server is a normal outcome and never an error the
// user is told about. And recall is on the critical path of every request, so the client
// carries its own deadline rather than trusting the transport's.

import type { FetchInit, FetchResponse } from "@atat/plugin-types";

/** The two shapes of `fetch` a plugin has: `ctx.fetch` in a hook, `fetch` in a panel. */
export type FetchFunction = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/** One hit, as qmd's `query` tool reports it. */
export interface QmdHit {
  /** `#abc123`, qmd's own short document id. */
  docid: string;
  /** `<collection>/<path relative to the collection root>`. */
  file: string;
  title: string;
  score: number;
  context: string | null;
  line: number;
  /** An excerpt around the match, with line numbers prefixed by qmd. */
  snippet: string;
}

export interface QmdQueryRequest {
  port: string;
  collections: string[];
  text: string;
  limit: number;
  /** This client's own budget. The host floors `fetch`'s timeout at one second. */
  deadlineMs: number;
}

/**
 * `reachable: false` is the qmd-is-not-running answer, and it is not a failure: the caller
 * degrades to no recall, or to browsing without search.
 */
export type QmdQueryOutcome =
  | { reachable: true; hits: QmdHit[] }
  | { reachable: false; reason: string };

export interface QmdCollectionStatus {
  name: string;
  path: string | null;
  documents: number;
}

const MCP_PATH = "/mcp";
/** Long enough to be a query, short enough that the whole thing stays a snippet of prompt. */
const MAXIMUM_QUERY_CHARACTERS = 600;

export function endpoint(port: string): string {
  return "http://127.0.0.1:" + normalizedPort(port) + MCP_PATH;
}

export function normalizedPort(port: string): string {
  const digits = String(port == null ? "" : port).replace(/[^0-9]/g, "");
  if (digits.length === 0) return "8181";
  return digits;
}

/**
 * Runs one `query` tool call.
 *
 * Typed sub-queries rather than a plain `query`, and no reranking: both of qmd's smarter paths
 * put a local language model on the critical path of every AtAt request, which is exactly the
 * latency this hook's budget does not have. Lexical and vector retrieval fused is what fits.
 */
export async function queryQmd(
  fetchFunction: FetchFunction,
  request: QmdQueryRequest
): Promise<QmdQueryOutcome> {
  const text = normalizeQuery(request.text);
  if (text.length === 0) return { reachable: true, hits: [] };

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "query",
      arguments: {
        searches: [
          { type: "lex", query: text },
          { type: "vec", query: text },
        ],
        collections: request.collections,
        limit: Math.max(1, Math.min(20, request.limit)),
        rerank: false,
      },
    },
  };

  const outcome = await call(fetchFunction, request, body);
  if (!outcome.reachable) return outcome;
  return { reachable: true, hits: readHits(outcome.payload) };
}

/** The `status` tool, which is how the panel says whether search is available at all. */
export async function statusQmd(
  fetchFunction: FetchFunction,
  request: { port: string; deadlineMs: number }
): Promise<
  { reachable: true; collections: QmdCollectionStatus[] } | { reachable: false; reason: string }
> {
  const outcome = await call(
    fetchFunction,
    { port: request.port, deadlineMs: request.deadlineMs },
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "status", arguments: {} } }
  );
  if (!outcome.reachable) return outcome;
  const structured = structuredContent(outcome.payload);
  const collections = structured && Array.isArray(structured["collections"])
    ? (structured["collections"] as Record<string, unknown>[]).map((entry) => ({
        name: String(entry["name"] ?? ""),
        path: typeof entry["path"] === "string" ? entry["path"] : null,
        documents: Number(entry["documents"] ?? 0),
      }))
    : [];
  return { reachable: true, collections };
}

// ---------------------------------------------------------------------- transport

type CallOutcome =
  | { reachable: true; payload: Record<string, unknown> }
  | { reachable: false; reason: string };

async function call(
  fetchFunction: FetchFunction,
  request: { port: string; deadlineMs: number },
  body: unknown
): Promise<CallOutcome> {
  let response: FetchResponse;
  try {
    response = await withDeadline(
      fetchFunction(endpoint(request.port), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Both media types, because a Streamable HTTP endpoint is entitled to answer
          // either. qmd is configured for JSON, and the parser below copes with the other.
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
        timeoutMs: request.deadlineMs,
      }),
      request.deadlineMs
    );
  } catch (error) {
    return { reachable: false, reason: messageOf(error) };
  }
  if (response.status < 200 || response.status >= 300) {
    return { reachable: false, reason: "HTTP " + String(response.status) };
  }

  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    return { reachable: false, reason: messageOf(error) };
  }
  const envelope = parseEnvelope(raw);
  if (!envelope) return { reachable: false, reason: "unreadable response" };
  const error = envelope["error"];
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>)["message"];
    return { reachable: false, reason: typeof message === "string" ? message : "JSON-RPC error" };
  }
  const result = envelope["result"];
  if (!result || typeof result !== "object") {
    return { reachable: false, reason: "no result" };
  }
  return { reachable: true, payload: result as Record<string, unknown> };
}

/**
 * The plugin's own deadline, on top of the transport's.
 *
 * `ctx.fetch`'s timeout is floored at one second by the host, and this hook's whole budget is
 * a second and a half. Losing the race means giving up on recall for this request while the
 * request itself goes out on time — the promise underneath is simply abandoned.
 */
function withDeadline<Value>(work: Promise<Value>, milliseconds: number): Promise<Value> {
  return Promise.race([
    work,
    sleep(milliseconds).then<Value>(() => {
      throw new Error("timed out after " + String(milliseconds) + "ms");
    }),
  ]);
}

/** Accepts a JSON body, and an SSE frame in case the endpoint answers in that mode. */
function parseEnvelope(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  const direct = parseJSON(text);
  if (direct) return direct;
  for (const line of text.split(/\r?\n/)) {
    if (line.indexOf("data:") !== 0) continue;
    const parsed = parseJSON(line.slice(5).trim());
    if (parsed) return parsed;
  }
  return null;
}

function parseJSON(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------ results

function structuredContent(payload: Record<string, unknown>): Record<string, unknown> | null {
  const structured = payload["structuredContent"];
  if (structured && typeof structured === "object") {
    return structured as Record<string, unknown>;
  }
  return null;
}

/**
 * `structuredContent.results` first, the human-readable summary second.
 *
 * The summary parser is not redundancy for its own sake: the structured field is the newer of
 * the two shapes, and a plugin that only understood it would silently recall nothing against
 * an older qmd instead of degrading to titles.
 */
function readHits(payload: Record<string, unknown>): QmdHit[] {
  const structured = structuredContent(payload);
  const results = structured ? structured["results"] : undefined;
  if (Array.isArray(results)) {
    const hits: QmdHit[] = [];
    for (const entry of results) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const file = typeof record["file"] === "string" ? record["file"] : "";
      if (file.length === 0) continue;
      hits.push({
        docid: typeof record["docid"] === "string" ? record["docid"] : "",
        file,
        title: typeof record["title"] === "string" ? record["title"] : basename(file),
        score: Number(record["score"] ?? 0),
        context: typeof record["context"] === "string" ? record["context"] : null,
        line: Number(record["line"] ?? 1),
        snippet: typeof record["snippet"] === "string" ? record["snippet"] : "",
      });
    }
    return hits;
  }
  return parseSummary(payload);
}

/** `#abc123 87% collection/path.md - Title`, one hit per line. */
function parseSummary(payload: Record<string, unknown>): QmdHit[] {
  const content = payload["content"];
  if (!Array.isArray(content)) return [];
  const hits: QmdHit[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const text = (part as Record<string, unknown>)["text"];
    if (typeof text !== "string") continue;
    for (const line of text.split(/\r?\n/)) {
      const match = /^(#[0-9a-z]+)\s+(\d+)%\s+(\S+)\s+-\s+(.*)$/i.exec(line.trim());
      if (!match) continue;
      hits.push({
        docid: match[1] ?? "",
        file: match[3] ?? "",
        title: (match[4] ?? "").trim(),
        score: Number(match[2] ?? 0) / 100,
        context: null,
        line: 1,
        snippet: "",
      });
    }
  }
  return hits;
}

// -------------------------------------------------------------------------- text

function normalizeQuery(text: string): string {
  return String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAXIMUM_QUERY_CHARACTERS);
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
