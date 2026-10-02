// Every string a user reads, in the language AtAt is running in.

export interface Strings {
  title: string;
  find: string;
  findPlaceholder: string;
  destination: string;
  database: string;
  nothingShared: string;
  how: string;
  addToEnd: string;
  asSubPage: string;
  pageTitle: string;
  untitled: string;
  suggesting: string;
  content: string;
  save: string;
  saving: string;
  appended: string;
  created: string;
  page: string;
  openInNotion: string;
  missingToken: string;
  tokenRejected: string;
  notShared: string;
  tooLong: string;
  failed: string;
}

const EN: Strings = {
  title: "Save to Notion",
  find: "Find",
  findPlaceholder: "Search your pages",
  destination: "Save to",
  database: "database",
  nothingShared: "No pages yet. In Notion, open a page’s ••• menu › Connections and add your integration.",
  how: "How",
  addToEnd: "Add to the end",
  asSubPage: "As a new page inside it",
  pageTitle: "Title",
  untitled: "Untitled",
  suggesting: "Suggesting a title…",
  content: "What gets saved",
  save: "Save",
  saving: "Saving…",
  appended: "Added to the page",
  created: "New page created",
  page: "Page",
  openInNotion: "Open in Notion",
  missingToken: "Add your integration secret on the Notion page in Settings first.",
  tokenRejected: "Notion didn’t accept the secret. Check it on the Notion page in Settings.",
  notShared: "That page isn’t shared with your integration. Add it under the page’s Connections.",
  tooLong: "That’s more than a hundred lines. Save a shorter piece.",
  failed: "That didn’t go through. Try again.",
};

const ZH_HANS: Strings = {
  title: "存到 Notion",
  find: "查找",
  findPlaceholder: "搜索你的页面",
  destination: "存到",
  database: "数据库",
  nothingShared: "还没有页面。在 Notion 里打开页面的 ••• 菜单 › 连接，把你的集成加进去。",
  how: "方式",
  addToEnd: "追加到末尾",
  asSubPage: "在里面新建一个页面",
  pageTitle: "标题",
  untitled: "未命名",
  suggesting: "正在拟标题…",
  content: "要保存的内容",
  save: "保存",
  saving: "正在保存…",
  appended: "已追加到页面",
  created: "已新建页面",
  page: "页面",
  openInNotion: "在 Notion 中打开",
  missingToken: "先在设置的「Notion」页里填上集成密钥。",
  tokenRejected: "Notion 不认这个密钥。到设置的「Notion」页里检查一下。",
  notShared: "这个页面还没共享给你的集成。在页面的「连接」里把它加上。",
  tooLong: "超过一百行了，存短一点的内容吧。",
  failed: "没存进去，再试一次。",
};

export function stringsFor(locale: string): Strings {
  return String(locale).toLowerCase().startsWith("zh") ? ZH_HANS : EN;
}
