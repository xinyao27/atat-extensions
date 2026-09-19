// quick-math — the entry point.
//
// Two actions: work out an expression, or add up every number in a selection. The
// evaluator is a small recursive-descent parser — numbers, + - * / ^, unary signs,
// parentheses, a trailing % and "of" — because the directory forbids eval and a model is the
// wrong tool for arithmetic that has to be exact.

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

const NOTICES = {
  calculate: {
    en: "That doesn’t read as a calculation.",
    zh: "这段读不成算式。",
  },
  sum: {
    en: "No numbers to add up.",
    zh: "没找到可以加起来的数字。",
  },
};

/** The app's language, not the text's: Chinese for any `zh*` locale, English otherwise. */
function notice(locale: string, kind: keyof typeof NOTICES): string {
  return String(locale ?? "").toLowerCase().startsWith("zh")
    ? NOTICES[kind].zh
    : NOTICES[kind].en;
}

/** Typographic operators, "of" and the marks people paste alongside numbers. */
function normalise(expression: string): string {
  return expression
    .replace(/[×✕✖]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/[$¥￥€£,]/g, "")
    .replace(/\bof\b/gi, "*");
}

function evaluate(expression: string): number {
  const source = normalise(expression);
  let index = 0;

  function skipSpaces(): void {
    while (index < source.length && /\s/.test(source.charAt(index))) index += 1;
  }

  function peek(): string {
    return source[index] ?? "";
  }

  function parseExpression(): number {
    let value = parseTerm();
    for (;;) {
      skipSpaces();
      const operator = peek();
      if (operator !== "+" && operator !== "-") return value;
      index += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
  }

  function parseTerm(): number {
    let value = parsePower();
    for (;;) {
      skipSpaces();
      const operator = peek();
      if (operator !== "*" && operator !== "/") return value;
      index += 1;
      const right = parsePower();
      value = operator === "*" ? value * right : value / right;
    }
  }

  function parsePower(): number {
    const base = parseUnary();
    skipSpaces();
    if (peek() === "^") {
      index += 1;
      return Math.pow(base, parsePower());
    }
    return base;
  }

  function parseUnary(): number {
    skipSpaces();
    const character = peek();
    if (character === "-") {
      index += 1;
      return -parseUnary();
    }
    if (character === "+") {
      index += 1;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    skipSpaces();
    if (peek() === "(") {
      index += 1;
      const value = parseExpression();
      skipSpaces();
      if (peek() !== ")") throw new Error("unbalanced parentheses");
      index += 1;
      return value;
    }
    const start = index;
    while (index < source.length && /[0-9.]/.test(source.charAt(index))) index += 1;
    if (start === index) throw new Error("expected a number");
    let value = Number(source.slice(start, index));
    if (!Number.isFinite(value)) throw new Error("bad number");
    if (peek() === "%") {
      index += 1;
      value /= 100;
    }
    return value;
  }

  skipSpaces();
  const result = parseExpression();
  skipSpaces();
  if (index !== source.length) throw new Error("trailing characters");
  return result;
}

/// 0.1 + 0.2 shows as 0.3: fifteen significant digits is where binary noise stops and a
/// user's own number still has every digit they typed.
function format(value: number): string {
  if (!Number.isFinite(value)) throw new Error("not a finite number");
  return String(Number(value.toPrecision(15)));
}

const calculate: ExtensionAction = async (input, ctx) => {
  try {
    return format(evaluate(input.text ?? ""));
  } catch {
    ctx.notify(notice(ctx.locale, "calculate"));
    return;
  }
};

/// A minus counts as a sign only where a digit is not already in front of it, so "10-12"
/// reads as two numbers and not as ten minus twelve.
function numbersIn(text: string): number[] {
  const matches = text.match(/(?<![\d.])-?\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
  return matches.map((match) => Number(match.replace(/,/g, "")));
}

const sum: ExtensionAction = async (input, ctx) => {
  const numbers = numbersIn(input.text ?? "");
  if (numbers.length === 0) {
    ctx.notify(notice(ctx.locale, "sum"));
    return;
  }
  try {
    return format(numbers.reduce((total, number) => total + number, 0));
  } catch {
    ctx.notify(notice(ctx.locale, "sum"));
    return;
  }
};

export default defineExtension({ actions: { calculate, sum } });
