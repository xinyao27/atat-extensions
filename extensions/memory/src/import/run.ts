// Bringing memories over: what is on this Mac, and what to do with it.
//
// The whole feature is one press of a button, so everything here answers to that: it finds
// the assistants that actually left something behind, turns each memory into a note in
// `inbox/`, and remembers what it brought so the next press only brings what is new. Nothing
// is written back to the other assistant, nothing is watched, and nothing runs unasked.
//
// Notes brought over are ordinary memories from the moment they land: same folder, same
// search, same list, dated the day the memory was made rather than the day it arrived.

import { inboxDirectory, readConfiguration, type Configuration } from "../library.js";
import { buildNote, encodeText, hashOf, joinPath, parseDate, stamp, token } from "../notes.js";
import { ASSISTANTS } from "./catalog.js";
import { converterFor, type ImportedEntry } from "./converters.js";
import { collectFiles, messageOf, type MemoryHost } from "./host.js";

/** What the panel draws for one assistant. */
export interface AssistantMemories {
  identifier: string;
  name: string;
  /** How many memories it has here. Never zero — an assistant with none is not offered. */
  count: number;
  /** The most recent one, ISO 8601, or null when nothing carried a date. */
  latest: string | null;
  /** How many have already been brought over. */
  brought: number;
}

export interface ImportOutcome {
  brought: number;
  skipped: number;
}

/** `storage` remembers what came from where, so the button is safe to press again. */
const STORAGE_KEY = "brought";
/** Enough room for a large library of memories without approaching the storage ceiling. */
const MAXIMUM_RECORDS = 4000;

interface Record_ {
  /** The fingerprint of the words, so an edited memory can be told from an unchanged one. */
  hash: string;
  /** The note written for it, so an edited memory replaces itself instead of doubling. */
  file: string;
  assistant: string;
}

interface Ledger {
  records: Record<string, Record_>;
}

/**
 * What was read while looking, kept for the press that follows.
 *
 * Finding out whether an assistant has memories means parsing them, and the user's next act
 * is almost always to bring that same assistant over. A panel session is one JavaScript
 * context, so the parse survives exactly as long as the page the user is looking at.
 */
const parsed = new Map<string, ImportedEntry[]>();

// ------------------------------------------------------------------- what is here

/**
 * The assistants with memories on this Mac.
 *
 * An assistant that is not installed, that has an empty folder, or whose memories all turn
 * out to be things AtAt does not bring over is simply not in the list — the user chooses
 * between assistants that have something to give, and nothing else is worth a row.
 */
export async function detectAssistants(host: MemoryHost): Promise<AssistantMemories[]> {
  const ledger = await readLedger(host);
  const found: AssistantMemories[] = [];
  for (const assistant of ASSISTANTS) {
    const entries = await entriesFor(host, assistant.identifier);
    if (entries.length === 0) continue;
    let latest: string | null = null;
    for (const entry of entries) {
      if (latest === null || entry.date > latest) latest = entry.date;
    }
    let brought = 0;
    for (const key of Object.keys(ledger.records)) {
      if (ledger.records[key]?.assistant === assistant.identifier) brought += 1;
    }
    found.push({
      identifier: assistant.identifier,
      name: assistant.name,
      count: entries.length,
      latest,
      brought,
    });
  }
  return found;
}

/** Every memory one assistant left here, read once per panel session. */
async function entriesFor(host: MemoryHost, identifier: string): Promise<ImportedEntry[]> {
  const cached = parsed.get(identifier);
  if (cached) return cached;

  const converter = converterFor(identifier);
  if (!converter) return [];
  let roots: string[] = [];
  try {
    roots = (await host.files.roots(identifier)) ?? [];
  } catch (error) {
    // An older AtAt does not offer this at all, and a folder can disappear between the list
    // and the read. Either way the answer is “this assistant is not here”.
    host.log("could not look for " + identifier + ": " + messageOf(error));
    return [];
  }

  const entries: ImportedEntry[] = [];
  for (const root of roots) {
    const files = await collectFiles(host, String(root), converter);
    try {
      entries.push(...converter.convert(files));
    } catch (error) {
      host.log("could not read what " + identifier + " remembers: " + messageOf(error));
    }
  }
  parsed.set(identifier, entries);
  return entries;
}

// --------------------------------------------------------------------- bringing

/**
 * Writes one assistant's memories into `inbox/`, and says what it did.
 *
 * A memory already brought over is left alone; one whose words have changed replaces the
 * note it produced last time; one the user forgot in the panel comes back — pressing the
 * button is asking for it. So the count in the toast is honest about the second press as
 * well as the first: nothing new, nothing written.
 */
