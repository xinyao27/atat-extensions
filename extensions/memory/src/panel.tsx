// The “Memory” panel: a tab in AtAt's Settings, rendered natively from this React tree.
//
// It is where a user uses their memory — read one, ask about one, forget one, and bring over
// what another assistant already remembers. It is not a second settings page: the memory
// folder is a manifest option the host renders in its own panel above this one, and echoing
// it here would be a row that looks like a control and is not.
//
// A row is a memory rather than a file: the glyph says where it came from, the title was
// decided when it was written, the line under it is how the note starts, and the grey word on
// the right is when. Clicking it opens the note. Nothing here shows a path.

import { useState } from "react";
import type { ReactElement } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  List,
  environment,
  files,
  log,
  options,
  sendToComposer,
  showToast,
  storage,
  useNavigation,
  usePromise,
} from "@atat/api";
import {
  INBOX_DIRECTORY,
  iconForSource,
  isGranted,
  readConfiguration,
  type Configuration,
} from "./library.js";
import { assistantName, isAssistantSource } from "./import/catalog.js";
import type { MemoryHost } from "./import/host.js";
import {
  detectAssistants,
  forgetImported,
  importFromAssistant,
  type AssistantMemories,
} from "./import/run.js";
import {
  basename,
  collapseBlankLines,
  decodeText,
  flatten,
  imageReferences,
  joinPath,
  parseNote,
  resolveRelative,
  sortKey,
  truncate,
} from "./notes.js";
import { relativeDay, strings, type Strings } from "./text.js";

/** The list is virtualised by the host, but every row still costs one read of its note. */
const MAXIMUM_ROWS = 120;
const SEARCH_LIMIT = 20;
/** One line under the title. Longer than this is a paragraph, and the row has one line. */
const EXCERPT_LIMIT = 140;

/** The same capabilities a hook gets, handed to the import routine as one object. */
const host: MemoryHost = { files, storage, options, log };

interface Row {
  path: string;
  title: string;
  excerpt: string;
  when: string;
  icon: string;
  /** The assistant this memory was brought from, written under the title. */
  from: string;
  /** Where it was read from, when it came from another assistant. */
  origin: string;
}

interface PanelData {
  rows: Row[];
  mode: "browse" | "search";
  truncated: boolean;
}

// ------------------------------------------------------------------------- loading

function rowFor(path: string, content: string, excerpt: string, words: Strings): Row {
  const note = parseNote(content);
  const source = note.fields["source"] ?? "";
  return {
    path,
    title: note.fields["title"] ?? stem(basename(path)),
    excerpt: excerpt.length > 0 ? excerpt : firstParagraph(note.body),
    when: relativeDay(note.fields["date"], new Date(), words),
    icon: iconForSource(source),
    from: isAssistantSource(source) ? assistantName(source) : "",
    origin: note.fields["origin"] ?? "",
  };
}

/**
 * The folder, newest first.
 *
 * File names begin with the moment the memory was made — including the ones brought over,
 * which are named for the day the other assistant learned them — so sorting on the name is
 * sorting by when, without asking the file system anything.
 */
async function browse(configuration: Configuration, words: Strings): Promise<PanelData> {
  const directory = joinPath(configuration.memoryDirectory, INBOX_DIRECTORY);
  let entries: { name: string; isDirectory: boolean }[] = [];
  try {
    entries = await files.list(directory);
  } catch {
    // Nothing creates the folder until the first save, so an empty list is the normal
    // answer for someone who has not saved anything yet.
    return { rows: [], mode: "browse", truncated: false };
  }

  const found = entries
    .filter((entry) => !entry.isDirectory && /\.md$/i.test(entry.name))
    .sort((left, right) => {
      const compared = sortKey(right.name).localeCompare(sortKey(left.name));
      return compared !== 0 ? compared : right.name.localeCompare(left.name);
    });

  const shown = found.slice(0, MAXIMUM_ROWS);
  const rows = await Promise.all(
    shown.map(async (entry) => {
      const path = joinPath(directory, entry.name);
      const content = await read(path);
      return content === null
        ? { path, title: stem(entry.name), excerpt: "", when: "", icon: "note", from: "", origin: "" }
        : rowFor(path, content, "", words);
    })
  );
  return { rows, mode: "browse", truncated: found.length > shown.length };
}

/** The host's index answers the search; the row keeps its shape and shows the hit instead. */
async function search(
  configuration: Configuration,
  query: string,
  words: Strings
): Promise<PanelData> {
  let hits: { path: string; snippet: string; score: number }[] = [];
  try {
    hits = await files.search(configuration.memoryDirectory, query, { limit: SEARCH_LIMIT });
  } catch (error) {
    // An index that is still building is not a broken panel. No result reads better here
    // than an error a user can do nothing about.
    log("panel search unavailable: " + messageOf(error));
  }
  const rows: Row[] = [];
  const seen: Record<string, boolean> = {};
  for (const hit of hits ?? []) {
    const path = String(hit?.path ?? "");
    if (!isGranted(configuration, path) || seen[path]) continue;
    seen[path] = true;
    const snippet = truncate(flatten(String(hit?.snippet ?? "")), EXCERPT_LIMIT);
    const content = await read(path);
    rows.push(
      content === null
        ? {
            path,
            title: stem(basename(path)),
            excerpt: snippet,
            when: "",
            icon: "note",
            from: "",
            origin: "",
          }
        : rowFor(path, content, snippet, words)
    );
  }
  return { rows, mode: "search", truncated: false };
}

