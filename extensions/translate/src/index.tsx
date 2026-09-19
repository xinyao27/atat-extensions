// translate — the entry point.
//
// One view, mounted wherever the user clicked Translate: beside a selection, on a clipboard
// row, or on a capture card. The view is handed the action's own input and nothing else, so
// the three entries are one behavior rather than three code paths.
//
// The page is a stack of cards. The original sits at the top and is resolved once and kept
// — a failed request never costs the user the OCR'd text. Under it is the language row:
// what it is being translated from, a swap, and what it is being translated into. Then one
// collapsible card per enabled service, each carrying its own translation and the actions
// that belong to it, so the user compares answers side by side instead of picking a winner
// in Settings. A card that is still waiting shows its own progress where its answer will
// be; nothing on the page waits on behalf of a service that already answered.

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
  detectedLanguage,
  languageSettings,
  pinnedSource,
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
  type ProviderResult,
} from "./providers.js";

/// The service's mark, drawn before its name in the panel and before its switch in
/// Settings: the service's own logo from the package, or — for the user's agent — the
/// provider mark the host names, so the card wears whichever agent is selected. A host
/// with no agent to name keeps the template glyph.
function providerIcon(provider: ProviderId): string {
  switch (provider) {
    case "agent": return environment.agent?.icon ?? "brain03";
    case "system": return "service-system.png";
    case "google": return "service-google.png";
    case "microsoft": return "service-microsoft.png";
    case "deepl": return "service-deepl.png";
  }
}

/// What the card is called. The agent's card names the model that will answer — the same
/// name the composer's picker shows — instead of a generic label.
function providerName(provider: ProviderId, copy: Strings): string {
  switch (provider) {
    case "agent": return environment.agent?.name ?? copy.agent;
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
      from: TargetLanguage | undefined
    ): Promise<Translation | null> => {
      if (!text || !agentEnabled) return Promise.resolve(null);
      return translate(text, language, from, capabilities.ask);
    },
    [sourceText ?? null, target, sourcePin]
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

  /// What the services say the original is. The pinned source wins because the user said
  /// it; otherwise the first service that reports a recognition does, in the order the
  /// services stand in. `detectedLanguage` drops a language this panel cannot name, so the
  /// badge never shows a raw code.
  const recognized: TargetLanguage | undefined =
    sourceChoice !== "auto"
      ? sourceChoice
      : services
          .map((provider) =>
            provider === "agent"
              ? undefined
              : (results[provider].data as ProviderResult | null | undefined)?.source
          )
          .map((value) => detectedLanguage(value))
          .find((value) => value !== undefined);

  // The agent's result, bound to the text and language it answers: a slow answer to a
  // question the user has moved on from is never shown and never gets actions.
  const agentCurrent =
    !agentResult.isLoading &&
    agentResult.data &&
    agentResult.data.language === target &&
    agentResult.data.source === sourceText
      ? agentResult.data
      : undefined;

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

  /// A language change is a new question: the old answers no longer apply.
  function chooseSource(value: string) {
    setSourceChoice(value as LanguageChoice);
  }

  function chooseTarget(value: string) {
    setTargetChoice(value as LanguageChoice);
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
  }

  /// Ask every service again for the language pair on screen.
  function translateAgain() {
    revalidate();
  }

  /// The two languages as the user reads them, for the badge that names one of them.
  function languageLabel(language: TargetLanguage): string {
    return language === "zh-Hans" ? copy.chinese : copy.english;
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

  /// One service's card: its own header, its own result, its own failure, its own actions.
  /// The header keeps only the mark, the name and the fold; the actions live under the
  /// text they act on, so a reading of the card runs name → answer → buttons. A card that
  /// is still loading shows nothing but the page's progress; the text appears in place.
  function serviceBlock(provider: ProviderId): ReactElement {
    const result = results[provider];
    const isCollapsed = collapsed.includes(provider);
    const failure = result.isLoading ? undefined : result.error;
    const text =
      provider === "agent"
        ? agentCurrent?.translation
        : (result.data as ProviderResult | null | undefined)?.text ?? undefined;
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
        // The wait belongs inside the fold: a collapsed card shows its header and nothing
        // else, and expanding it again reveals the loader that was always part of it.
        loading={!isCollapsed && result.isLoading}
        actions={
          <ActionPanel>
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
        {!isCollapsed && text !== undefined ? (
          <ActionPanel>
            <Action
              title={speaking === provider ? copy.stop : copy.speak}
              icon={speaking === provider ? "stop" : "volume-high"}
              onAction={() => toggleSpeak(provider, text, target)}
            />
            <Action title={copy.favorite} icon="star" onAction={() => addFavorite(text)} />
            <Action.CopyToClipboard title={copy.copy} icon="copy01" content={text} />
            {/* Only the Selection entry has somewhere to write back to; the host does not
                draw this action in a clipboard or capture window. */}
            <Action.ReplaceSelection title={copy.replace} icon="check" content={text} />
          </ActionPanel>
        ) : null}
      </Panel.Section>
    );
  }

  return (
    <Panel
      navigationTitle={copy.title}
      error={errorKind ? copy[errorKind] : undefined}
      onRetry={revalidate}
    >
      {/* The original keeps its own line of actions — read aloud, favorite, copy — the way
          the reference puts them with the source card rather than in its title, and the
          badge that says what the words were recognised as sits at the end of that same
          line. While OCR is running the card says so itself, like any other region. */}
      <Panel.Section loading={source.isLoading}>
        <Panel.Text text={original} />
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
        {recognized ? (
          <Panel.Badge
            title={copy.recognizedAs}
            value={languageLabel(recognized)}
            tooltip={copy.adjustRecognition}
            onChange={chooseSource}
          >
            <Form.Dropdown.Item value="auto" title={copy.auto} />
            <Form.Dropdown.Item value="zh-Hans" title={copy.chinese} />
            <Form.Dropdown.Item value="en" title={copy.english} />
          </Panel.Badge>
        ) : null}
      </Panel.Section>

      {/* The swap stands between the two languages it trades, where the eye already is;
          translating again from scratch sits at the row's far end. */}
      <Panel.Controls>
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
        <ActionPanel>
          <Action
            title={copy.swap}
            icon="arrow-data-transfer-horizontal"
            onAction={swapLanguages}
          />
        </ActionPanel>
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
        <ActionPanel>
          <Action title={copy.refresh} icon="refresh" onAction={translateAgain} />
        </ActionPanel>
      </Panel.Controls>

      {services.length === 0 ? <Panel.Text text={copy.noServices} /> : null}
      {services.map((provider) => serviceBlock(provider))}
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
  ) => {
    const result = await translateText(
      provider,
      text,
      language,
      source,
      capabilitiesFor(host)
    );
    return {
      translation: result.text,
      // What the service said the original was, in its own spelling. The agent does not
      // report one, so the field is absent for that provider.
      detected: result.source,
      language,
      source: text,
    };
  },
  speak: (host: HostContext, text: string, language?: string) =>
    host.speak(text, { language }),
  favorite: (host: HostContext, text: string) => host.favorites.add(text),
};

export default defineExtension({
  views: { translation: TranslationView },
  routines,
});
