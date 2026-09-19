// translate — the entry point.
//
// One view, mounted wherever the user clicked Translate: beside a selection, on a clipboard
// row, or on a capture card. The view is handed the action's own input and nothing else, so
// the three entries are one behavior rather than three code paths.
//
// The page is a stack of service blocks. The original sits at the top and is resolved once
// and kept — a failed request never costs the user the OCR'd text. Under it is the language
// row: what it is being translated from, a swap, and what it is being translated into.
// Then one collapsible block per enabled service, each carrying its own translation and the
// actions that belong to it, so the user compares answers side by side instead of picking a
// winner in Settings. The agent's block is the only one with an adjustment field, because
// only a model can rewrite a translation it produced.

import { useState } from "react";
import type { ReactElement } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Panel,
  agent,
  defineExtension,
  environment,
  favorites,
  fetch,
  ocr,
  options,
  secrets,
  showToast,
  speak,
  stopSpeaking,
  translate as systemTranslate,
  usePromise,
} from "@atat/api";
import type { ActionInput, HostContext, ViewProps } from "@atat/api";
import { stringsFor } from "./text.js";
import type { Strings } from "./text.js";
import {
  TranslateError,
  counterpart,
  languageSettings,
  pinnedSource,
  refine,
  resolveSource,
  resolveTarget,
  translate,
  type LanguageChoice,
  type TargetLanguage,
  type TranslateErrorKind,
  type Translation,
} from "./translation.js";
import {
  enabledProviders,
  translateText,
  type ProviderCapabilities,
  type ProviderId,
} from "./providers.js";

/// One adjustment the user asked for, and the translation it applies to. Kept together
/// because a result is only current when both still match what is on screen.
interface Adjustment {
  instruction: string;
  base: string;
}

/// The service's mark, drawn before its name in the panel and before its switch in
/// Settings. @@ icon names, the same vocabulary an action's `icon` uses.
function providerIcon(provider: ProviderId): string {
  switch (provider) {
    case "agent": return "brain03";
    case "system": return "apple";
    case "google": return "google";
    case "microsoft": return "microsoft";
    case "deepl": return "translation";
  }
}

function providerName(provider: ProviderId, copy: Strings): string {
  switch (provider) {
    case "agent": return copy.agent;
    case "system": return copy.system;
    case "google": return copy.google;
    case "microsoft": return copy.microsoft;
    case "deepl": return copy.deepl;
  }
}

