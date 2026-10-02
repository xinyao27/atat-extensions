// Every string a user reads, in the language AtAt is running in.

export interface Strings {
  title: string;
  gistTitle: string;
  repository: string;
  issueTitle: string;
  issueTitlePlaceholder: string;
  drafting: string;
  labels: string;
  description: string;
  createIssue: string;
  creating: string;
  issueCreated: string;
  fileName: string;
  gistDescription: string;
  optional: string;
  makePublic: string;
  makePublicInfo: string;
  content: string;
  share: string;
  gistCreated: string;
  openOnGitHub: string;
  copyLink: string;
  missingToken: string;
  tokenRejected: string;
  notFound: string;
  notAllowed: string;
  failed: string;
}

const EN: Strings = {
  title: "Create GitHub Issue",
  gistTitle: "Share as Gist",
  repository: "Repository",
  issueTitle: "Title",
  issueTitlePlaceholder: "What’s this about?",
  drafting: "Drafting…",
  labels: "Labels",
  description: "Description",
  createIssue: "Create Issue",
  creating: "Creating…",
  issueCreated: "Issue created",
  fileName: "File name",
  gistDescription: "Description",
  optional: "Optional",
  makePublic: "Public",
  makePublicInfo: "Anyone can find a public gist. A secret one is only seen by people with the link.",
  content: "What gets shared",
  share: "Share",
  gistCreated: "Gist created",
  openOnGitHub: "Open on GitHub",
  copyLink: "Copy Link",
  missingToken: "Add a personal access token on the GitHub page in Settings first.",
  tokenRejected: "GitHub didn’t accept the token. Check it on the GitHub page in Settings.",
  notFound: "GitHub can’t find that repository, or the token can’t reach it.",
  notAllowed: "The token isn’t allowed to do that. Give it Issues or Gists access on GitHub.",
  failed: "That didn’t go through. Try again.",
};

const ZH_HANS: Strings = {
  title: "建 GitHub Issue",
  gistTitle: "分享成 Gist",
  repository: "仓库",
  issueTitle: "标题",
  issueTitlePlaceholder: "这个 issue 说的是什么？",
  drafting: "正在起草…",
  labels: "标签",
  description: "描述",
  createIssue: "创建 Issue",
  creating: "正在创建…",
  issueCreated: "Issue 已创建",
  fileName: "文件名",
  gistDescription: "说明",
  optional: "可不填",
  makePublic: "公开",
  makePublicInfo: "公开的 gist 谁都能搜到；私密的只有拿到链接的人能看。",
  content: "要分享的内容",
  share: "分享",
  gistCreated: "Gist 已创建",
  openOnGitHub: "在 GitHub 上打开",
  copyLink: "复制链接",
  missingToken: "先在设置的「GitHub」页里填上个人访问令牌。",
  tokenRejected: "GitHub 不认这个令牌。到设置的「GitHub」页里检查一下。",
  notFound: "GitHub 找不到这个仓库，或者令牌没有它的权限。",
  notAllowed: "这个令牌没有这项权限。到 GitHub 上给它开 Issues 或 Gists 权限。",
  failed: "没发出去，再试一次。",
};

export function stringsFor(locale: string): Strings {
  return String(locale).toLowerCase().startsWith("zh") ? ZH_HANS : EN;
}
