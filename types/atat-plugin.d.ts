// Type declarations for a plugin's hooks, actions and host context.
//
// Transcribed from the manifest and Host API sections of AtAt's plugin specification and
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
    plugin: { identifier: string; version: string };
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

    clipboard: { copy(text: string): Promise<void> };
    /** Adds a text Favorite in Clipboard History, attributed to AtAt. No entitlement. */
    favorites: { add(text: string): Promise<void> };
    paste(text: string): Promise<void>;
    notify(message: string): void;
    progress(message: string, fraction?: number): void;

    /**
     * A relative path resolves inside the plugin's own data directory. An absolute one has
     * to be a path this call was handed, or one inside a folder the user granted through a
     * `folder` option — `list`, `remove` and `search` accept only the latter.
     *
     * `write` creates the directories on the way to the file, so a plugin's own layout inside
     * a granted folder comes into being on first write.
     */
    files: {
      read(path: string): Promise<{ base64: string }>;
      write(path: string, data: { base64: string }): Promise<void>;
      list(dirPath: string): Promise<DirectoryEntry[]>;
      remove(path: string): Promise<void>;
      /**
       * The host's own index over a granted directory: markdown and text, recursive, lexical
       * and semantic together. It is the way a plugin searches its files — a JavaScript
       * sandbox cannot build an index, and reading a folder to grep it is not one either.
       */
      search(
        dirPath: string,
        query: string,
        opts?: { limit?: number }
      ): Promise<FileSearchHit[]>;
    };

    ocr(filePath: string): Promise<string>;

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

    /**
     * Entitlement: `agent`. Ten calls a minute, per plugin. `skill` names one of the user's
     * installed skills (`~/.agents/skills/<name>`); the host expands it for whichever agent
     * answers, and rejects when no such skill is installed.
     */
    agent: {
      ask(prompt: string, opts?: { timeoutMs?: number; skill?: string }): Promise<string>;
    };

    log(message: string): void;
  }

  // -------------------------------------------------------------------- hooks

  export interface ContextItemSnapshot {
    id: string;
    /** `"screenshot" | "selection" | "clipboard" | … | "plugin"`. */
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
  export interface PluginContextItem {
    label: string;
    text?: string;
    filePaths?: string[];
  }

  export interface PromptSection {
    /** `[a-z0-9-]{1,32}`. At most four per plugin per call, 16000 characters together. */
    name: string;
    content: string;
  }

  export interface ContextAssembledResult {
    addItems?: PluginContextItem[];
    removeItemIDs?: string[];
    promptSections?: PromptSection[];
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

  export interface PluginHooks {
    clipboardIngest?: (
      input: ClipboardIngestInput,
      ctx: HostContext
    ) => Promise<ClipboardIngestResult | void>;
    capture?: (input: CaptureInput, ctx: HostContext) => Promise<CaptureResult | void>;
    contextAssembled?: (
      input: ContextAssembledInput,
      ctx: HostContext
    ) => Promise<ContextAssembledResult | void>;
    response?: (input: ResponseInput, ctx: HostContext) => Promise<void>;
  }

  /** A string return goes to the action's `after` route; `void` means it handled itself. */
  export type PluginAction = (
    input: ActionInput,
    ctx: HostContext
  ) => Promise<string | void>;

  export interface PluginViewProps {
    presentation: "settingsPanel";
    input: Readonly<{
      surface?: Surface;
      text?: string;
      sourceBundleIdentifier?: string;
    }>;
  }

  export interface PluginDefinition {
    hooks?: PluginHooks;
    actions?: Record<string, PluginAction>;
    views?: Record<string, ComponentType<PluginViewProps>>;
  }

  export function definePlugin<Definition extends PluginDefinition>(
    plugin: Definition
  ): Definition;
}
