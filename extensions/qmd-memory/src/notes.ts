// Markdown notes, paths and base64.
//
// The memory library is a folder of markdown files and nothing else — no database, no index of
// this plugin's own. That is what makes the whole thing survive: the notes are readable in any
// editor, syncable by iCloud, writable by a Shortcut on a phone, and indexable by qmd. This
// module is the small amount of plumbing that requires.

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

export function encodeBytes(bytes: Uint8Array): string {
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
 * qmd, by a text editor and by whatever a phone Shortcut appends, so the format has to be the
 * boring one everything already understands.
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

/** qmd prefixes every snippet line with `N: `. Useful in a terminal, noise in a prompt. */
export function stripLineNumbers(snippet: string): string {
  return String(snippet == null ? "" : snippet)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+:\s?/, ""))
    .join("\n")
    .trim();
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "heic", "webp", "tiff", "bmp"];

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.indexOf(extensionOf(path)) >= 0;
}

/**
 * The relative image references in a piece of markdown.
 *
 * Only relative ones: an `http://` image is not a file this plugin could attach, and an
 * absolute path in someone else's note is not a path the plugin has any business resolving.
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

function decodeURIComponentSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
