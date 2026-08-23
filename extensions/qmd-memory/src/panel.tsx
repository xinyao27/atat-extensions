// The “Memory” panel: a tab in AtAt's Settings, rendered natively from this React tree.
//
// It is the answer to “where do my memories live?”. Search goes to qmd; browsing goes straight
// to the folder, so the panel keeps working when qmd does not — which is the whole degradation
// story of this plugin, made visible in one page.
//
// It is a plain display layer by contract: no pills, no prompt, nothing but the host APIs a
// hook would have. Every write it does — deleting a note, sending one to the composer — goes
// through the same gates, and the destructive one is confirmed by AtAt rather than by anything
// drawn here.

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  List,
  fetch,
  files,
  log,
  options,
  sendToComposer,
  showToast,
  storage,
  useNavigation,
  usePromise,
} from "@atat/ui";
import {
  INBOX_DIRECTORY,
  collections,
  readConfiguration,
  resolveHitPath,
  type Configuration,
  type LibraryKind,
} from "./library.js";
import {
  basename,
  decodeText,
  joinPath,
  stripLineNumbers,
  titleOf,
  truncate,
} from "./notes.js";
import { queryQmd, statusQmd } from "./qmd.js";

/** A panel is interactive, so it can afford more than a hook's 800ms. */
const PANEL_DEADLINE_MS = 5000;
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
/** Whether panel search covers the trajectory as well. A panel preference, so it lives here. */
const SEARCH_TRAJECTORY_KEY = "panel.searchesTrajectory";

interface Row {
  path: string;
  title: string;
  subtitle: string;
  accessory: string | null;
  kind: LibraryKind;
}

interface PanelData {
  rows: Row[];
  mode: "browse" | "search";
  /** `null` in browse mode, where nothing was asked of qmd. */
  reachable: boolean | null;
  truncated: boolean;
  documents: number | null;
}

// ------------------------------------------------------------------------- loading

async function browse(configuration: Configuration): Promise<PanelData> {
  const directory = joinPath(configuration.memoryDirectory, INBOX_DIRECTORY);
  const entries = await files.list(directory);
  const names = entries
    .filter((entry) => !entry.isDirectory && /\.md$/i.test(entry.name))
    .map((entry) => entry.name)
    // Names begin with a timestamp, so newest-first is the reverse of alphabetical. Sorting
    // by name rather than by modification time is deliberate: a file iCloud downloaded this
    // morning was written months ago, and the name is when it was written.
    .sort()
    .reverse();

  const shown = names.slice(0, MAXIMUM_ROWS);
  const titled = await Promise.all(
    shown.slice(0, TITLE_BUDGET).map(async (name) => {
      const path = joinPath(directory, name);
      try {
        const content = decodeText((await files.read(path)).base64);
        return titleOf(content, stem(name));
      } catch {
        return stem(name);
      }
    })
  );

  const rows: Row[] = shown.map((name, index) => ({
    path: joinPath(directory, name),
    title: titled[index] ?? stem(name),
    subtitle: describeDate(name),
    accessory: null,
    kind: "memory" as LibraryKind,
  }));

  const status = await statusQmd(fetch, {
    port: configuration.port,
    deadlineMs: PANEL_DEADLINE_MS,
  });
  return {
    rows,
    mode: "browse",
    reachable: status.reachable,
    truncated: names.length > shown.length,
    documents: status.reachable
      ? status.collections.reduce((total, entry) => total + entry.documents, 0)
      : null,
  };
}

async function search(
  configuration: Configuration,
  query: string,
  includesTrajectory: boolean
): Promise<PanelData> {
  const searched = collections(configuration).filter(
    (collection) => includesTrajectory || collection.kind === "memory"
  );
  const outcome = await queryQmd(fetch, {
    port: configuration.port,
    collections: searched.map((collection) => collection.name),
    text: query,
    limit: 20,
    deadlineMs: PANEL_DEADLINE_MS,
  });
  if (!outcome.reachable) {
    log("panel search unavailable: qmd " + outcome.reason);
    return { rows: [], mode: "search", reachable: false, truncated: false, documents: null };
  }

  const rows: Row[] = [];
  const seen: Record<string, boolean> = {};
  for (const hit of outcome.hits) {
    const resolved = resolveHitPath(configuration, hit.file);
    if (!resolved || seen[resolved.path]) continue;
    seen[resolved.path] = true;
    rows.push({
      path: resolved.path,
      title: hit.title.length > 0 ? hit.title : basename(resolved.path),
      subtitle: truncate(stripLineNumbers(hit.snippet).replace(/\s+/g, " "), 140),
      accessory: String(Math.round(hit.score * 100)) + "%",
      kind: resolved.kind,
    });
  }
  return { rows, mode: "search", reachable: true, truncated: false, documents: null };
}

