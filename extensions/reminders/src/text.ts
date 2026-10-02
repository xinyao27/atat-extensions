// Every string a user reads, in the language AtAt is running in.

export interface Strings {
  title: string;
  reminder: string;
  titlePlaceholder: string;
  suggesting: string;
  list: string;
  remindMe: string;
  due: string;
  notes: string;
  add: string;
  adding: string;
  added: string;
  emptyTitle: string;
  addFailed: string;
  cannotReach: string;
}

const EN: Strings = {
  title: "Add to Reminders",
  reminder: "Reminder",
  titlePlaceholder: "What to do",
  suggesting: "Writing the to-do…",
  list: "List",
  remindMe: "Remind me on a day",
  due: "When",
  notes: "Notes",
  add: "Add",
  adding: "Adding…",
  added: "Added to Reminders",
  emptyTitle: "Give the reminder a title first.",
  addFailed: "Couldn’t add the reminder. Try again.",
  cannotReach: "Allow @@ to use Reminders in System Settings › Privacy & Security › Automation, then try again.",
};

const ZH_HANS: Strings = {
  title: "加到提醒事项",
  reminder: "提醒",
  titlePlaceholder: "要做什么",
  suggesting: "正在概括待办…",
  list: "列表",
  remindMe: "在指定时间提醒我",
  due: "时间",
  notes: "备注",
  add: "添加",
  adding: "正在添加…",
  added: "已加到提醒事项",
  emptyTitle: "先给这条提醒写个标题。",
  addFailed: "没能添加提醒，再试一次。",
  cannotReach: "先到系统设置 › 隐私与安全性 › 自动化里允许 @@ 使用「提醒事项」，再试一次。",
};

export function stringsFor(locale: string): Strings {
  return String(locale).toLowerCase().startsWith("zh") ? ZH_HANS : EN;
}
