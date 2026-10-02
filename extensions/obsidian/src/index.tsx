// obsidian — the entry point.
//
// One view, opened beside whatever the user clicked Save on. It shows what will be saved,
// where it will go — today's note or a note of its own — and, for a new note, a title the
// agent suggested and the user can change. One button saves. The page then says where the
// text went; nothing about it needs a second window.

import { useState } from "react";
import type { ReactElement } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Panel,
  agent,
  defineExtension,
  environment,
  files,
  options,
  showToast,
  Toast,
  usePromise,
} from "@atat/api";
import type {
  ActionInput,
  ExtensionMemorySource,
  HostContext,
  ViewProps,
} from "@atat/api";
import { stringsFor, type Strings } from "./text.js";
import { listNotes } from "./memory.js";
import {
  VaultError,
  firstLine,
  saveNote,
  type Destination,
  type SaveResult,
  type VaultSettings,
} from "./vault.js";

function settingsFrom(values: Record<string, string | boolean>): VaultSettings {
  return {
    vault: String(values.vault ?? ""),
    dailyFolder: String(values.dailyFolder ?? ""),
    dailyFormat: String(values.dailyFormat ?? "YYYY-MM-DD"),
    inboxFolder: String(values.inboxFolder ?? ""),
  };
}

/// A short title for a new note, from the user's own agent. Anything that goes wrong —
/// no agent, a slow one, an answer that is not a title — falls back to the text's first
/// line, so the field is never empty and the user is never kept waiting on it.
async function suggestTitle(
  text: string,
  ask: (prompt: string) => Promise<string>
): Promise<string> {
  const prompt = [
    "Write a short title for a note that holds the text below.",
    "Use the language the text is written in. At most eight words.",
    "Reply with the title only — no quotes, no punctuation at the end, no explanation.",
    "",
    "<text>",
    text.slice(0, 4_000),
    "</text>",
  ].join("\n");
  const reply = (await ask(prompt)).trim().split("\n")[0] ?? "";
  const title = reply.replace(/^["'“”「」#\s]+|["'“”「」.。\s]+$/g, "").slice(0, 100);
  return title.length > 0 ? title : firstLine(text);
}

function failureMessage(error: unknown, copy: Strings): string {
  if (error instanceof VaultError) return copy[error.kind];
  return copy.saveFailed;
}

function SaveView({ input }: ViewProps<ActionInput>): ReactElement {
  const copy = stringsFor(environment.locale);
  const settings = settingsFrom(options);
  const text = (input.text ?? "").trim();
  const [destination, setDestination] = useState<Destination>("note");
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const wantsTitle = options.suggestTitle !== false;
  const suggestion = usePromise(
    (source: string, enabled: boolean) =>
      enabled && source.length > 0
        ? suggestTitle(source, (prompt) => agent.ask(prompt, { timeoutMs: 20_000 })).catch(() =>
            firstLine(source)
          )
        : Promise.resolve(firstLine(source)),
    [text, wantsTitle]
  );
  const shownTitle = title ?? suggestion.data ?? "";

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveNote(
        { destination, title: shownTitle, text, now: new Date().toISOString() },
        settings,
        files
      );
      setSaved(result);
    } catch (error) {
      await showToast({ title: failureMessage(error, copy), style: Toast.Style.Failure });
    } finally {
      setIsSaving(false);
    }
  }

  if (settings.vault.length === 0) {
    return (
      <Panel navigationTitle={copy.title}>
        <Panel.Text text={copy.noVault} />
      </Panel>
    );
  }

  if (saved) {
    return (
      <Panel navigationTitle={copy.title}>
        <Panel.Section icon="check" title={saved.destination === "daily" ? copy.savedToDaily : copy.savedAsNote}>
          <Detail.Metadata>
            <Detail.Metadata.Label title={copy.file} text={saved.relativePath} />
          </Detail.Metadata>
          <ActionPanel>
            <Action.ShowInFinder title={copy.showInFinder} path={saved.path} />
          </ActionPanel>
        </Panel.Section>
      </Panel>
    );
  }

  return (
    <Panel
      navigationTitle={copy.title}
      actions={
        <ActionPanel>
          <Action title={isSaving ? copy.saving : copy.save} icon="note-add" onAction={save} />
        </ActionPanel>
      }
    >
      <Panel.Section>
        <Form.Dropdown
          id="destination"
          title={copy.destination}
          value={destination}
          onChange={(value) => setDestination(value as Destination)}
        >
          <Form.Dropdown.Item value="note" title={copy.newNote} />
          <Form.Dropdown.Item value="daily" title={copy.dailyNote} />
        </Form.Dropdown>
        {destination === "note" ? (
          <Form.TextField
            id="title"
            title={copy.noteTitle}
            placeholder={suggestion.isLoading ? copy.suggesting : copy.titlePlaceholder}
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

// The same save, reachable from a hook context so the smoke harness can check it without a
// window.
const routines = {
  save: (
    host: HostContext,
    destination: Destination,
    title: string,
    text: string,
    now: string
  ) => saveNote({ destination, title, text, now }, settingsFrom(host.options), host.files),
  suggestTitle: (host: HostContext, text: string) =>
    suggestTitle(text, (prompt) => host.agent.ask(prompt, { timeoutMs: 20_000 })),
};

// The vault, read for @@ Memory instead of written to. One handler per `memorySources` entry
// in the manifest: `vault` pages every note in the folder, and the host decides which of them
// become memories. Reading needs no new option — the same `vault` the saves land in is the
// collection the import lists.
const vaultSource: ExtensionMemorySource = (request, host) =>
  listNotes(request, String(host.options.vault ?? ""), host.files);

export default defineExtension({
  views: { save: SaveView },
  routines,
  memorySources: { vault: vaultSource },
});
