// Type declarations for a extension's hooks, actions and host context.
//
// Transcribed from the manifest and Host API sections of AtAt's extension specification and
// checked against the public `@atat/api` contract. This temporary declaration mirror keeps
// the extensions monorepo buildable before the first npm publication; it is removed as soon
// as the package is available from the registry.

declare module "@atat/api" {
  import type { ComponentType } from "react";
  // -------------------------------------------------------------- host context

  export interface FetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string | { base64: string };
    /** Default 30s, ceiling 120s. */
    timeoutMs?: number;
  }

  export interface FetchResponse {
    status: number;
    headers: Record<string, string>;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }

  export interface DirectoryEntry {
    name: string;
    isDirectory: boolean;
    /**
     * When the entry last changed, as ISO 8601 with the Mac's own offset
     * (`2026-08-24T01:15:00+08:00`). Absent when the file system does not say.
     */
    modifiedAt?: string;
  }

  /**
   * One result from `files.search`, the host's index over a granted directory.
   *
   * `path` is absolute and inside the directory that was searched. `snippet` is the passage
   * around the match, taken from the file itself. `score` orders the results and nothing else:
   * the host's ranking is hybrid and its scale is not a contract.
   */
  export interface FileSearchHit {
    path: string;
    snippet: string;
    score: number;
  }

  /**
   * Injected into every hook and action call. Absent capabilities are not missing
   * properties — they are calls that reject, naming the entitlement they need.
   */
  export interface HostContext {
    extension: { identifier: string; version: string };
    locale: string;
    /** Secret-typed options are absent by construction. A folder option's value is a path. */
    options: Record<string, string | boolean>;

    storage: {
      get(key: string): Promise<unknown | null>;
      set(key: string, value: unknown): Promise<void>;
      remove(key: string): Promise<void>;
    };

    /** Entitlement: `secrets`. */
    secrets: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<void>;
    };

    /** Entitlement: `network`. HTTPS, plus plain HTTP to the loopback host. */
    fetch(url: string, init?: FetchInit): Promise<FetchResponse>;

    sources: SourcesAPI;
    clipboard: { copy(text: string): Promise<void> };
    /** Adds a text Favorite in Clipboard History, attributed to AtAt. No entitlement. */
    favorites: { add(text: string): Promise<void> };
    paste(text: string): Promise<void>;
    notify(message: string): void;
    progress(message: string, fraction?: number): void;

    /**
     * A relative path resolves inside the extension's own data directory. An absolute one has
     * to be a path this call was handed, or one inside a folder the user granted through a
     * `folder` option — `remove` and `search` accept only the latter, and `list` accepts it
     * plus the directories the manifest's `reads` named. `read` is the widest of the four;
     * nothing writes anywhere but a granted folder and this call's own output path.
     *
     * `write` creates the directories on the way to the file, so a extension's own layout inside
     * a granted folder comes into being on first write.
     */
    files: {
      read(path: string): Promise<{ base64: string }>;
      write(path: string, data: { base64: string }): Promise<void>;
      list(dirPath: string): Promise<DirectoryEntry[]>;
      /**
       * Moves the file to the Trash, which is the only undo a delete has. `trashed` is false
       * when the file could not go there and was deleted outright — say so before promising
       * a user they can get it back.
       */
      remove(path: string): Promise<{ trashed: boolean }>;
      /**
       * The host's own index over a granted directory: markdown and text, recursive, lexical
       * and semantic together. It is the way a extension searches its files — a JavaScript
       * sandbox cannot build an index, and reading a folder to grep it is not one either.
       */
      search(
        dirPath: string,
        query: string,
        opts?: { limit?: number; mode?: "hybrid" | "keyword" }
      ): Promise<FileSearchHit[]>;
      /**
       * The directories one `reads` declaration found on this Mac: wildcard segments
       * expanded against the disk, anything that is not there left out. An empty array is
       * how a extension learns another app is not installed, without listing the folder
       * above it — and the only paths in it are ones `read` and `list` will accept.
       */
      roots(identifier: string): Promise<string[]>;
    };

    ocr(filePath: string): Promise<string>;

    /**
     * Reads text aloud with the Mac's own voice, choosing a voice for `language` when one is
     * installed. No entitlement: it is local and as harmless as `notify`. Resolves when the
     * utterance finishes or is stopped, so a button can toggle on the same promise.
     */
    speak(text: string, options?: { language?: string }): Promise<void>;
    /** Stops whatever `speak` is reading, if anything. No entitlement. */
    stopSpeaking(): Promise<void>;
    /**
     * The entry the Mac's own dictionaries have for a word or short phrase, as one
     * plain-text paragraph, or `null`. Offline; no entitlement; ≤ 64 characters.
     */
    define(text: string): Promise<string | null>;

    /** Entitlement: `automation`. */
    openUrl(url: string): Promise<void>;
    /** Entitlement: `automation`. */
    runShortcut(name: string, input?: string): Promise<string | null>;
    /**
     * Entitlement: `automation`. The same script the Text Selection AppleScript action takes:
     * with `input`, the host calls the script's `on atatSelection(selectedText)` handler with
     * it; without, the script runs top to bottom. Resolves with the script's result as text.
     * Source is capped at 64 KB, and a script that never returns cannot be cancelled.
     */
    runAppleScript(source: string, input?: string): Promise<string | null>;

    /** Entitlement: `agent`. Ten calls a minute, per extension. `skill` names one of the user's
     * installed skills (`~/.agents/skills/<name>`); the host expands it for whichever agent
     * answers, and rejects when no such skill is installed.
     */
    agent: {
      ask(prompt: string, opts?: { timeoutMs?: number; skill?: string }): Promise<string>;
    };

    /**
     * A local model this extension declared in `models`. Capability routes to the
     * declaration in *this* extension's manifest — never another extension's weights, and
     * there is no fallback to a model the host happens to have. No entitlement: the model
     * runs on this Mac.
     *
     * `pii` answers with spans over the text handed in; a `generation` capability answers
     * with text. Offsets are UTF-16 code units, so the string sliced here is the string
     * returned with the same boundaries. `timeoutMs` defaults to 3s and is capped at 5s.
     */
    model: {
      run(request: {
        capability: string;
        input: { text: string };
        timeoutMs?: number;
      }): Promise<ModelRunResult>;
    };

    log(message: string): void;
  }

  /** One labelled, contiguous range of the input text, in UTF-16 code units. */
  export interface ModelSpan {
    label: string;
    start: number;
    end: number;
  }

  /** `{ spans }` from a classifier, or `{ text }` from a generator. */
  export interface ModelRunResult {
    spans?: ModelSpan[];
    text?: string;
  }

  // -------------------------------------------------------------------- hooks

  export interface ContextItemSnapshot {
    id: string;
    /** `"screenshot" | "selection" | "clipboard" | … | "extension"`. */
    source: string;
    text?: string;
    filePaths?: string[];
    label?: string;
  }

  export interface ContextAssembledInput {
    prompt: string;
    items: ContextItemSnapshot[];
    interactionSource: string;
  }

  /** Exactly one of `text` and `filePaths`; both or neither and the host drops the item. */
  export interface ExtensionContextItem {
    label: string;
    text?: string;
    filePaths?: string[];
  }

  export interface PromptSection {
    /** `[a-z0-9-]{1,32}`. At most four per extension per call, 16000 characters together. */
    name: string;
    content: string;
  }

  export interface ContextAssembledResult {
    addItems?: ExtensionContextItem[];
    removeItemIDs?: string[];
    promptSections?: PromptSection[];
    /**
     * Replace what is about to be sent, rather than adding to it. `items` addresses the
     * snapshots by `id`; a path is deliberately out of reach — it chooses which file the
     * agent opens.
     */
    rewrite?: {
      prompt?: string;
      items?: { id: string; text?: string }[];
    };
    /**
     * Say this interaction should not be sent. The user is always offered a way past it —
     * a wrong block must not be able to break the entry point — and the reason is shown.
     */
    block?: { reason: string };
  }

  /**
   * The answer the moment the agent finishes it, before it is shown or recorded — the
   * answer-side mirror of `contextAssembled`. `responseText` is not truncated here (the
   * read-only `response` hook's input is), because an extension restoring placeholders has
   * to see the whole thing.
   */
  export interface AnswerAssembledInput {
    prompt: string;
    responseText: string;
    items: ContextItemSnapshot[];
  }

  /**
   * A whole replacement for the answer: whatever comes back is what the user sees, the
   * session records, and a later chat turn sends back. Past 400,000 characters the result
   * is refused rather than truncated. Only `contextAssembled` and `answerAssembled` may
   * return one, and one extension rewrites a given answer.
   */
  export interface AnswerAssembledResult {
    rewrite?: { responseText: string };
  }

  export interface ResponseInput {
    prompt: string;
    /** Truncated to 32000 characters by the host. */
    responseText: string;
    items: ContextItemSnapshot[];
    interactionSource: string;
  }

  export interface ClipboardIngestInput {
    text?: string;
    html?: string;
    fileURLs?: string[];
    imagePath?: string;
    sourceBundleID?: string;
    regexMatches?: string[];
  }

  export interface ClipboardIngestResult {
    action?: "keep" | "ignore";
    text?: string;
    html?: string;
    title?: string;
  }

  export interface CaptureInput {
    filePath: string;
    outputPath: string;
    kind: "screenshot";
    sourceFrame?: { x: number; y: number; width: number; height: number };
    ocrText?: string;
  }

  export interface CaptureResult {
    action?: "keep" | "replace";
  }

  // ------------------------------------------------------------------ actions

  export type Surface = "selectionBar" | "clipboardHistory" | "captureQuickAccess";

  export interface ActionInput {
    surface: Surface;
    text?: string;
    filePaths?: string[];
    sourceBundleID?: string;
    regexMatches?: string[];
    /** `["command", "option", "shift", "control"]`, in that order. */
    modifiers: string[];
  }

  // ------------------------------------------------------------------ exports

  export interface ExtensionHooks {
    clipboardIngest?: (
      input: ClipboardIngestInput,
      ctx: HostContext
    ) => Promise<ClipboardIngestResult | void>;
    capture?: (input: CaptureInput, ctx: HostContext) => Promise<CaptureResult | void>;
    contextAssembled?: (
      input: ContextAssembledInput,
      ctx: HostContext
    ) => Promise<ContextAssembledResult | void>;
    /**
     * Awaited before the answer is shown or recorded, so a later chat turn sees what this
     * returned. Failures skip the extension, and the answer on screen stays the model's own.
     */
    answerAssembled?: (
      input: AnswerAssembledInput,
      ctx: HostContext
    ) => Promise<AnswerAssembledResult | void>;
    response?: (input: ResponseInput, ctx: HostContext) => Promise<void>;
  }

  /** A string return goes to the action's `after` route; `void` means it handled itself. */
  export type ExtensionAction = (
    input: ActionInput,
    ctx: HostContext
  ) => Promise<string | void>;

  /**
   * The props every view component receives, whatever opened it.
   *
   * `input` is a read-only snapshot — frozen on the JavaScript side, and never updated
   * while the view is open — and `entry` names the place that opened it (`"settings"`,
   * `"selectionBar"`, `"clipboardHistory"`, `"captureQuickAccess"`). An action's view
   * receives `ViewProps<ActionInput>`. A component that needs no input can ignore both.
   */
  export interface ViewProps<Input = unknown> {
    readonly input: Readonly<Input>;
    readonly entry: string;
  }

  /**
   * A view action: the manifest declares `view: "<identifier>"` on the action and
   * `views: [{ identifier }]` at the root, and the host mounts the component when the
   * button is clicked. `url`, a JS action handler and a view are mutually exclusive.
   */
  export interface ExtensionDefinition {
    hooks?: ExtensionHooks;
    actions?: Record<string, ExtensionAction>;
    /**
     * Collections this extension hands to @@ Memory to import. Each key matches a
     * `memorySources` entry in the manifest, and the host calls it in pages rather than
     * once — a vault or a workspace is larger than one call should carry.
     *
     * Entitlement: `memorySource`. It is supply-only: the handler answers with items, and
     * the host decides what becomes a memory. Nothing here can read what Memory already
     * holds, and there is no write-back to the collection an item came from.
     */
    memorySources?: Record<string, ExtensionMemorySource>;
    // Each view declares its own narrower input type; the host entry that mounts it is the
    // one that knows which shape it passes.
    views?: Record<string, ComponentType<ViewProps<any>>>;
  }

  /**
   * One page request. `cursor` is whatever `nextCursor` this handler returned last, handed
   * back unchanged; `since` is the last complete read of this source as ISO 8601, present
   * only when there has been one.
   */
  export interface MemorySourceRequest {
    cursor?: string;
    since?: string;
    limit: number;
  }

  /**
   * One item to import.
   *
   * `externalKey` is the item's identity and the whole reason a second import does not
   * duplicate the first: it must be stable for the item's lifetime — never its title, its
   * URL, or its body, all of which change.
   */
  export interface ExtensionMemoryItem {
    /** Stable id inside the collection. Becomes the stored item's `native_key`. */
    externalKey: string;
    title: string;
    /** Plain text or Markdown. The host trims it to a single item's budget. */
    body: string;
    /** `http(s)` only, for the "open the original" affordance. */
    url?: string;
    /** Where it sat in the collection, in the source's own words. */
    locator?: string;
    /** A starting value for the user's review, never an assertion about them. */
    kind?: "fact" | "preference" | "decision" | "state" | "reference" | "procedure" | "conversation";
    /** ISO 8601. Omit when the collection does not say; the host does not guess. */
    observedAt?: string;
    updatedAt?: string;
  }

  /**
   * One page of a collection.
   *
   * `complete` is load-bearing: it is what authorizes the host to treat items it did not
   * receive as deleted. Say `false`, or stop early, whenever the read did not see
   * everything — a page reported as complete when it was not can delete the user's
   * memories at the source's word alone.
   */
  export interface MemorySourcePage {
    items: ExtensionMemoryItem[];
    /** Where the next page resumes. Omit or return the same value and the read ends. */
    nextCursor?: string;
    complete: boolean;
  }

  /** Pages this extension's collection for Memory's import pipeline. */
  export type ExtensionMemorySource = (
    request: MemorySourceRequest,
    ctx: HostContext
  ) => Promise<MemorySourcePage>;

  export function defineExtension<Definition extends ExtensionDefinition>(
    extension: Definition
  ): Definition;
}
