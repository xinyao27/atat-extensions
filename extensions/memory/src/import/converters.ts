// One converter per assistant: their file, our note.
//
// Every assistant writes memories differently — one file per fact, one big file split by
// heading, one file split by a section sign, a text file split by blank lines — so the only
// thing they share is what comes out: a title, the date the memory was made, the words
// themselves, and where they were read from. No model is involved. A memory is recalled by
// searching it, and the original words search better than a summary of them would.
//
// Everything a converter is handed was written by another program. It is data: it is never
// executed, never followed as an instruction, and it arrives with control characters already
// stripped (see `collectFiles`).

import {
  collapseBlankLines,
  dateInName,
  firstSentence,
  isIndexLine,
  joinPath,
  parseDate,
  parseNote,
  stripWikilinks,
  truncate,
} from "../notes.js";
import type { SourceFile } from "./host.js";

/** One memory, on its way to becoming a note in `inbox/`. */
export interface ImportedEntry {
  title: string;
  /** ISO 8601. The date the memory was made, never the date it was brought over. */
  date: string;
  body: string;
  /** The file it came from, and which part of it: `/Users/…/USER.md#3`. */
  origin: string;
  /** Whether the origin names a part of a file rather than the whole of it. */
  split: boolean;
}

export interface Converter {
  wantsFile(relativePath: string, name: string): boolean;
  entersDirectory(relativePath: string, name: string): boolean;
  convert(files: SourceFile[]): ImportedEntry[];
}

/** A title has to fit on one line of a list row. */
const TITLE_LIMIT = 60;
/** Below this a memory is a stray word, a heading with nothing under it, or an empty file. */
const MINIMUM_BODY_CHARACTERS = 8;

// --------------------------------------------------------------------- helpers

function markdownFile(name: string): boolean {
  return /\.(?:md|markdown)$/i.test(name);
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** `feedback_testing` → `Feedback testing`. A file name is the last resort for a title. */
function humanize(name: string): string {
  const words = stem(name).replace(/[-_]+/g, " ").trim();
  return words.length === 0 ? "" : words.charAt(0).toUpperCase() + words.slice(1);
}

function heading(text: string): string {
  for (const line of text.split("\n")) {
    const match = /^#\s+(.*)$/.exec(line.trim());
    if (match) return (match[1] ?? "").trim();
  }
  return "";
}

/** The body without the front matter the source wrote, and without its index lines. */
function bodyOf(text: string): string {
  const lines = parseNote(text)
    .body.split("\n")
    .filter((line) => !isIndexLine(line));
  return collapseBlankLines(stripWikilinks(lines.join("\n"))).trim();
}

function titled(candidates: (string | undefined)[], body: string, fallback: string): string {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value.length > 0) return truncate(value, TITLE_LIMIT);
  }
  const sentence = firstSentence(body, TITLE_LIMIT);
  return sentence.length > 0 ? sentence : truncate(fallback, TITLE_LIMIT);
}

function dateOf(file: SourceFile, ...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const parsed = parseDate(candidate);
    if (parsed) return parsed.toISOString();
  }
  const modified = parseDate(file.modifiedAt);
  return (modified ?? new Date()).toISOString();
}

function entry(
  file: SourceFile,
  title: string,
  date: string,
  body: string,
  index?: number
): ImportedEntry | null {
  const words = body.trim();
  if (words.length < MINIMUM_BODY_CHARACTERS) return null;
  return {
    title,
    date,
    body: words,
    origin: index === undefined ? file.path : file.path + "#" + String(index),
    split: index !== undefined,
  };
}