function TranslationView({ input }: ViewProps<ActionInput>): ReactElement {
  const copy = stringsFor(environment.locale);
  const settings = languageSettings(options, environment.locale);
  const services = enabledProviders(options);
  const [sourceChoice, setSourceChoice] = useState<LanguageChoice>("auto");
  const [targetChoice, setTargetChoice] = useState<LanguageChoice>("auto");
  const [collapsed, setCollapsed] = useState<ProviderId[]>([]);
  /// Which text is being read aloud right now. One at a time, because speaking a new one
  /// interrupts the old one, and the promise each click returns is what clears this.
  const [speaking, setSpeaking] = useState<ProviderId | "source" | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const [promptDraft, setPromptDraft] = useState("");

  // The same calls a hook context gets off `ctx`, taken from the panel's own imports. A
  // provider only sees these while it runs, and nothing here calls one by itself.
  const capabilities: ProviderCapabilities = {
    fetch,
    secrets,
    translate: systemTranslate,
    ask: (prompt, timeoutMs) => agent.ask(prompt, { timeoutMs }),
    options,
  };

  const agentEnabled = services.includes("agent");
  const systemEnabled = services.includes("system");
  const googleEnabled = services.includes("google");
  const microsoftEnabled = services.includes("microsoft");
  const deeplEnabled = services.includes("deepl");

  // The original first, once. It survives a failed translation, which is the point: every
  // service can fail; the words the user selected cannot disappear because of them.
  const source = usePromise(
    (actionInput: Readonly<ActionInput>) =>
      resolveSource(actionInput, (path) => ocr(path)),
    [input]
  );
  const sourceText = source.data?.text;
  const target = resolveTarget(targetChoice, sourceChoice, sourceText, settings);
  const sourcePin = pinnedSource(sourceChoice);

  // One hook per service, always in the same order — a hook cannot live in a list. A
  // disabled service resolves to nothing, and a service the user turned on answers for the
  // language pair on screen; a slower answer for a pair the user has moved on from is
  // discarded by `usePromise` rather than shown late.
  const agentResult = usePromise(
    (
      text: string | null,
      language: TargetLanguage,
      from: TargetLanguage | undefined,
      instruction: string | null,
      base: string | null
    ): Promise<Translation | null> => {
      if (!text || !agentEnabled) return Promise.resolve(null);
      if (instruction !== null && base !== null) {
        return refine(base, instruction, language, capabilities.ask);
      }
      return translate(text, language, from, capabilities.ask);
    },
    [sourceText ?? null, target, sourcePin, adjustment?.instruction ?? null, adjustment?.base ?? null]
  );
  const systemResult = usePromise(
    (text: string | null, language: TargetLanguage, from: TargetLanguage | undefined) =>
      text === null || !systemEnabled
        ? Promise.resolve(null)
        : translateText("system", text, language, from, capabilities),
    [sourceText ?? null, target, sourcePin]
  );
  const googleResult = usePromise(
    (text: string | null, language: TargetLanguage, from: TargetLanguage | undefined) =>
      text === null || !googleEnabled
        ? Promise.resolve(null)
        : translateText("google", text, language, from, capabilities),
    [sourceText ?? null, target, sourcePin]
  );
  const microsoftResult = usePromise(
    (text: string | null, language: TargetLanguage, from: TargetLanguage | undefined) =>
      text === null || !microsoftEnabled
        ? Promise.resolve(null)
        : translateText("microsoft", text, language, from, capabilities),
    [sourceText ?? null, target, sourcePin]
  );
  const deeplResult = usePromise(
    (text: string | null, language: TargetLanguage, from: TargetLanguage | undefined) =>
      text === null || !deeplEnabled
        ? Promise.resolve(null)
        : translateText("deepl", text, language, from, capabilities),
    [sourceText ?? null, target, sourcePin]
  );

  const results = {
    agent: agentResult,
    system: systemResult,
    google: googleResult,
    microsoft: microsoftResult,
    deepl: deeplResult,
  } as const;

  // The agent's result, bound to the text, language and adjustment it answers: a slow
  // answer to a question the user has moved on from is never shown and never gets actions.
  const agentCurrent =
    !agentResult.isLoading &&
    agentResult.data &&
    agentResult.data.language === target &&
    agentResult.data.source === (adjustment?.base ?? sourceText) &&
    agentResult.data.instruction === (adjustment?.instruction ?? null)
      ? agentResult.data
      : undefined;

  const isLoading =
    source.isLoading || services.some((provider) => results[provider].isLoading);
  const sourceFailure = source.isLoading ? undefined : source.error;
  const errorKind: TranslateErrorKind | undefined = sourceFailure
    ? sourceFailure instanceof TranslateError
      ? sourceFailure.kind
      : "failed"
    : undefined;

  const original = sourceText ?? "";

  function revalidate() {
    if (source.error) {
      source.revalidate();
      return;
    }
    source.revalidate();
    agentResult.revalidate();
    systemResult.revalidate();
    googleResult.revalidate();
    microsoftResult.revalidate();
    deeplResult.revalidate();
  }

  /// A language change is a new question: the old answers, and any adjustment that belonged
  /// to one of them, no longer apply.
  function chooseSource(value: string) {
    setSourceChoice(value as LanguageChoice);
    setAdjustment(null);
    setPromptDraft("");
  }

  function chooseTarget(value: string) {
    setTargetChoice(value as LanguageChoice);
    setAdjustment(null);
    setPromptDraft("");
  }

  /// Trade the two sides. With the target on Automatic the resolved language is what moves
  /// to the source, and the other of the user's two languages becomes the target — which is
  /// the swap the user meant even though one side was never picked.
  function swapLanguages() {
    const nextSource = target;
    setSourceChoice(nextSource);
    setTargetChoice(
      sourceChoice === "auto" ? counterpart(nextSource, settings) : sourceChoice
    );
    setAdjustment(null);
    setPromptDraft("");
  }

  /// Translate again from scratch, dropping an adjustment the user no longer wants.
  function translateAgain() {
    setAdjustment(null);
    setPromptDraft("");
    revalidate();
  }

  /// The bottom field: a correction to the agent's translation. The field clears here, and
  /// the instruction lives on with the request — a failure offers Retry, not a retype.
  function adjust(instruction: string) {
    if (!agentCurrent) return;
    setPromptDraft("");
    setAdjustment({ instruction, base: agentCurrent.translation });
  }

  /// Keep a text in Clipboard History's Favorites, with a word about where it went. The
  /// store owns duplicates; a refusal is worth saying out loud rather than swallowing.
  function addFavorite(text: string) {
    favorites
      .add(text)
      .then(() => showToast({ title: copy.favorited }))
      .catch(() => showToast({ title: copy.favoriteFailed }));
  }

  /// Read a text aloud, or stop the one that is playing. Clicking another speaker while one
  /// is talking is a switch, not a queue: the host interrupts the old utterance, whose
  /// promise then resolves and is ignored because it is no longer the active one.
  function toggleSpeak(
    id: ProviderId | "source",
    text: string,
    language: TargetLanguage | undefined
  ) {
    if (speaking === id) {
      setSpeaking(null);
      void stopSpeaking();
      return;
    }
    setSpeaking(id);
    speak(text, { language })
      .then(() => setSpeaking((current) => (current === id ? null : current)))
      .catch(() => setSpeaking((current) => (current === id ? null : current)));
  }

  /// Collapse or expand one service's block. Collapsed blocks keep their header and their
  /// actions; only the text goes away.
  function toggleCollapsed(provider: ProviderId) {
    setCollapsed((current) =>
      current.includes(provider)
        ? current.filter((entry) => entry !== provider)
        : current.concat(provider)
    );
  }

  /// One service's block: its own result, its own failure, its own actions. A block that is
  /// still loading shows nothing but the page's progress; the text appears in place.
  function serviceBlock(provider: ProviderId): ReactElement {
    const result = results[provider];
    const isCollapsed = collapsed.includes(provider);
    const failure = result.isLoading ? undefined : result.error;
    const text =
      provider === "agent"
        ? agentCurrent?.translation
        : (result.data as string | null | undefined) ?? undefined;
    const failureKind: TranslateErrorKind | undefined = failure
      ? failure instanceof TranslateError
        ? failure.kind
        : "failed"
      : undefined;

    return (
      <Panel.Section
        key={provider}
        icon={providerIcon(provider)}
        title={providerName(provider, copy)}
        actions={
          <ActionPanel>
            {text !== undefined ? (
              <Action
                title={speaking === provider ? copy.stop : copy.speak}
                icon={speaking === provider ? "stop" : "volume-high"}
                onAction={() => toggleSpeak(provider, text, target)}
              />
            ) : null}
            {text !== undefined ? (
              <Action
                title={copy.favorite}
                icon="star"
                onAction={() => addFavorite(text)}
              />
            ) : null}
            {text !== undefined ? (
              <Action.CopyToClipboard title={copy.copy} icon="copy01" content={text} />
            ) : null}
            {/* Only the Selection entry has somewhere to write back to; the host does not
                draw this action in a clipboard or capture window. */}
            {text !== undefined ? (
              <Action.ReplaceSelection title={copy.replace} icon="check" content={text} />
            ) : null}
            <Action
              title={isCollapsed ? copy.expand : copy.collapse}
              icon={isCollapsed ? "arrow-right01" : "arrow-down01"}
              onAction={() => toggleCollapsed(provider)}
            />
          </ActionPanel>
        }
      >
        {isCollapsed ? null : failureKind ? (
          <Panel.Text text={copy[failureKind]} />
        ) : text !== undefined ? (
          <Panel.Text text={text} />
        ) : null}
      </Panel.Section>
    );
  }

  return (
    <Panel
      navigationTitle={copy.title}
      isLoading={isLoading}
      error={errorKind ? copy[errorKind] : undefined}
      onRetry={revalidate}
    >
      {/* The original keeps its own line of actions — read aloud, copy — the way the
          reference puts them with the source card rather than in its title. */}
      <Panel.Section
        actions={
          <ActionPanel>
            <Action
              title={speaking === "source" ? copy.stop : copy.speak}
              icon={speaking === "source" ? "stop" : "volume-high"}
              onAction={() =>
                toggleSpeak("source", original, pinnedSource(sourceChoice))
              }
            />
            <Action
              title={copy.favorite}
              icon="star"
              onAction={() => addFavorite(original)}
            />
            <Action.CopyToClipboard title={copy.copy} icon="copy01" content={original} />
          </ActionPanel>
        }
      >
        <Panel.Text text={original} />
      </Panel.Section>

      <Panel.Controls
        actions={
          <ActionPanel>
            <Action
              title={copy.swap}
              icon="arrow-data-transfer-horizontal"
              onAction={swapLanguages}
            />
            <Action title={copy.refresh} icon="refresh" onAction={translateAgain} />
          </ActionPanel>
        }
      >
        <Form.Dropdown
          id="source"
          title={copy.sourceLanguage}
          value={sourceChoice}
          onChange={chooseSource}
        >
          <Form.Dropdown.Item value="auto" title={copy.auto} />
          <Form.Dropdown.Item value="zh-Hans" title={copy.chinese} />
          <Form.Dropdown.Item value="en" title={copy.english} />
        </Form.Dropdown>
        <Form.Dropdown
          id="language"
          title={copy.language}
          value={targetChoice}
          onChange={chooseTarget}
        >
          <Form.Dropdown.Item value="auto" title={copy.auto} />
          <Form.Dropdown.Item value="zh-Hans" title={copy.chinese} />
          <Form.Dropdown.Item value="en" title={copy.english} />
        </Form.Dropdown>
      </Panel.Controls>

      {services.length === 0 ? <Panel.Text text={copy.noServices} /> : null}
      {services.map((provider) => serviceBlock(provider))}

      {agentCurrent && agentEnabled ? (
        <Panel.Prompt
          placeholder={copy.adjust}
          value={promptDraft}
          onSubmit={adjust}
        />
      ) : null}
    </Panel>
  );
}