async function read(path: string): Promise<string | null> {
  try {
    return decodeText((await files.read(path)).base64);
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- pages

/** One memory, as it was written: the words, the picture, and none of the bookkeeping. */
function NoteDetail(props: { path: string; title: string; words: Strings }): ReactElement {
  const note = usePromise<string, [string]>(
    async (path: string) => decodeText((await files.read(path)).base64),
    [props.path]
  );
  const content = note.data ?? "";
  const body = parseNote(content).body;
  const markdown = note.isLoading
    ? props.words.loading
    : note.error
      ? props.words.unreadableNote
      : withResolvedImages(body, props.path);

  return (
    <Detail
      navigationTitle={props.title}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.SendToComposer
            title={props.words.ask}
            content={content}
            label={props.words.memory + " · " + props.title}
          />
        </ActionPanel>
      }
    />
  );
}

/**
 * The assistants that have something to hand over, and the press that brings it.
 *
 * Only assistants with memories on this Mac appear, because a list of things the user does
 * not have is a list of things they cannot do. There is nothing to choose beyond which
 * assistant: no ticks, no preview, no options. Pressing again later brings only what is new.
 */
function AssistantsPage(props: { words: Strings; onFinished: () => void }): ReactElement {
  const navigation = useNavigation();
  const [busy, setBusy] = useState<{ identifier: string; done: number; total: number } | null>(
    null
  );
  const state = usePromise<AssistantMemories[], []>(async () => await detectAssistants(host), []);
  const found = state.data ?? [];

  const bring = (assistant: AssistantMemories) => {
    if (readConfiguration(options).memoryDirectory.length === 0) {
      showToast({ title: props.words.noFolder });
      return;
    }
    setBusy({ identifier: assistant.identifier, done: 0, total: assistant.count });
    importFromAssistant(host, assistant.identifier, (done, total) => {
      setBusy({ identifier: assistant.identifier, done, total });
    })
      .then((outcome) => {
        setBusy(null);
        showToast({ title: props.words.brought(outcome.brought, outcome.skipped) });
        props.onFinished();
        navigation.pop();
      })
      .catch((error: unknown) => {
        setBusy(null);
        showToast({ title: props.words.bringFailed(messageOf(error)) });
      });
  };

  return (
    <List
      navigationTitle={props.words.otherAssistants}
      isLoading={state.isLoading}
      emptyTitle={state.isLoading ? props.words.looking : props.words.nothingDetected}
    >
      {found.map((assistant) => (
        <List.Item
          key={assistant.identifier}
          icon="bubble-chat"
          title={assistant.name}
          subtitle={
            busy && busy.identifier === assistant.identifier
              ? props.words.bringing(busy.done, busy.total)
              : props.words.assistantSubtitle(
                  assistant.count,
                  relativeDay(assistant.latest ?? undefined, new Date(), props.words)
                )
          }
          accessories={
            assistant.brought > 0
              ? [{ text: props.words.broughtOver(assistant.brought) }]
              : undefined
          }
          actions={
            <ActionPanel>
              <Action title={props.words.bringThese} onAction={() => bring(assistant)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

// ----------------------------------------------------------------------- the panel

export default function MemoryPanel(): ReactElement {
  const words = strings(environment.locale);
  const configuration = readConfiguration(options);
  const navigation = useNavigation();
  const [query, setQuery] = useState("");

  const state = usePromise<PanelData, [string]>(
    async (text: string): Promise<PanelData> => {
      if (configuration.memoryDirectory.length === 0) {
        return { rows: [], mode: "browse", truncated: false };
      }
      const trimmed = text.trim();
      return trimmed.length === 0
        ? await browse(configuration, words)
        : await search(configuration, trimmed, words);
    },
    [query]
  );

  const data = state.data;
  const rows = data?.rows ?? [];

  const forget = (row: Row) => {
    forgetNote(configuration, row)
      .then(() => {
        showToast({ title: words.forgotten, message: row.title });
        state.revalidate();
      })
      .catch((error: unknown) => {
        showToast({ title: words.forgetFailed(messageOf(error)) });
      });
  };

  const ask = (row: Row) => {
    files
      .read(row.path)
      .then((payload: { base64: string }) =>
        sendToComposer(decodeText(payload.base64), words.memory + " · " + row.title)
      )
      .catch((error: unknown) => {
        log("panel could not send a note: " + messageOf(error));
        showToast({ title: words.askFailed(messageOf(error)) });
      });
  };

  return (
    <List
      searchBarPlaceholder={words.searchPlaceholder}
      onSearchTextChange={setQuery}
      isLoading={state.isLoading}
      emptyTitle={emptyTitle(configuration, query, data, state.error, words)}
      actions={
        <ActionPanel>
          <Action
            title={words.bringOver}
            onAction={() =>
              navigation.push(
                <AssistantsPage words={words} onFinished={() => state.revalidate()} />
              )
            }
          />
        </ActionPanel>
      }
    >
      <List.Section title={sectionTitle(data, rows.length, words)}>
        {rows.map((row) => (
          <List.Item
            key={row.path}
            icon={row.icon}
            title={row.title}
            subtitle={row.from.length > 0 ? row.from + " · " + row.excerpt : row.excerpt}
            accessories={row.when.length > 0 ? [{ text: row.when }] : undefined}
            actions={
              <ActionPanel>
                {/* The row itself opens the note: the first push action is what a click runs. */}
                <Action.Push
                  title={words.open}
                  target={<NoteDetail path={row.path} title={row.title} words={words} />}
                />
                <Action title={words.ask} onAction={() => ask(row)} />
                {/*
                  A destructive action is put through `confirmAlert` by the runtime before the
                  handler runs, so the confirmation is AtAt's own dialog and cannot be skipped.
                */}
                <Action
                  title={words.forget}
                  style={Action.Style.Destructive}
                  confirmTitle={words.forgetTitle}
                  confirmMessage={words.forgetMessage(row.title)}
                  onAction={() => forget(row)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

// ------------------------------------------------------------------------ forgetting

/**
 * Forgetting is the note, its picture, and the promise not to bring it back.
 *
 * A memory that came from another assistant is on that assistant's disk as well as ours, so
 * deleting the note is only half of it: without the second half the next press of “bring
 * these over” would hand back the thing the user just threw away.
 */
async function forgetNote(configuration: Configuration, row: Row): Promise<void> {
  const content = await read(row.path);
  const note = content === null ? { fields: {}, body: "" } : parseNote(content);
  const directory = row.path.slice(0, row.path.lastIndexOf("/"));

  const assets: string[] = [];
  const declared = note.fields["asset"];
  if (declared) {
    const path = resolveRelative(configuration.memoryDirectory, declared);
    if (path) assets.push(path);
  }
  for (const reference of imageReferences(note.body)) {
    const path = resolveRelative(directory, reference);
    if (path && assets.indexOf(path) < 0) assets.push(path);
  }

  await files.remove(row.path);
  for (const asset of assets) {
    if (!isGranted(configuration, asset)) continue;
    try {
      await files.remove(asset);
    } catch (error) {
      // The note is gone, which is what the user asked for. An image that was already
      // deleted, or that another note also points at, is not worth an error message.
      log("could not delete an image beside a note: " + messageOf(error));
    }
  }
  if (row.origin.length > 0) {
    await forgetImported(host, row.origin, note.body);
  }
}

// --------------------------------------------------------------------------- copy

function sectionTitle(data: PanelData | undefined, count: number, words: Strings): string {
  if (!data) return words.memories;
  const suffix = data.truncated ? words.newest(count) : "";
  return (data.mode === "search" ? words.matches : words.memories) + suffix;
}

function emptyTitle(
  configuration: Configuration,
  query: string,
  data: PanelData | undefined,
  error: unknown,
  words: Strings
): string {
  if (configuration.memoryDirectory.length === 0) return words.noFolder;
  if (error) return words.unreadableFolder(messageOf(error));
  if (!data) return words.loading;
  if (data.mode === "search") return words.noMatches(truncate(query.trim(), 40));
  return words.empty;
}

/** How a note starts, as one line: the first paragraph, without its heading or its picture. */
function firstParagraph(body: string): string {
  const paragraph: string[] = [];
  for (const line of collapseBlankLines(body).split("\n")) {
    const text = line.trim();
    if (text.length === 0) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s/.test(text) || /^!\[/.test(text)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(text.replace(/^\s*[-*+]\s+/, ""));
  }
  return truncate(flatten(paragraph.join(" ")), EXCERPT_LIMIT);
}

/** A picture a note points at is beside it on disk; the renderer needs the whole path. */
function withResolvedImages(body: string, notePath: string): string {
  const directory = notePath.slice(0, notePath.lastIndexOf("/"));
  return body.replace(
    /(!\[[^\]]*\]\()([^)\s]+)(\))/g,
    (match: string, open: string, target: string, close: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.charAt(0) === "/") return match;
      const resolved = resolveRelative(directory, decodeSafely(target));
      return resolved === null ? match : open + resolved + close;
    }
  );
}

function decodeSafely(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function stem(name: string): string {
  return name.replace(/\.md$/i, "");
}

function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
