// Every string a user reads, in the language the host is running in.
//
// Same shape as memory's table: one record per language, picked once from
// `environment.locale`, so the view does not ask per string and a missing translation is a
// type error rather than an English word in a Chinese window.

export type Language = "en" | "zh-Hans";

export interface Strings {
  title: string;
  /// The source-language picker, whose default is detection.
  sourceLanguage: string;
  /// The target-language picker.
  language: string;
  auto: string;
  chinese: string;
  english: string;
  swap: string;
  translation: string;
  copy: string;
  replace: string;
  refresh: string;
  collapse: string;
  expand: string;
  speak: string;
  stop: string;
  favorite: string;
  favorited: string;
  favoriteFailed: string;
  adjust: string;
  failed: string;
  noText: string;
  noServices: string;
  missingKey: string;
  keyRejected: string;
  systemUnavailable: string;
  agent: string;
  system: string;
  google: string;
  microsoft: string;
  deepl: string;
}

const EN: Strings = {
  title: "Translate",
  sourceLanguage: "From",
  language: "Translate into",
  auto: "Auto Detect",
  chinese: "Chinese",
  english: "English",
  swap: "Swap languages",
  translation: "Translation",
  copy: "Copy",
  replace: "Replace",
  refresh: "Translate again",
  collapse: "Collapse",
  expand: "Expand",
  speak: "Speak",
  stop: "Stop",
  favorite: "Favorite",
  favorited: "Saved to Favorites",
  favoriteFailed: "Couldn’t add that to Favorites.",
  adjust: "Tell me what to adjust",
  failed: "Translation failed. Try again.",
  noText: "No readable text here to translate.",
  noServices: "Turn on a translation service on the Translate page in Settings.",
  missingKey: "Add the key for this service on the Translate page in Settings, then try again.",
  keyRejected: "Check the key on the Translate page in Settings.",
  systemUnavailable: "Download the language in System Settings › General › Language & Region, then try again.",
  agent: "Your agent",
  system: "macOS translation",
  google: "Google Translate",
  microsoft: "Microsoft Translator",
  deepl: "DeepL",
};

const ZH_HANS: Strings = {
  title: "翻译",
  sourceLanguage: "源语言",
  language: "翻译成",
  auto: "自动检测",
  chinese: "中文",
  english: "英文",
  swap: "交换语言",
  translation: "译文",
  copy: "复制",
  replace: "替换",
  refresh: "重新翻译",
  collapse: "收起",
  expand: "展开",
  speak: "朗读",
  stop: "停止",
  favorite: "收藏",
  favorited: "已加入收藏",
  favoriteFailed: "没能加入收藏。",
  adjust: "想怎么调整？",
  failed: "翻译没成功，再试一次。",
  noText: "这里没有能翻译的文字。",
  noServices: "先在设置的「翻译」页里打开一个翻译服务。",
  missingKey: "先在设置的「翻译」页里填上这个服务的密钥，再试一次。",
  keyRejected: "到设置的「翻译」页里检查一下密钥。",
  systemUnavailable: "先在系统设置 › 通用 › 语言与地区里下载这种语言，再试一次。",
  agent: "你的助手",
  system: "macOS 自带翻译",
  google: "Google 翻译",
  microsoft: "微软翻译",
  deepl: "DeepL",
};

export function languageFor(locale: string): Language {
  return locale.toLowerCase().startsWith("zh") ? "zh-Hans" : "en";
}

export function stringsFor(locale: string): Strings {
  return languageFor(locale) === "zh-Hans" ? ZH_HANS : EN;
}
