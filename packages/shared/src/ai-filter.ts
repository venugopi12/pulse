import { z } from "zod";
import { SeveritySchema, type AnalyticsEvent, type Severity } from "./event.js";
import type { Metric } from "./widget.js";

/**
 * Natural-language filters.
 *
 * "errors from checkout in the last hour" becomes:
 *   { severities: ["error"], eventTypes: [], sources: ["checkout"], sinceMinutes: 60 }
 *
 * An empty array means "no constraint". The SAME shape comes from the LLM
 * (validated here) or from the deterministic rule-based parser (the fallback).
 */
export const AiFilterSchema = z
  .object({
    severities: z.array(SeveritySchema).max(3),
    eventTypes: z.array(z.string().min(1)).max(20),
    sources: z.array(z.string().min(1)).max(20),
    sinceMinutes: z.number().int().min(1).max(1440).nullable(),
  })
  .strict();
export type AiFilter = z.infer<typeof AiFilterSchema>;

export const EMPTY_FILTER: AiFilter = { severities: [], eventTypes: [], sources: [], sinceMinutes: null };

export const isEmptyFilter = (f: AiFilter): boolean =>
  f.severities.length === 0 && f.eventTypes.length === 0 && f.sources.length === 0 && f.sinceMinutes === null;

export const AiFilterRequestSchema = z
  .object({ query: z.string().trim().min(2, "Type a few words to filter by").max(200, "Keep it under 200 characters") })
  .strict();

/** What the filter is allowed to mention: this tenant's event types and sources. */
export interface FilterVocabulary {
  eventTypes: string[];
  sources: string[];
}

