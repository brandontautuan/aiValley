import type { ItemSalesBucket, OrderBucket, PlanningData, PlanningRequest, ScenarioId } from "../contracts/index.ts";
import {
  CHAIN,
  COMPETITOR_OFFERS,
  CONTEXT_SIGNALS,
  DEFAULT_PLANNING_DATE,
  FIXTURE_LABEL,
  HISTORICAL_PROMOTIONS,
  HISTORY_END_DATE,
  HISTORY_WEEKS,
  HOURLY_ORDER_PROFILE,
  ITEM_MIX,
  LOCATIONS,
  MENU,
  UNITS_PER_ORDER,
} from "./fixtures.ts";
import { loadSnapshot, planningDataFromSnapshot } from "./live.ts";
import { loadMockPlanningData, mockSeed } from "./mock.ts";

export { DEFAULT_PLANNING_DATE, FIXTURE_LABEL } from "./fixtures.ts";
export { SF_COMPETITOR_PROFILES } from "./fixtures.ts";
export { mockLabel, mockSeed } from "./mock.ts";

export const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "typical", label: "Typical day" },
  { id: "local-event", label: "Local event day" },
];

/** Deterministic noise in [-amplitude, +amplitude] from a string seed (FNV-1a). */
function noise(seed: string, amplitude: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (((hash >>> 0) % 10_000) / 10_000 - 0.5) * 2 * amplitude;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

let cachedHistory: { itemSales: ItemSalesBucket[]; orderTotals: OrderBucket[] } | null = null;

/** Generates 8 weeks of fictional hourly orders and item units. Same output every run. */
function generateHistory(): { itemSales: ItemSalesBucket[]; orderTotals: OrderBucket[] } {
  if (cachedHistory) return cachedHistory;
  const itemSales: ItemSalesBucket[] = [];
  const orderTotals: OrderBucket[] = [];

  for (let offset = HISTORY_WEEKS * 7 - 1; offset >= 0; offset -= 1) {
    const date = addDays(HISTORY_END_DATE, -offset);
    const weekday = weekdayOf(date);
    const weekend = weekday === 0 || weekday === 6;

    for (const location of LOCATIONS) {
      const profile = HOURLY_ORDER_PROFILE[location.id][weekend ? "weekend" : "weekday"];
      const items = MENU.filter((item) => item.eligibleLocationIds.includes(location.id));
      const mixTotal = items.reduce((sum, item) => sum + ITEM_MIX[item.id], 0);

      for (let hour = location.openingHours.open; hour < location.openingHours.close; hour += 1) {
        const typicalOrders = profile[hour] ?? 0;
        let orders = Math.max(0, Math.round(typicalOrders * (1 + noise(`${location.id}:${date}:${hour}`, 0.12))));
        let hourPromotion = false;

        for (const item of items) {
          const promo = HISTORICAL_PROMOTIONS.find(
            (entry) => entry.locationId === location.id && entry.itemId === item.id && entry.date === date && hour >= entry.startHour && hour < entry.endHour,
          );
          const share = ITEM_MIX[item.id] / mixTotal;
          let units = Math.max(0, Math.round(orders * UNITS_PER_ORDER * share * (1 + noise(`${location.id}:${item.id}:${date}:${hour}`, 0.2))));
          let price = item.regularPriceCents;
          if (promo) {
            const extra = Math.round(units * promo.unitLift);
            units += extra;
            orders += Math.round(extra / UNITS_PER_ORDER);
            price = Math.round((item.regularPriceCents * (100 - promo.discountPct)) / 100);
            hourPromotion = true;
          }
          itemSales.push({
            locationId: location.id,
            itemId: item.id,
            date,
            hour,
            units,
            revenueCents: units * price,
            effectivePriceCents: price,
            promotion: Boolean(promo),
          });
        }
        orderTotals.push({ locationId: location.id, date, hour, orders, promotion: hourPromotion });
      }
    }
  }
  cachedHistory = { itemSales, orderTotals };
  return cachedHistory;
}

/**
 * Loads normalized planning data for a date and scenario. Context signals are
 * filtered to the scenario; the engine decides which locations/hours they affect.
 */
export function loadPlanningData(request: Partial<PlanningRequest> = {}): PlanningData {
  const normalized: PlanningRequest = {
    date: request.date ?? DEFAULT_PLANNING_DATE,
    scenario: request.scenario ?? "typical",
    ...(request.locationId ? { locationId: request.locationId } : {}),
  };
  const seed = mockSeed(normalized.scenario);
  if (seed !== null) return loadMockPlanningData(normalized, seed);
  // Opt-in: a snapshot written by data/fetch.ts replaces the curated fixtures. Mock seeds are unaffected.
  const snapshotPath = process.env.PLANNING_SNAPSHOT;
  if (snapshotPath) return planningDataFromSnapshot(loadSnapshot(snapshotPath), normalized);
  const history = generateHistory();
  return {
    request: normalized,
    fixtureLabel: FIXTURE_LABEL,
    chain: CHAIN,
    locations: LOCATIONS,
    menu: MENU,
    itemSales: history.itemSales.filter((bucket) => bucket.date < normalized.date),
    orderTotals: history.orderTotals.filter((bucket) => bucket.date < normalized.date),
    contextSignals: CONTEXT_SIGNALS.filter((signal) => signal.scenarioIds.includes(normalized.scenario)),
    competitorOffers: COMPETITOR_OFFERS,
  };
}
