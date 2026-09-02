// The “Memory” panel: a tab in AtAt's Settings, rendered natively from this React tree.
//
// It is where a user uses their memory — search it, read one, send one on, delete one. It is
// not a second settings page: the memory folder and the recording switch are manifest options
// the host renders in its own panel, and echoing them here would be a row that looks like a
// control and is not. So there are no status rows, no preferences and no folder paths on
// display; there is a search field and a list.
//
// It is a plain display layer by contract: no pills, no prompt, nothing but the host APIs a
// hook would have. Every write it does goes through the same gates, and the destructive one is
// confirmed by AtAt rather than by anything drawn here.

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
  usePromise,
} from "@atat/api";
import {
  INBOX_DIRECTORY,
  TRAJECTORY_DIRECTORY,
  isGranted,
  kindOf,
  readConfiguration,
  type Configuration,
  type MemoryKind,
} from "./library.js";
import {
  basename,
  decodeText,
  flatten,
  joinPath,
  sortKey,
  titleOf,
  truncate,
} from "./notes.js";
import { strings, type Strings } from "./text.js";

/** The list is virtualised by the host, but the bridge still carries every row. */
const MAXIMUM_ROWS = 200;
/**
 * How many of the newest notes get their real title.
 *
 * A title lives in a note's front matter, so reading it means reading the file. Two hundred
 * reads to draw one list is not a trade worth making; the newest few get their titles and the
 * rest are named by their file, which is a date and therefore never meaningless.
 */
const TITLE_BUDGET = 25;
const SEARCH_LIMIT = 20;

interface Row {
  path: string;
  title: string;
  subtitle: string;
  kind: MemoryKind;
}

interface PanelData {
  rows: Row[];
  mode: "browse" | "search";
  truncated: boolean;
}

// ------------------------------------------------------------------------- loading

/**
 * The whole folder, newest first: `inbox/` and `trajectory/` read together and merged.
 *
 * Neither directory has to exist — nothing creates them until the first write — so a failed
 * listing is an empty one rather than an error. A user who has never saved anything and turned
 * recording off should see “no memories yet”, not a broken panel.
 */
async function browse(configuration: Configuration): Promise<PanelData> {
  const found: { path: string; name: string; kind: MemoryKind }[] = [];
  for (const subfolder of [INBOX_DIRECTORY, TRAJECTORY_DIRECTORY]) {
    const directory = joinPath(configuration.memoryDirectory, subfolder);
    let entries: { name: string; isDirectory: boolean }[] = [];
    try {
      entries = await files.list(directory);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory || !/\.md$/i.test(entry.name)) continue;
      const path = joinPath(directory, entry.name);
      found.push({ path, name: entry.name, kind: kindOf(configuration, path) });
    }
  }

  // Names begin with a timestamp, so sorting on that is newest-first across both folders.
  found.sort((left, right) => {
    const compared = sortKey(right.name).localeCompare(sortKey(left.name));
    return compared !== 0 ? compared : right.name.localeCompare(left.name);
  });

  const shown = found.slice(0, MAXIMUM_ROWS);
  const titled = await Promise.all(
    shown.slice(0, TITLE_BUDGET).map(async (entry) => {
      try {
        return titleOf(decodeText((await files.read(entry.path)).base64), stem(entry.name));
      } catch {
        return stem(entry.name);
      }
    })
  );

  const rows: Row[] = shown.map((entry, index) => ({
    path: entry.path,
    title: titled[index] ?? stem(entry.name),
    subtitle: describeDate(entry.name),
    kind: entry.kind,
  }));
  return { rows, mode: "browse", truncated: found.length > shown.length };
}

/**
 * The host's index answers the search.
 *
 * `files.search` covers the granted folder recursively, so one call reaches saved memories and
 * recorded trajectories alike — which is why there is no “also search the trajectory” switch
 * to hide behind.
 */
