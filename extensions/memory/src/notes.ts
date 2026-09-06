// Markdown notes, paths and base64.
//
// The memory folder is a folder of markdown files and nothing else — no database, no index of
// this extension's own. That is what makes the whole thing survive: the notes are readable in any
// editor, syncable by iCloud, writable by a Shortcut on a phone, and indexable by the host's
// own folder search. This module is the small amount of plumbing that requires.

/** `files.read` and `files.write` carry base64, so a note has to be encoded going both ways. */
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * UTF-8 text to base64, without going through `btoa`.
 *
 * `btoa` is Latin-1 only — the prelude's implementation throws above code point 255 — and a
 * memory written in Chinese is the normal case, not the edge case.
 */
export function encodeText(text: string): string {
  return encodeBytes(new TextEncoder().encode(String(text == null ? "" : text)));
}

function encodeBytes(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64_ALPHABET.charAt((block >> 18) & 63);
    output += BASE64_ALPHABET.charAt((block >> 12) & 63);
    output += second === undefined ? "=" : BASE64_ALPHABET.charAt((block >> 6) & 63);
    output += third === undefined ? "=" : BASE64_ALPHABET.charAt(block & 63);
  }
  return output;
}

export function decodeText(base64: string): string {
  const clean = String(base64 == null ? "" : base64).replace(/[^A-Za-z0-9+/]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const value = BASE64_ALPHABET.indexOf(clean.charAt(index));
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// -------------------------------------------------------------------------- paths

export function joinPath(...parts: string[]): string {
  const cleaned: string[] = [];
  for (const part of parts) {
    const text = String(part == null ? "" : part);
    if (text.length === 0) continue;
    cleaned.push(cleaned.length === 0 ? trimTrailingSlash(text) : trimSlashes(text));
  }
  return cleaned.join("/");
}

export function basename(path: string): string {
  const parts = trimTrailingSlash(String(path == null ? "" : path)).split("/");
  return parts[parts.length - 1] ?? "";
}

export function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Whether `path` is inside `directory`, compared as path segments rather than as text. */
export function isInside(directory: string, path: string): boolean {
  const root = trimTrailingSlash(directory);
  if (root.length === 0) return false;
  return path === root || path.indexOf(root + "/") === 0;
}

function trimTrailingSlash(text: string): string {
  let result = text;
  while (result.length > 1 && result.charAt(result.length - 1) === "/") {
    result = result.slice(0, -1);
  }
  return result;
}

function trimSlashes(text: string): string {
  let result = text;
  while (result.charAt(0) === "/") result = result.slice(1);
  return trimTrailingSlash(result);
}

// --------------------------------------------------------------------------- time

export interface Stamp {
  /** `20260824-011500`, local time, the sortable half of every file name. */
  compact: string;
  /** `2026-08-24T01:15:00+08:00`, local time with its offset, for the front matter. */
  iso: string;
}

export function stamp(now?: Date): Stamp {
  const date = now ?? new Date();
  const compact =
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "-" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const iso =
    String(date.getFullYear()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes()) +
    ":" +
    pad(date.getSeconds()) +
    sign +
    pad(Math.floor(absolute / 60)) +
    ":" +
    pad(absolute % 60);
  return { compact, iso };
}

/** Only to keep two notes written in the same second apart. Nothing depends on it being hard. */
export function token(length = 4): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return output;
}

function pad(value: number): string {
  return value < 10 ? "0" + String(value) : String(value);
}

// -------------------------------------------------------------------- front matter

export type FrontMatterValue = string | number | boolean;

/**
 * A note as it is written to disk: YAML front matter, then markdown.
 *
 * The front matter is deliberately flat and quoted conservatively — these files are read by
 * the host's search index, by a text editor and by whatever a phone Shortcut appends, so the
 * format has to be the boring one everything already understands.
 */
export function buildNote(
  fields: Record<string, FrontMatterValue | undefined>,
  body: string
): string {
  const lines: string[] = ["---"];
  for (const key of Object.keys(fields)) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    lines.push(key + ": " + formatScalar(value));
  }
  lines.push("---", "");
  return lines.join("\n") + String(body == null ? "" : body).replace(/\s+$/, "") + "\n";
}