/** A big file cut at its second-level headings; the whole file when it has none. */
function sections(text: string): { title: string; body: string }[] {
  const body = bodyOf(text);
  const lines = body.split("\n");
  const found: { title: string; body: string[] }[] = [];
  for (const line of lines) {
    const match = /^##\s+(.*)$/.exec(line);
    if (match) {
      found.push({ title: (match[1] ?? "").trim(), body: [] });
      continue;
    }
    if (found.length === 0) {
      // What sits above the first heading is the file's own title and whatever preamble it
      // came with. A lone `# Handbook` is not a memory; a paragraph of real text is.
      if (line.trim().length === 0 || /^#\s/.test(line)) continue;
      found.push({ title: "", body: [line] });
      continue;
    }
    found[found.length - 1]?.body.push(line);
  }
  return found.map((section) => ({
    title: section.title,
    body: collapseBlankLines(section.body.join("\n")).trim(),
  }));
}

function keepAll(): boolean {
  return true;
}

function skipsNothing(_relativePath: string, name: string): boolean {
  return name !== "skills" && name !== "imports" && name !== "chats";
}

// -------------------------------------------------------------------- Claude Code

/**
 * One file per memory, with front matter that has changed shape once and may again.
 *
 * The parser is deliberately forgiving: `type` is read wherever it sits, an unknown field is
 * ignored rather than fatal, and a file with no front matter at all is still a memory. Two
 * kinds are left behind — `project`, which is one repository's running progress and goes
 * stale in a fortnight, and `message`, which is one agent writing to another.
 *
 * `MEMORY.md` is the index Claude Code keeps, not a memory. It is read anyway, because the
 * link text in it is a better title than anything derivable from the file it points at.
 */
const claudeCode: Converter = {
  wantsFile: (_relativePath, name) => markdownFile(name),
  entersDirectory: skipsNothing,
  convert(files) {
    const titles: Record<string, string> = {};
    for (const file of files) {
      if (file.name !== "MEMORY.md") continue;
      const directory = file.path.slice(0, file.path.lastIndexOf("/"));
      const pattern = /^\s*[-*+]\s*\[([^\]]+)\]\(([^)\s]+)\)/gm;
      let match = pattern.exec(file.text);
      while (match) {
        const target = (match[2] ?? "").trim();
        if (target.length > 0 && target.indexOf("..") < 0) {
          titles[joinPath(directory, target)] = (match[1] ?? "").trim();
        }
        match = pattern.exec(file.text);
      }
    }

    const entries: ImportedEntry[] = [];
    for (const file of files) {
      if (file.name === "MEMORY.md") continue;
      const note = parseNote(file.text);
      const kind = note.fields["type"];
      if (kind === "project" || kind === "message") continue;
      const description = note.fields["description"];
      const body = bodyOf(file.text) || String(description ?? "").trim();
      const title = titled(
        [titles[file.path], humanizeName(note.fields["name"]), heading(file.text), description],
        body,
        humanize(file.name)
      );
      const made = entry(file, title, dateOf(file, note.fields["modified"]), body);
      if (made) entries.push(made);
    }
    return entries;
  },
};

/** A `name` field is sometimes a slug and sometimes a sentence. Both become a title. */
function humanizeName(value: string | undefined): string {
  const text = String(value ?? "").trim();
  if (text.length === 0) return "";
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(text) ? humanize(text) : text;
}

// -------------------------------------------------------------------------- Codex

/**
 * A handbook plus one recap per session, and a pile of pipeline leftovers to leave alone.
 *
 * `MEMORY.md` is the consolidated handbook — the memories themselves, so it is split at its
 * headings rather than skipped. The transient files beside it are mid-flight state, and the
 * SQLite database next to them is never opened.
 */
const codex: Converter = {
  wantsFile: (_relativePath, name) =>
    markdownFile(name) &&
    !["memory_summary.md", "raw_memories.md", "phase2_workspace_diff.md"].includes(name),
  entersDirectory: (_relativePath, name) => name !== "skills" && name !== ".git",
  convert(files) {
    const entries: ImportedEntry[] = [];
    for (const file of files) {
      if (file.name === "MEMORY.md") {
        sections(file.text).forEach((section, index) => {
          const made = entry(
            file,
            titled([section.title], section.body, humanize(file.name)),
            dateOf(file),
            section.body,
            index
          );
          if (made) entries.push(made);
        });
        continue;
      }
      const body = bodyOf(file.text);
      const made = entry(
        file,
        titled([heading(file.text)], body, humanize(file.name)),
        dateOf(file),
        body
      );
      if (made) entries.push(made);
    }
    return entries;
  },
};

// ------------------------------------------------------------------------ Hermes

/** Two files, each a list of one-fact entries separated by a section sign. No dates inside. */
const hermes: Converter = {
  wantsFile: (_relativePath, name) => name === "MEMORY.md" || name === "USER.md",
  entersDirectory: keepAll,
  convert(files) {
    const entries: ImportedEntry[] = [];
    for (const file of files) {
      const date = dateOf(file);
      bodyOf(file.text)
        .split(/\n\s*§\s*\n/)
        .forEach((part, index) => {
          const body = collapseBlankLines(part).trim();
          const made = entry(file, titled([], body, humanize(file.name)), date, body, index);
          if (made) entries.push(made);
        });
    }
    return entries;
  },
};

// ---------------------------------------------------------------------- OpenClaw

/**
 * The only assistant that dates its entries and says which ones it has retired.
 *
 * `USER.md` marks every entry with the day it was observed and whether it still holds, so
 * both come across for free and a superseded entry is left where it is. `memory/imports/`
 * is skipped on principle: it is OpenClaw's own copy of Claude Code, Codex and Hermes
 * memories, which are brought over from those assistants directly.
 */
const openclaw: Converter = {
  wantsFile(relativePath, name) {
    if (!markdownFile(name)) return false;
    if (relativePath === "USER.md" || relativePath === "MEMORY.md") return true;
    return relativePath.indexOf("memory/") === 0;
  },
  entersDirectory: (_relativePath, name) => name === "memory",
  convert(files) {
    const entries: ImportedEntry[] = [];
    for (const file of files) {
      if (file.name === "USER.md") {
        observed(file).forEach((part, index) => {
          const made = entry(
            file,
            titled([], part.body, humanize(file.name)),
            part.date ?? dateOf(file),
            part.body,
            index
          );
          if (made) entries.push(made);
        });
        continue;
      }
      if (file.name === "MEMORY.md") {
        sections(file.text).forEach((section, index) => {
          const made = entry(
            file,
            titled([section.title], section.body, humanize(file.name)),
            dateOf(file),
            section.body,
            index
          );
          if (made) entries.push(made);
        });
        continue;
      }
      const body = bodyOf(file.text);
      const day = dateInName(file.name);
      const made = entry(
        file,
        titled([heading(file.text)], body, humanize(file.name)),
        day ? day.toISOString() : dateOf(file),
        body
      );
      if (made) entries.push(made);
    }
    return entries;
  },
};