async function search(configuration: Configuration, query: string): Promise<PanelData> {
  let hits: { path: string; snippet: string; score: number }[] = [];
  try {
    hits = await files.search(configuration.memoryDirectory, query, { limit: SEARCH_LIMIT });
  } catch (error) {
    // An index that is still building is not a broken panel. No result reads better here than
    // an error a user can do nothing about.
    log("panel search unavailable: " + messageOf(error));
  }
  const rows: Row[] = [];
  const seen: Record<string, boolean> = {};
  for (const hit of hits ?? []) {
    const path = String(hit?.path ?? "");
    if (!isGranted(configuration, path) || seen[path]) continue;
    seen[path] = true;
    rows.push({
      path,
      title: stem(basename(path)),
      subtitle: truncate(flatten(String(hit?.snippet ?? "")), 140),
      kind: kindOf(configuration, path),
    });
  }
  return { rows, mode: "search", truncated: false };
}

// --------------------------------------------------------------------------- pages

function NoteDetail(props: { path: string; words: Strings }): ReactElement {
  const note = usePromise<string, [string]>(
    async (path: string) => decodeText((await files.read(path)).base64),
    [props.path]
  );
  const content = note.data ?? "";
  const markdown = note.isLoading
    ? props.words.loading
    : note.error
      ? props.words.unreadableNote
      : content;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.SendToComposer
            title={props.words.sendToComposer}
            content={content}
            label={props.words.memory + " · " + basename(props.path)}
          />
          <Action.CopyToClipboard title={props.words.copyNote} content={content} />
          <Action.CopyToClipboard title={props.words.copyPath} content={props.path} />
        </ActionPanel>
      }
    />
  );
}

// ----------------------------------------------------------------------- the panel

export default function MemoryPanel(): ReactElement {
  const words = strings(environment.locale);
  const configuration = readConfiguration(options);
  const [query, setQuery] = useState("");

  const state = usePromise<PanelData, [string]>(
    async (text: string): Promise<PanelData> => {
      if (configuration.memoryDirectory.length === 0) {
        return { rows: [], mode: "browse", truncated: false };
      }
      const trimmed = text.trim();
      return trimmed.length === 0
        ? await browse(configuration)
        : await search(configuration, trimmed);
    },
    [query]
  );

  const data = state.data;
  const rows = data?.rows ?? [];

  const remove = (row: Row) => {
    files
      .remove(row.path)
      .then(() => {
        showToast({ title: words.deleted, message: basename(row.path) });
        state.revalidate();
      })
      .catch((error: unknown) => {
        showToast({ title: words.deleteFailed(messageOf(error)) });
      });
  };

  const send = (row: Row) => {
    files
      .read(row.path)
      .then((payload: { base64: string }) =>
        sendToComposer(decodeText(payload.base64), words.memory + " · " + row.title)
      )
      .catch((error: unknown) => {
        log("panel could not send a note: " + messageOf(error));
        showToast({ title: words.sendFailed(messageOf(error)) });
      });
  };

  return (
    <List
      searchBarPlaceholder={words.searchPlaceholder}
      onSearchTextChange={setQuery}
      isLoading={state.isLoading}
      emptyTitle={emptyTitle(configuration, query, data, state.error, words)}
    >
      <List.Section title={sectionTitle(data, rows.length, words)}>
        {rows.map((row) => (
          <List.Item
            key={row.path}
            title={row.title}
            subtitle={row.subtitle}
            accessories={row.kind === "trajectory" ? [{ text: words.trajectory }] : undefined}
            actions={
              <ActionPanel>
                <Action.Push
                  title={words.preview}
                  target={<NoteDetail path={row.path} words={words} />}
                />
                <Action title={words.sendToComposer} onAction={() => send(row)} />
                <Action.CopyToClipboard title={words.copyPath} content={row.path} />
                {/*
                  A destructive action is put through `confirmAlert` by the runtime before the
                  handler runs, so the confirmation is AtAt's own dialog and cannot be skipped.
                */}
                <Action
                  title={words.delete}
                  style={Action.Style.Destructive}
                  confirmTitle={words.deleteTitle}
                  confirmMessage={words.deleteMessage(basename(row.path))}
                  onAction={() => remove(row)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
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

function stem(name: string): string {
  return name.replace(/\.md$/i, "");
}

/** `20260824-011500-ab12` → `2026-08-24 01:15`. Anything else keeps its name. */
function describeDate(name: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
  if (!match) return stem(name);
  return match[1] + "-" + match[2] + "-" + match[3] + " " + match[4] + ":" + match[5];
}

function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
