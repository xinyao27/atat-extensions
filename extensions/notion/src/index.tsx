// notion — the entry point.
//
// One view beside what the user clicked. It lists the pages and databases the integration
// can see (searchable, most recently edited first), asks whether to add the text to the end
// of a page or save it as a new page — a sub-page, or a row when the destination is a
// database — and ends on a link to what changed.

import { useState } from "react";
import type { ReactElement } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Panel,
  Toast,
  agent,
  defineExtension,
  environment,
  fetch,
  options,
  secrets,
  showToast,
  usePromise,
} from "@atat/api";
import type {
  ActionInput,
  ExtensionMemorySource,
  HostContext,
  ViewProps,
} from "@atat/api";
import { stringsFor, type Strings } from "./text.js";
import { listPages } from "./memory.js";
import {
  NotionError,
  appendToPage,
  createPage,
  searchDestinations,
  type Destination,
  type Saved,
} from "./notion.js";

type Mode = "append" | "newPage";

function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").replace(/^[#>*\-\s]+/, "").slice(0, 80);
}

async function suggestTitle(text: string, ask: ((prompt: string) => Promise<string>) | null): Promise<string> {
  if (!ask) return firstLine(text);
  const prompt = [
    "Write a short title for a page that holds the text below.",
    "Use the language the text is written in. At most eight words.",
    "Reply with the title only — no quotes, no punctuation at the end.",
    "",
    "<text>",
    text.slice(0, 4_000),
    "</text>",
  ].join("\n");
  try {
    const title = ((await ask(prompt)).trim().split("\n")[0] ?? "").replace(/^["'“”「」#\s]+|["'“”「」.。\s]+$/g, "");
    return title.length > 0 ? title : firstLine(text);
  } catch {
    return firstLine(text);
  }
}

function failureMessage(error: unknown, copy: Strings): string {
  return error instanceof NotionError ? copy[error.kind] : copy.failed;
}

function SaveView({ input }: ViewProps<ActionInput>): ReactElement {
  const copy = stringsFor(environment.locale);
  const text = (input.text ?? "").trim();
  const token = usePromise(() => secrets.get("token").then((value) => value ?? ""), []);
  const [query, setQuery] = useState("");
  const destinations = usePromise(
    (value: string, search: string) => (value ? searchDestinations(value, search, fetch) : Promise.resolve([])),
    [token.data ?? "", query]
  );
  const wantsTitle = options.suggestTitle !== false;
  const suggestion = usePromise(
    (source: string, enabled: boolean) =>
      suggestTitle(source, enabled ? (prompt) => agent.ask(prompt, { timeoutMs: 20_000 }) : null),
    [text, wantsTitle]
  );

  const [destinationID, setDestinationID] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("append");
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const available: Destination[] = destinations.data ?? [];
  const chosen = available.find((entry) => entry.id === destinationID) ?? available[0];
  // A database takes rows, not appended paragraphs: its only mode is a new page.
  const effectiveMode: Mode = chosen?.kind === "dataSource" ? "newPage" : mode;
  const shownTitle = title ?? suggestion.data ?? "";

  async function save() {
    if (isSaving || !chosen) return;
    setIsSaving(true);
    try {
      setSaved(
        effectiveMode === "append"
          ? await appendToPage(token.data ?? "", chosen, text, fetch)
          : await createPage(token.data ?? "", chosen, shownTitle, text, fetch)
      );
    } catch (error) {
      await showToast({ title: failureMessage(error, copy), style: Toast.Style.Failure });
    } finally {
      setIsSaving(false);
    }
  }

  if (saved) {
    return (
      <Panel navigationTitle={copy.title}>
        <Panel.Section icon="check" title={effectiveMode === "append" ? copy.appended : copy.created}>
          <Detail.Metadata>
            <Detail.Metadata.Link title={copy.page} target={saved.url} text={saved.title} />
          </Detail.Metadata>
          <ActionPanel>
            <Action.OpenInBrowser title={copy.openInNotion} url={saved.url} />
          </ActionPanel>
        </Panel.Section>
      </Panel>
    );
  }
  if (!token.isLoading && !token.data) {
    return (
      <Panel navigationTitle={copy.title}>
        <Panel.Text text={copy.missingToken} />
      </Panel>
    );
  }

  return (
    <Panel
      navigationTitle={copy.title}
      isLoading={token.isLoading || destinations.isLoading}
      error={destinations.error ? failureMessage(destinations.error, copy) : undefined}
      onRetry={destinations.revalidate}
      actions={
        <ActionPanel>
          <Action title={isSaving ? copy.saving : copy.save} icon="upload01" onAction={save} />
        </ActionPanel>
      }
    >
      <Panel.Section>
        <Form.TextField
          id="search"
          title={copy.find}
          placeholder={copy.findPlaceholder}
          value={query}
          onChange={setQuery}
        />
        {available.length > 0 ? (
          <Form.Dropdown id="destination" title={copy.destination} value={chosen?.id ?? ""} onChange={setDestinationID}>
            {available.map((entry) => (
              <Form.Dropdown.Item
                key={entry.id}
                value={entry.id}
                title={entry.kind === "dataSource" ? `${entry.title} · ${copy.database}` : entry.title}
              />
            ))}
          </Form.Dropdown>
        ) : !destinations.isLoading ? (
          <Form.Description text={copy.nothingShared} />
        ) : null}
        {chosen?.kind === "page" ? (
          <Form.Dropdown id="mode" title={copy.how} value={mode} onChange={(value) => setMode(value as Mode)}>
            <Form.Dropdown.Item value="append" title={copy.addToEnd} />
            <Form.Dropdown.Item value="newPage" title={copy.asSubPage} />
          </Form.Dropdown>
        ) : null}
        {effectiveMode === "newPage" ? (
          <Form.TextField
            id="title"
            title={copy.pageTitle}
            placeholder={suggestion.isLoading ? copy.suggesting : copy.untitled}
            value={shownTitle}
            onChange={setTitle}
          />
        ) : null}
      </Panel.Section>
      <Panel.Section title={copy.content}>
        <Panel.Text text={text} />
      </Panel.Section>
    </Panel>
  );
}

async function tokenFrom(host: HostContext): Promise<string> {
  return (await host.secrets.get("token")) ?? "";
}

/// A routine answers the way the panel shows it: the result, or the failure's kind.
async function outcome<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    return { error: error instanceof NotionError ? error.kind : "failed" };
  }
}

const routines = {
  search: (host: HostContext, query: string) =>
    outcome(async () => searchDestinations(await tokenFrom(host), query, host.fetch)),
  append: (host: HostContext, page: Destination, text: string) =>
    outcome(async () => appendToPage(await tokenFrom(host), page, text, host.fetch)),
  create: (host: HostContext, parent: Destination, title: string, text: string) =>
    outcome(async () => createPage(await tokenFrom(host), parent, title, text, host.fetch)),
};

// The workspace, read for @@ Memory instead of written to. One handler per `memorySources`
// entry in the manifest: `workspace` pages every shared page's text, and the host decides
// which of them become memories. It needs no new option — the same secret the saves go
// through is the one the reads go through.
const workspaceSource: ExtensionMemorySource = async (request, host) =>
  listPages(request, await tokenFrom(host), host.fetch);

export default defineExtension({
  views: { save: SaveView },
  routines,
  memorySources: { workspace: workspaceSource },
});
