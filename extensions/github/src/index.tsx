// github — the entry point.
//
// Two views, one per action. The issue view drafts a title and description with the
// user's agent, lets them pick the repository and labels, and creates the issue. The gist
// view names the file from its content and shares it, secret by default. Both end on the
// same page: what was created, and a button that opens it in the browser.

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
import type { ActionInput, HostContext, ViewProps } from "@atat/api";
import { stringsFor, type Strings } from "./text.js";
import {
  GitHubError,
  createGist,
  createIssue,
  draftIssue,
  guessFileName,
  listLabels,
  listRepositories,
  type Created,
} from "./github.js";

function failureMessage(error: unknown, copy: Strings): string {
  return error instanceof GitHubError ? copy[error.kind] : copy.failed;
}

/// The page every successful create lands on.
function CreatedPage({ created, heading, copy }: { created: Created; heading: string; copy: Strings }): ReactElement {
  return (
    <Panel navigationTitle={copy.title}>
      <Panel.Section icon="check" title={heading}>
        <Detail.Metadata>
          <Detail.Metadata.Link title={created.label} target={created.url} text={created.url} />
        </Detail.Metadata>
        <ActionPanel>
          <Action.OpenInBrowser title={copy.openOnGitHub} url={created.url} />
          <Action.CopyToClipboard title={copy.copyLink} icon="copy01" content={created.url} />
        </ActionPanel>
      </Panel.Section>
    </Panel>
  );
}

function IssueView({ input }: ViewProps<ActionInput>): ReactElement {
  const copy = stringsFor(environment.locale);
  const text = (input.text ?? "").trim();
  const token = usePromise(() => secrets.get("token").then((value) => value ?? ""), []);
  const repositories = usePromise(
    (value: string) => (value ? listRepositories(value, fetch) : Promise.resolve([])),
    [token.data ?? ""]
  );
  const wantsDraft = options.draftWithAgent !== false;
  const draft = usePromise(
    (source: string, enabled: boolean) =>
      draftIssue(source, enabled ? (prompt) => agent.ask(prompt, { timeoutMs: 30_000 }) : null),
    [text, wantsDraft]
  );

  const preferred = String(options.defaultRepository ?? "").trim();
  const [repository, setRepository] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [body, setBody] = useState<string | undefined>(undefined);
  const [labels, setLabels] = useState<string[]>([]);
  const [created, setCreated] = useState<Created | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const names = (repositories.data ?? []).map((repo) => repo.fullName);
  const chosen = repository ?? (names.includes(preferred) ? preferred : names[0] ?? preferred);
  const available = usePromise(
    (value: string, repo: string) => (value && repo ? listLabels(value, repo, fetch) : Promise.resolve([])),
    [token.data ?? "", chosen]
  );
  const shownTitle = title ?? draft.data?.title ?? "";
  const shownBody = body ?? draft.data?.body ?? "";

  async function create() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      setCreated(
        await createIssue(token.data ?? "", chosen, { title: shownTitle, body: shownBody, labels }, fetch)
      );
    } catch (error) {
      await showToast({ title: failureMessage(error, copy), style: Toast.Style.Failure });
    } finally {
      setIsCreating(false);
    }
  }

  if (created) return <CreatedPage created={created} heading={copy.issueCreated} copy={copy} />;
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
      isLoading={token.isLoading || repositories.isLoading}
      error={repositories.error ? failureMessage(repositories.error, copy) : undefined}
      onRetry={repositories.revalidate}
      actions={
        <ActionPanel>
          <Action title={isCreating ? copy.creating : copy.createIssue} icon="upload01" onAction={create} />
        </ActionPanel>
      }
    >
      <Panel.Section>
        <Form.Dropdown id="repository" title={copy.repository} value={chosen} onChange={setRepository}>
          {(names.length > 0 ? names : preferred ? [preferred] : []).map((name) => (
            <Form.Dropdown.Item key={name} value={name} title={name} />
          ))}
        </Form.Dropdown>
        <Form.TextField
          id="title"
          title={copy.issueTitle}
          placeholder={draft.isLoading ? copy.drafting : copy.issueTitlePlaceholder}
          value={shownTitle}
          onChange={setTitle}
        />
        {(available.data ?? []).length > 0 ? (
          <Form.TagPicker id="labels" title={copy.labels} value={labels} onChange={setLabels}>
            {(available.data ?? []).map((label) => (
              <Form.TagPicker.Item key={label} value={label} title={label} />
            ))}
          </Form.TagPicker>
        ) : null}
        <Form.TextArea id="body" title={copy.description} value={shownBody} onChange={setBody} />
      </Panel.Section>
    </Panel>
  );
}

