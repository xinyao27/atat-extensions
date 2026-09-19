import { useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  Action, ActionPanel, Detail, List, agent, confirmAlert, environment, files,
  ocr, options, showToast, sources, usePromise,
} from "@atat/api";
import type { SourceName, SourcePage } from "@atat/api";
import { organizeSources } from "./source-memory.js";

export default function SourcesPage({ onFinished }: { onFinished: () => void }): ReactElement {
  const isChinese = environment.locale.startsWith("zh");
  const choices: { source: SourceName; title: string }[] = [
    { source: "favorites", title: isChinese ? "收藏" : "Favorites" },
    { source: "captures", title: isChinese ? "截图与录屏工程" : "Capture projects" },
    { source: "clipboard", title: isChinese ? "剪贴板历史" : "Clipboard history" },
  ];
  return <List emptyTitle={isChinese ? "没有可用的资料" : "No sources available"}>
    {choices.map(({ source, title }) => <List.Item key={source} title={title} actions={
      <ActionPanel><Action.Push title={isChinese ? "查看资料" : "Browse items"}
        target={<SourceItems source={source} title={title} onFinished={onFinished} />} /></ActionPanel>
    } />)}
  </List>;
}

function SourceItems({ source, title, onFinished }: {
  source: SourceName; title: string; onFinished: () => void;
}): ReactElement {
  const isChinese = environment.locale.startsWith("zh");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [outcome, setOutcome] = useState("");
  const isBusy = useRef(false);
  const page = usePromise<SourcePage, [string, string | undefined]>(
    (text, next) => sources.query({ sources: [source], query: text, cursor: next, limit: 10 }),
    [query, cursor]
  );
  const items = page.error ? [] : page.data?.items ?? [];
  const organize = async (): Promise<void> => {
    if (isBusy.current || !items.length || page.isLoading) return;
    isBusy.current = true;
    try {
      const isConfirmed = await confirmAlert({
        title: isChinese ? "把这批资料整理成记忆？" : "Make memories from these items?",
        message: isChinese
          ? `将这 ${items.length} 条资料中的文字交给你配置的助手，提炼成笔记。图片会先识别文字，录屏暂不处理。`
          : `Your configured agent will turn text from ${items.length === 1 ? "this item" : `these ${items.length} items`} into notes. Images use text recognition; videos are skipped.`,
        primaryAction: { title: isChinese ? "整理" : "Organize" },
      });
      if (!isConfirmed) return;
      setIsOrganizing(true);
      setOutcome("");
      const result = await organizeSources({ sources, files, agent, ocr, options }, items, environment.locale);
      setOutcome(isChinese
        ? `新增 ${result.saved} 条记忆，${result.existing} 条已保存，${result.skipped} 条跳过。`
        : `${result.saved} saved · ${result.existing} already saved · ${result.skipped} skipped`);
      await showToast({
        title: isChinese ? `新增 ${result.saved} 条记忆` : `${result.saved} memories saved`,
        message: isChinese ? `${result.existing} 条已整理，${result.skipped} 条无需保存或暂不支持。`
          : `${result.existing} already saved; ${result.skipped} not retained or unsupported.`,
      });
    } catch (error) {
      setOutcome((isChinese ? "整理未完成：" : "Couldn’t finish: ") + (error instanceof Error ? error.message : String(error)));
      await showToast({ title: isChinese ? "整理未完成" : "Couldn't finish organizing",
        message: error instanceof Error ? error.message : String(error) });
    } finally {
      isBusy.current = false;
      setIsOrganizing(false);
      onFinished();
    }
  };
  return <List
    isLoading={page.isLoading || isOrganizing}
    searchBarPlaceholder={isChinese ? `搜索${title}` : `Search ${title.toLowerCase()}`}
    onSearchTextChange={(text) => { if (!isBusy.current) { setOutcome(""); setCursor(undefined); setQuery(text); } }}
    emptyTitle={page.error ? (isChinese ? "暂时无法读取资料" : "Couldn't read these items")
      : isChinese ? "没有找到资料" : "No items found"}
    actions={<ActionPanel>
      {items.length > 0 && !isOrganizing && <Action title={isChinese ? "整理这一批" : "Organize this batch"} onAction={organize} />}
      {page.data?.nextCursor && !isOrganizing && <Action title={isChinese ? "下一批" : "Next batch"}
        onAction={() => { if (!isBusy.current) { setOutcome(""); setCursor(page.data?.nextCursor); } }} />}
      {cursor && !isOrganizing && <Action title={isChinese ? "回到最新" : "Back to newest"}
        onAction={() => { if (!isBusy.current) { setOutcome(""); setCursor(undefined); } }} />}
    </ActionPanel>}
  >
    <List.Section title={outcome || undefined}>
    {items.map((item) => <List.Item key={item.id} title={item.title} subtitle={item.excerpt}
      actions={<ActionPanel><Action.Push title={isChinese ? "查看摘要" : "View excerpt"}
        target={<Detail markdown={item.excerpt || item.title} />} /></ActionPanel>} />)}
    </List.Section>
  </List>;
}
