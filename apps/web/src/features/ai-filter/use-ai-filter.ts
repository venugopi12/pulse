import { AiFilterMessageSchema, AiFilterSchema, ApiErrorSchema, isEmptyFilter } from "@pulse/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { API_BASE } from "@/lib/api";
import { useSession } from "@/stores/session";
import { parsePartialJson } from "./partial-json";
import { createSseParser } from "./sse";
import { useFilterStore } from "./store";

const PreviewSchema = AiFilterSchema.partial();
export type FilterPreview = z.infer<typeof PreviewSchema>;

export type AiFilterStatus =
  | { state: "idle" }
  | { state: "streaming"; preview: FilterPreview }
  | { state: "error"; message: string }
  /** The request was understood but gave nothing to filter by; the dashboard is left as it was. */
  | { state: "nothing"; message: string };

/**
 * Sends a request to POST /api/ai/filter and reads the event stream.
 *   - `delta` events build a live PREVIEW (best-effort partial JSON),
 *   - the final `result` (validated by the server) is what gets APPLIED.
 * A new request cancels the previous one, and so does unmounting.
 */
export function useAiFilter() {
  const { token, tenant } = useSession();
  const apply = useFilterStore((s) => s.apply);
  const [status, setStatus] = useState<AiFilterStatus>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => setStatus({ state: "idle" }), [tenant.id]);

  const submit = useCallback(
    async (query: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus({ state: "streaming", preview: {} });

      try {
        const res = await fetch(`${API_BASE}/api/ai/filter`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = ApiErrorSchema.safeParse(await res.json().catch(() => null));
          setStatus({ state: "error", message: err.success ? err.data.error.message : "Couldn't reach the server" });
          return;
        }

        let raw = "";
        let applied = false;
        const parser = createSseParser((data) => {
          const msg = AiFilterMessageSchema.safeParse(JSON.parse(data));
          if (!msg.success) return;
          if (msg.data.type === "delta") {
            raw += msg.data.text;
            const preview = PreviewSchema.safeParse(parsePartialJson(raw));
            if (preview.success) setStatus({ state: "streaming", preview: preview.data });
          } else if (msg.data.type === "result") {
            applied = true;
            if (isEmptyFilter(msg.data.filter)) {
              setStatus({
                state: "nothing",
                message: msg.data.notes.join(" ") || "Nothing in that matched this workspace's events. Try naming a source, a severity or a time range.",
              });
              return;
            }
            apply(tenant.id, { query, filter: msg.data.filter, source: msg.data.source, notes: msg.data.notes });
            setStatus({ state: "idle" });
          } else {
            setStatus({ state: "error", message: msg.data.message });
          }
        });

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(value);
        }
        if (!applied) setStatus({ state: "error", message: "The filter request ended early. Try again." });
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus({ state: "error", message: err instanceof Error ? err.message : "Something went wrong" });
      }
    },
    [token, tenant.id, apply],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus({ state: "idle" });
  }, []);

  return { status, submit, cancel };
}