function GistView({ input }: ViewProps<ActionInput>): ReactElement {
  const copy = stringsFor(environment.locale);
  const text = input.text ?? "";
  const token = usePromise(() => secrets.get("token").then((value) => value ?? ""), []);
  const [fileName, setFileName] = useState(() => guessFileName(text));
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function share() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      setCreated(await createGist(token.data ?? "", { fileName, content: text, description, isPublic }, fetch));
    } catch (error) {
      await showToast({ title: failureMessage(error, copy), style: Toast.Style.Failure });
    } finally {
      setIsCreating(false);
    }
  }

  if (created) return <CreatedPage created={created} heading={copy.gistCreated} copy={copy} />;
  if (!token.isLoading && !token.data) {
    return (
      <Panel navigationTitle={copy.gistTitle}>
        <Panel.Text text={copy.missingToken} />
      </Panel>
    );
  }

  return (
    <Panel
      navigationTitle={copy.gistTitle}
      isLoading={token.isLoading}
      actions={
        <ActionPanel>
          <Action title={isCreating ? copy.creating : copy.share} icon="code" onAction={share} />
        </ActionPanel>
      }
    >
      <Panel.Section>
        <Form.TextField id="fileName" title={copy.fileName} value={fileName} onChange={setFileName} />
        <Form.TextField
          id="description"
          title={copy.gistDescription}
          placeholder={copy.optional}
          value={description}
          onChange={setDescription}
        />
        <Form.Checkbox
          id="public"
          title={copy.makePublic}
          info={copy.makePublicInfo}
          value={isPublic}
          onChange={setIsPublic}
        />
      </Panel.Section>
      <Panel.Section title={copy.content}>
        <Panel.Markdown markdown={`\`\`\`\n${text.replace(/```/g, "ˋˋˋ")}\n\`\`\``} />
      </Panel.Section>
    </Panel>
  );
}

// The same work, reachable from a hook context so the smoke harness can check the requests
// without a window.
async function tokenFrom(host: HostContext): Promise<string> {
  return (await host.secrets.get("token")) ?? "";
}

/// A routine answers the way the panel would show it: the result, or the kind of failure
/// the page turns into a sentence.
async function outcome<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    return { error: error instanceof GitHubError ? error.kind : "failed" };
  }
}

const routines = {
  repositories: (host: HostContext) =>
    outcome(async () => listRepositories(await tokenFrom(host), host.fetch)),
  createIssue: (host: HostContext, repository: string, title: string, body: string, labels: string[]) =>
    outcome(async () => createIssue(await tokenFrom(host), repository, { title, body, labels }, host.fetch)),
  createGist: (host: HostContext, fileName: string, content: string, isPublic: boolean) =>
    outcome(async () =>
      createGist(await tokenFrom(host), { fileName, content, description: "", isPublic }, host.fetch)
    ),
  draft: (host: HostContext, text: string) =>
    draftIssue(text, (prompt) => host.agent.ask(prompt, { timeoutMs: 30_000 })),
  guessFileName: (_host: HostContext, text: string) => guessFileName(text),
};

export default defineExtension({ views: { issue: IssueView, gist: GistView }, routines });
