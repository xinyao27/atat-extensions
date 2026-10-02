// apple-notes — the entry point.
//
// One view beside what the user clicked: a title (suggested by the agent, or the text's
// first line), the folder, and the text that will be saved. One button makes the note.

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
  options,
  runAppleScript,
  showToast,
  usePromise,
} from "@atat/api";
import type { ActionInput, HostContext, ViewProps } from "@atat/api";
import { stringsFor } from "./text.js";
import { createNote, listFolders, type NotesFolder, type RunAppleScript } from "./notes.js";

function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").replace(/^[#>*\-\s]+/, "").slice(0, 60);
}

async function suggestTitle(
  text: string,
  ask: ((prompt: string) => Promise<string>) | null
): Promise<string> {
  if (!ask) return firstLine(text);
  const prompt = [
    "Write a short title for a note that holds the text below.",
    "Use the language the text is written in. At most eight words.",
    "Reply with the title only — no quotes, no punctuation at the end.",
    "",
    "<text>",
    text.slice(0, 4_000),
    "</text>",
  ].join("\n");
  try {
    const title = ((await ask(prompt)).trim().split("\n")[0] ?? "")
      .replace(/^["'“”「」#\s]+|["'“”「」.。\s]+$/g, "");
    return title.length > 0 ? title : firstLine(text);
  } catch {
    return firstLine(text);
  }
}

function SaveView({ input }: ViewProps<ActionInput>): ReactElement {
  const copy = stringsFor(environment.locale);
  const text = (input.text ?? "").trim();
  const run: RunAppleScript = (source, scriptInput) => runAppleScript(source, scriptInput);

  const folders = usePromise(() => listFolders(run), []);
  const wantsTitle = options.suggestTitle !== false;
  const suggestion = usePromise(
    (source: string, enabled: boolean) =>
      suggestTitle(source, enabled ? (prompt) => agent.ask(prompt, { timeoutMs: 20_000 }) : null),
    [text, wantsTitle]
  );

  const [title, setTitle] = useState<string | undefined>(undefined);
  const [folderID, setFolderID] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<{ name: string; folder: string } | null>(null);

  const available: NotesFolder[] = folders.data ?? [];
  const chosen = folderID ?? available[0]?.id ?? "";
  const shownTitle = title ?? suggestion.data ?? "";

  async function save() {
    if (isSaving || chosen.length === 0) return;
    setIsSaving(true);
    try {
      const name = await createNote({ folderID: chosen, title: shownTitle, text }, run);
      setSaved({
        name: name || shownTitle,
        folder: available.find((folder) => folder.id === chosen)?.name ?? "",
      });
    } catch {
      await showToast({ title: copy.saveFailed, style: Toast.Style.Failure });
    } finally {
      setIsSaving(false);
    }
  }

  if (saved) {
    return (
      <Panel navigationTitle={copy.title}>
        <Panel.Section icon="check" title={copy.saved}>
          <Detail.Metadata>
            <Detail.Metadata.Label title={copy.note} text={saved.name} />
            <Detail.Metadata.Label title={copy.folder} text={saved.folder} />
          </Detail.Metadata>
        </Panel.Section>
      </Panel>
    );
  }

  return (
    <Panel
      navigationTitle={copy.title}
      isLoading={folders.isLoading}
      error={folders.error ? copy.cannotReach : undefined}
      onRetry={folders.revalidate}
      actions={
        <ActionPanel>
          <Action title={isSaving ? copy.saving : copy.save} icon="note-add" onAction={save} />
        </ActionPanel>
      }
    >
      <Panel.Section>
        <Form.TextField
          id="title"
          title={copy.noteTitle}
          placeholder={suggestion.isLoading ? copy.suggesting : copy.titlePlaceholder}
          value={shownTitle}
          onChange={setTitle}
        />
        <Form.Dropdown id="folder" title={copy.folder} value={chosen} onChange={setFolderID}>
          {available.map((folder) => (
            <Form.Dropdown.Item key={folder.id} value={folder.id} title={folder.name} />
          ))}
        </Form.Dropdown>
      </Panel.Section>
      <Panel.Section title={copy.content}>
        <Panel.Text text={text} />
      </Panel.Section>
    </Panel>
  );
}

const routines = {
  folders: (host: HostContext) =>
    listFolders((source, scriptInput) => host.runAppleScript(source, scriptInput)),
  create: (host: HostContext, folderID: string, title: string, text: string) =>
    createNote({ folderID, title, text }, (source, scriptInput) => host.runAppleScript(source, scriptInput)),
  suggestTitle: (host: HostContext, text: string) =>
    suggestTitle(text, (prompt) => host.agent.ask(prompt, { timeoutMs: 20_000 })),
};

export default defineExtension({ views: { save: SaveView }, routines });
