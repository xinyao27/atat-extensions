// Every string a user can see, in the two languages AtAt ships.
//
// The host tells a extension which language it is running in (`ctx.locale` in a hook,
// `environment.locale` in a panel) and expects the extension to localise its own output — a
// pill label saying “Memory” inside a Chinese interface is the extension's bug, not the
// host's.
//
// Nothing here is addressed to the agent. The `<memory>` section stays in English on purpose:
// it is scaffolding around the user's own words, and the words carry their own language.

import { assistantNames } from "./import/catalog.js";

export interface Strings {
  /** Pill and row label for a memory. */
  memory: string;
  saved: string;
  savedFiles: (count: number) => string;
  nothingToSave: string;
  saveFailed: (reason: string) => string;
  noFolder: string;
  searchPlaceholder: string;
  loading: string;
  unreadableNote: string;
  unreadableFolder: (reason: string) => string;
  noMatches: (query: string) => string;
  empty: string;
  matches: string;
  memories: string;
  newest: (count: number) => string;
  open: string;
  ask: string;
  askFailed: (reason: string) => string;
  forget: string;
  forgetTitle: string;
  forgetMessage: (title: string) => string;
  forgotten: string;
  forgetFailed: (reason: string) => string;
  forgetManyTitle: (count: number) => string;
  forgetManyMessage: string;
  forgotMany: (count: number, trashed: boolean) => string;
  today: string;
  yesterday: string;
  daysAgo: (days: number) => string;
  /** The page-level action, named after the page it opens. */
  otherAssistants: string;
  looking: string;
  assistantSubtitle: (count: number, latest: string) => string;
  broughtOver: (count: number) => string;
  bringThese: string;
  bringing: (done: number, total: number) => string;
  brought: (brought: number, skipped: number) => string;
  bringFailed: (reason: string) => string;
  nothingDetected: string;
}

const EN: Strings = {
  memory: "Memory",
  saved: "Saved to memory.",
  savedFiles: (count) => "Saved " + String(count) + " files to memory.",
  nothingToSave: "Nothing to save.",
  saveFailed: (reason) => "Couldn’t save that: " + reason,
  noFolder: "Choose a memory folder in Settings → Extensions → Memory.",
  searchPlaceholder: "Search your memory",
  loading: "Loading…",
  unreadableNote: "This note can’t be opened. It may have been moved or deleted.",
  unreadableFolder: (reason) => "Can’t read the memory folder: " + reason,
  noMatches: (query) => "Nothing matches “" + query + "”.",
  empty:
    "Nothing here yet. Select some text or a screenshot and choose “Save to memory”, " +
    "or bring over what another assistant remembers.",
  matches: "Matches",
  memories: "Memories",
  newest: (count) => " (newest " + String(count) + ")",
  open: "Open",
  ask: "Ask @@",
  askFailed: (reason) => "Couldn’t send that note: " + reason,
  forget: "Forget",
  forgetTitle: "Forget this?",
  forgetMessage: (title) => "“" + title + "” will be deleted. You can’t undo this.",
  forgotten: "Forgotten",
  forgetFailed: (reason) => "Couldn’t delete that note: " + reason,
  forgetManyTitle: (count) => "Forget these " + String(count) + " memories?",
  forgetManyMessage: "Their screenshots go too. You can get them back from the Trash.",
  forgotMany: (count, trashed) =>
    trashed
      ? "Forgot " + String(count) + ". They’re in the Trash."
      : "Forgot " + String(count) + ".",
  today: "Today",
  yesterday: "Yesterday",
  daysAgo: (days) => String(days) + " days ago",
  otherAssistants: "Other assistants",
  looking: "Looking…",
  assistantSubtitle: (count, latest) => {
    const notes = String(count) + (count === 1 ? " note" : " notes");
    return latest.length > 0 ? notes + " · latest " + latest.toLowerCase() : notes;
  },
  broughtOver: (count) => String(count) + " brought over",
  bringThese: "Bring these over",
  bringing: (done, total) => "Sorting through… " + String(done) + "/" + String(total),
  brought: (brought, skipped) =>
    skipped > 0
      ? "Brought over " + String(brought) + ", skipped " + String(skipped) + " you already had."
      : "Brought over " + String(brought) + ".",
  bringFailed: (reason) => "Couldn’t bring those over: " + reason,
  nothingDetected:
    "No other assistant left any memories on this Mac. @@ looked for " +
    assistantNames(", ", " and ") +
    ".",
};

