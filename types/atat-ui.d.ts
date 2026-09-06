// Temporary Extension View declarations for the public `@atat/api` module.
//
// Copied verbatim from the AtAt repository (`packages/extension-ui-runtime/types/atat-ui.d.ts`),
// which is the authority: the implementation next to it is what a panel actually calls. The
// npm package becomes authoritative at publication; this bridge exists only until then.

declare module "@atat/api" {
  import type { ReactElement, ReactNode } from "react";

  // ------------------------------------------------------------- components

  export type ExtensionViewSpacing = "none" | "xs" | "sm" | "md" | "lg" | "xl";
  export type ExtensionViewAlignment = "leading" | "center" | "trailing";

  export interface StackProps {
    children?: ReactNode;
    spacing?: ExtensionViewSpacing;
    alignment?: ExtensionViewAlignment;
  }

  export const Stack: (props: StackProps) => ReactElement;
  export const HStack: (props: StackProps) => ReactElement;

  export interface TextProps {
    children?: string | number;
    style?: "title" | "heading" | "body" | "caption" | "label";
    emphasis?: "primary" | "secondary" | "tertiary";
    lineLimit?: 1 | 2 | 3 | 4 | 5 | 6;
  }

  export const Text: (props: TextProps) => ReactElement;

  export interface ButtonProps {
    title: string;
    icon?: string;
    style?: "primary" | "secondary" | "plain";
    onAction?: () => void;
  }

  export const Button: (props: ButtonProps) => ReactElement;
  export const Divider: (props: Record<string, never>) => ReactElement;
  export const ScrollView: (props: { children?: ReactNode }) => ReactElement;
  export const Markdown: (props: { markdown: string }) => ReactElement;

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
    title: string;
    subtitle?: string;
    accessories?: ListAccessory[];
    /** A file name inside the extension package. */
    icon?: string;
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
    onAction?: () => void;
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
  };

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
    list(dirPath: string): Promise<{ name: string; isDirectory: boolean }[]>;
    remove(path: string): Promise<void>;
    /** The host's index over a granted directory. Same call a hook's `ctx.files` has. */
    search(
      dirPath: string,
      query: string,
      opts?: { limit?: number }
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

  /** Entitlement: `agent`. Ten calls a minute, per extension. */
  export const agent: {
    ask(prompt: string, opts?: { timeoutMs?: number }): Promise<string>;
  };

  /** Entitlement: `automation`. */
  export function openUrl(url: string): Promise<void>;
  /** Entitlement: `automation`. */
  export function runShortcut(name: string, input?: string): Promise<string | null>;

  export function ocr(path: string): Promise<string>;

  /**
   * The user's configuration, as a snapshot. Secret-typed options are absent by
   * construction — read those by name through `secrets`.
   */
  export const options: Record<string, string | boolean>;

  export const extension: { identifier: string; version: string };
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

  /** What `<Action.SendToComposer>` calls. */
  export function sendToComposer(content: string, label?: string): Promise<void>;
}
