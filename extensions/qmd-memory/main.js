// Built by scripts/build.mjs from src/. Do not edit.
// qmd-memory 1.0.0
'use strict';
var require = typeof require === 'function' ? require : function () { return {}; };
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");
let _atat_ui = require("@atat/ui");
let react_jsx_runtime = require("react/jsx-runtime");

//#region extensions/qmd-memory/src/notes.ts
/** `files.read` and `files.write` carry base64, so a note has to be encoded going both ways. */
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/**
* UTF-8 text to base64, without going through `btoa`.
*
* `btoa` is Latin-1 only — the prelude's implementation throws above code point 255 — and a
* memory written in Chinese is the normal case, not the edge case.
*/
function encodeText(text) {
	return encodeBytes(new TextEncoder().encode(String(text == null ? "" : text)));
}
function encodeBytes(bytes) {
	let output = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const first = bytes[index] ?? 0;
		const second = bytes[index + 1];
		const third = bytes[index + 2];
		const block = first << 16 | (second ?? 0) << 8 | (third ?? 0);
		output += BASE64_ALPHABET.charAt(block >> 18 & 63);
		output += BASE64_ALPHABET.charAt(block >> 12 & 63);
		output += second === void 0 ? "=" : BASE64_ALPHABET.charAt(block >> 6 & 63);
		output += third === void 0 ? "=" : BASE64_ALPHABET.charAt(block & 63);
	}
	return output;
}
function decodeText(base64) {
	const clean = String(base64 == null ? "" : base64).replace(/[^A-Za-z0-9+/]/g, "");
	const bytes = [];
	let buffer = 0;
	let bits = 0;
	for (let index = 0; index < clean.length; index += 1) {
		const value = BASE64_ALPHABET.indexOf(clean.charAt(index));
		if (value < 0) continue;
		buffer = buffer << 6 | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			bytes.push(buffer >> bits & 255);
		}
	}
	return new TextDecoder().decode(new Uint8Array(bytes));
}
function joinPath(...parts) {
	const cleaned = [];
	for (const part of parts) {
		const text = String(part == null ? "" : part);
		if (text.length === 0) continue;
		cleaned.push(cleaned.length === 0 ? trimTrailingSlash(text) : trimSlashes(text));
	}
	return cleaned.join("/");
}
function basename$1(path) {
	const parts = trimTrailingSlash(String(path == null ? "" : path)).split("/");
	return parts[parts.length - 1] ?? "";
}
function extensionOf(path) {
	const name = basename$1(path);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}
/** Whether `path` is inside `directory`, compared as path segments rather than as text. */
function isInside(directory, path) {
	const root = trimTrailingSlash(directory);
	if (root.length === 0) return false;
	return path === root || path.indexOf(root + "/") === 0;
}
function trimTrailingSlash(text) {
	let result = text;
	while (result.length > 1 && result.charAt(result.length - 1) === "/") result = result.slice(0, -1);
	return result;
}
function trimSlashes(text) {
	let result = text;
	while (result.charAt(0) === "/") result = result.slice(1);
	return trimTrailingSlash(result);
}
function stamp(now) {
	const date = now ?? /* @__PURE__ */ new Date();
	const compact = String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate()) + "-" + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes < 0 ? "-" : "+";
	const absolute = Math.abs(offsetMinutes);
	return {
		compact,
		iso: String(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds()) + sign + pad(Math.floor(absolute / 60)) + ":" + pad(absolute % 60)
	};
}
/** Only to keep two notes written in the same second apart. Nothing depends on it being hard. */
function token(length = 4) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	let output = "";
	for (let index = 0; index < length; index += 1) output += alphabet.charAt(Math.floor(Math.random() * 36));
	return output;
}
function pad(value) {
	return value < 10 ? "0" + String(value) : String(value);
}
/**
* A note as it is written to disk: YAML front matter, then markdown.
*
* The front matter is deliberately flat and quoted conservatively — these files are read by
* qmd, by a text editor and by whatever a phone Shortcut appends, so the format has to be the
* boring one everything already understands.
*/
function buildNote(fields, body) {
	const lines = ["---"];
	for (const key of Object.keys(fields)) {
		const value = fields[key];
		if (value === void 0 || value === null) continue;
		lines.push(key + ": " + formatScalar(value));
	}
	lines.push("---", "");
	return lines.join("\n") + String(body == null ? "" : body).replace(/\s+$/, "") + "\n";
}
function formatScalar(value) {
	if (typeof value === "boolean" || typeof value === "number") return String(value);
	const text = String(value).replace(/\r?\n/g, " ").trim();
	if (text.length === 0) return "\"\"";
	if (/^[A-Za-z0-9][A-Za-z0-9 _./:+@-]*$/.test(text)) return text;
	return "\"" + text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
}
function parseNote(content) {
	const text = String(content == null ? "" : content).replace(/^﻿/, "");
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	if (!match) return {
		fields: {},
		body: text
	};
	const fields = {};
	for (const line of (match[1] ?? "").split(/\r?\n/)) {
		const separator = line.indexOf(":");
		if (separator <= 0) continue;
		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1).trim();
		if (value.length >= 2 && value.charAt(0) === "\"" && value.charAt(value.length - 1) === "\"") value = value.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
		if (key.length > 0) fields[key] = value;
	}
	return {
		fields,
		body: text.slice(match[0].length)
	};
}
/** The front matter title, then the first heading, then the first line of text. */
function titleOf(content, fallback) {
	const note = parseNote(content);
	const declared = note.fields["title"];
	if (declared && declared.length > 0) return declared;
	for (const line of note.body.split(/\r?\n/)) {
		const text = line.trim();
		if (text.length === 0) continue;
		const heading = /^#{1,6}\s+(.*)$/.exec(text);
		return truncate(heading ? (heading[1] ?? "").trim() : text, 120);
	}
	return fallback;
}
function truncate(text, limit) {
	const value = String(text == null ? "" : text);
	if (value.length <= limit) return value;
	return value.slice(0, Math.max(0, limit - 1)) + "…";
}
/** qmd prefixes every snippet line with `N: `. Useful in a terminal, noise in a prompt. */
function stripLineNumbers(snippet) {
	return String(snippet == null ? "" : snippet).split(/\r?\n/).map((line) => line.replace(/^\s*\d+:\s?/, "")).join("\n").trim();
}
const IMAGE_EXTENSIONS = [
	"png",
	"jpg",
	"jpeg",
	"gif",
	"heic",
	"webp",
	"tiff",
	"bmp"
];
function isImagePath(path) {
	return IMAGE_EXTENSIONS.indexOf(extensionOf(path)) >= 0;
}
/**
* The relative image references in a piece of markdown.
*
* Only relative ones: an `http://` image is not a file this plugin could attach, and an
* absolute path in someone else's note is not a path the plugin has any business resolving.
*/
function imageReferences(markdown) {
	const text = String(markdown == null ? "" : markdown);
	const found = [];
	const pattern = /!\[[^\]]*\]\(([^)\s]+)/g;
	let match = pattern.exec(text);
	while (match) {
		const target = decodeURIComponentSafely(match[1] ?? "");
		if (target.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(target) && target.charAt(0) !== "/") {
			if (isImagePath(target) && found.indexOf(target) < 0) found.push(target);
		}
		match = pattern.exec(text);
	}
	return found;
}
function decodeURIComponentSafely(text) {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
}