const ZH: Strings = {
  memory: "记忆",
  saved: "已存入记忆。",
  savedFiles: (count) => "已存入 " + String(count) + " 个文件。",
  nothingToSave: "没有可存的内容。",
  saveFailed: (reason) => "没能存进记忆：" + reason,
  noFolder: "先到 设置 → 扩展 → 记忆 里选一个目录。",
  searchPlaceholder: "搜索记忆",
  loading: "正在加载…",
  unreadableNote: "这篇笔记打不开了，可能被移走或删掉了。",
  unreadableFolder: (reason) => "读不到记忆目录：" + reason,
  noMatches: (query) => "没有匹配「" + query + "」的内容。",
  empty: "还没存过东西。选中一段文字或一张截图，点「存入记忆」；也可以把其他助手记住的东西带过来。",
  matches: "匹配结果",
  memories: "记忆",
  newest: (count) => "（最近 " + String(count) + " 条）",
  open: "打开",
  ask: "问 @@",
  askFailed: (reason) => "没能发送这篇笔记：" + reason,
  forget: "忘掉",
  forgetTitle: "忘掉这条？",
  forgetMessage: (title) => "「" + title + "」会被删掉，撤销不了。",
  forgotten: "已忘掉",
  forgetFailed: (reason) => "没能删掉这篇笔记：" + reason,
  forgetManyTitle: (count) => "忘掉这 " + String(count) + " 条记忆？",
  forgetManyMessage: "截图也会一起删，可以在废纸篓找回。",
  forgotMany: (count, trashed) =>
    trashed ? "忘掉了 " + String(count) + " 条，可以在废纸篓找回。" : "忘掉了 " + String(count) + " 条。",
  today: "今天",
  yesterday: "昨天",
  daysAgo: (days) => String(days) + " 天前",
  otherAssistants: "其他助手",
  looking: "正在查找…",
  assistantSubtitle: (count, latest) =>
    latest.length > 0 ? String(count) + " 条 · 最近 " + latest : String(count) + " 条",
  broughtOver: (count) => "已带过 " + String(count) + " 条",
  bringThese: "把这些带过来",
  bringing: (done, total) => "正在整理… " + String(done) + "/" + String(total),
  brought: (brought, skipped) =>
    skipped > 0
      ? "带来了 " + String(brought) + " 条，跳过 " + String(skipped) + " 条已有的。"
      : "带来了 " + String(brought) + " 条。",
  bringFailed: (reason) => "没能带过来：" + reason,
  nothingDetected:
    "没找到其他助手留下的记忆。会找这些：" + assistantNames("、") + "。",
};

/** `zh`, `zh-Hans`, `zh-Hant-TW` all get Chinese; everything else gets English. */
export function strings(locale: string): Strings {
  return String(locale == null ? "" : locale).toLowerCase().indexOf("zh") === 0 ? ZH : EN;
}

/** Today, yesterday, a few days ago, or the day itself. What a list row has room for. */
export function relativeDay(value: string | undefined, now: Date, words: Strings): string {
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const days = Math.round((startOfToday - startOfThatDay) / 86400000);
  if (days <= 0) return words.today;
  if (days === 1) return words.yesterday;
  if (days < 7) return words.daysAgo(days);
  return (
    String(date.getFullYear()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

function pad(value: number): string {
  return value < 10 ? "0" + String(value) : String(value);
}
