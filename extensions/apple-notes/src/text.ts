// Every string a user reads, in the language AtAt is running in.

export interface Strings {
  title: string;
  noteTitle: string;
  titlePlaceholder: string;
  suggesting: string;
  folder: string;
  content: string;
  save: string;
  saving: string;
  saved: string;
  note: string;
  saveFailed: string;
  cannotReach: string;
}

const EN: Strings = {
  title: "Save to Notes",
  noteTitle: "Title",
  titlePlaceholder: "Untitled",
  suggesting: "Suggesting a title…",
  folder: "Folder",
  content: "What gets saved",
  save: "Save",
  saving: "Saving…",
  saved: "Saved to Notes",
  note: "Note",
  saveFailed: "Couldn’t save the note. Try again.",
  cannotReach: "Allow @@ to use Notes in System Settings › Privacy & Security › Automation, then try again.",
};

const ZH_HANS: Strings = {
  title: "存到备忘录",
  noteTitle: "标题",
  titlePlaceholder: "未命名",
  suggesting: "正在拟标题…",
  folder: "文件夹",
  content: "要保存的内容",
  save: "保存",
  saving: "正在保存…",
  saved: "已存到备忘录",
  note: "备忘录",
  saveFailed: "没能保存这条备忘录，再试一次。",
  cannotReach: "先到系统设置 › 隐私与安全性 › 自动化里允许 @@ 使用「备忘录」，再试一次。",
};

export function stringsFor(locale: string): Strings {
  return String(locale).toLowerCase().startsWith("zh") ? ZH_HANS : EN;
}
