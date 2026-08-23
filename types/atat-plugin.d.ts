// Type declarations for a plugin's hooks, actions and host context.
//
// Transcribed from the manifest and Host API sections of AtAt's plugin specification and
// checked against the runtime that implements them (`PluginJavaScriptPrelude.swift`,
// `PluginHookPayload.swift`, `PluginHostAPI.swift`). Stands in for the `@atat/plugin-types`
// npm package until it ships. Types only — nothing here exists at runtime, so every import
// of it must be an `import type`.

declare module "@atat/plugin-types" {
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
   * Injected into every hook and action call. Absent capabilities are not missing
   * properties — they are calls that reject, naming the entitlement they need.
   */
  export interface HostContext {
    plugin: { identifier: string; version: string };
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
    paste(text: string): Promise<void>;
    notify(message: string): void;
    progress(message: string, fraction?: number): void;

    /**
     * A relative path resolves inside the plugin's own data directory. An absolute one has
     * to be a path this call was handed, or one inside a folder the user granted through a
     * `folder` option — `list` and `remove` accept only the latter.
     */
    files: {
      read(path: string): Promise<{ base64: string }>;
      write(path: string, data: { base64: string }): Promise<void>;
      list(dirPath: string): Promise<DirectoryEntry[]>;
      remove(path: string): Promise<void>;
    };

    ocr(filePath: string): Promise<string>;

    /** Entitlement: `automation`. */
    openUrl(url: string): Promise<void>;
    /** Entitlement: `automation`. */
    runShortcut(name: string, input?: string): Promise<string | null>;

    /** Entitlement: `agent`. Ten calls a minute, per plugin. */
    agent: { ask(prompt: string, opts?: { timeoutMs?: number }): Promise<string> };

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
    kind: "screenshot" | "recording";
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
}
