// Temporary Extension View declarations for the public `@atat/api` module.
//
// Copied verbatim from the AtAt repository (`packages/extension-ui-runtime/types/atat-ui.d.ts`),
// which is the authority: the implementation next to it is what a panel actually calls. The
// npm package becomes authoritative at publication; this bridge exists only until then.

declare module "@atat/api" {
  import type { ReactElement, ReactNode } from "react";

  // ------------------------------------------------------------- components

  /**
   * What the window's title bar calls this page.
   *
   * A page is named where the user reads every other page name — the title bar — and the same
   * bar carries the back button and the page's actions. A page that gives no title keeps the
   * panel's own name there.
   */
  interface NavigationTitleProps {
    navigationTitle?: string;
  }

  export interface ListProps extends NavigationTitleProps {
    children?: ReactNode;
    /** Shown as the prompt of the search field. Omit it and no search field appears. */
    searchBarPlaceholder?: string;
    /** Reported as the user types, already debounced by the host. */
    onSearchTextChange?: (text: string) => void;
    isLoading?: boolean;
    /** Shown under an empty list. */
    emptyTitle?: string;
    /**
     * Drawn at the trailing end of the title bar, because they act on the whole list rather
     * than on any one row. One action is a button with its own name on it; several collapse
     * into a ••• menu. A row's own actions stay on the row.
     */
    actions?: ReactNode;
    /**
     * What can be done to several rows at once, which is also what makes the list selectable:
     * a list without this one prop cannot be selected at all.
     *
     * The host owns the whole of selection — the circles, the range that ⇧-click covers, ⌘A,
     * the bar that floats up at the bottom while something is selected — and each `<Action>`
     * here is one of the buttons in that bar, in the order written. What reaches the handler
     * is the `id` of every selected row: `onAction={(ids) => …}`. A `destructive` one still
     * confirms itself with `confirmAlert`, and should say how many rows it is about.
     */
    selection?: ReactNode;
  }

  export interface ListSectionProps {
    title?: string;
    children?: ReactNode;
  }

  /** `{ text }` is the one accessory shape a native list row can render. */
  export interface ListAccessory {
    text: string;
  }

  export interface ListItemProps {
    /**
     * What this row is, in the extension's own terms — the one a batch action gets back.
     * Falls back to the row's React `key`, so `key={memory.id}` alone is usually enough.
     */
    id?: string;
    title: string;
    /** One line. Anything longer is truncated rather than wrapped. */
    subtitle?: string;
    /** Only the first one is drawn: a row ends in one piece of trailing text, not a table. */
    accessories?: ListAccessory[];
    /** An @@ icon name (`clipboard`, `camera01`), or a file name inside the extension package. */
    icon?: string;
    /**
     * The first `Action.Push` runs on a click anywhere in the row; everything else lives in
     * the row's ••• menu.
     */
    actions?: ReactElement;
  }

  export const List: {
    (props: ListProps): ReactElement;
    Section: (props: ListSectionProps) => ReactElement;
    Item: (props: ListItemProps) => ReactElement;
  };

  export interface DetailProps extends NavigationTitleProps {
    /** Headings, paragraphs, bullet lists, code blocks and inline emphasis. */
    markdown: string;
    /** Drawn at the trailing end of the title bar, because they act on the whole page. */
    actions?: ReactElement;
  }

  export const Detail: (props: DetailProps) => ReactElement;

  /**
   * The generic page root: a vertical stack of sections and text, with the mount's actions
   * in its action area. A view opened from an action — the translation window is the first —
   * is written against this rather than against a list or a form.
   *
   * `isLoading` adds a progress indicator without unmounting what is already there, so the
   * original text and the controls that produced the request stay on screen while it runs.
   * `error` replaces the result area with a sentence of the extension's own and offers
   * `onRetry`; a network failure handled this way is a state of the view, not a broken
   * panel.
   */
  export interface PanelProps extends NavigationTitleProps {
    children?: ReactNode;
    isLoading?: boolean;
    /** A readable sentence, never a provider's raw error body. */
    error?: string;
    onRetry?: () => void;
    /** Drawn at the bottom of a floating view; in Settings, at the end of the title bar. */
    actions?: ReactElement;
  }

  export interface PanelSectionProps {
    title?: string;
    /**
     * A glyph before the title: an @@ icon name, or a file name inside the package. The
     * same resolution an action's `icon` gets, so one section per service can wear the
     * service's mark.
     */
    icon?: string;
    /**
     * Drawn at the trailing end of the section's title line, because they act on the section
     * rather than on the page — copying the result beside the result.
     */
    actions?: ReactNode;
    children?: ReactNode;
  }

  export interface PanelControlsProps {
    /**
     * The parameters the request needs, in the order written. A `Form.Dropdown` here draws
     * as a compact control rather than a settings row: the value and a chevron, no label
     * column.
     */
    children?: ReactNode;
    /** The primary action of the row, at its trailing end. */
    actions?: ReactNode;
  }

