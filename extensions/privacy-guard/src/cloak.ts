// The OpenCloak-shaped cloaking core.
//
// Ported from opencloak's utils/cloak.ts: same kind table, same PERSON/ADDRESS
// split, same deterministic alias key, same fake→real restore map. The host
// differences are only around us — JSContext is use-and-discard, so memory
// lives in ctx.storage rather than module globals; and there is no card UI yet,
// so every detected span is masked (the `on` flag OpenCloak exposes is always
// true here).
//
// Two departures from OpenCloak, both from running it on real chat text:
//
// - The restore map belongs to one turn. The host gives both hooks of a turn the
//   same `turnID` and masks the whole history again on every send, so every stand-in
//   an answer can contain was made in its own turn. A map kept across turns turned
//   every later "Jack" or "Sean" in any answer into whatever it once stood for.
// - What the detector finds is checked (`validate.ts`) before it is masked, and a
//   remembered alias that would not pass is dropped when it is loaded.
//
// Fake values come from `./fake.ts` rather than `@faker-js/faker`: the eleven
// kinds we need are a few kilobytes of curated lists, not half a megabyte of
// locale data evaluated on every hook call.

import type { HostContext, ModelSpan } from "@atat/api";
import { GENERATE, type PiiKind } from "./fake.js";
import { plausible, plausibleAddress } from "./validate.js";

const SIMPLE: Record<string, PiiKind> = {
  EMAIL: "email",
  PHONE: "phone",
  DATE_OF_BIRTH: "date of birth",
  US_SSN: "ssn",
  PAYMENT_CARD: "card",
  IP_ADDRESS: "ip address",
};

const MEMORY_KEY = "memory";
const TURNS_KEY = "turns";
/** The map every turn shared before 1.0.3. Removed on first use. */
const LEGACY_RESTORE_KEY = "restore";
/** Turns whose answer never came (a cancel, a failed run) expire after this long. */
const TURN_LIFETIME_MS = 6 * 60 * 60 * 1000;
/** And no more than this many are kept, whatever their age. */
const MAXIMUM_TURNS = 16;

export interface AliasEntry {
  real: string;
  fake: string;
  on: boolean;
}

export type MemoryMap = Record<string, AliasEntry>;
export type RestoreMap = Record<string, string>;
type TurnMap = Record<string, { at: number; restore: RestoreMap }>;

export interface CloakState {
  memory: MemoryMap;
  /** This turn's stand-ins and what they stand for. */
  restore: RestoreMap;
  turns: TurnMap;
}

export interface CloakItem {
  start: number;
  end: number;
  kind: PiiKind;
  real: string;
  fake: string;
  on: boolean;
}

function memoryKey(kind: PiiKind, real: string): string {
  return `${kind}\u0000${String(real).toLowerCase()}`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Remembered aliases that still look like what their kind says. */
function plausibleMemory(memory: Record<string, unknown>): MemoryMap {
  const out: MemoryMap = {};
  for (const [key, value] of Object.entries(memory)) {
    const entry = asObject(value) as AliasEntry | null;
    const kind = key.split("\u0000")[0] as PiiKind;
    if (!entry || typeof entry.real !== "string" || typeof entry.fake !== "string") continue;
    if (!(kind in GENERATE) || !plausible(kind, entry.real)) continue;
    out[key] = entry;
  }
  return out;
}

/** Load the maps the cloaking core needs for this turn. */
export async function hydrate(ctx: HostContext, turnID: string): Promise<CloakState> {
  const remember = ctx.options.rememberMappings !== false;
  const [memory, turns] = await Promise.all([
    remember ? ctx.storage.get(MEMORY_KEY) : Promise.resolve(null),
    ctx.storage.get(TURNS_KEY),
  ]);
  const allTurns = (asObject(turns) as TurnMap | null) ?? {};
  return {
    // Aliases only survive across sessions when the user left "Remember" on.
    memory: remember && asObject(memory) ? plausibleMemory(asObject(memory)!) : {},
    // A turn can mask twice — the request, then the history on its way out — and
    // answerAssembled is a fresh JSContext: both find this turn's map in storage.
    restore: { ...(asObject(allTurns[turnID]?.restore) as RestoreMap | null) },
    turns: allTurns,
  };
}

/** Keep the newest turns that may still get an answer; drop the rest. */
function prune(turns: TurnMap, now: number): TurnMap {
  const kept = Object.entries(turns)
    .filter(([, turn]) => turn && typeof turn.at === "number" && now - turn.at < TURN_LIFETIME_MS)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAXIMUM_TURNS);
  return Object.fromEntries(kept);
}

export async function persist(
  ctx: HostContext,
  state: CloakState,
  turnID: string,
  remember: boolean
): Promise<void> {
  const now = Date.now();
  const turns = prune({ ...state.turns, [turnID]: { at: now, restore: state.restore } }, now);
  const writes = [ctx.storage.set(TURNS_KEY, turns), ctx.storage.remove(LEGACY_RESTORE_KEY)];
  if (remember) writes.push(ctx.storage.set(MEMORY_KEY, state.memory));
  await Promise.all(writes);
}

/** The answer has been restored: this turn's map is no longer needed by anyone. */
export async function finishTurn(ctx: HostContext, state: CloakState, turnID: string): Promise<void> {
  const turns = prune({ ...state.turns }, Date.now());
  delete turns[turnID];
  await Promise.all([ctx.storage.set(TURNS_KEY, turns), ctx.storage.remove(LEGACY_RESTORE_KEY)]);
}

