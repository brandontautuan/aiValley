import type { HourOutlook, LocationOutlook, LocationOutlookResponse, OfferCandidate, OfferWindow } from "../../contracts/index.ts";
import { windowLabel } from "./format.ts";

/**
 * Display-only interpretation of server numbers (labels, sentences, color states).
 * No economics are computed here; every value comes from the API.
 */

/** Share of capacity at which the UI marks an hour as full (mirrors chain policy default). */
export const NEAR_CAPACITY = 0.9;

export const isNearCapacity = (hour: HourOutlook) => hour.scenarioOrders >= hour.capacityOrders * NEAR_CAPACITY;

export const inWindow = (hour: number, window: OfferWindow) => hour >= window.startHour && hour < window.endHour;

export function selectedCandidate(response: Pick<LocationOutlookResponse, "candidates" | "selection">): OfferCandidate {
  return response.candidates.find((candidate) => candidate.id === response.selection.selectedCandidateId) ?? response.candidates[0];
}

/** True when a keep-price decision exists to protect a full window. */
export const isCapacityHold = (candidate: OfferCandidate) =>
  candidate.kind === "no-change" && candidate.windowCapacityOrders > 0 && candidate.windowOrders >= candidate.windowCapacityOrders * NEAR_CAPACITY;

export function actionLabel(candidate: OfferCandidate, outlook: Pick<LocationOutlook, "focusReason">): string {
  if (candidate.kind === "discount") return `Trial ${candidate.terms.discountPct}% off ${candidate.itemName} · ${windowLabel(candidate.terms.window)}`;
  if (outlook.focusReason === "capacity-peak") return `Keep regular price · protect ${windowLabel(candidate.terms.window)}`;
  return "Keep regular price";
}

const avg = (hours: HourOutlook[]) => (hours.length ? hours.reduce((sum, hour) => sum + hour.scenarioOrders, 0) / hours.length : 0);

/** One plain-language sentence for a store card. */
export function storeSentence(response: LocationOutlookResponse): string {
  const { outlook } = response;
  const selected = selectedCandidate(response);
  const window = windowLabel(outlook.focusWindow);
  if (selected.kind === "discount") {
    const share = avg(outlook.hours.filter((hour) => inWindow(hour.hour, outlook.focusWindow))) / avg(outlook.hours);
    return `Quiet ${window}, about ${Math.round(share * 100)}% of a typical hour. Trial ${selected.terms.discountPct}% off ${selected.itemName} to fill it.`;
  }
  if (outlook.focusReason === "capacity-peak") return `Demand reaches capacity ${window}. Hold the price; a promotion would add orders you can't serve.`;
  if (outlook.evidenceQuality !== "good") return "There is not enough sales history to confidently suggest a discount. Keep prices steady while you learn more.";
  if (outlook.focusReason === "soft-window") return `There is a quiet period ${window}, but the assumed extra sales do not justify a discount. Keep regular prices.`;
  return "Demand is in the usual range with no unusually quiet window. Keep the regular price.";
}

export type DaypartState = "low" | "usual" | "high" | "cap";

export interface Daypart {
  name: string;
  short: string;
  startHour: number;
  endHour: number;
  orders: number;
  state: DaypartState;
}

/** Morning–lunch, afternoon and evening blocks with a state for heatmap coloring. */
export function dayparts(response: LocationOutlookResponse): Daypart[] {
  const { outlook, location } = response;
  const selected = selectedCandidate(response);
  const { open, close } = location.openingHours;
  const blocks: Array<[string, string, number, number]> = [
    ["Lunch", "L", open, Math.max(open, 14)],
    ["Afternoon", "A", 14, 17],
    ["Evening", "E", 17, close],
  ];
  return blocks
    .filter(([, , start, end]) => end > start)
    .map(([name, short, startHour, endHour]) => {
      const hours = outlook.hours.filter((hour) => hour.hour >= startHour && hour.hour < endHour);
      const scenario = hours.reduce((sum, hour) => sum + hour.scenarioOrders, 0);
      const baseline = hours.reduce((sum, hour) => sum + hour.baselineOrders, 0);
      const promo = selected.kind === "discount" && selected.terms.window.startHour < endHour && selected.terms.window.endHour > startHour;
      const state: DaypartState = hours.some(isNearCapacity) ? "cap" : promo ? "low" : scenario >= baseline * 1.1 ? "high" : "usual";
      return { name, short, startHour, endHour, orders: Math.round(scenario), state };
    });
}

export const STATE_LABEL: Record<DaypartState, string> = {
  low: "Quiet window: promotion opportunity",
  usual: "Usual",
  high: "Busier than usual",
  cap: "At capacity",
};