//#endregion
//#region extensions/qmd-memory/src/library.ts
/** Created by `setup/setup.sh`, and the names recall filters on. */
const MEMORY_COLLECTION = "atat-memory";
const TRAJECTORY_COLLECTION = "atat-trajectory";
/** Where a memory lands: the same folder a phone Shortcut appends to. */
const INBOX_DIRECTORY = "inbox";
/** Where a captured image lands, next to the note that references it. */
const ASSETS_DIRECTORY = "assets";
const OPTION_MEMORY_FOLDER = "memoryFolder";
const OPTION_TRAJECTORY_FOLDER = "trajectoryFolder";
const OPTION_PORT = "qmdPort";
const OPTION_RECORDS = "recordsInteractions";
const OPTION_RECALL_LIMIT = "recallLimit";
function readConfiguration(options) {
	return {
		memoryDirectory: readPath(options[OPTION_MEMORY_FOLDER]),
		trajectoryDirectory: readPath(options[OPTION_TRAJECTORY_FOLDER]),
		port: typeof options["qmdPort"] === "string" ? options[OPTION_PORT] : "8181",
		recordsInteractions: options[OPTION_RECORDS] !== false,
		recallLimit: readLimit(options[OPTION_RECALL_LIMIT])
	};
}
function readPath(value) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	return trimmed.charAt(0) === "/" ? trimmed.replace(/\/+$/, "") : "";
}
function readLimit(value) {
	const parsed = typeof value === "string" ? parseInt(value, 10) : NaN;
	if (!(parsed > 0)) return 3;
	return Math.min(10, parsed);
}
/** The collections recall should ask for: the library always, the trajectory when granted. */
function collections(configuration) {
	const result = [];
	if (configuration.memoryDirectory.length > 0) result.push({
		name: MEMORY_COLLECTION,
		root: configuration.memoryDirectory,
		kind: "memory"
	});
	if (configuration.trajectoryDirectory.length > 0) result.push({
		name: TRAJECTORY_COLLECTION,
		root: configuration.trajectoryDirectory,
		kind: "trajectory"
	});
	return result;
}
/**
* A qmd result path to an absolute one inside a granted directory.
*
* qmd reports `<collection>/<path relative to the collection root>`, sometimes wrapped as a
* `qmd://` URI. Mapping it back needs the collection roots, which is why the collection names
* are fixed by `setup.sh` rather than configurable — a name the plugin cannot map is a hit it
* has to throw away.
*
* Anything that does not land inside a granted directory returns `null`. The host's allow list
* would refuse such a path anyway; refusing it here means a mistake shows up as a missing
* result rather than as a hook failure counted against the plugin.
*/
function resolveHitPath(configuration, file) {
	const roots = collections(configuration);
	if (roots.length === 0) return null;
	let text = String(file == null ? "" : file).trim();
	if (text.length === 0) return null;
	if (text.indexOf("qmd://") === 0) text = text.slice(6);
	text = decodeSegments(text);
	for (const collection of roots) {
		const prefix = collection.name + "/";
		if (text.indexOf(prefix) === 0) return {
			path: joinPath(collection.root, text.slice(prefix.length)),
			kind: collection.kind
		};
	}
	if (text.charAt(0) === "/") {
		for (const collection of roots) if (isInside(collection.root, text)) return {
			path: text,
			kind: collection.kind
		};
		return null;
	}
	const only = roots[0];
	if (roots.length === 1 && only) return {
		path: joinPath(only.root, text),
		kind: only.kind
	};
	return null;
}
function decodeSegments(path) {
	return path.split("/").map((segment) => {
		try {
			return decodeURIComponent(segment);
		} catch {
			return segment;
		}
	}).join("/");
}
function inboxDirectory(configuration) {
	return joinPath(configuration.memoryDirectory, INBOX_DIRECTORY);
}
function assetsDirectory(configuration) {
	return joinPath(configuration.memoryDirectory, ASSETS_DIRECTORY);
}

