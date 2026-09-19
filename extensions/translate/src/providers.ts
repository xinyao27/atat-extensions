// Where translations come from besides your agent: the translation macOS ships, and the
// three services whose APIs are reachable with the user's own key.
//
// Every capability a provider needs arrives as an argument — `fetch`, `secrets`, the
// system's `translate` — the same way the agent's `ask` already did, so this file runs
// unchanged in a panel, in a hook context and in the smoke harness. Nothing here knows
// which world it is running in, and nothing here holds a key itself.
//
// A page shows one block per enabled service, all at once: the blocks are the answer to
// "which one translated this best", so a provider that was not asked for is not a provider.

import type { FetchInit, FetchResponse } from "@atat/api";
import {
  TranslateError,
  translate as translateWithAgent,
  type AskAgent,
  type TargetLanguage,
} from "./translation.js";

export type ProviderId = "agent" | "system" | "google" | "microsoft" | "deepl";

/// Declaration order, and the order the blocks appear in: the agent first because it is
/// the one that can also be talked to afterwards, then the local system, then the three
/// remote services.
export const PROVIDERS: ProviderId[] = ["agent", "system", "google", "microsoft", "deepl"];

/// The boolean option that turns each provider on.
const ENABLED_OPTION: Record<ProviderId, string> = {
  agent: "useAgent",
  system: "useSystem",
  google: "useGoogle",
  microsoft: "useMicrosoft",
  deepl: "useDeepL",
};

/// Which providers the user turned on, in declaration order.
export function enabledProviders(options: Record<string, string | boolean>): ProviderId[] {
  return PROVIDERS.filter((provider) => options[ENABLED_OPTION[provider]] === true);
}

/// What a provider is allowed to reach. The view passes the panel's own imports; a hook
/// context and the smoke harness pass the same calls off `ctx`.
export interface ProviderCapabilities {
  fetch: (url: string, init?: FetchInit) => Promise<FetchResponse>;
  secrets: { get(key: string): Promise<string | null> };
  translate: (
    text: string,
    options: { target: string; source?: string; timeoutMs?: number }
  ) => Promise<ProviderResult>;
  ask: AskAgent;
  options: Record<string, string | boolean>;
}

/// One service's answer: the text, and the language the service says it was in. The source
/// is the pinned one, or the service's own recognition when the caller left it out; it is
/// absent only from a service that does not report one — the agent — and the view leaves
/// the language badge off rather than guessing.
export interface ProviderResult {
  text: string;
  source?: string;
}

/// One translation, by one provider. `source` is the language the user pinned, or
/// `undefined` when the provider should detect it — which is what "Auto Detect" means and
/// what every service here can do.
export async function translateText(
  provider: ProviderId,
  text: string,
  language: TargetLanguage,
  source: TargetLanguage | undefined,
  capabilities: ProviderCapabilities
): Promise<ProviderResult> {
  switch (provider) {
    case "agent":
      return {
        text: (await translateWithAgent(text, language, source, capabilities.ask))
          .translation,
      };
    case "system":
      return translateWithSystem(text, language, source, capabilities);
    case "google":
      return translateWithGoogle(text, language, source, capabilities);
    case "microsoft":
      return translateWithMicrosoft(text, language, source, capabilities);
    case "deepl":
      return translateWithDeepL(text, language, source, capabilities);
  }
}

// ------------------------------------------------------------------------ the system

/// The translation macOS itself uses, through the host. The language pair has to be
/// downloaded on this Mac already; the host reports that as its own refusal, and the wording
/// the user sees points at System Settings either way. The host is also the one service
/// that answers with the language it recognised, because the system is doing the
/// recognising.
async function translateWithSystem(
  text: string,
  language: TargetLanguage,
  source: TargetLanguage | undefined,
  capabilities: ProviderCapabilities
): Promise<ProviderResult> {
  try {
    const result = await capabilities.translate(text, {
      target: language,
      source,
      timeoutMs: 60_000,
    });
    if (!result.text.trim()) throw new TranslateError("failed");
    return { text: result.text.trim(), source: result.source };
  } catch (error) {
    if (error instanceof TranslateError) throw error;
    throw new TranslateError("systemUnavailable");
  }
}

// ------------------------------------------------------------------------ Google

/// The endpoint the Google Translate page itself calls. It needs no key and no account;
/// it is not a documented API, so it can fail with nothing but a status, which reads as a
/// plain failed translation.
const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateWithGoogle(
  text: string,
  language: TargetLanguage,
  source: TargetLanguage | undefined,
  capabilities: ProviderCapabilities
): Promise<ProviderResult> {
  const query = [
    "client=gtx",
    `sl=${source === undefined ? "auto" : googleLanguage(source)}`,
    `tl=${googleLanguage(language)}`,
    "dt=t",
    `q=${encodeURIComponent(text)}`,
  ].join("&");
  const response = await capabilities.fetch(`${GOOGLE_ENDPOINT}?${query}`, {
    timeoutMs: 30_000,
  });
  if (response.status !== 200) throw new TranslateError("failed");
  const result = parseGoogle(await response.json());
  if (!result.text) throw new TranslateError("failed");
  return result;
}

function googleLanguage(language: TargetLanguage): string {
  return language === "zh-Hans" ? "zh-CN" : "en";
}

