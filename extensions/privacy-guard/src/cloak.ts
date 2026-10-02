// The OpenCloak-shaped cloaking core.
//
// Ported from opencloak's utils/cloak.ts: same kind table, same PERSON/ADDRESS
// split, same deterministic alias key, same fake→real restore map. The host
// differences are only around us — JSContext is use-and-discard, so memory
// lives in ctx.storage rather than module globals; and there is no card UI yet,
// so every detected span is masked (the `on` flag OpenCloak exposes is always
// true here).
//
// Fake values come from `./fake.ts` rather than `@faker-js/faker`: the eleven
// kinds we need are a few kilobytes of curated lists, not half a megabyte of
// locale data evaluated on every hook call.

import type { HostContext, ModelSpan } from "@atat/api";
import { GENERATE, type PiiKind } from "./fake.js";

const SIMPLE: Record<string, PiiKind> = {
  EMAIL: "email",
  PHONE: "phone",
  DATE_OF_BIRTH: "date of birth",
  US_SSN: "ssn",
  PAYMENT_CARD: "card",
  IP_ADDRESS: "ip address",
};

const MEMORY_KEY = "memory";
const RESTORE_KEY = "restore";

export interface AliasEntry {
  real: string;
  fake: string;
  on: boolean;
}

export type MemoryMap = Record<string, AliasEntry>;
export type RestoreMap = Record<string, string>;

export interface CloakState {
  memory: MemoryMap;
  restore: RestoreMap;
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

/** Load the two maps the cloaking core needs for this invocation. */
export async function hydrate(ctx: HostContext): Promise<CloakState> {
  const remember = ctx.options.rememberMappings !== false;
  const [memory, restore] = await Promise.all([
    remember ? ctx.storage.get(MEMORY_KEY) : Promise.resolve(null),
    ctx.storage.get(RESTORE_KEY),
  ]);
  return {
    // Aliases only survive across sessions when the user left "Remember" on.
    // Restore always loads: answerAssembled is a fresh JSContext and has to see
    // what this interaction's contextAssembled just wrote.
    memory: remember && asObject(memory) ? (memory as MemoryMap) : {},
    restore: asObject(restore) ? (restore as RestoreMap) : {},
  };
}

export async function persist(
  ctx: HostContext,
  memory: MemoryMap,
  restore: RestoreMap,
  remember: boolean
): Promise<void> {
  const writes = [ctx.storage.set(RESTORE_KEY, restore)];
  if (remember) writes.push(ctx.storage.set(MEMORY_KEY, memory));
  await Promise.all(writes);
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

/** Spans → items with a stable fake per (kind, real). */
export function toItems(text: string, spans: ModelSpan[], memory: MemoryMap): CloakItem[] {
  return [...spans]
    .sort((a, b) => a.start - b.start)
    .flatMap((span) => parts(text, span))
    .filter((part) => text.slice(part.start, part.end).trim().length > 0)
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
  }
  return out;
}

/**
 * Swap every known fake back to its real value. Longest-first so a short fake
 * that is a substring of a longer one cannot steal the match.
 */
export function reveal(text: string, restore: RestoreMap): string {
  const fakes = Object.keys(restore);
  if (fakes.length === 0) return text;
  const pattern = new RegExp(
    fakes
      .sort((a, b) => b.length - a.length)
      .map((fake) => fake.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g"
  );
  return text.replace(pattern, (match) => restore[match] ?? match);
}
