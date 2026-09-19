// convert-units — the entry point.
//
// One action that rewrites every measurement it recognises in the selection: kilometres to
// miles, kilos to pounds, Celsius to Fahrenheit, and each one back. A unit that would read
// as ordinary prose — "5 in the morning" — is left alone unless the phrase ends there, and
// a number that is part of a longer one — the 000 in 1,000 — is never touched.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

const NOTICES = {
  en: "No measurements to convert here.",
  zh: "没找到能换算的数值。",
};

/** The app's language, not the text's: Chinese for any `zh*` locale, English otherwise. */
function notice(locale: string): string {
  return String(locale ?? "").toLowerCase().startsWith("zh") ? NOTICES.zh : NOTICES.en;
}

interface Rule {
  /// Every spelling this rule answers to, lowercased with spaces removed.
  units: string[];
  /// What the number becomes, always the short form.
  target: string;
  factor?: number;
  convert?: (value: number) => number;
  /// `in` is a preposition as often as it is a unit; only convert it where a phrase ends.
  ambiguous?: boolean;
}

const RULES: Rule[] = [
  { units: ["km", "kilometer", "kilometers", "kilometre", "kilometres"], target: "mi", factor: 0.621371 },
  { units: ["mi", "mile", "miles"], target: "km", factor: 1.609344 },
  { units: ["m", "meter", "meters", "metre", "metres"], target: "ft", factor: 3.280839895 },
  { units: ["ft", "foot", "feet"], target: "m", factor: 0.3048 },
  { units: ["yd", "yard", "yards"], target: "m", factor: 0.9144 },
  { units: ["cm", "centimeter", "centimeters", "centimetre", "centimetres"], target: "in", factor: 0.3937007874 },
  { units: ["mm", "millimeter", "millimeters", "millimetre", "millimetres"], target: "in", factor: 0.03937007874 },
  { units: ["in", "inch", "inches"], target: "cm", factor: 2.54, ambiguous: true },
  { units: ["kg", "kilogram", "kilograms"], target: "lb", factor: 2.2046226218 },
  { units: ["lb", "lbs", "pound", "pounds"], target: "kg", factor: 0.45359237 },
  { units: ["g", "gram", "grams"], target: "oz", factor: 0.03527396195 },
  { units: ["oz", "ounce", "ounces"], target: "g", factor: 28.349523125 },
  { units: ["°c", "℃"], target: "°F", convert: (value) => (value * 9) / 5 + 32 },
  { units: ["°f", "℉"], target: "°C", convert: (value) => ((value - 32) * 5) / 9 },
];

const BY_UNIT = new Map<string, Rule>();
for (const rule of RULES) {
  for (const unit of rule.units) BY_UNIT.set(unit, rule);
}

/// Longest spellings first, so "miles" is never read as "mi" plus leftover letters. The
/// lookahead refuses a letter after the unit; the lookbehind refuses a number that is
/// itself preceded by a digit or a point.
const MEASURE = new RegExp(
  "(?<![\\d.,])(\\d+(?:,\\d{3})*(?:\\.\\d+)?)(\\s*)(" +
    "kilomet(?:er|re)s?|km|miles?|mi|millimet(?:er|re)s?|mm|centimet(?:er|re)s?|cm|" +
    "met(?:er|re)s?|m|feet|foot|ft|yards?|yd|kilograms?|kg|pounds?|lbs?|lb|" +
    "grams?|g|ounces?|oz|inches?|in|°\\s*[CF]|℃|℉" +
    ")(?![A-Za-z])",
  "gi"
);

/// A number that came in with thousands separators goes out with them.
function formatNumber(value: number, grouped: boolean): string {
  const rounded = String(Math.round(value * 100) / 100);
  if (!grouped) return rounded;
  const dot = rounded.indexOf(".");
  const whole = dot === -1 ? rounded : rounded.slice(0, dot);
  const fraction = dot === -1 ? undefined : rounded.slice(dot + 1);
  const separated = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? separated : `${separated}.${fraction}`;
}

function convert(text: string): string | null {
  let result = "";
  let cursor = 0;
  let changed = false;
  MEASURE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MEASURE.exec(text)) !== null) {
    const whole = match[0] ?? "";
    const value = Number((match[1] ?? "").replace(/,/g, ""));
    const unit = (match[3] ?? "").toLowerCase().replace(/\s+/g, "");
    const rule = BY_UNIT.get(unit);
    if (rule === undefined) continue;
    if (
      rule.ambiguous &&
      unit === "in" &&
      /^\s+[A-Za-z]/.test(text.slice(match.index + whole.length))
    ) {
      continue;
    }
    const converted = rule.convert ? rule.convert(value) : value * (rule.factor ?? 1);
    if (!Number.isFinite(converted)) continue;
    /// The spacing the user wrote is kept, except that a lettered unit joined to its
    /// number gains one: "5g" reads badly as "0.18oz".
    const spacing = match[2] ?? "";
    result +=
      text.slice(cursor, match.index) +
      formatNumber(converted, (match[1] ?? "").includes(",")) +
      (spacing.length > 0 ? spacing : rule.target.startsWith("°") ? "" : " ") +
      rule.target;
    cursor = match.index + whole.length;
    changed = true;
  }
  if (!changed) return null;
  return result + text.slice(cursor);
}

const convertUnits: ExtensionAction = async (input, ctx) => {
  const converted = convert(input.text ?? "");
  if (converted === null) {
    ctx.notify(notice(ctx.locale));
    return;
  }
  return converted;
};

export default defineExtension({ actions: { convertUnits } });
