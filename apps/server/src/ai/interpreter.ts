import type { FilterVocabulary } from "@pulse/shared";

export interface InterpretInput {
  /** Already redacted (see redactQuery). */
  query: string;
  vocabulary: FilterVocabulary;
}

/**
 * Anything that turns a request into filter JSON, streamed as text chunks.
 * The route depends on this interface, not on Anthropic's SDK, so tests use a
 * fake that streams exactly the chunks (valid or broken) a test needs.
 */
export interface FilterInterpreter {
  readonly name: string;
  stream(input: InterpretInput, signal: AbortSignal): AsyncIterable<string>;
}
