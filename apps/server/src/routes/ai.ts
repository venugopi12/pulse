import {
  AiFilterRequestSchema,
  isEmptyFilter,
  parseFilterRules,
  redactQuery,
  sanitizeFilter,
  type AiFilterMessage,
} from "@pulse/shared";
import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import type { FilterInterpreter } from "../ai/interpreter.js";
import { ModelOutputSchema } from "../ai/prompt.js";
import { tenantVocabulary } from "../ai/vocabulary.js";
import { HttpError } from "../lib/errors.js";
import { getAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import type { Store } from "../store/types.js";

export interface AiOptions {
  /** null = no API key: every request uses the rule-based parser. */
  interpreter: FilterInterpreter | null;
  timeoutMs?: number;
  /** Requests per user per minute. */
  perMinute?: number;
}

/**
 * POST /api/ai/filter  { query }  ->  text/event-stream
 *
 *   data: {"type":"delta","text":"{\"sever"}      (model output as it streams)
 *   data: {"type":"result","filter":{…},"source":"ai","notes":[]}
 *
 * The browser shows the deltas as a preview, but only ever APPLIES the final
 * `result`, which the server has parsed, validated with Zod and checked
 * against the tenant's vocabulary. Any failure (no key, API error, timeout,
 * invalid JSON) ends in a rule-based result instead, never in a broken UI.
 */
export function aiRouter(store: Store, opts: AiOptions): Router {
  const router = Router();
  const timeoutMs = opts.timeoutMs ?? 12_000;

  // Per USER, not per IP: LLM calls cost money; one person shouldn't be able to run up the bill.
  const limiter: RequestHandler = rateLimit({
    windowMs: 60_000,
    limit: opts.perMinute ?? 20,
    keyGenerator: (req) => getAuth(req).userId,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError("TOO_MANY_REQUESTS", "Too many filter requests. Try again in a minute.")),
  });

  router.get("/status", requirePermission("events:read"), (_req, res) => {
    res.json({ mode: opts.interpreter ? "ai" : "rules", model: opts.interpreter?.name ?? null });
  });

  router.post("/filter", requirePermission("events:read"), limiter, async (req, res) => {
    const { tenantId } = getAuth(req);
    // Validation errors become a normal 400 JSON response (before streaming starts).
    const { query } = AiFilterRequestSchema.parse(req.body);
    const vocabulary = tenantVocabulary(store, tenantId);

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // don't let proxies (nginx) buffer the stream
    });
    const send = (msg: AiFilterMessage) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

    const fallback = (reason: string | null) => {
      const rules = parseFilterRules(query, vocabulary);
      send({ type: "result", filter: rules.filter, source: "rules", notes: [...(reason ? [reason] : []), ...rules.notes] });
    };

    if (!opts.interpreter) {
      fallback(null);
      res.end();
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // The browser went away (navigated, cancelled): stop paying for tokens.
    res.on("close", () => controller.abort());

    let text = "";
    try {
      for await (const chunk of opts.interpreter.stream({ query: redactQuery(query), vocabulary }, controller.signal)) {
        text += chunk;
        send({ type: "delta", text: chunk });
      }
      const parsed = ModelOutputSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error("Model output failed validation");

      const { notes: modelNotes, ...raw } = parsed.data;
      const { filter, dropped } = sanitizeFilter(raw, vocabulary);
      const notes = modelNotes.slice(0, 3).map((n) => n.slice(0, 160));
      if (dropped.length > 0) notes.push(`Ignored values that don't exist here: ${dropped.join(", ")}`);
      if (isEmptyFilter(filter) && notes.length === 0) notes.push("That didn't match anything the dashboard can filter by.");
      send({ type: "result", filter, source: "ai", notes });
    } catch (err) {
      if (res.writableEnded || res.destroyed) return;
      const timedOut = controller.signal.aborted;
      // Log the failure, not the user's text.
      console.warn(`[ai] ${timedOut ? "timeout" : "fallback"}: ${err instanceof Error ? err.message : String(err)}`);
      fallback(`${timedOut ? "The AI took too long" : "The AI's answer couldn't be used"}, so keyword matching was used instead.`);
    } finally {
      clearTimeout(timer);
      if (!res.writableEnded) res.end();
    }
  });

  return router;
}