interface SpanPart {
  start: number;
  end: number;
  kind: PiiKind;
}

/**
 * The model labels a whole person or address as one span. Split those into the
 * parts a person recognises, so each gets its own fake and its own restore entry.
 */
function parts(text: string, span: ModelSpan): SpanPart[] {
  const raw = text.slice(span.start, span.end);
  const label = String(span.label || "").replace(/^[BI]-/, "");

  if (label === "PERSON") {
    const words: { start: number; end: number }[] = [];
    for (const match of raw.matchAll(/\S+/g)) {
      words.push({
        start: span.start + match.index,
        end: span.start + match.index + match[0].length,
      });
    }
    return words.map((word, index) => ({
      ...word,
      kind:
        index === 0
          ? "first name"
          : index === words.length - 1
            ? "last name"
            : "middle name",
    }));
  }

  if (label === "ADDRESS") {
    // "Oct 14" is not an address; nor is half of one.
    if (!plausibleAddress(raw)) return [];
    const number = /^\d+[a-z]?\b/i.exec(raw);
    if (!number) return [{ start: span.start, end: span.end, kind: "street" }];
    const rest = raw.slice(number[0].length);
    const offset = rest.length - rest.trimStart().length;
    const out: SpanPart[] = [
      {
        start: span.start,
        end: span.start + number[0].length,
        kind: "building no.",
      },
    ];
    if (rest.trim()) {
      out.push({
        start: span.start + number[0].length + offset,
        end: span.end,
        kind: "street",
      });
    }
    return out;
  }

  const kind = SIMPLE[label];
  return kind ? [{ start: span.start, end: span.end, kind }] : [];
}

/** The same part without the white space the detector sometimes includes (" @@"). */
function trimmed(text: string, part: SpanPart): SpanPart {
  const raw = text.slice(part.start, part.end);
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  return { ...part, start: part.start + lead, end: part.end - trail };
}

function alias(memory: MemoryMap, kind: PiiKind, real: string): string {
  const key = memoryKey(kind, real);
  let fake = memory[key]?.fake;
  if (!fake) {
    fake = GENERATE[kind]();
    // A rare collision with the real value would leave the secret in the prompt.
    for (let attempt = 0; attempt < 5 && fake === real; attempt += 1) {
      fake = GENERATE[kind]();
    }
  }
  memory[key] = { real, fake, on: true };
  return fake;
}

/** Spans → items with a stable fake per (kind, real), keeping only plausible ones. */
export function toItems(text: string, spans: ModelSpan[], memory: MemoryMap): CloakItem[] {
  return [...spans]
    .sort((a, b) => a.start - b.start)
    .flatMap((span) => parts(text, span))
    .map((part) => trimmed(text, part))
    .filter((part) => part.end > part.start && plausible(part.kind, text.slice(part.start, part.end)))
    .map((part) => {
      const real = text.slice(part.start, part.end);
      return {
        ...part,
        real,
        fake: alias(memory, part.kind, real),
        on: true,
      };
    });
}

const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** `first.last` or `first` from an address's local part, when it reads as a name. */
function nameParts(address: string): string[] {
  const local = (address.split("@")[0] ?? "").replace(/\d+$/, "");
  const words = local.split(/[._-]/);
  if (words.length > 2 || !words.every((word) => /^\p{L}{2,}$/u.test(word))) return [];
  return words;
}

/**
 * A model writing to a stand-in address greets the stand-in's name: "Hi Taylor" for
 * `taylor.rodriguez78@mail.test`. When the real address reads as a name too, its parts
 * restore the stand-in's parts; otherwise the greeting is left as the model wrote it.
 */
function addressNames(item: CloakItem, restore: RestoreMap): void {
  const [fakeFirst, fakeLast] = nameParts(item.fake);
  const [realFirst, realLast] = nameParts(item.real);
  if (!fakeFirst || !realFirst) return;
  const pairs: [string, string][] = [[fakeFirst, realFirst]];
  if (fakeLast && realLast) pairs.push([fakeLast, realLast]);
  for (const [stand, actual] of pairs) {
    const key = capitalised(stand);
    // A name the user really wrote in this turn keeps its own restore.
    if (!(key in restore)) restore[key] = capitalised(actual);
  }
}

/**
 * Apply the masks and fill the restore map. Walks backwards so earlier offsets
 * stay valid after each edit — the same rule OpenCloak uses.
 */
export function apply(text: string, items: CloakItem[], restore: RestoreMap): string {
  let out = text;
  for (const item of [...items].sort((a, b) => b.start - a.start)) {
    if (!item.on) continue;
    out = out.slice(0, item.start) + item.fake + out.slice(item.end);
    restore[item.fake] = item.real;
    if (item.kind === "email") addressNames(item, restore);
  }
  return out;
}

/**
 * Swap this turn's stand-ins back to their real values. Longest-first so a short fake
 * that is a substring of a longer one cannot steal the match, and only as whole words,
 * so "Jack" never rewrites "Jackson".
 */
export function reveal(text: string, restore: RestoreMap): string {
  const fakes = Object.keys(restore);
  if (fakes.length === 0) return text;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${fakes
      .sort((a, b) => b.length - a.length)
      .map((fake) => fake.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})(?![\\p{L}\\p{N}])`,
    "gu"
  );
  return text.replace(pattern, (match) => restore[match] ?? match);
}