function formatScalar(value: FrontMatterValue): string {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = String(value).replace(/\r?\n/g, " ").trim();
  if (text.length === 0) return '""';
  if (/^[A-Za-z0-9][A-Za-z0-9 _./:+@-]*$/.test(text)) return text;
  return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export interface ParsedNote {
  fields: Record<string, string>;
  body: string;
}

export function parseNote(content: string): ParsedNote {
  const text = String(content == null ? "" : content).replace(/^﻿/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (key.length > 0) fields[key] = value;
  }
  return { fields, body: text.slice(match[0].length) };
}

/** The front matter title, then the first heading, then the first line of text. */
export function titleOf(content: string, fallback: string): string {
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

export function truncate(text: string, limit: number): string {
  const value = String(text == null ? "" : text);
  if (value.length <= limit) return value;
  return value.slice(0, Math.max(0, limit - 1)) + "…";
}

/** A search snippet as one paragraph. What the host returns keeps the note's own line breaks. */
export function flatten(snippet: string): string {
  return String(snippet == null ? "" : snippet).replace(/\s+/g, " ").trim();
}

/**
 * The sortable part of a note's file name: `20260824-011500-a3f9.md` → `20260824011500`.
 *
 * Notes are named after the moment they were written, so newest-first is a string comparison
 * on this rather than a `files.list` that reports modification times — a file iCloud
 * downloaded this morning was written months ago, and the name is when it was written.
 * Anything unnamed by that convention sorts last, which is where a stray file belongs.
 */
export function sortKey(name: string): string {
  const match = /(\d{8})-(\d{6})/.exec(String(name == null ? "" : name));
  return match ? (match[1] ?? "") + (match[2] ?? "") : "";
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "heic", "webp", "tiff", "bmp"];

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.indexOf(extensionOf(path)) >= 0;
}

/**
 * The relative image references in a piece of markdown.
 *
 * Only relative ones: an `http://` image is not a file this extension could attach, and an
 * absolute path in someone else's note is not a path the extension has any business resolving.
 */
export function imageReferences(markdown: string): string[] {
  const text = String(markdown == null ? "" : markdown);
  const found: string[] = [];
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

/**
 * Joins a relative reference onto a directory, resolving `.` and `..` rather than passing
 * them on. A reference that climbs out of the folder resolves to nothing.
 */
export function resolveRelative(directory: string, reference: string): string | null {
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

function decodeURIComponentSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// --------------------------------------------------------------- imported text

/**
 * Text from somebody else's file, made safe to look at.
 *
 * Everything read out of another app's folder is data: it was written by an agent, out of a
 * conversation, and it can carry characters that change what the rest of a line appears to
 * say. Zero-width and bidirectional control characters go, line endings become `\n`, and
 * nothing else about the words is touched.
 */
export function sanitizeText(text: string): string {
  return String(text == null ? "" : text)
    .replace(/\r\n?/g, "\n")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, "");
}

/** `[[Note|label]]` and `[[Note]]` become the words they show. */
export function stripWikilinks(text: string): string {
  return String(text == null ? "" : text).replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, label?: string) => (label ?? target).trim()
  );
}

/** Three blank lines in a row are two more than anyone meant. */
export function collapseBlankLines(text: string): string {
  return String(text == null ? "" : text).replace(/\n{3,}/g, "\n\n");
}

/** A line that only points at another file — an index entry, not something to remember. */
export function isIndexLine(line: string): boolean {
  return /^\s*[-*+]\s*\[[^\]]+\]\([^)\s]+\.(?:md|markdown|txt)\)/i.test(line);
}

/** The first sentence or line, which is what a memory without a title of its own is called. */
export function firstSentence(text: string, limit: number): string {
  for (const line of String(text == null ? "" : text).split("\n")) {
    const value = line.replace(/^#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "").trim();
    if (value.length === 0) continue;
    const sentence = /^(.*?[。！？!?.])\s/.exec(value + " ");
    return truncate((sentence?.[1] ?? value).trim(), limit);
  }
  return "";
}

/**
 * A short, stable fingerprint of a piece of text.
 *
 * It answers one question — has this changed since it was brought over — so it is a hash in
 * the plain sense and not a cryptographic one. Two passes with different seeds, because one
 * 32-bit pass over a whole note collides more often than is comfortable.
 */
export function hashOf(text: string): string {
  const value = String(text == null ? "" : text);
  let first = 2166136261;
  let second = 16777619;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ (code + index), 2166136261) >>> 0;
  }
  return first.toString(16) + second.toString(16) + value.length.toString(16);
}

/** An ISO 8601 date, or `null` when the text is not one. */
export function parseDate(value: string | undefined): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const time = Date.parse(value.trim());
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  // A date in the far future is a parse that went wrong, and a note dated 2087 would sit at
  // the top of the list forever.
  return date.getFullYear() > 1990 && date.getFullYear() < 2200 ? date : null;
}

/** `2026-08-24` anywhere in a file name, which is how daily notes carry their date. */
export function dateInName(name: string): Date | null {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(String(name == null ? "" : name));
  if (!match) return null;
  return parseDate(match[1] + "-" + match[2] + "-" + match[3] + "T12:00:00");
}
