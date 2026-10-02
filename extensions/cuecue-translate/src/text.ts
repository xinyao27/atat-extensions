// Every string a user reads, in the language AtAt is running in.

export interface Strings {
  failed: string;
  empty: string;
}

const EN: Strings = {
  failed: "Couldn’t translate that. Open CueCue and try again.",
  empty: "Nothing to translate here.",
};

const ZH_HANS: Strings = {
  failed: "没有译出来。打开 CueCue 再试一次。",
  empty: "这里没有可翻译的文字。",
};

export function strings(locale: string): Strings {
  return locale.startsWith("zh") ? ZH_HANS : EN;
}