/** `<!-- observed: 2026-08-14 | status: active -->` and the entry under it. */
function observed(file: SourceFile): { body: string; date?: string }[] {
  const marker = /<!--\s*observed:\s*([^|>]+?)\s*(?:\|\s*status:\s*([a-z]+)\s*)?-->/gi;
  const parts: { body: string; date?: string }[] = [];
  const text = file.text;
  let match = marker.exec(text);
  while (match) {
    const start = match.index + match[0].length;
    const next = marker.exec(text);
    const raw = text.slice(start, next ? next.index : text.length);
    const status = (match[2] ?? "active").toLowerCase();
    if (status !== "superseded") {
      const body = collapseBlankLines(stripWikilinks(raw)).trim();
      const date = parseDate(match[1]);
      parts.push({ body, date: date ? date.toISOString() : undefined });
    }
    match = next;
  }
  return parts;
}

// -------------------------------------------------------------- Gemini CLI, Qwen

/** One file per memory beside an index, which is the shape most assistants settled on. */
function fileForEachMemory(wantsFile: (relativePath: string, name: string) => boolean): Converter {
  return {
    wantsFile,
    entersDirectory: skipsNothing,
    convert(files) {
      const entries: ImportedEntry[] = [];
      for (const file of files) {
        const note = parseNote(file.text);
        const body = bodyOf(file.text);
        const title = titled(
          [humanizeName(note.fields["title"]), humanizeName(note.fields["name"]), heading(file.text)],
          body,
          humanize(file.name)
        );
        const made = entry(
          file,
          title,
          dateOf(file, note.fields["date"], note.fields["modified"]),
          body
        );
        if (made) entries.push(made);
      }
      return entries;
    },
  };
}

const geminiCli = fileForEachMemory(
  (_relativePath, name) => markdownFile(name) && name !== "MEMORY.md"
);
const qwenCode = fileForEachMemory(
  (_relativePath, name) => markdownFile(name) && name !== "MEMORY.md"
);

// -------------------------------------------------------------------------- Trae

/** A profile and one file per project, each ordinary markdown with headings. */
const trae: Converter = {
  wantsFile: (_relativePath, name) => markdownFile(name),
  entersDirectory: skipsNothing,
  convert(files) {
    const entries: ImportedEntry[] = [];
    for (const file of files) {
      const parts = sections(file.text);
      const titledParts = parts.filter((part) => part.title.length > 0);
      if (titledParts.length === 0) {
        const body = bodyOf(file.text);
        const made = entry(
          file,
          titled([heading(file.text)], body, humanize(file.name)),
          dateOf(file),
          body
        );
        if (made) entries.push(made);
        continue;
      }
      parts.forEach((section, index) => {
        const made = entry(
          file,
          titled([section.title, heading(file.text)], section.body, humanize(file.name)),
          dateOf(file),
          section.body,
          index
        );
        if (made) entries.push(made);
      });
    }
    return entries;
  },
};

// ------------------------------------------------------------------------- Goose

/**
 * Text files, one per category, entries separated by a blank line.
 *
 * An entry may open with a line of tags. The tags say how Goose files a memory, not what it
 * says, so they are dropped and the category — which is the file's own name — leads the
 * title instead.
 */
const goose: Converter = {
  wantsFile: (_relativePath, name) => /\.txt$/i.test(name),
  entersDirectory: skipsNothing,
  convert(files) {
    const entries: ImportedEntry[] = [];
    for (const file of files) {
      const category = humanize(file.name);
      const date = dateOf(file);
      file.text.split(/\n\s*\n/).forEach((part, index) => {
        const lines = part.split("\n");
        if (/^#\s*\S/.test(lines[0] ?? "")) lines.shift();
        const body = collapseBlankLines(stripWikilinks(lines.join("\n"))).trim();
        const sentence = firstSentence(body, TITLE_LIMIT);
        const made = entry(
          file,
          truncate(
            category.length > 0 && sentence.length > 0 ? category + " · " + sentence : sentence || category,
            TITLE_LIMIT
          ),
          date,
          body,
          index
        );
        if (made) entries.push(made);
      });
    }
    return entries;
  },
};

const CONVERTERS: Record<string, Converter> = {
  "claude-code": claudeCode,
  codex,
  hermes,
  openclaw,
  "gemini-cli": geminiCli,
  "qwen-code": qwenCode,
  trae,
  goose,
};

export function converterFor(identifier: string): Converter | undefined {
  return CONVERTERS[identifier];
}
