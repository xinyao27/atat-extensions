// Every string a user reads, in the language AtAt is running in.

export interface Strings {
  title: string;
  destination: string;
  newNote: string;
  dailyNote: string;
  noteTitle: string;
  titlePlaceholder: string;
  suggesting: string;
  content: string;
  save: string;
  saving: string;
  savedAsNote: string;
  savedToDaily: string;
  file: string;
  showInFinder: string;
  noVault: string;
  emptyText: string;
  badFolder: string;
  saveFailed: string;
}

const EN: Strings = {
  title: "Save to Obsidian",
  destination: "Save to",
  newNote: "A new note",
  dailyNote: "Today’s note",
  noteTitle: "Title",
  titlePlaceholder: "Untitled",
  suggesting: "Suggesting a title…",
  content: "What gets saved",
  save: "Save",
  saving: "Saving…",
  savedAsNote: "Saved as a new note",
  savedToDaily: "Added to today’s note",
  file: "File",
  showInFinder: "Show in Finder",
  noVault: "Choose your vault on the Obsidian page in Settings first.",
  emptyText: "There’s nothing here to save.",
  badFolder: "Check the folder names on the Obsidian page in Settings.",
  saveFailed: "Couldn’t save that. Check that your vault is still where you chose.",
};

const ZH_HANS: Strings = {
  title: "存到 Obsidian",
  destination: "存到",
  newNote: "一篇新笔记",
  dailyNote: "今天的日记",
  noteTitle: "标题",
  titlePlaceholder: "未命名",
  suggesting: "正在拟标题…",
  content: "要保存的内容",
  save: "保存",
  saving: "正在保存…",
  savedAsNote: "已存成新笔记",
  savedToDaily: "已记进今天的日记",
  file: "文件",
  showInFinder: "在访达中显示",
  noVault: "先在设置的「Obsidian」页里选好你的笔记库。",
  emptyText: "这里没有能保存的内容。",
  badFolder: "到设置的「Obsidian」页里检查一下文件夹名称。",
  saveFailed: "没能保存。看看笔记库是不是还在你选的位置。",
};

export function stringsFor(locale: string): Strings {
  return String(locale).toLowerCase().startsWith("zh") ? ZH_HANS : EN;
}
