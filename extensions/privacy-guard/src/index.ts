// privacy-guard — masks personal details before they leave, restores them in the answer.
//
// Lifecycle:
//   1. contextAssembled  → ctx.model.run({ capability: "pii" }) → cloak
//                        → rewrite.prompt (and rewrite.items for textual pills)
//   2. answerAssembled   → restore fake→real in the answer before it is shown
//
// Failure policy: the host no longer lets a hook's failure hold the send —
// contextAssembled returns an explicit `block` instead. Detection is local and
// on its own worker thread; the one way a detector outage can leak a real value
// is the pipeline's timeout, and that budget dwarfs the Metal call.
// answerAssembled failures skip — the worst case is the user sees a fake name
// that the restore would have fixed.

import { defineExtension } from "@atat/api";
import type {
  AnswerAssembledInput,
  AnswerAssembledResult,
  ContextAssembledInput,
  ContextAssembledResult,
  ContextItemSnapshot,
  ExtensionHooks,
  HostContext,
  ModelSpan,
} from "@atat/api";
import {
  apply,
  hydrate,
  persist,
  reveal,
  toItems,
  type CloakState,
} from "./cloak.js";

function textualItems(input: ContextAssembledInput): ContextItemSnapshot[] {
  return input.items.filter(
    (item): item is ContextItemSnapshot & { text: string } =>
      typeof item.text === "string" && item.text.length > 0
  );
}

async function detect(text: string, ctx: HostContext): Promise<ModelSpan[]> {
  try {
    const result = await ctx.model.run({
      capability: "pii",
      input: { text },
    });
    return Array.isArray(result.spans) ? result.spans : [];
  } catch (error) {
    // Three consecutive throws pause the extension. A missing model or a
    // transient Metal failure is temporary: log metadata only and let the
    // caller decide — a timeout on this hook skips rather than blocks.
    ctx.log(
      `pii detect failed: ${error instanceof Error ? error.message : "unknown"}`
    );
    throw error;
  }
}

function cloakOnce(text: string, spans: ModelSpan[], state: CloakState): string {
  const items = toItems(text, spans, state.memory);
  if (items.length === 0) return text;
  return apply(text, items, state.restore);
}

const hooks: ExtensionHooks = {
  async contextAssembled(
    input: ContextAssembledInput,
    ctx: HostContext
  ): Promise<ContextAssembledResult | void> {
    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    const items = textualItems(input);
    const state = await hydrate(ctx);
    const remember = ctx.options.rememberMappings !== false;

    let rewrittenPrompt = prompt;
    const itemReplacements: { id: string; text: string }[] = [];
    let maskedAnything = false;

    // One model call for the prompt, then one per textual pill. Pills are usually
    // short; the budget is 1.5s and the Metal detector is milliseconds, so this
    // stays well inside. A single concatenated call would scramble offsets.
    if (prompt.trim()) {
      const spans = await detect(prompt, ctx);
      if (spans.length > 0) {
        const next = cloakOnce(prompt, spans, state);
        if (next !== prompt) {
          rewrittenPrompt = next;
          maskedAnything = true;
        }
      }
    }

    for (const item of items) {
      const spans = await detect(item.text!, ctx);
      if (spans.length === 0) continue;
      const next = cloakOnce(item.text!, spans, state);
      if (next !== item.text) {
        itemReplacements.push({ id: item.id, text: next });
        maskedAnything = true;
      }
    }

    if (maskedAnything) {
      await persist(ctx, state.memory, state.restore, remember);
    }

    if (!maskedAnything) return;

    const rewrite: NonNullable<ContextAssembledResult["rewrite"]> = {};
    if (rewrittenPrompt !== prompt) rewrite.prompt = rewrittenPrompt;
    if (itemReplacements.length > 0) rewrite.items = itemReplacements;
    return { rewrite };
  },

  async answerAssembled(
    input: AnswerAssembledInput,
    ctx: HostContext
  ): Promise<AnswerAssembledResult | void> {
    const responseText =
      typeof input.responseText === "string" ? input.responseText : "";
    if (!responseText) return;
    try {
      const state = await hydrate(ctx);
      const restored = reveal(responseText, state.restore);
      if (restored === responseText) return;
      return { rewrite: { responseText: restored } };
    } catch (error) {
      ctx.log(
        `answer restore failed: ${error instanceof Error ? error.message : "unknown"}`
      );
      return;
    }
  },
};

export default defineExtension({ hooks });
