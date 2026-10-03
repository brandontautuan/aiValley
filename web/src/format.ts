import type { DemandClassification, OfferWindow } from "../../contracts/index.ts";

export const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`);

export const hour = (value: number) => {
  const suffix = value >= 12 && value < 24 ? "p" : "a";
  const display = value % 12 === 0 ? 12 : value % 12;
  return `${display}${suffix}`;
};

export const windowLabel = (window: OfferWindow) => `${hour(window.startHour)}–${hour(window.endHour)}`;

export const pct = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;

export const units = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Calendar arithmetic on YYYY-MM-DD strings (no timezone involved). */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Local time of day for an ISO timestamp in a location's timezone, e.g. "11:00 AM". */
export const localTime = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });

/** Local YYYY-MM-DD for an ISO timestamp in a timezone. */
export const localDate = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });

export const timestamp = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export const CLASSIFICATION_LABEL: Record<DemandClassification, string> = {
  soft: "Below usual",
  typical: "Usual demand",
  busy: "Above usual",
  constrained: "At capacity",
};