/** Server-Sent Events from POST /api/ai/filter. */
export const AiFilterMessageSchema = z.discriminatedUnion("type", [
  /** A chunk of the model's JSON as it streams. */
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({
    type: z.literal("result"),
    filter: AiFilterSchema,
    /** "ai" = the model's answer, validated; "rules" = the deterministic fallback. */
    source: z.enum(["ai", "rules"]),
    /** Parts of the request that couldn't be turned into a filter. */
    notes: z.array(z.string()),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AiFilterMessage = z.infer<typeof AiFilterMessageSchema>;

// --- Privacy -------------------------------------------------------------------

/**
 * Remove things that look personal or secret BEFORE a query leaves the
 * server: emails, long digit runs (card, phone, account numbers), IPs and
 * anything token-like. Filters never need them.
 */
export function redactQuery(query: string): string {
  return query
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[ip]")
    .replace(/\b(?:\d[ -]?){7,}\d\b/g, "[number]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]");
}

// --- Validation against the vocabulary -------------------------------------------

/**
 * Keep only values that exist for this tenant. A model can't invent an event
 * type: anything unknown is dropped and reported, never applied.
 */
export function sanitizeFilter(raw: AiFilter, vocab: FilterVocabulary): { filter: AiFilter; dropped: string[] } {
  const dropped: string[] = [];
  const keep = (values: string[], allowed: string[]) =>
    [...new Set(values)].filter((v) => {
      if (allowed.includes(v)) return true;
      dropped.push(v);
      return false;
    });
  return {
    filter: {
      severities: [...new Set(raw.severities)],
      eventTypes: keep(raw.eventTypes, vocab.eventTypes),
      sources: keep(raw.sources, vocab.sources),
      sinceMinutes: raw.sinceMinutes,
    },
    dropped,
  };
}

// --- The deterministic fallback ----------------------------------------------------

const SEVERITY_WORDS: [RegExp, Severity[]][] = [
  [/\b(errors?|errored|critical)\b/, ["error"]],
  [/\b(warnings?|warn)\b/, ["warn"]],
  [/\b(problems?|issues?|incidents?)\b/, ["warn", "error"]],
  [/\binfo\b/, ["info"]],
];

/** Plural/past-tense trimming, so "payments" matches payment and "deliveries" delivery. */
function stem(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("es") && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem);

function parseSince(q: string): number | null {
  const m = q.match(/\b(?:last|past|previous)\s+(\d{1,4})\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)\b/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2]!.startsWith("m") ? 1 : m[2]!.startsWith("h") ? 60 : 1440;
    return Math.min(1440, Math.max(1, n * unit));
  }
  if (/\b(last|past|this)\s+hour\b/.test(q)) return 60;
  if (/\b(today|last day|past day|24 ?h(ours)?)\b/.test(q)) return 1440;
  if (/\b(last|past)\s+(half an hour|30 ?min)/.test(q)) return 30;
  if (/\b(right now|just now|recently|latest)\b/.test(q)) return 15;
  return null;
}

/**
 * Rule-based parser: used when no API key is configured, when the model
 * fails or times out, or when its answer doesn't validate. Predictable and
 * offline, but it only understands keywords.
 *
 * Words are consumed in order (severity words, then sources, then event
 * types), so "checkout errors" means source=checkout + severity=error rather
 * than ALSO matching the event type "checkout.error".
 */
export function parseFilterRules(query: string, vocab: FilterVocabulary): { filter: AiFilter; notes: string[] } {
  const q = query.toLowerCase();
  const severities = new Set<Severity>();
  for (const [re, sev] of SEVERITY_WORDS) if (re.test(q)) sev.forEach((s) => severities.add(s));

  const sinceMinutes = parseSince(q);
  const used = new Set<string>();
  const queryTokens = tokens(q.replace(/\b(?:last|past|previous)\s+\d+\s*\w+\b/g, " "));
  for (const t of queryTokens) if (/^(error|errored|critical|warning|warn|problem|issue|incident|info)$/.test(t)) used.add(t);

  const sources = vocab.sources.filter((src) => {
    const parts = tokens(src);
    if (parts.length > 0 && parts.every((p) => queryTokens.includes(p))) {
      parts.forEach((p) => used.add(p));
      return true;
    }
    return false;
  });

  const remaining = queryTokens.filter((t) => !used.has(t));
  const eventTypes = vocab.eventTypes.filter((type) => {
    const parts = tokens(type);
    return parts.length > 0 && parts.every((p) => remaining.includes(p));
  });

  const filter: AiFilter = { severities: [...severities], eventTypes, sources, sinceMinutes };
  const notes = isEmptyFilter(filter) ? ["Couldn't find an event type, source, severity or time range in that."] : [];
  return { filter, notes };
}

// --- Applying a filter ----------------------------------------------------------------

const intersect = <T>(a: T[] | undefined, b: T[]): T[] | undefined => {
  if (b.length === 0) return a;
  if (!a) return b;
  return a.filter((x) => b.includes(x));
};

/**
 * A widget's metric, narrowed by the dashboard filter. Constraints combine
 * with AND: a widget that counts appointment.booked, filtered to source
 * "checkout", correctly shows zero. The time range replaces the window.
 */
export function applyFilterToMetric(metric: Metric, filter: AiFilter): Metric {
  if (isEmptyFilter(filter)) return metric;
  const types = intersect(metric.eventTypes, filter.eventTypes);
  const severities = intersect(metric.severities, filter.severities);
  const sources = intersect(metric.sources, filter.sources);
  const next: Metric = {
    ...metric,
    ...(filter.sinceMinutes !== null ? { windowMinutes: filter.sinceMinutes } : {}),
  };
  // An EMPTY intersection must match nothing (not everything), so it becomes
  // a single event type that can't exist.
  if ([types, severities, sources].some((x) => x !== undefined && x.length === 0)) {
    return { ...next, eventTypes: [NO_MATCH] };
  }
  if (types) next.eventTypes = types;
  if (severities) next.severities = severities;
  if (sources) next.sources = sources;
  return next;
}

/** An event type no tenant can have (event types are dotted lowercase words). */
export const NO_MATCH = "(no match)";

/** True when a filter left this metric with nothing it could ever match. */
export function isNoMatch(metric: Metric): boolean {
  return metric.eventTypes?.includes(NO_MATCH) ?? false;
}

export function matchesFilter(e: AnalyticsEvent, filter: AiFilter, now: number): boolean {
  if (filter.severities.length > 0 && !filter.severities.includes(e.severity)) return false;
  if (filter.eventTypes.length > 0 && !filter.eventTypes.includes(e.type)) return false;
  if (filter.sources.length > 0 && !filter.sources.includes(e.source)) return false;
  if (filter.sinceMinutes !== null && e.timestamp < now - filter.sinceMinutes * 60_000) return false;
  return true;
}

const SEVERITY_LABEL: Record<Severity, string> = { info: "Info", warn: "Warnings", error: "Errors" };

/** "Errors from checkout in the last hour" — built from the VALIDATED filter, never from model text. */
export function describeFilter(f: AiFilter): string {
  const what = f.eventTypes.length > 0 ? f.eventTypes.join(", ") : "Events";
  const sev = f.severities.length > 0 ? f.severities.map((s) => SEVERITY_LABEL[s]).join(" and ") : null;
  let text = sev ? (f.eventTypes.length > 0 ? `${sev}: ${what}` : sev) : what;
  if (f.sources.length > 0) text += ` from ${f.sources.join(", ")}`;
  if (f.sinceMinutes !== null) {
    const m = f.sinceMinutes;
    text += m === 60 ? " in the last hour" : m % 60 === 0 ? ` in the last ${m / 60} hours` : ` in the last ${m} minutes`;
  }
  return text;
}
