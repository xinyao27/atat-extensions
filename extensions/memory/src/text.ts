// Every string a user can see, in the two languages AtAt ships.
//
// The host tells a plugin which language it is running in (`ctx.locale` in a hook,
// `environment.locale` in a panel) and expects the plugin to localise its own output — a pill
// label saying “Recorded” inside a Chinese interface is the plugin's bug, not the host's.
//
// Nothing here is addressed to the agent. The `<memory>` section stays in English on purpose:
// it is scaffolding around the user's own words, and the words carry their own language.

export interface Strings {
  /** Pill and row label for a note the plugin wrote by itself. */
  trajectory: string;
  memory: string;
  saved: string;
  savedFiles: (count: number) => string;
  nothingToSave: string;
  saveFailed: (reason: string) => string;
  noFolder: string;
  deleted: string;
  deleteFailed: (reason: string) => string;
  deleteTitle: string;
  deleteMessage: (name: string) => string;
  searchPlaceholder: string;
  loading: string;
  unreadableNote: string;
  unreadableFolder: (reason: string) => string;
  noMatches: (query: string) => string;
  empty: string;
  matches: string;
  memories: string;
  newest: (count: number) => string;
  preview: string;
  sendToComposer: string;
  copyNote: string;
  copyPath: string;
  delete: string;
  sendFailed: (reason: string) => string;
}

const EN: Strings = {
  trajectory: "Recorded",
  memory: "Memory",
  saved: "Saved to memory.",
  savedFiles: (count) => "Saved " + String(count) + " files to memory.",
  nothingToSave: "Nothing to save.",
  saveFailed: (reason) => "Couldn’t save that: " + reason,
  noFolder: "Choose a memory folder in Settings → Extensions → Memory.",
  deleted: "Deleted",
  deleteFailed: (reason) => "Couldn’t delete that note: " + reason,
  deleteTitle: "Delete this note?",
  deleteMessage: (name) =>
    name + " will be deleted from your memory folder. You can’t undo this.",
  searchPlaceholder: "Search your memory",
  loading: "Loading…",
  unreadableNote: "This note can’t be opened. It may have been moved or deleted.",
  unreadableFolder: (reason) => "Can’t read the memory folder: " + reason,
  noMatches: (query) => "Nothing matches “" + query + "”.",
  empty: "Nothing saved yet. Select some text or a screenshot, then choose “Save to memory”.",
  matches: "Matches",
  memories: "Memories",
  newest: (count) => " (newest " + String(count) + ")",
  preview: "Preview",
  sendToComposer: "Send to Composer",
  copyNote: "Copy Note",
  copyPath: "Copy Path",
  delete: "Delete",
  sendFailed: (reason) => "Couldn’t send that note: " + reason,
};

const ZH: Strings = {
  trajectory: "自动记录",
  memory: "记忆",
  saved: "已存入记忆。",
  savedFiles: (count) => "已存入 " + String(count) + " 个文件。",
  nothingToSave: "没有可存的内容。",
  saveFailed: (reason) => "没能存进记忆：" + reason,
  noFolder: "先到 设置 → 插件 → 记忆 里选一个目录。",
  deleted: "已删除",
  deleteFailed: (reason) => "没能删掉这篇笔记：" + reason,
  deleteTitle: "删除这篇笔记？",
  deleteMessage: (name) => name + " 会从记忆目录里删掉，撤销不了。",
  searchPlaceholder: "搜索记忆",
  loading: "正在加载…",
  unreadableNote: "这篇笔记打不开了，可能被移走或删掉了。",
  unreadableFolder: (reason) => "读不到记忆目录：" + reason,
  noMatches: (query) => "没有匹配「" + query + "」的内容。",
  empty: "还没存过内容。选中一段文字或一张截图，点「存入记忆」。",
  matches: "匹配结果",
  memories: "记忆",
  newest: (count) => "（最近 " + String(count) + " 条）",
  preview: "预览",
  sendToComposer: "发送到输入框",
  copyNote: "复制笔记",
  copyPath: "复制路径",
  delete: "删除",
  sendFailed: (reason) => "没能发送这篇笔记：" + reason,
};

/** `zh`, `zh-Hans`, `zh-Hant-TW` all get Chinese; everything else gets English. */
export function strings(locale: string): Strings {
  return String(locale == null ? "" : locale).toLowerCase().indexOf("zh") === 0 ? ZH : EN;
}
