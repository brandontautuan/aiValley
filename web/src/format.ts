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

export const timestamp = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export const CLASSIFICATION_LABEL: Record<DemandClassification, string> = {
  soft: "Below usual",
  typical: "Usual demand",
  busy: "Above usual",
  constrained: "At capacity",
};
