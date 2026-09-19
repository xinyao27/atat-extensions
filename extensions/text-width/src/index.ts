// text-width — the entry point.
//
// Two actions over one pair of index-aligned tables: the full-width forms of ASCII, the
// ideographic space, and katakana, in either direction. A half-width sound mark joins the
// kana before it into the precomposed character (ｶﾞ → ガ), and a precomposed one comes
// apart on the way back (ガ → ｶﾞ).

import { defineExtension } from "@atat/api";
import type { ExtensionAction } from "@atat/api";

/// Half-width first, full-width second, same index: ｦ→ヲ, ｶ→カ, ｰ→ー, ﾝ→ン … 56 pairs.
const HALF_KANA =
  "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";
const FULL_KANA =
  "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン";

/// The precomposed kana a base kana plus one sound mark becomes.
const VOICED: Record<string, string> = {
  "ウ": "ヴ",
  "カ": "ガ", "キ": "ギ", "ク": "グ", "ケ": "ゲ", "コ": "ゴ",
  "サ": "ザ", "シ": "ジ", "ス": "ズ", "セ": "ゼ", "ソ": "ゾ",
  "タ": "ダ", "チ": "ヂ", "ツ": "ヅ", "テ": "デ", "ト": "ド",
  "ハ": "バ", "ヒ": "ビ", "フ": "ブ", "ヘ": "ベ", "ホ": "ボ",
  "ワ": "ヷ",
};
const SEMI_VOICED: Record<string, string> = {
  "ハ": "パ", "ヒ": "ピ", "フ": "プ", "ヘ": "ペ", "ホ": "ポ",
};

const TO_FULL = new Map<string, string>();
const TO_HALF = new Map<string, string>();
for (let index = 0; index < HALF_KANA.length; index += 1) {
  const half = HALF_KANA[index];
  const full = FULL_KANA[index];
  if (half === undefined || full === undefined) continue;
  TO_FULL.set(half, full);
  TO_HALF.set(full, half);
}

const VOICED_PLAIN = new Map<string, string>();
const SEMI_VOICED_PLAIN = new Map<string, string>();
for (const [plain, voiced] of Object.entries(VOICED)) VOICED_PLAIN.set(voiced, plain);
for (const [plain, semi] of Object.entries(SEMI_VOICED)) SEMI_VOICED_PLAIN.set(semi, plain);

function toFullWidth(text: string): string {
  const characters = [...text];
  let result = "";
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === undefined) continue;
    const kana = TO_FULL.get(character);
    if (kana !== undefined) {
      const mark = characters[index + 1];
      const composed =
        mark === "ﾞ" ? VOICED[kana] : mark === "ﾟ" ? SEMI_VOICED[kana] : undefined;
      if (composed !== undefined) {
        result += composed;
        index += 1;
      } else {
        result += kana;
      }
      continue;
    }
    if (character === "ﾞ") {
      result += "゛";
      continue;
    }
    if (character === "ﾟ") {
      result += "゜";
      continue;
    }
    if (character === " ") {
      result += "\u3000";
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    result +=
      code >= 0x21 && code <= 0x7e ? String.fromCodePoint(code + 0xfee0) : character;
  }
  return result;
}

function toHalfWidth(text: string): string {
  let result = "";
  for (const character of text) {
    const voiced = VOICED_PLAIN.get(character);
    if (voiced !== undefined) {
      result += (TO_HALF.get(voiced) ?? voiced) + "ﾞ";
      continue;
    }
    const semiVoiced = SEMI_VOICED_PLAIN.get(character);
    if (semiVoiced !== undefined) {
      result += (TO_HALF.get(semiVoiced) ?? semiVoiced) + "ﾟ";
      continue;
    }
    const kana = TO_HALF.get(character);
    if (kana !== undefined) {
      result += kana;
      continue;
    }
    if (character === "\u3000") {
      result += " ";
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    result +=
      code >= 0xff01 && code <= 0xff5e ? String.fromCodePoint(code - 0xfee0) : character;
  }
  return result;
}

const toHalfWidthAction: ExtensionAction = async (input) => toHalfWidth(input.text ?? "");
const toFullWidthAction: ExtensionAction = async (input) => toFullWidth(input.text ?? "");

export default defineExtension({
  actions: {
    toHalfWidth: toHalfWidthAction,
    toFullWidth: toFullWidthAction,
  },
});
