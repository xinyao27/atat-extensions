// A second opinion on what the detector found.
//
// The bundled model labels spans and gives no confidence, and on short chat text it
// labels things that are not personal at all: `@@` as an email, `Claude` and `Cursor` as
// first names, `Oct 14` as a street, a lone `+` as a phone. Masked, those break the
// question; remembered, they are masked again on every send. Each kind here must look
// like what it claims to be before it is replaced.

import type { PiiKind } from "./fake.js";

/**
 * Names of apps, agents and products people type to an agent all day. A word on this
 * list is a thing, not a person, whatever the detector says.
 */
const NOT_PEOPLE = new Set(
  [
    "atat", "orb", "tabtab", "claude", "codex", "cursor", "gemini", "grok", "copilot",
    "chatgpt", "openai", "anthropic", "deepseek", "openrouter", "ollama", "siri",
    "antigravity", "hermes", "opencode", "pi", "dia", "arc", "safari", "chrome", "firefox",
    "finder", "xcode", "slack", "notion", "figma", "linear", "raycast", "github", "gitlab",
    "mail", "notes", "messages", "wechat", "telegram", "discord", "zoom", "teams",
    "excel", "word", "pages", "keynote", "numbers", "typeless",
  ]
);

const STREET_SUFFIX =
  /\b(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|way|pl|place|ter|terrace|hwy|highway|pkwy|parkway|sq|square|cir|circle|aly|alley|loop|row|walk|crescent|close|plaza|trail)\.?$/i;

const digitCount = (text: string) => (text.match(/\d/g) ?? []).length;

/** One word of a person's name: Latin letters, at least two of them, not a product. */
function plausibleNameWord(word: string): boolean {
  if (!/^\p{Script=Latin}[\p{Script=Latin}'’.-]*$/u.test(word)) return false;
  if ((word.match(/\p{L}/gu) ?? []).length < 2) return false;
  return !NOT_PEOPLE.has(word.toLowerCase().replace(/['’.-]/g, ""));
}

function plausibleIPv4(text: string): boolean {
  const parts = text.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** Whether `real`, labelled `kind` by the detector, is worth masking. */
export function plausible(kind: PiiKind, real: string): boolean {
  const text = real.trim();
  if (!text) return false;
  switch (kind) {
    case "first name":
    case "middle name":
    case "last name":
      return plausibleNameWord(text);
    case "email":
      return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(text);
    case "phone":
      return /^[+\d\s().-]+$/.test(text) && digitCount(text) >= 7 && digitCount(text) <= 15;
    case "date of birth":
      return /\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/.test(text) || /\b(19|20)\d{2}\b/.test(text);
    case "ssn":
      return /^\d{3}-?\d{2}-?\d{4}$/.test(text);
    case "card":
      return /^[\d\s-]+$/.test(text) && digitCount(text) >= 13 && digitCount(text) <= 19;
    case "ip address":
      return plausibleIPv4(text) || (/^[0-9a-f:]+$/i.test(text) && (text.match(/:/g) ?? []).length >= 2);
    case "building no.":
      return /^\d+[a-z]?$/i.test(text);
    case "street":
      return STREET_SUFFIX.test(text);
  }
}

/** A whole address span: it must end like a street, or none of it is masked. */
export function plausibleAddress(text: string): boolean {
  return STREET_SUFFIX.test(text.trim());
}