  export interface PanelPromptProps {
    placeholder?: string;
    /**
     * What the field holds. The host keeps a draft while the user types and syncs it when
     * this prop changes, so a view that submitted its text writes `""` back to clear it.
     */
    value?: string;
    /** Receives the typed text on Return or the submit button. */
    onSubmit?: (text: string) => void;
  }

  export const Panel: {
    (props: PanelProps): ReactElement;
    /** A group with an optional title. It does not scroll on its own. */
    Section: (props: PanelSectionProps) => ReactElement;
    /** Plain text. Line breaks are kept; nothing is interpreted. */
    Text: (props: { text: string }) => ReactElement;
    /** Markdown through @@'s own renderer. Remote images show their alt text only. */
    Markdown: (props: { markdown: string }) => ReactElement;
    /**
     * The row of parameters that belongs with the content: a compact `Form.Dropdown`, an
     * icon button, and the row's own `actions` at the trailing end.
     */
    Controls: (props: PanelControlsProps) => ReactElement;
    /**
     * The input pinned at the bottom of a floating view while the content scrolls: what the
     * user wants changed, not a second form. `onSubmit` gets the typed text.
     */
    Prompt: (props: PanelPromptProps) => ReactElement;
  };

  export interface FormProps extends NavigationTitleProps {
    children?: ReactNode;
    actions?: ReactElement;
  }

  export interface FormTextFieldProps {
    id: string;
    title?: string;
    /** Explanatory text under the label. */
    info?: string;
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
  }

  export interface FormCheckboxProps {
    id: string;
    title?: string;
    info?: string;
    value?: boolean;
    onChange?: (value: boolean) => void;
  }

  export interface FormDropdownProps {
    id: string;
    title?: string;
    info?: string;
    value?: string;
    onChange?: (value: string) => void;
    children?: ReactNode;
  }

  export interface FormDropdownItemProps {
    value: string;
    title?: string;
  }

  export const Form: {
    (props: FormProps): ReactElement;
    TextField: (props: FormTextFieldProps) => ReactElement;
    Checkbox: (props: FormCheckboxProps) => ReactElement;
    Dropdown: {
      (props: FormDropdownProps): ReactElement;
      Item: (props: FormDropdownItemProps) => ReactElement;
    };
  };

  export interface ActionPanelProps {
    children?: ReactNode;
  }

  export const ActionPanel: {
    (props: ActionPanelProps): ReactElement;
    Section: (props: ListSectionProps) => ReactElement;
  };

  export type ActionStyle = "regular" | "destructive";

  export interface ActionProps {
    title: string;
    icon?: string;
    /**
     * A destructive action is confirmed by the host before it runs. The runtime adds that
     * confirmation itself, so an irreversible action cannot ship without one.
     */
    style?: ActionStyle;
    /** Overrides the confirmation's title. Defaults to the action's own title. */
    confirmTitle?: string;
    confirmMessage?: string;
    /**
     * Inside a `<List selection>` panel the handler is called with the ids of the selected
     * rows, and the host clears the selection once the promise it returns settles — so an
     * `async` handler keeps the selection while it works. Everywhere else it is called with
     * nothing.
     */
    onAction?: (ids: string[]) => void | Promise<void>;
  }

  export const Action: {
    (props: ActionProps): ReactElement;
    Style: { Regular: "regular"; Destructive: "destructive" };
    CopyToClipboard: (props: {
      title: string;
      icon?: string;
      content: string;
      onCopy?: () => void;
    }) => ReactElement;
    /** Needs the `automation` entitlement, like `ctx.openUrl`. */
    Open: (props: { title: string; icon?: string; target: string }) => ReactElement;
    Push: (props: {
      title: string;
      icon?: string;
      target: ReactElement;
    }) => ReactElement;
    /** Opens a Composer interaction with the content attached as a visible pill. */
    SendToComposer: (props: {
      title: string;
      icon?: string;
      content: string;
      label?: string;
    }) => ReactElement;
    /**
     * Writes the content back into the selection the view was opened from. Only exists
     * where there is a selection to write into: in a Settings panel or a clipboard entry
     * the host does not show it. The click is handled natively — nothing crosses the
     * bridge — and the host re-validates the original selection before anything is typed.
     */
    ReplaceSelection: (props: {
      title: string;
      icon?: string;
      content: string;
    }) => ReactElement;
  };

  // ------------------------------------------------------------- view props

  /** What an action is handed when the user clicks it. The same shape a hook sees. */
  export interface ActionInput {
    surface: string;
    text?: string;
    filePaths?: string[];
    sourceBundleID?: string;
    regexMatches?: string[];
    modifiers: string[];
  }

  /**
   * The props every view component receives, whatever opened it. `input` is a read-only
   * snapshot — frozen, and never updated while the view is open — and `entry` names the
   * place that opened it (`"settings"`, `"selectionBar"`, `"clipboardHistory"`,
   * `"captureQuickAccess"`). A component that needs no input can ignore both.
   */
  export interface ViewProps<Input = unknown> {
    readonly input: Readonly<Input>;
    readonly entry: string;
  }

  // ------------------------------------------------------------------ hooks

  export interface Navigation {
    push(page: ReactElement): void;
    pop(): void;
  }