// --------------------------------------------------------------------------- pages

function NoteDetail(props: { path: string }): ReactElement {
  const note = usePromise<string, [string]>(
    async (path: string) => decodeText((await files.read(path)).base64),
    [props.path]
  );
  const content = note.data ?? "";
  const markdown = note.isLoading
    ? "Loading…"
    : note.error
      ? "This note could not be read. It may have been moved or deleted."
      : content;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.SendToComposer
            title="Send to Composer"
            content={content}
            label={"Memory · " + basename(props.path)}
          />
          <Action.CopyToClipboard title="Copy Note" content={content} />
          <Action.CopyToClipboard title="Copy Path" content={props.path} />
        </ActionPanel>
      }
    />
  );
}

/**
 * Panel preferences — and only panel preferences.
 *
 * The memory folder, the trajectory folder, the port and the auto-record switch are all
 * manifest options: the host renders them, the host stores them, and a folder grant has to come
 * from the user's own hand in a native panel. Drawing a copy of that switch here would be a
 * control that looks like it works and does not, so the panel shows those as status and owns
 * only the one preference that is genuinely its own.
 */
function Preferences(props: {
  searchesTrajectory: boolean;
  hasTrajectory: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  const navigation = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action title="Done" onAction={() => navigation.pop()} />
        </ActionPanel>
      }
    >
      <Form.Checkbox
        id="searchesTrajectory"
        title="Search the trajectory too"
        info={
          props.hasTrajectory
            ? "Searches recorded interactions alongside your saved memories."
            : "Available once a trajectory folder is granted in Settings → Plugins → qmd-memory."
        }
        value={props.searchesTrajectory}
        onChange={(value: boolean) => {
          props.onChange(value);
          storage.set(SEARCH_TRAJECTORY_KEY, value).catch((error: unknown) => {
            showToast({ title: "Could not save that preference", message: messageOf(error) });
          });
        }}
      />
    </Form>
  );
}

// ----------------------------------------------------------------------- the panel