//#endregion
//#region extensions/qmd-memory/src/qmd.ts
const MCP_PATH = "/mcp";
/** Long enough to be a query, short enough that the whole thing stays a snippet of prompt. */
const MAXIMUM_QUERY_CHARACTERS$1 = 600;
function endpoint(port) {
	return "http://127.0.0.1:" + normalizedPort(port) + MCP_PATH;
}
function normalizedPort(port) {
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
async function queryQmd(fetchFunction, request) {
	const text = normalizeQuery(request.text);
	if (text.length === 0) return {
		reachable: true,
		hits: []
	};
	const outcome = await call(fetchFunction, request, {
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: {
			name: "query",
			arguments: {
				searches: [{
					type: "lex",
					query: text
				}, {
					type: "vec",
					query: text
				}],
				collections: request.collections,
				limit: Math.max(1, Math.min(20, request.limit)),
				rerank: false
			}
		}
	});
	if (!outcome.reachable) return outcome;
	return {
		reachable: true,
		hits: readHits(outcome.payload)
	};
}
/** The `status` tool, which is how the panel says whether search is available at all. */
async function statusQmd(fetchFunction, request) {
	const outcome = await call(fetchFunction, {
		port: request.port,
		deadlineMs: request.deadlineMs
	}, {
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: {
			name: "status",
			arguments: {}
		}
	});
	if (!outcome.reachable) return outcome;
	const structured = structuredContent(outcome.payload);
	return {
		reachable: true,
		collections: structured && Array.isArray(structured["collections"]) ? structured["collections"].map((entry) => ({
			name: String(entry["name"] ?? ""),
			path: typeof entry["path"] === "string" ? entry["path"] : null,
			documents: Number(entry["documents"] ?? 0)
		})) : []
	};
}
async function call(fetchFunction, request, body) {
	let response;
	try {
		response = await withDeadline(fetchFunction(endpoint(request.port), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream"
			},
			body: JSON.stringify(body),
			timeoutMs: request.deadlineMs
		}), request.deadlineMs);
	} catch (error) {
		return {
			reachable: false,
			reason: messageOf$4(error)
		};
	}
	if (response.status < 200 || response.status >= 300) return {
		reachable: false,
		reason: "HTTP " + String(response.status)
	};
	let raw;
	try {
		raw = await response.text();
	} catch (error) {
		return {
			reachable: false,
			reason: messageOf$4(error)
		};
	}
	const envelope = parseEnvelope(raw);
	if (!envelope) return {
		reachable: false,
		reason: "unreadable response"
	};
	const error = envelope["error"];
	if (error && typeof error === "object") {
		const message = error["message"];
		return {
			reachable: false,
			reason: typeof message === "string" ? message : "JSON-RPC error"
		};
	}
	const result = envelope["result"];
	if (!result || typeof result !== "object") return {
		reachable: false,
		reason: "no result"
	};
	return {
		reachable: true,
		payload: result
	};
}
/**
* The plugin's own deadline, on top of the transport's.
*
* `ctx.fetch`'s timeout is floored at one second by the host, and this hook's whole budget is
* a second and a half. Losing the race means giving up on recall for this request while the
* request itself goes out on time — the promise underneath is simply abandoned.
*/
function withDeadline(work, milliseconds) {
	return Promise.race([work, sleep(milliseconds).then(() => {
		throw new Error("timed out after " + String(milliseconds) + "ms");
	})]);
}
/** Accepts a JSON body, and an SSE frame in case the endpoint answers in that mode. */
function parseEnvelope(raw) {
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
function parseJSON(text) {
	try {
		const value = JSON.parse(text);
		return value && typeof value === "object" ? value : null;
	} catch {
		return null;
	}
}
function structuredContent(payload) {
	const structured = payload["structuredContent"];
	if (structured && typeof structured === "object") return structured;
	return null;
}
/**
* `structuredContent.results` first, the human-readable summary second.
*
* The summary parser is not redundancy for its own sake: the structured field is the newer of
* the two shapes, and a plugin that only understood it would silently recall nothing against
* an older qmd instead of degrading to titles.
*/
function readHits(payload) {
	const structured = structuredContent(payload);
	const results = structured ? structured["results"] : void 0;
	if (Array.isArray(results)) {
		const hits = [];
		for (const entry of results) {
			if (!entry || typeof entry !== "object") continue;
			const record = entry;
			const file = typeof record["file"] === "string" ? record["file"] : "";
			if (file.length === 0) continue;
			hits.push({
				docid: typeof record["docid"] === "string" ? record["docid"] : "",
				file,
				title: typeof record["title"] === "string" ? record["title"] : basename(file),
				score: Number(record["score"] ?? 0),
				context: typeof record["context"] === "string" ? record["context"] : null,
				line: Number(record["line"] ?? 1),
				snippet: typeof record["snippet"] === "string" ? record["snippet"] : ""
			});
		}
		return hits;
	}
	return parseSummary(payload);
}
/** `#abc123 87% collection/path.md - Title`, one hit per line. */
function parseSummary(payload) {
	const content = payload["content"];
	if (!Array.isArray(content)) return [];
	const hits = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const text = part["text"];
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
				snippet: ""
			});
		}
	}
	return hits;
}
function normalizeQuery(text) {
	return String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, MAXIMUM_QUERY_CHARACTERS$1);
}
function basename(path) {
	const parts = path.split("/");
	return parts[parts.length - 1] ?? path;
}
function messageOf$4(error) {
	if (!error) return "unknown error";
	const message = error.message;
	return typeof message === "string" ? message : String(error);
}

