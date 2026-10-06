/**
 * Intl formatters are expensive to construct, so build each once and reuse.
 * (This matters later when hundreds of numbers update per second.)
 */
const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export type { Unit } from "@pulse/shared";
import type { Unit } from "@pulse/shared";

const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const compactCurrency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "14:30" for chart axes and tooltips. */
export const formatClock = (epochMs: number): string => clock.format(epochMs);

/** Short axis labels: 1.2K, $3.4M, 250 ms. */
export function formatAxis(value: number, unit: Unit): string {
  switch (unit) {
    case "currency":
      return compactCurrency.format(value);
    case "ms":
      return `${compact.format(value)} ms`;
    case "percent":
      return `${compact.format(value)}%`;
    case "count":
      return compact.format(value);
  }
}

export function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case "currency":
      return currency.format(value);
    case "ms":
      return `${integer.format(value)} ms`;
    case "percent":
      return `${integer.format(value)}%`;
    case "count":
      return value >= 100_000 ? compact.format(value) : integer.format(value);
  }
}

export const formatTime = (epochMs: number): string => time.format(epochMs);

export function formatRelative(epochMs: number, now = Date.now()): string {
  const seconds = Math.round((epochMs - now) / 1000);
  if (Math.abs(seconds) < 60) return relative.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  return relative.format(Math.round(minutes / 60), "hour");
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