export default function MemoryPanel(): ReactElement {
  const configuration = readConfiguration(options);
  const [query, setQuery] = useState("");
  const [searchesTrajectory, setSearchesTrajectory] = useState(false);

  useEffect(() => {
    storage
      .get(SEARCH_TRAJECTORY_KEY)
      .then((stored: unknown) => {
        if (stored === true) setSearchesTrajectory(true);
      })
      .catch(() => {
        // A preference that cannot be read is a preference at its default.
      });
  }, []);

  const state = usePromise<PanelData, [string, boolean]>(
    async (text: string, includesTrajectory: boolean): Promise<PanelData> => {
      if (configuration.memoryDirectory.length === 0) {
        return { rows: [], mode: "browse", reachable: null, truncated: false, documents: null };
      }
      const trimmed = text.trim();
      return trimmed.length === 0
        ? await browse(configuration)
        : await search(configuration, trimmed, includesTrajectory);
    },
    [query, searchesTrajectory]
  );

  const data = state.data;
  const rows = data?.rows ?? [];

  const remove = (row: Row) => {
    files
      .remove(row.path)
      .then(() => {
        showToast({ title: "Deleted", message: basename(row.path) });
        state.revalidate();
      })
      .catch((error: unknown) => {
        showToast({ title: "Could not delete that note", message: messageOf(error) });
      });
  };

  const send = (row: Row) => {
    files
      .read(row.path)
      .then((payload: { base64: string }) =>
        sendToComposer(decodeText(payload.base64), "Memory · " + row.title)
      )
      .catch((error: unknown) => {
        showToast({ title: "Could not send that note", message: messageOf(error) });
      });
  };

  return (
    <List
      searchBarPlaceholder="Search your memory"
      onSearchTextChange={setQuery}
      isLoading={state.isLoading}
      emptyTitle={emptyTitle(configuration, query, data, state.error)}
    >
      <List.Section title={sectionTitle(data, rows.length)}>
        {rows.map((row) => (
          <List.Item
            key={row.path}
            title={row.title}
            subtitle={row.subtitle}
            accessories={accessories(row)}
            actions={
              <ActionPanel>
                <Action.Push title="Preview" target={<NoteDetail path={row.path} />} />
                <Action title="Send to Composer" onAction={() => send(row)} />
                <Action.CopyToClipboard title="Copy Path" content={row.path} />
                <Action
                  title="Delete"
                  style={Action.Style.Destructive}
                  confirmTitle="Delete this memory?"
                  confirmMessage={
                    basename(row.path) + " will be removed from the folder. This cannot be undone."
                  }
                  onAction={() => remove(row)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Library">
        {statusRows(configuration, data).map((entry) => (
          <List.Item key={entry.title} title={entry.title} subtitle={entry.subtitle} />
        ))}
        <List.Item
          key="preferences"
          title="Panel preferences"
          subtitle={
            searchesTrajectory
              ? "Search covers memories and the trajectory"
              : "Search covers saved memories only"
          }
          actions={
            <ActionPanel>
              <Action.Push
                title="Open Preferences"
                target={
                  <Preferences
                    searchesTrajectory={searchesTrajectory}
                    hasTrajectory={configuration.trajectoryDirectory.length > 0}
                    onChange={setSearchesTrajectory}
                  />
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

// --------------------------------------------------------------------------- copy

function accessories(row: Row): { text: string }[] | undefined {
  const entries: { text: string }[] = [];
  if (row.kind === "trajectory") entries.push({ text: "Trajectory" });
  if (row.accessory) entries.push({ text: row.accessory });
  return entries.length > 0 ? entries : undefined;
}

function sectionTitle(data: PanelData | undefined, count: number): string {
  if (!data) return "Memories";
  const suffix = data.truncated ? " (newest " + String(count) + ")" : "";
  return (data.mode === "search" ? "Matches" : "Memories") + suffix;
}

function emptyTitle(
  configuration: Configuration,
  query: string,
  data: PanelData | undefined,
  error: unknown
): string {
  if (configuration.memoryDirectory.length === 0) {
    return "Choose a memory folder in Settings → Plugins → qmd-memory to get started.";
  }
  if (error) return "The memory folder could not be read: " + messageOf(error);
  if (!data) return "Loading…";
  if (data.mode === "search" && data.reachable === false) {
    return "Install and start qmd to unlock search. Browsing is unaffected.";
  }
  if (data.mode === "search") return "No memories match “" + truncate(query.trim(), 40) + "”.";
  return "No memories yet. Use “Save to memory” from a selection, a clipboard entry or a capture.";
}

function statusRows(
  configuration: Configuration,
  data: PanelData | undefined
): { title: string; subtitle: string }[] {
  const rows: { title: string; subtitle: string }[] = [
    {
      title: "Memory folder",
      subtitle: configuration.memoryDirectory.length > 0
        ? configuration.memoryDirectory
        : "Not granted — Settings → Plugins → qmd-memory",
    },
    {
      title: "Trajectory folder",
      subtitle: configuration.trajectoryDirectory.length > 0
        ? configuration.trajectoryDirectory
        : "Not granted — automatic recording is off until it is",
    },
    {
      title: "Record interactions automatically",
      subtitle:
        (configuration.recordsInteractions ? "On" : "Off") +
        " — change it in Settings → Plugins → qmd-memory",
    },
  ];

  const port = configuration.port;
  if (data?.reachable === true) {
    rows.push({
      title: "qmd",
      subtitle:
        "Running on port " +
        port +
        (data.documents === null ? "" : " · " + String(data.documents) + " documents indexed"),
    });
  } else if (data?.reachable === false) {
    rows.push({
      title: "qmd",
      subtitle: "Not reachable on port " + port + " — search is off, recording still works",
    });
  }
  return rows;
}

function stem(name: string): string {
  return name.replace(/\.md$/i, "");
}

/** `20260824-011500-ab12` → `2026-08-24 01:15`. Anything else keeps its name. */
function describeDate(name: string): string {
  const match = /^(?:atat-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
  if (!match) return stem(name);
  return (
    match[1] + "-" + match[2] + "-" + match[3] + " " + match[4] + ":" + match[5]
  );
}

function messageOf(error: unknown): string {
  if (!error) return "unknown error";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}