//#endregion
//#region extensions/qmd-memory/src/panel.tsx
/** A panel is interactive, so it can afford more than a hook's 800ms. */
const PANEL_DEADLINE_MS = 5e3;
/** The list is virtualised by the host, but the bridge still carries every row. */
const MAXIMUM_ROWS = 200;
/**
* How many of the newest notes get their real title.
*
* A title lives in a note's front matter, so reading it means reading the file. Two hundred
* reads to draw one list is not a trade worth making; the newest few get their titles and the
* rest are named by their file, which is a date and therefore never meaningless.
*/
const TITLE_BUDGET = 25;
/** Whether panel search covers the trajectory as well. A panel preference, so it lives here. */
const SEARCH_TRAJECTORY_KEY = "panel.searchesTrajectory";
async function browse(configuration) {
	const directory = joinPath(configuration.memoryDirectory, INBOX_DIRECTORY);
	const names = (await _atat_ui.files.list(directory)).filter((entry) => !entry.isDirectory && /\.md$/i.test(entry.name)).map((entry) => entry.name).sort().reverse();
	const shown = names.slice(0, MAXIMUM_ROWS);
	const titled = await Promise.all(shown.slice(0, TITLE_BUDGET).map(async (name) => {
		const path = joinPath(directory, name);
		try {
			const content = decodeText((await _atat_ui.files.read(path)).base64);
			return titleOf(content, stem(name));
		} catch {
			return stem(name);
		}
	}));
	const rows = shown.map((name, index) => ({
		path: joinPath(directory, name),
		title: titled[index] ?? stem(name),
		subtitle: describeDate(name),
		accessory: null,
		kind: "memory"
	}));
	const status = await statusQmd(_atat_ui.fetch, {
		port: configuration.port,
		deadlineMs: PANEL_DEADLINE_MS
	});
	return {
		rows,
		mode: "browse",
		reachable: status.reachable,
		truncated: names.length > shown.length,
		documents: status.reachable ? status.collections.reduce((total, entry) => total + entry.documents, 0) : null
	};
}
async function search(configuration, query, includesTrajectory) {
	const searched = collections(configuration).filter((collection) => includesTrajectory || collection.kind === "memory");
	const outcome = await queryQmd(_atat_ui.fetch, {
		port: configuration.port,
		collections: searched.map((collection) => collection.name),
		text: query,
		limit: 20,
		deadlineMs: PANEL_DEADLINE_MS
	});
	if (!outcome.reachable) {
		(0, _atat_ui.log)("panel search unavailable: qmd " + outcome.reason);
		return {
			rows: [],
			mode: "search",
			reachable: false,
			truncated: false,
			documents: null
		};
	}
	const rows = [];
	const seen = {};
	for (const hit of outcome.hits) {
		const resolved = resolveHitPath(configuration, hit.file);
		if (!resolved || seen[resolved.path]) continue;
		seen[resolved.path] = true;
		rows.push({
			path: resolved.path,
			title: hit.title.length > 0 ? hit.title : basename$1(resolved.path),
			subtitle: truncate(stripLineNumbers(hit.snippet).replace(/\s+/g, " "), 140),
			accessory: String(Math.round(hit.score * 100)) + "%",
			kind: resolved.kind
		});
	}
	return {
		rows,
		mode: "search",
		reachable: true,
		truncated: false,
		documents: null
	};
}
function NoteDetail(props) {
	const note = (0, _atat_ui.usePromise)(async (path) => decodeText((await _atat_ui.files.read(path)).base64), [props.path]);
	const content = note.data ?? "";
	const markdown = note.isLoading ? "Loading…" : note.error ? "This note could not be read. It may have been moved or deleted." : content;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Detail, {
		markdown,
		actions: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_atat_ui.ActionPanel, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action.SendToComposer, {
				title: "Send to Composer",
				content,
				label: "Memory · " + basename$1(props.path)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action.CopyToClipboard, {
				title: "Copy Note",
				content
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action.CopyToClipboard, {
				title: "Copy Path",
				content: props.path
			})
		] })
	});
}
/**
* Panel preferences — and only panel preferences.
*
* The memory folder, the trajectory folder, the port and the auto-record switch are all
* manifest options: the host renders them, the host stores them, and a folder grant has to come
* from the user's own hand in a native panel. Drawing a copy of that switch here would be a
* control that looks like it works and does not, so the panel shows those as status and owns
* only the one preference that is genuinely its own.
*/
function Preferences(props) {
	const navigation = (0, _atat_ui.useNavigation)();
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Form, {
		actions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.ActionPanel, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action, {
			title: "Done",
			onAction: () => navigation.pop()
		}) }),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Form.Checkbox, {
			id: "searchesTrajectory",
			title: "Search the trajectory too",
			info: props.hasTrajectory ? "Searches recorded interactions alongside your saved memories." : "Available once a trajectory folder is granted in Settings → Plugins → qmd-memory.",
			value: props.searchesTrajectory,
			onChange: (value) => {
				props.onChange(value);
				_atat_ui.storage.set(SEARCH_TRAJECTORY_KEY, value).catch((error) => {
					(0, _atat_ui.showToast)({
						title: "Could not save that preference",
						message: messageOf$3(error)
					});
				});
			}
		})
	});
}
function MemoryPanel() {
	const configuration = readConfiguration(_atat_ui.options);
	const [query, setQuery] = (0, react.useState)("");
	const [searchesTrajectory, setSearchesTrajectory] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		_atat_ui.storage.get(SEARCH_TRAJECTORY_KEY).then((stored) => {
			if (stored === true) setSearchesTrajectory(true);
		}).catch(() => {});
	}, []);
	const state = (0, _atat_ui.usePromise)(async (text, includesTrajectory) => {
		if (configuration.memoryDirectory.length === 0) return {
			rows: [],
			mode: "browse",
			reachable: null,
			truncated: false,
			documents: null
		};
		const trimmed = text.trim();
		return trimmed.length === 0 ? await browse(configuration) : await search(configuration, trimmed, includesTrajectory);
	}, [query, searchesTrajectory]);
	const data = state.data;
	const rows = data?.rows ?? [];
	const remove = (row) => {
		_atat_ui.files.remove(row.path).then(() => {
			(0, _atat_ui.showToast)({
				title: "Deleted",
				message: basename$1(row.path)
			});
			state.revalidate();
		}).catch((error) => {
			(0, _atat_ui.showToast)({
				title: "Could not delete that note",
				message: messageOf$3(error)
			});
		});
	};
	const send = (row) => {
		_atat_ui.files.read(row.path).then((payload) => (0, _atat_ui.sendToComposer)(decodeText(payload.base64), "Memory · " + row.title)).catch((error) => {
			(0, _atat_ui.showToast)({
				title: "Could not send that note",
				message: messageOf$3(error)
			});
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_atat_ui.List, {
		searchBarPlaceholder: "Search your memory",
		onSearchTextChange: setQuery,
		isLoading: state.isLoading,
		emptyTitle: emptyTitle(configuration, query, data, state.error),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.List.Section, {
			title: sectionTitle(data, rows.length),
			children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.List.Item, {
				title: row.title,
				subtitle: row.subtitle,
				accessories: accessories(row),
				actions: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_atat_ui.ActionPanel, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action.Push, {
						title: "Preview",
						target: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NoteDetail, { path: row.path })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action, {
						title: "Send to Composer",
						onAction: () => send(row)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action.CopyToClipboard, {
						title: "Copy Path",
						content: row.path
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action, {
						title: "Delete",
						style: _atat_ui.Action.Style.Destructive,
						confirmTitle: "Delete this memory?",
						confirmMessage: basename$1(row.path) + " will be removed from the folder. This cannot be undone.",
						onAction: () => remove(row)
					})
				] })
			}, row.path))
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_atat_ui.List.Section, {
			title: "Library",
			children: [statusRows(configuration, data).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.List.Item, {
				title: entry.title,
				subtitle: entry.subtitle
			}, entry.title)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.List.Item, {
				title: "Panel preferences",
				subtitle: searchesTrajectory ? "Search covers memories and the trajectory" : "Search covers saved memories only",
				actions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.ActionPanel, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_atat_ui.Action.Push, {
					title: "Open Preferences",
					target: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preferences, {
						searchesTrajectory,
						hasTrajectory: configuration.trajectoryDirectory.length > 0,
						onChange: setSearchesTrajectory
					})
				}) })
			}, "preferences")]
		})]
	});
}
function accessories(row) {
	const entries = [];
	if (row.kind === "trajectory") entries.push({ text: "Trajectory" });
	if (row.accessory) entries.push({ text: row.accessory });
	return entries.length > 0 ? entries : void 0;
}
function sectionTitle(data, count) {
	if (!data) return "Memories";
	const suffix = data.truncated ? " (newest " + String(count) + ")" : "";
	return (data.mode === "search" ? "Matches" : "Memories") + suffix;
}
function emptyTitle(configuration, query, data, error) {
	if (configuration.memoryDirectory.length === 0) return "Choose a memory folder in Settings → Plugins → qmd-memory to get started.";
	if (error) return "The memory folder could not be read: " + messageOf$3(error);
	if (!data) return "Loading…";
	if (data.mode === "search" && data.reachable === false) return "Install and start qmd to unlock search. Browsing is unaffected.";
	if (data.mode === "search") return "No memories match “" + truncate(query.trim(), 40) + "”.";
	return "No memories yet. Use “Save to memory” from a selection, a clipboard entry or a capture.";
}
function statusRows(configuration, data) {
	const rows = [
		{
			title: "Memory folder",
			subtitle: configuration.memoryDirectory.length > 0 ? configuration.memoryDirectory : "Not granted — Settings → Plugins → qmd-memory"
		},
		{
			title: "Trajectory folder",
			subtitle: configuration.trajectoryDirectory.length > 0 ? configuration.trajectoryDirectory : "Not granted — automatic recording is off until it is"
		},
		{
			title: "Record interactions automatically",
			subtitle: (configuration.recordsInteractions ? "On" : "Off") + " — change it in Settings → Plugins → qmd-memory"
		}
	];
	const port = configuration.port;
	if (data?.reachable === true) rows.push({
		title: "qmd",
		subtitle: "Running on port " + port + (data.documents === null ? "" : " · " + String(data.documents) + " documents indexed")
	});
	else if (data?.reachable === false) rows.push({
		title: "qmd",
		subtitle: "Not reachable on port " + port + " — search is off, recording still works"
	});
	return rows;
}
function stem(name) {
	return name.replace(/\.md$/i, "");
}
/** `20260824-011500-ab12` → `2026-08-24 01:15`. Anything else keeps its name. */
function describeDate(name) {
	const match = /^(?:atat-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
	if (!match) return stem(name);
	return match[1] + "-" + match[2] + "-" + match[3] + " " + match[4] + ":" + match[5];
}
function messageOf$3(error) {
	if (!error) return "unknown error";
	const message = error.message;
	return typeof message === "string" ? message : String(error);
}

//#endregion
//#region extensions/qmd-memory/src/recall.ts
/** The plugin's own budget for qmd, inside the host's 1.5s for the whole hook. */
const QMD_DEADLINE_MS = 800;
/** The named section's ceiling. The host allows 16000 characters; a recall is not a document. */
const MAXIMUM_SECTION_CHARACTERS = 4e3;
const MAXIMUM_EXCERPT_CHARACTERS = 700;
/** Enough query text to be specific, little enough to stay a query. */
const MAXIMUM_QUERY_CHARACTERS = 600;
async function recall(input, ctx) {
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
		limit: Math.min(20, configuration.recallLimit * 2 + 2),
		deadlineMs: QMD_DEADLINE_MS
	});
	if (!outcome.reachable) {
		ctx.log("recall unavailable: qmd " + outcome.reason);
		return;
	}
	if (outcome.hits.length === 0) return;
	const recalled = [];
	const seen = {};
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
			title: hit.title.length > 0 ? hit.title : basename$1(resolved.path),
			excerpt: excerpt.length > 0 ? excerpt : hit.title
		});
	}
	if (recalled.length === 0) return;
	await attachImages(recalled, ctx);
	return {
		addItems: recalled.map((entry) => {
			const label = labelFor(entry);
			return entry.imagePath ? {
				label,
				filePaths: [entry.imagePath]
			} : {
				label,
				text: entry.excerpt
			};
		}),
		promptSections: [{
			name: "memory",
			content: section(recalled)
		}]
	};
}
function labelFor(entry) {
	return (entry.kind === "memory" ? "Memory" : "Trajectory") + " · " + truncate(entry.title, 60);
}
function section(recalled) {
	const parts = [];
	let used = 0;
	for (const entry of recalled) {
		const block = [
			"## " + (entry.kind === "memory" ? "Memory" : "Trajectory") + ": " + entry.title,
			"",
			entry.excerpt
		].join("\n");
		if (used + block.length > MAXIMUM_SECTION_CHARACTERS) {
			parts.push("_(further matches omitted)_");
			break;
		}
		parts.push(block);
		used += block.length + 2;
	}
	return parts.join("\n\n");
}
function queryText(input) {
	const parts = [String(input.prompt ?? "")];
	for (const item of input.items ?? []) if (item.text) parts.push(item.text);
	else if (item.label) parts.push(item.label);
	return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAXIMUM_QUERY_CHARACTERS);
}
/**
* Resolves the images a recalled note points at, and confirms they are really there.
*
* One `files.list` per directory rather than a read per candidate: the point is to know a file
* exists, and reading it would haul ten megabytes of base64 across the bridge to learn that.
* A note whose image has been deleted degrades to its text, which is the right answer anyway.
*/
async function attachImages(recalled, ctx) {
	const candidates = [];
	for (const entry of recalled) {
		const first = imageReferences(entry.excerpt)[0];
		if (!first) continue;
		const path = normalizeRelative(entry.path.slice(0, entry.path.lastIndexOf("/")), first);
		if (!path) continue;
		candidates.push({
			entry,
			directory: path.slice(0, path.lastIndexOf("/")),
			name: path.slice(path.lastIndexOf("/") + 1),
			path
		});
	}
	if (candidates.length === 0) return;
	const listed = {};
	for (const candidate of candidates) {
		if (listed[candidate.directory]) continue;
		const names = {};
		try {
			for (const entry of await ctx.files.list(candidate.directory)) if (!entry.isDirectory) names[entry.name] = true;
		} catch (error) {
			ctx.log("recall could not list an assets directory: " + messageOf$2(error));
		}
		listed[candidate.directory] = names;
	}
	for (const candidate of candidates) if (listed[candidate.directory]?.[candidate.name]) candidate.entry.imagePath = candidate.path;
}
/** Joins a relative reference onto a directory, resolving `.` and `..` rather than passing it on. */
function normalizeRelative(directory, reference) {
	const segments = joinPath(directory, reference).split("/");
	const resolved = [];
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
function messageOf$2(error) {
	if (!error) return "unknown error";
	const message = error.message;
	return typeof message === "string" ? message : String(error);
}

//#endregion
//#region extensions/qmd-memory/src/record.ts
const MAXIMUM_PROMPT_CHARACTERS = 4e3;
const MAXIMUM_RESPONSE_CHARACTERS = 8e3;
const MAXIMUM_ITEMS = 20;
const MAXIMUM_ITEM_EXCERPT = 200;
async function record(input, ctx) {
	const configuration = readConfiguration(ctx.options);
	if (!configuration.recordsInteractions) return;
	if (configuration.trajectoryDirectory.length === 0) {
		ctx.log("recording skipped: no trajectory folder granted");
		return;
	}
	const prompt = String(input.prompt ?? "").trim();
	const responseText = String(input.responseText ?? "").trim();
	if (prompt.length === 0 && responseText.length === 0) return;
	const at = stamp();
	const title = headline$1(prompt, responseText);
	const note = buildNote({
		date: at.iso,
		source: "atat",
		interactionSource: interactionSource(input),
		title
	}, body(prompt, responseText, input.items ?? []));
	const path = joinPath(configuration.trajectoryDirectory, "atat-" + at.compact + "-" + token() + ".md");
	try {
		await ctx.files.write(path, { base64: encodeText(note) });
		ctx.log("recorded one interaction");
	} catch (error) {
		ctx.log("recording failed: " + messageOf$1(error));
	}
}
/**
* `ResponseInput` has no `interactionSource` field, unlike `ContextAssembledInput`.
*
* Read defensively rather than dropped: the value is useful in the front matter, and if the
* host ever carries it here this keeps working without a change.
*/
function interactionSource(input) {
	const value = input["interactionSource"];
	return typeof value === "string" && value.length > 0 ? value : "unknown";
}
function headline$1(prompt, responseText) {
	const source = prompt.length > 0 ? prompt : responseText;
	for (const line of source.split(/\r?\n/)) {
		const text = line.trim();
		if (text.length > 0) return truncate(text, 100);
	}
	return "AtAt interaction";
}
function body(prompt, responseText, items) {
	const parts = ["# " + headline$1(prompt, responseText)];
	if (prompt.length > 0) parts.push("## Request", truncate(prompt, MAXIMUM_PROMPT_CHARACTERS));
	if (responseText.length > 0) parts.push("## Response", truncate(responseText, MAXIMUM_RESPONSE_CHARACTERS));
	const context = contextLines(items);
	if (context.length > 0) parts.push("## Context", context.join("\n"));
	return parts.join("\n\n");
}
/**
* The context as a summary, not as a copy.
*
* A pill's whole text can be a screenshot's worth of recognised writing, and a trajectory note
* is a record of what happened rather than a second copy of everything attached to it. Paths
* are recorded as names for the same reason a log records metadata: the file may well be gone
* by the time anyone reads this.
*/
function contextLines(items) {
	const lines = [];
	for (const item of items.slice(0, MAXIMUM_ITEMS)) {
		const label = item.label && item.label.length > 0 ? item.label : item.source;
		const detail = item.text ? summarize(item.text) : (item.filePaths ?? []).map(fileName).join(", ");
		lines.push("- **" + label + "** — " + (detail.length > 0 ? detail : item.source));
	}
	if (items.length > MAXIMUM_ITEMS) lines.push("- _(" + String(items.length - MAXIMUM_ITEMS) + " more attachments)_");
	return lines;
}
function summarize(text) {
	return truncate(text.replace(/\s+/g, " ").trim(), MAXIMUM_ITEM_EXCERPT);
}
function fileName(path) {
	const parts = String(path ?? "").split("/");
	return parts[parts.length - 1] ?? "";
}
function messageOf$1(error) {
	if (!error) return "unknown error";
	const message = error.message;
	return typeof message === "string" ? message : String(error);
}

//#endregion
//#region extensions/qmd-memory/src/save.ts
/** A click saves what the user pointed at, not a folder's worth of attachments. */
const MAXIMUM_FILES = 4;
const MAXIMUM_TEXT_CHARACTERS = 2e4;
async function saveToMemory(input, ctx) {
	const configuration = readConfiguration(ctx.options);
	if (configuration.memoryDirectory.length === 0) {
		ctx.notify("Choose a memory folder for qmd-memory in Settings → Plugins first.");
		return;
	}
	const files = (input.filePaths ?? []).filter((path) => typeof path === "string" && path.length > 0);
	const text = String(input.text ?? "").trim();
	try {
		if (files.length > 0) {
			const saved = await saveFiles(files.slice(0, MAXIMUM_FILES), input, configuration, ctx);
			ctx.notify(saved === 1 ? "Saved to memory." : "Saved " + String(saved) + " files to memory.");
			return;
		}
		if (text.length > 0) {
			const name = await saveText(text, input, configuration, ctx);
			ctx.notify("Saved to memory · " + name);
			return;
		}
		ctx.notify("Nothing to save.");
	} catch (error) {
		ctx.notify("Could not save to memory: " + messageOf(error));
	}
}
async function saveText(text, input, configuration, ctx) {
	const at = stamp();
	const name = at.compact + "-" + token() + ".md";
	const note = buildNote({
		date: at.iso,
		source: "atat",
		sourceBundleID: input.sourceBundleID ?? void 0,
		surface: input.surface,
		title: headline(text)
	}, truncate(text, MAXIMUM_TEXT_CHARACTERS));
	await ctx.files.write(joinPath(inboxDirectory(configuration), name), { base64: encodeText(note) });
	return name;
}
/**
* Copies each file into `assets/` and writes a note beside it.
*
* The copy is what makes a saved capture outlive the capture: the path the action was handed
* points into AtAt's own temporary storage, and a memory that referenced it would be a broken
* link within the hour. `files.read` on that path is allowed because the host handed it to this
* call, and `files.write` into `assets/` because the user granted the folder — two different
* permissions, which is why the copy has to go through both.
*/
async function saveFiles(paths, input, configuration, ctx) {
	const assets = assetsDirectory(configuration);
	const inbox = inboxDirectory(configuration);
	let saved = 0;
	for (const path of paths) {
		const at = stamp();
		const stem = at.compact + "-" + token();
		const extension = extensionOf(path);
		const assetName = stem + (extension.length > 0 ? "." + extension : "");
		const data = await ctx.files.read(path);
		await ctx.files.write(joinPath(assets, assetName), { base64: data.base64 });
		const recognized = isImagePath(path) ? await recognize(path, ctx) : "";
		const body = [
			"# " + basename$1(path),
			"",
			"![" + basename$1(path) + "](../" + ASSETS_DIRECTORY + "/" + assetName + ")"
		];
		if (recognized.length > 0) body.push("", "## Recognized text", "", recognized);
		const note = buildNote({
			date: at.iso,
			source: "atat",
			sourceBundleID: input.sourceBundleID ?? void 0,
			surface: input.surface,
			asset: ASSETS_DIRECTORY + "/" + assetName,
			title: recognized.length > 0 ? headline(recognized) : basename$1(path)
		}, body.join("\n"));
		await ctx.files.write(joinPath(inbox, stem + ".md"), { base64: encodeText(note) });
		saved += 1;
	}
	return saved;
}
/** Recognition is a bonus, not a requirement: a capture with no text in it still saves. */
async function recognize(path, ctx) {
	try {
		return truncate(String(await ctx.ocr(path) ?? "").trim(), MAXIMUM_TEXT_CHARACTERS);
	} catch (error) {
		ctx.log("could not recognize text in a capture: " + messageOf(error));
		return "";
	}
}
function headline(text) {
	for (const line of text.split(/\r?\n/)) {
		const value = line.trim();
		if (value.length > 0) return truncate(value, 100);
	}
	return "Memory";
}
function messageOf(error) {
	if (!error) return "unknown error";
	const message = error.message;
	return typeof message === "string" ? message : String(error);
}

//#endregion
//#region extensions/qmd-memory/src/index.ts
const hooks = {
	contextAssembled: recall,
	response: record
};
const actions = { saveToMemory };
const panel = MemoryPanel;

//#endregion
exports.actions = actions;
exports.hooks = hooks;
exports.panel = panel;