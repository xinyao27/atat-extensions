import { useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  Action, ActionPanel, Detail, List, agent, confirmAlert, environment, files,
  ocr, options, showToast, sources, usePromise,
} from "@atat/api";
import type { SourceName, SourcePage } from "@atat/api";
import { organizeSources } from "./source-memory.js";
import { strings } from "./text.js";

export default function SourcesPage({ onFinished }: { onFinished: () => void }): ReactElement {
  const words = strings(environment.locale);
  const choices: { source: SourceName; title: string }[] = [
    { source: "favorites", title: words.sourceFavorites },
    { source: "captures", title: words.sourceCaptures },
    { source: "clipboard", title: words.sourceClipboard },
  ];
  return <List emptyTitle={words.noSources}>
    {choices.map(({ source, title }) => <List.Item key={source} title={title} actions={
      <ActionPanel><Action.Push title={words.browseItems}
        target={<SourceItems source={source} title={title} onFinished={onFinished} />} /></ActionPanel>
    } />)}
  </List>;
}

function SourceItems({ source, title, onFinished }: {
  source: SourceName; title: string; onFinished: () => void;
}): ReactElement {
  const words = strings(environment.locale);
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
        title: words.organizeTitle,
        message: words.organizeMessage(items.length),
        primaryAction: { title: words.organize },
      });
      if (!isConfirmed) return;
      setIsOrganizing(true);
      setOutcome("");
      const result = await organizeSources({ sources, files, agent, ocr, options }, items, environment.locale);
      setOutcome(words.organizeOutcome(result.saved, result.existing, result.skipped));
      await showToast({
        title: words.organizedToastTitle(result.saved),
        message: words.organizedToastMessage(result.existing, result.skipped),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setOutcome(words.organizeFailedReason(reason));
      await showToast({ title: words.organizeFailed, message: reason });
    } finally {
      isBusy.current = false;
      setIsOrganizing(false);
      onFinished();
    }
  };
  return <List
    isLoading={page.isLoading || isOrganizing}
    searchBarPlaceholder={words.searchSource(title)}
    onSearchTextChange={(text) => { if (!isBusy.current) { setOutcome(""); setCursor(undefined); setQuery(text); } }}
    emptyTitle={page.error ? words.unreadableItems : words.noItems}
    actions={<ActionPanel>
      {items.length > 0 && !isOrganizing && <Action title={words.organizeBatch} onAction={organize} />}
      {page.data?.nextCursor && !isOrganizing && <Action title={words.nextBatch}
        onAction={() => { if (!isBusy.current) { setOutcome(""); setCursor(page.data?.nextCursor); } }} />}
      {cursor && !isOrganizing && <Action title={words.backToNewest}
        onAction={() => { if (!isBusy.current) { setOutcome(""); setCursor(undefined); } }} />}
    </ActionPanel>}
  >
    <List.Section title={outcome || undefined}>
    {items.map((item) => <List.Item key={item.id} title={item.title} subtitle={item.excerpt}
      actions={<ActionPanel><Action.Push title={words.viewExcerpt}
        target={<Detail markdown={item.excerpt || item.title} />} /></ActionPanel>} />)}
    </List.Section>
  </List>;
}
