// The assistants a memory can be brought over from, and what they are called.
//
// One entry per `reads` declaration in the manifest, in the order they are offered. The name
// is the product's own — it is the same word in every language, and a user recognises it or
// they do not have it installed.

export interface Assistant {
  /** Matches a `reads` identifier in the manifest, and the `source` written into a note. */
  identifier: string;
  name: string;
}

export const ASSISTANTS: Assistant[] = [
  { identifier: "claude-code", name: "Claude Code" },
  { identifier: "codex", name: "Codex" },
  { identifier: "hermes", name: "Hermes" },
  { identifier: "openclaw", name: "OpenClaw" },
  { identifier: "gemini-cli", name: "Gemini CLI" },
  { identifier: "qwen-code", name: "Qwen Code" },
  { identifier: "trae", name: "Trae" },
  { identifier: "goose", name: "Goose" },
];

export function assistant(identifier: string): Assistant | undefined {
  return ASSISTANTS.find((entry) => entry.identifier === identifier);
}

export function assistantName(identifier: string): string {
  return assistant(identifier)?.name ?? identifier;
}

/** Whether a note's `source` names an assistant rather than one of AtAt's own surfaces. */
export function isAssistantSource(source: string): boolean {
  return ASSISTANTS.some((entry) => entry.identifier === source);
}

/** “Claude Code, Codex … and Goose” — the half-sentence that says where AtAt looked. */
export function assistantNames(separator: string, lastSeparator?: string): string {
  const names = ASSISTANTS.map((entry) => entry.name);
  if (lastSeparator === undefined || names.length < 2) return names.join(separator);
  return names.slice(0, -1).join(separator) + lastSeparator + names[names.length - 1];
}