// The same work the view does, reachable from a hook context: turning a click into a source
// text and a source text into a translation, with the context's own capabilities injected.
// The host ignores `routines`; the smoke harness calls them by name to check every provider
// without a window. Same shape as memory's import routines.
function capabilitiesFor(host: HostContext): ProviderCapabilities {
  return {
    fetch: (url, init) => host.fetch(url, init),
    secrets: host.secrets,
    translate: (text, options) => host.translate(text, options),
    ask: (prompt, timeoutMs) => host.agent.ask(prompt, { timeoutMs }),
    options: host.options,
  };
}

const routines = {
  resolveSource: (host: HostContext, input: ActionInput) =>
    resolveSource(input, (path) => host.ocr(path)),
  translate: async (
    host: HostContext,
    provider: ProviderId,
    text: string,
    language: TargetLanguage,
    source?: TargetLanguage
  ) => ({
    translation: await translateText(
      provider,
      text,
      language,
      source,
      capabilitiesFor(host)
    ),
    language,
    source: text,
    instruction: null,
  }),
  refine: (
    host: HostContext,
    text: string,
    instruction: string,
    language: TargetLanguage
  ) =>
    refine(text, instruction, language, (prompt, timeoutMs) =>
      host.agent.ask(prompt, { timeoutMs })
    ),
  speak: (host: HostContext, text: string, language?: string) =>
    host.speak(text, { language }),
  favorite: (host: HostContext, text: string) => host.favorites.add(text),
};

export default defineExtension({
  views: { translation: TranslationView },
  routines,
});
