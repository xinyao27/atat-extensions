// reminders — the entry point.
//
// One view beside what the user clicked: the to-do as a title (shortened by the agent when
// the selection is long), the full text kept as the reminder's notes, the list it goes
// into, and an optional due date. One button adds it; the page then says where it went.

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
import {
  addReminder,
  listReminderLists,
  type ReminderList,
  type RunAppleScript,
} from "./reminders.js";

/// A selection this short already reads as a to-do; anything longer gets a suggested one.
const SHORT_ENOUGH = 60;

/// A to-do line from the agent, or the text itself when it is short, the agent is off, or
/// the answer is unusable.
async function suggestTitle(
  text: string,
  ask: ((prompt: string) => Promise<string>) | null
): Promise<string> {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length <= SHORT_ENOUGH || !ask) return plain.slice(0, 250);
  const prompt = [
    "Write the to-do this text asks for, as one short imperative line.",
    "Use the language the text is written in. At most ten words.",
    "Reply with the line only — no quotes, no explanation.",
    "",
    "<text>",
    text.slice(0, 4_000),
    "</text>",
  ].join("\n");
  try {
    const line = ((await ask(prompt)).trim().split("\n")[0] ?? "")
      .replace(/^["'“”「」\-*\s]+|["'“”「」\s]+$/g, "");
    return line.length > 0 ? line : plain.slice(0, 250);
  } catch {
    return plain.slice(0, 250);
  }
}

/// Tomorrow at nine, the moment a reminder with a date most often wants.
function tomorrowMorning(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function AddView({ input }: ViewProps<ActionInput>): ReactElement {
  const copy = stringsFor(environment.locale);
  const text = (input.text ?? "").trim();
  const run: RunAppleScript = (source, scriptInput) => runAppleScript(source, scriptInput);

  const lists = usePromise(() => listReminderLists(run), []);
  const wantsTitle = options.suggestTitle !== false;
  const suggestion = usePromise(
    (source: string, enabled: boolean) =>
      suggestTitle(source, enabled ? (prompt) => agent.ask(prompt, { timeoutMs: 20_000 }) : null),
    [text, wantsTitle]
  );

  const [title, setTitle] = useState<string | undefined>(undefined);
  const [listID, setListID] = useState<string | undefined>(undefined);
  const [hasDue, setHasDue] = useState(false);
  const [due, setDue] = useState<Date>(tomorrowMorning);
  const [isAdding, setIsAdding] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);

  const available: ReminderList[] = lists.data ?? [];
  const chosenList = listID ?? available[0]?.id ?? "";
  const shownTitle = title ?? suggestion.data ?? "";
  // The full text travels as notes only when the title does not already say all of it.
  const notes = shownTitle.replace(/\s+/g, " ").trim() === text.replace(/\s+/g, " ").trim() ? "" : text;

  async function add() {
    if (isAdding || chosenList.length === 0) return;
    if (shownTitle.trim().length === 0) {
      await showToast({ title: copy.emptyTitle, style: Toast.Style.Failure });
      return;
    }
    setIsAdding(true);
    try {
      const listName = await addReminder(
        { listID: chosenList, title: shownTitle, notes, due: hasDue ? due.toISOString() : "" },
        run
      );
      setAddedTo(listName || available.find((list) => list.id === chosenList)?.name || "");
    } catch {
      await showToast({ title: copy.addFailed, style: Toast.Style.Failure });
    } finally {
      setIsAdding(false);
    }
  }

  if (addedTo !== null) {
    return (
      <Panel navigationTitle={copy.title}>
        <Panel.Section icon="check" title={copy.added}>
          <Detail.Metadata>
            <Detail.Metadata.Label title={copy.reminder} text={shownTitle} />
            <Detail.Metadata.Label title={copy.list} text={addedTo} />
            {hasDue ? (
              <Detail.Metadata.Label title={copy.due} text={due.toLocaleString(environment.locale)} />
            ) : null}
          </Detail.Metadata>
        </Panel.Section>
      </Panel>
    );
  }

  return (
    <Panel
      navigationTitle={copy.title}
      isLoading={lists.isLoading}
      error={lists.error ? copy.cannotReach : undefined}
      onRetry={lists.revalidate}
      actions={
        <ActionPanel>
          <Action title={isAdding ? copy.adding : copy.add} icon="check" onAction={add} />
        </ActionPanel>
      }
    >
      <Panel.Section>
        <Form.TextField
          id="title"
          title={copy.reminder}
          placeholder={suggestion.isLoading ? copy.suggesting : copy.titlePlaceholder}
          value={shownTitle}
          onChange={setTitle}
        />
        <Form.Dropdown id="list" title={copy.list} value={chosenList} onChange={setListID}>
          {available.map((list) => (
            <Form.Dropdown.Item key={list.id} value={list.id} title={list.name} />
          ))}
        </Form.Dropdown>
        <Form.Checkbox id="hasDue" title={copy.remindMe} value={hasDue} onChange={setHasDue} />
        {hasDue ? (
          <Form.DatePicker
            id="due"
            title={copy.due}
            type="dateTime"
            value={due}
            onChange={(value) => value && setDue(value)}
          />
        ) : null}
      </Panel.Section>
      {notes.length > 0 ? (
        <Panel.Section title={copy.notes}>
          <Panel.Text text={notes} />
        </Panel.Section>
      ) : null}
    </Panel>
  );
}

const routines = {
  lists: (host: HostContext) =>
    listReminderLists((source, scriptInput) => host.runAppleScript(source, scriptInput)),
  add: (host: HostContext, listID: string, title: string, notes: string, due: string) =>
    addReminder({ listID, title, notes, due }, (source, scriptInput) =>
      host.runAppleScript(source, scriptInput)
    ),
  suggestTitle: (host: HostContext, text: string) =>
    suggestTitle(text, (prompt) => host.agent.ask(prompt, { timeoutMs: 20_000 })),
};

export default defineExtension({ views: { add: AddView }, routines });
