// Every string a user can see, in the two languages AtAt ships.
//
// The host tells a plugin which language it is running in (`ctx.locale` in a hook,
// `environment.locale` in a panel) and expects the plugin to localise its own output — a pill
// label saying “Trajectory” inside a Chinese interface is the plugin's bug, not the host's.
//
// Nothing here is addressed to the agent. The `<memory>` section stays in English on purpose:
// it is scaffolding around the user's own words, and the words carry their own language.

export interface Strings {
  /** Pill and row label for a note AtAt recorded by itself. */
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
  trajectory: "Trajectory",
  memory: "Memory",
  saved: "Saved to memory.",
  savedFiles: (count) => "Saved " + String(count) + " files to memory.",
  nothingToSave: "Nothing to save.",
  saveFailed: (reason) => "Could not save to memory: " + reason,
  noFolder: "Choose a memory folder in Settings → Plugins → Memory first.",
  deleted: "Deleted",
  deleteFailed: (reason) => "Could not delete that note: " + reason,
  deleteTitle: "Delete this memory?",
  deleteMessage: (name) => name + " will be removed from the folder. This cannot be undone.",
  searchPlaceholder: "Search your memory",
  loading: "Loading…",
  unreadableNote: "This note could not be read. It may have been moved or deleted.",
  unreadableFolder: (reason) => "The memory folder could not be read: " + reason,
  noMatches: (query) => "No memories match “" + query + "”.",
  empty: "No memories yet. Use “Save to memory” from a selection, a clipboard entry or a capture.",
  matches: "Matches",
  memories: "Memories",
  newest: (count) => " (newest " + String(count) + ")",
  preview: "Preview",
  sendToComposer: "Send to Composer",
  copyNote: "Copy Note",
  copyPath: "Copy Path",
  delete: "Delete",
  sendFailed: (reason) => "Could not send that note: " + reason,
};

const ZH: Strings = {
  trajectory: "轨迹",
  memory: "记忆",
  saved: "已存入记忆。",
  savedFiles: (count) => "已存入记忆，共 " + String(count) + " 个文件。",
  nothingToSave: "没有可存的内容。",
  saveFailed: (reason) => "存入记忆失败：" + reason,
  noFolder: "请先在 设置 → 插件 → 记忆 里选择记忆目录。",
  deleted: "已删除",
  deleteFailed: (reason) => "删除失败：" + reason,
  deleteTitle: "删除这条记忆？",
  deleteMessage: (name) => name + " 会从目录里移除，无法恢复。",
  searchPlaceholder: "搜索记忆",
  loading: "加载中…",
  unreadableNote: "读不到这篇笔记，可能已经被移动或删除。",
  unreadableFolder: (reason) => "读不到记忆目录：" + reason,
  noMatches: (query) => "没有匹配「" + query + "」的记忆。",
  empty: "还没有记忆。在划词、剪贴板条目或截图上点「存入记忆」试试。",
  matches: "匹配结果",
  memories: "记忆",
  newest: (count) => "（最近 " + String(count) + " 条）",
  preview: "预览",
  sendToComposer: "发送到输入框",
  copyNote: "复制笔记",
  copyPath: "复制路径",
  delete: "删除",
  sendFailed: (reason) => "发送失败：" + reason,
};

/** `zh`, `zh-Hans`, `zh-Hant-TW` all get Chinese; everything else gets English. */
export function strings(locale: string): Strings {
  return String(locale == null ? "" : locale).toLowerCase().indexOf("zh") === 0 ? ZH : EN;
}
