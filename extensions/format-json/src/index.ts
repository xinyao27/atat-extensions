// format-json — the entry point.
//
// One action: parse and print the selection with two-space indentation. Refuse malformed
// input and numeric values that JavaScript would silently round; preserve key order.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

const NOTICES = {
  en: { invalid: "That isn’t valid JSON.", unsafe: "This JSON has a number that can’t be formatted without changing it." },
  zh: { invalid: "这段文字不是有效的 JSON。", unsafe: "这段 JSON 里有无法原样保留的数字。" },
};

/** Compare decimal values without converting their digits to a lossy JavaScript number. */
function decimalValue(token: string): string {
  const [, sign = "", integer = "", fraction = "", exponent = "0"] =
    /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token) ?? [];
  const digits = `${integer}${fraction}`.replace(/^0+/, "").replace(/0+$/, "");
  if (!digits) return "0";
  const trailingZeros = `${integer}${fraction}`.replace(/^0+/, "").length - digits.length;
  return `${sign}${digits}e${BigInt(exponent) - BigInt(fraction.length) + BigInt(trailingZeros)}`;
}

/** JSON numbers outside strings, including escaped quotes and exponent notation. */
function hasUnsafeNumber(text: string): boolean {
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  for (let index = 0; index < text.length;) {
    if (text[index] === '"') {
      index++;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
        } else if (text[index++] === '"') {
          break;
        }
      }
      continue;
    }
    number.lastIndex = index;
    const match = number.exec(text);
    if (!match) {
      index++;
      continue;
    }
    const parsed = Number(match[0]);
    if (
      !Number.isFinite(parsed) ||
      (Object.is(parsed, -0) && match[0].startsWith("-")) ||
      (Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) ||
      decimalValue(match[0]) !== decimalValue(String(parsed))
    ) return true;
    index = number.lastIndex;
  }
  return false;
}

const formatJson: ExtensionAction = async (input, ctx) => {
  const text = input.text ?? "";
  let value: unknown;
  const notices = String(ctx.locale ?? "").toLowerCase().startsWith("zh") ? NOTICES.zh : NOTICES.en;
  try {
    value = JSON.parse(text);
  } catch {
    await ctx.notify(notices.invalid);
    return;
  }
  if (hasUnsafeNumber(text)) {
    await ctx.notify(notices.unsafe);
    return;
  }
  return JSON.stringify(value, null, 2);
};

export default defineExtension({ actions: { formatJson } });