  export function useNavigation(): Navigation;

  export interface PromiseState<Data> {
    isLoading: boolean;
    data: Data | undefined;
    error: unknown;
    revalidate(): void;
  }

  export function usePromise<Data, Args extends unknown[]>(
    fn: (...args: Args) => Promise<Data>,
    args?: Args,
    options?: { initialData?: Data }
  ): PromiseState<Data>;

  // -------------------------------------------------------- host capabilities

  /**
   * The same capabilities a hook's `ctx` has, behind the same entitlement gates, the same
   * granted directories and the same rate limits. A panel is not a more powerful world.
   */
  export const storage: {
    get(key: string): Promise<unknown | null>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
  };

  /** Entitlement: `secrets`. */
  export const secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };

  export const files: {
    read(path: string): Promise<{ base64: string }>;
    write(path: string, data: { base64: string }): Promise<void>;
    list(
      dirPath: string
    ): Promise<{ name: string; isDirectory: boolean; modifiedAt?: string }[]>;
    /**
     * Moves the file to the Trash, so a batch delete has a way back. `trashed` is false on
     * the systems where that cannot be done and the file was deleted outright.
     */
    remove(path: string): Promise<{ trashed: boolean }>;
    /**
     * The directories one `reads` declaration resolved to on this Mac: absolute, wildcards
     * expanded, and only the ones that are really there. An empty array means the other app
     * has left nothing here; an identifier the manifest never declared is rejected.
     */
    roots(identifier: string): Promise<string[]>;
    /** Searches an authorized directory through the host's own index. */
    search(
      dirPath: string,
      query: string,
      opts?: { limit?: number; mode?: "hybrid" | "keyword" }
    ): Promise<{ path: string; snippet: string; score: number }[]>;
  };

  /** Entitlement: `network`. */
  export function fetch(
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string | { base64: string };
      timeoutMs?: number;
    }
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;

  export const clipboard: { copy(text: string): Promise<void> };

  /**
   * Adds a text Favorite in Clipboard History, attributed to AtAt. No entitlement, the
   * same footing as `clipboard.copy`.
   */
  export const favorites: { add(text: string): Promise<void> };

  /** Entitlement: `agent`. Ten calls a minute, per extension. */
  export const agent: {
    /**
     * Borrows the user's configured agent. `skill` names one of the user's installed
     * skills, expanded the way the selection bar's skill action expands it.
     */
    ask(prompt: string, opts?: { timeoutMs?: number; skill?: string }): Promise<string>;
  };

  /** Entitlement: `automation`. */
  export function openUrl(url: string): Promise<void>;

  export function ocr(path: string): Promise<string>;

  /**
   * Entitlement: `translation`. Apple's on-device translation, the one macOS itself uses.
   * The language pair has to be downloaded on this Mac already: a pair the system could
   * only offer to download cannot be requested from here, and rejects instead.
   */
  export function translate(
    text: string,
    options: { target: string; source?: string; timeoutMs?: number }
  ): Promise<string>;

  /**
   * Reads text aloud with the Mac's own voice, choosing a voice for `language` when one is
   * installed. No entitlement: it is local and as harmless as `notify`. Resolves when the
   * utterance finishes or is stopped, so a button can toggle on the same promise.
   */
  export function speak(text: string, options?: { language?: string }): Promise<void>;

  /** Stops whatever `speak` is reading, if anything. No entitlement. */
  export function stopSpeaking(): Promise<void>;

  /**
   * The user's configuration, as a snapshot. Secret-typed options are absent by
   * construction — read those by name through `secrets`.
   */
  export const options: Record<string, string | boolean>;

  export const extension: { identifier: string; version: string };

  /**
   * What the panel can know about the host it runs inside. `locale` is the app's own
   * interface language as a BCP 47 tag — `"en"` or `"zh-Hans"` — and is the same value a
   * hook reads as `ctx.locale`.
   */
  export const environment: { locale: string };

  export function notify(message: string): Promise<void>;
  export function log(message: string): Promise<void>;

  /** A non-modal message. The host owns how it looks. */
  export function showToast(
    input: string | { title?: string; message?: string }
  ): Promise<void>;

  /** Presented by the host, so the user can trust what they are agreeing to. */
  export function confirmAlert(
    input:
      | string
      | {
          title?: string;
          message?: string;
          primaryAction?: { title?: string; style?: ActionStyle };
        }
  ): Promise<boolean>;

  /** One thing handed to the Composer, which becomes one pill. */
  export interface ComposerItem {
    text: string;
    /** What the pill is called. Defaults to the extension's own name. */
    label?: string;
  }

  /**
   * What `<Action.SendToComposer>` calls. An array opens **one** interaction carrying one
   * pill per entry, in order — a batch "Ask @@" over five rows is one question about five
   * things, not five questions.
   */
  export function sendToComposer(
    content: string | ComposerItem | Array<string | ComposerItem>,
    label?: string
  ): Promise<void>;

  /** The identity wrapper for a extension's `{ hooks, actions, views }` definition. */
  export function defineExtension<Definition>(definition: Definition): Definition;
}