export async function importFromAssistant(
  host: MemoryHost,
  identifier: string,
  onProgress?: (done: number, total: number) => void
): Promise<ImportOutcome> {
  const configuration = readConfiguration(host.options);
  if (configuration.memoryDirectory.length === 0) {
    throw new Error("no memory folder");
  }
  const entries = await entriesFor(host, identifier);
  const ledger = await readLedger(host);

  let brought = 0;
  let skipped = 0;
  let done = 0;
  onProgress?.(0, entries.length);

  for (const entry of entries) {
    const key = keyOf(entry);
    done += 1;
    const known = ledger.records[key];
    if (known && known.hash === keyHash(entry)) {
      skipped += 1;
      onProgress?.(done, entries.length);
      continue;
    }
    try {
      const file = await writeMemory(host, configuration, identifier, entry, known?.file);
      ledger.records[key] = { hash: keyHash(entry), file, assistant: identifier };
      brought += 1;
    } catch (error) {
      // One memory that could not be written is one memory missing, not a failed import.
      host.log("could not write a memory brought from " + identifier + ": " + messageOf(error));
      skipped += 1;
    }
    onProgress?.(done, entries.length);
  }

  await writeLedger(host, ledger);
  return { brought, skipped };
}

/** One note, named for the day the memory was made so it lands there in the list. */
async function writeMemory(
  host: MemoryHost,
  configuration: Configuration,
  identifier: string,
  entry: ImportedEntry,
  existingFile?: string
): Promise<string> {
  const at = stamp(parseDate(entry.date) ?? new Date());
  const name = existingFile ?? at.compact + "-" + token() + ".md";
  const note = buildNote(
    { title: entry.title, date: at.iso, source: identifier, origin: entry.origin },
    entry.body
  );
  await host.files.write(joinPath(inboxDirectory(configuration), name), {
    base64: encodeText(note),
  });
  return name;
}

// ---------------------------------------------------------------------- the ledger

/**
 * How a memory is recognised on the next press.
 *
 * A file that holds one memory is known by its path: rewrite it and the note it produced is
 * rewritten too. A file that holds many — Hermes' entries, a handbook split at its headings —
 * cannot be, because inserting one entry renumbers the rest; those are known by their words,
 * so an edited entry arrives as a new memory and the old one stays where it is.
 */
function keyOf(entry: ImportedEntry): string {
  return entry.split ? origin(entry) + "#" + hashOf(entry.body) : entry.origin;
}

function keyHash(entry: ImportedEntry): string {
  return hashOf(entry.title + "\n" + entry.body);
}

function origin(entry: ImportedEntry): string {
  const hash = entry.origin.lastIndexOf("#");
  return hash > 0 ? entry.origin.slice(0, hash) : entry.origin;
}

async function readLedger(host: MemoryHost): Promise<Ledger> {
  try {
    const stored = (await host.storage.get(STORAGE_KEY)) as Partial<Ledger> | null;
    const records = stored?.records;
    return {
      records: records && typeof records === "object" ? (records as Ledger["records"]) : {},
    };
  } catch (error) {
    host.log("could not read what was brought over before: " + messageOf(error));
    return { records: {} };
  }
}

async function writeLedger(host: MemoryHost, ledger: Ledger): Promise<void> {
  const keys = Object.keys(ledger.records);
  // Oldest first would be nicer than last-written first; neither is worth a second index for
  // a ceiling nobody with a normal library reaches.
  const trimmed: Ledger["records"] = {};
  for (const key of keys.slice(Math.max(0, keys.length - MAXIMUM_RECORDS))) {
    const record = ledger.records[key];
    if (record) trimmed[key] = record;
  }
  try {
    await host.storage.set(STORAGE_KEY, { records: trimmed });
  } catch (error) {
    host.log("could not remember what was brought over: " + messageOf(error));
  }
}

/**
 * Forgetting a brought-over memory takes it out of the ledger.
 *
 * Deleting the note is all the user asked for. The next press of the button brings it back,
 * because pressing the button is asking for it; a hidden list of things that never return
 * would make a delete look like a failure the next time. Both spellings of the key go — the
 * one a whole file gets and the one a single entry inside a file gets — because the note on
 * disk cannot say which it was.
 */
export async function forgetImported(
  host: MemoryHost,
  noteOrigin: string,
  noteBody: string
): Promise<void> {
  const value = String(noteOrigin ?? "").trim();
  if (value.length === 0) return;
  const hash = value.lastIndexOf("#");
  const base = hash > 0 ? value.slice(0, hash) : value;
  const keys = [value, base + "#" + hashOf(String(noteBody ?? "").trim())];
  const ledger = await readLedger(host);
  let changed = false;
  for (const key of keys) {
    if (key in ledger.records) {
      delete ledger.records[key];
      changed = true;
    }
  }
  if (changed) await writeLedger(host, ledger);
}
