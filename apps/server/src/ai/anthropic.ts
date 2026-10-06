import Anthropic from "@anthropic-ai/sdk";
import type { FilterInterpreter } from "./interpreter.js";
import { buildPrompt } from "./prompt.js";

/**
 * Claude via the Anthropic API, with STRUCTURED OUTPUTS: the reply is
 * constrained to our JSON schema (including enums of this tenant's event types
 * and sources). We stream the text so the browser can show the filter forming.
 */
export function createAnthropicInterpreter(apiKey: string, model: string): FilterInterpreter {
  const client = new Anthropic({ apiKey, maxRetries: 1 });

  return {
    name: model,
    async *stream({ query, vocabulary }, signal) {
      const { system, user, schema } = buildPrompt(query, vocabulary);
      const events = await client.messages.create(
        {
          model,
          max_tokens: 400,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { format: { type: "json_schema", schema } },
          stream: true,
        },
        { signal },
      );
      for await (const event of events) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    },
  };
}