/// `[[["译文","source",…],["…","…"]],null,"en",…]`: every segment's first cell is a piece
/// of the answer, joining them back is the whole parse, and the third cell of the root is
/// the language Google decided the text was in.
function parseGoogle(payload: unknown): ProviderResult {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return { text: "" };
  let translation = "";
  for (const segment of payload[0] as unknown[]) {
    if (Array.isArray(segment) && typeof segment[0] === "string") {
      translation += segment[0];
    }
  }
  const detected = typeof payload[2] === "string" ? (payload[2] as string) : undefined;
  return { text: translation.trim(), source: detected };
}

// ------------------------------------------------------------------------ Microsoft

/// Azure's Translator API. The key comes from the user's own Translator resource; the
/// region is only sent when they filled one in, which is what a global resource needs.
const MICROSOFT_ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate";
const MICROSOFT_API_VERSION = "3.0";

async function translateWithMicrosoft(
  text: string,
  language: TargetLanguage,
  source: TargetLanguage | undefined,
  capabilities: ProviderCapabilities
): Promise<ProviderResult> {
  const key = await requireSecret(capabilities, "microsoftKey");
  const headers: Record<string, string> = {
    "Ocp-Apim-Subscription-Key": key,
    "Content-Type": "application/json",
  };
  const region = String(capabilities.options.microsoftRegion ?? "").trim();
  if (region) headers["Ocp-Apim-Subscription-Region"] = region;

  const query = [
    `api-version=${MICROSOFT_API_VERSION}`,
    `to=${encodeURIComponent(language)}`,
    source === undefined ? undefined : `from=${encodeURIComponent(source)}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join("&");
  const response = await capabilities.fetch(`${MICROSOFT_ENDPOINT}?${query}`, {
    method: "POST",
    headers,
    body: JSON.stringify([{ Text: text }]),
    timeoutMs: 30_000,
  });
  if (response.status === 401 || response.status === 403) {
    throw new TranslateError("keyRejected");
  }
  if (response.status !== 200) throw new TranslateError("failed");
  const result = parseMicrosoft(await response.json());
  if (!result.text) throw new TranslateError("failed");
  return result;
}

/// `[{"detectedLanguage":{"language":"en"},"translations":[{"text":"…"}]}]`.
function parseMicrosoft(payload: unknown): ProviderResult {
  if (!Array.isArray(payload)) return { text: "" };
  const first = payload[0] as
    | { translations?: unknown; detectedLanguage?: unknown }
    | undefined;
  const translations = first?.translations;
  if (!Array.isArray(translations)) return { text: "" };
  const translated = (translations[0] as { text?: unknown } | undefined)?.text;
  const detected = (first?.detectedLanguage as { language?: unknown } | undefined)
    ?.language;
  return {
    text: typeof translated === "string" ? translated.trim() : "",
    source: typeof detected === "string" ? detected : undefined,
  };
}

// ------------------------------------------------------------------------ DeepL

/// DeepL has two hosts, and which one a key works on is written in the key itself: free
/// keys end in `:fx`. Both are declared in `networkHosts`, because which one is called is
/// the user's key that decides.
const DEEPL_FREE_ENDPOINT = "https://api-free.deepl.com/v2/translate";
const DEEPL_PRO_ENDPOINT = "https://api.deepl.com/v2/translate";

async function translateWithDeepL(
  text: string,
  language: TargetLanguage,
  source: TargetLanguage | undefined,
  capabilities: ProviderCapabilities
): Promise<ProviderResult> {
  const key = await requireSecret(capabilities, "deeplKey");
  const endpoint = key.endsWith(":fx") ? DEEPL_FREE_ENDPOINT : DEEPL_PRO_ENDPOINT;
  const body: { text: string[]; target_lang: string; source_lang?: string } = {
    text: [text],
    target_lang: language === "zh-Hans" ? "ZH" : "EN-US",
  };
  if (source !== undefined) body.source_lang = source === "zh-Hans" ? "ZH" : "EN";
  const response = await capabilities.fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });
  if (response.status === 401 || response.status === 403) {
    throw new TranslateError("keyRejected");
  }
  if (response.status !== 200) throw new TranslateError("failed");
  const result = parseDeepL(await response.json());
  if (!result.text) throw new TranslateError("failed");
  return result;
}

/// `{"translations":[{"detected_source_language":"EN","text":"…"}]}`.
function parseDeepL(payload: unknown): ProviderResult {
  const translations = (payload as { translations?: unknown } | null)?.translations;
  if (!Array.isArray(translations)) return { text: "" };
  const first = translations[0] as
    | { text?: unknown; detected_source_language?: unknown }
    | undefined;
  return {
    text: typeof first?.text === "string" ? first.text.trim() : "",
    source:
      typeof first?.detected_source_language === "string"
        ? first.detected_source_language
        : undefined,
  };
}

// ------------------------------------------------------------------------ keys

/// A key the user has not filled in yet is a state to explain, not a failure to retry.
/// `secrets` is the one option type with no default; the message the view shows names the
/// extension's own Settings page, where the field is.
async function requireSecret(
  capabilities: ProviderCapabilities,
  key: string
): Promise<string> {
  const value = (await capabilities.secrets.get(key))?.trim();
  if (!value) throw new TranslateError("missingKey");
  return value;
}
