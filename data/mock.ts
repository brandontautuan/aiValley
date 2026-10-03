import type { ContextSignal, ItemSalesBucket, Location, MenuItem, OrderBucket, PlanningData, PlanningRequest, ScenarioId } from "../contracts/index.ts";
import { CHAIN, COMPETITOR_OFFERS, HISTORY_WEEKS, HOURLY_ORDER_PROFILE, ITEM_MIX, LOCATIONS, MENU, UNITS_PER_ORDER } from "./fixtures.ts";

/** Mock scenarios are `mock-<seed>`; the same seed always yields the same dataset. */
export function mockSeed(scenario: ScenarioId | string): number | null {
  const match = /^mock-(\d{1,9})$/.exec(scenario);
  return match ? Number(match[1]) : null;
}

export const mockLabel = (seed: number) => `Mock dataset #${seed} — randomly generated fictional demand, costs and local signals; not live data`;

/** Deterministic value in [0, 1) from a string key (FNV-1a). */
function unit(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // Extra mixing so keys that differ only in a trailing digit spread out.
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822519);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

const between = (key: string, min: number, max: number) => min + unit(key) * (max - min);
const pick = <T>(key: string, values: T[]): T => values[Math.floor(unit(key) * values.length)]!;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Local wall-clock hour on a date as an ISO string with the zone's offset for that day. */
function localIso(date: string, hour: number, timeZone: string): string {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === "timeZoneName")!
    .value.replace("GMT", "");
  return `${date}T${String(hour).padStart(2, "0")}:00:00${offset || "+00:00"}`;
}

const DAYPART_STARTS = [0, 11, 14, 17];
const daypartIndex = (hour: number) => DAYPART_STARTS.filter((start) => hour >= start).length - 1;

/** Per-seed store conditions: overall traffic level and how each daypart compares with the fixture shape. */
function demandFactor(seed: number, locationId: string, hour: number): number {
  const level = between(`${seed}:level:${locationId}`, 0.7, 2.2);
  const daypart = between(`${seed}:daypart:${locationId}:${daypartIndex(hour)}`, 0.45, 1.5);
  return level * daypart;
}

function mockMenu(seed: number, date: string): MenuItem[] {
  const staleItemId = unit(`${seed}:stale`) < 0.25 ? pick(`${seed}:stale-item`, MENU).id : null;
  return MENU.map((item) => {
    // Variable cost as a share of price; low shares are what let a discount clear break-even.
    const costShare = between(`${seed}:cost:${item.id}`, 0.06, 0.34);
    return {
      ...item,
      variableCostCents: Math.max(5, Math.round((item.regularPriceCents * costShare) / 5) * 5),
      costUpdatedAt: localIso(addDays(date, item.id === staleItemId ? -120 : -14), 9, LOCATIONS[0]!.timezone),
    };
  });
}

/** Store size varies with the seed, so the same traffic can be comfortable in one dataset and a capacity peak in another. */
function mockLocations(seed: number): Location[] {
  return LOCATIONS.map((location) => ({ ...location, hourlyCapacityOrders: Math.round(location.hourlyCapacityOrders * between(`${seed}:capacity:${location.id}`, 1, 2.6)) }));
}

function mockMix(seed: number): Record<string, number> {
  return Object.fromEntries(Object.entries(ITEM_MIX).map(([itemId, share]) => [itemId, share * between(`${seed}:mix:${itemId}`, 0.4, 2)]));
}

interface SignalTemplate {
  key: string;
  type: ContextSignal["type"];
  title: string;
  source: string;
  adjustment: [number, number];
  durationHours: [number, number];
  why: string;
}

const SIGNAL_TEMPLATES: SignalTemplate[] = [
  { key: "rain", type: "weather", title: "Heavy rain forecast", source: "Mock: weather forecast", adjustment: [-0.35, -0.1], durationHours: [3, 6], why: "Walk-in traffic is assumed to drop while it rains." },
  { key: "heat", type: "weather", title: "Unusually warm afternoon", source: "Mock: weather forecast", adjustment: [0.1, 0.3], durationHours: [3, 5], why: "Warm weather is assumed to lift cold-drink orders." },
  { key: "concert", type: "event", title: "Concert nearby", source: "Mock: event calendar", adjustment: [0.4, 0.9], durationHours: [3, 4], why: "Pre-show walk-ups concentrate in the hours before doors open." },
  { key: "street-fair", type: "event", title: "Street fair on the block", source: "Mock: event calendar", adjustment: [0.25, 0.6], durationHours: [4, 7], why: "Foot traffic past the store is assumed to rise for the length of the fair." },
  { key: "transit", type: "pattern", title: "Transit line closure", source: "Mock: transit notice", adjustment: [-0.3, -0.12], durationHours: [4, 8], why: "Fewer commuters are assumed to pass the store while the line is closed." },
  { key: "office", type: "pattern", title: "Large office remote-work day", source: "Mock: neighborhood notice", adjustment: [-0.4, -0.15], durationHours: [5, 9], why: "Nearby office workers are assumed to stay home." },
  { key: "school", type: "event", title: "School event letting out", source: "Mock: school calendar", adjustment: [0.15, 0.4], durationHours: [2, 3], why: "Families are assumed to stop in after the event." },
];

/** 0–2 signals per store for the planning date, so different dates under one seed differ too. */
function mockSignals(seed: number, date: string, scenario: ScenarioId): ContextSignal[] {
  const signals: ContextSignal[] = [];
  for (const location of LOCATIONS) {
    const count = Math.floor(between(`${seed}:${date}:signal-count:${location.id}`, 0, 3));
    for (let index = 0; index < count; index += 1) {
      const key = `${seed}:${date}:${location.id}:${index}`;
      const template = pick(`${key}:template`, SIGNAL_TEMPLATES);
      const duration = Math.round(between(`${key}:duration`, ...template.durationHours));
      const { open, close } = location.openingHours;
      const startHour = Math.min(close - 1, Math.floor(between(`${key}:start`, open, Math.max(open + 1, close - duration + 1))));
      const endHour = Math.min(close, startHour + duration);
      const adjustment = Math.round(between(`${key}:adjustment`, ...template.adjustment) * 100) / 100;
      signals.push({
        id: `mock-${seed}-${date}-${location.id}-${index}`,
        type: template.type,
        title: `${template.title} (mock)`,
        locationIds: [location.id],
        scenarioIds: [scenario],
        start: localIso(date, startHour, location.timezone),
        end: localIso(date, endHour, location.timezone),
        distanceKm: template.type === "event" ? Math.round(between(`${key}:distance`, 0.1, 1.5) * 10) / 10 : null,
        source: template.source,
        sourceLabel: "fixture",
        observedAt: localIso(addDays(date, -1), 9, location.timezone),
        // One real-world cause per store and template: a repeated template is applied once.
        dedupeKey: `mock-${seed}-${date}-${location.id}-${template.key}`,
        assumedOrderAdjustment: adjustment,
        assumedUnitAdjustment: adjustment,
        whyItMatters: `${template.why} Randomly generated; the adjustment is an assumption.`,
      });
    }
  }
  return signals;
}

function mockHistory(seed: number, date: string, locations: Location[], menu: MenuItem[]): { itemSales: ItemSalesBucket[]; orderTotals: OrderBucket[] } {
  const itemSales: ItemSalesBucket[] = [];
  const orderTotals: OrderBucket[] = [];
  const mix = mockMix(seed);

  for (let offset = HISTORY_WEEKS * 7; offset >= 1; offset -= 1) {
    const day = addDays(date, -offset);
    const weekdayNumber = new Date(`${day}T12:00:00Z`).getUTCDay();
    const weekend = weekdayNumber === 0 || weekdayNumber === 6;

    for (const location of locations) {
      const profile = HOURLY_ORDER_PROFILE[location.id]![weekend ? "weekend" : "weekday"];
      const items = menu.filter((item) => item.eligibleLocationIds.includes(location.id));
      const mixTotal = items.reduce((total, item) => total + mix[item.id]!, 0);

      for (let hour = location.openingHours.open; hour < location.openingHours.close; hour += 1) {
        const typical = (profile[hour] ?? 0) * demandFactor(seed, location.id, hour);
        const orders = Math.max(0, Math.round(typical * between(`${seed}:orders:${location.id}:${day}:${hour}`, 0.88, 1.12)));
        for (const item of items) {
          const units = Math.max(0, Math.round(orders * UNITS_PER_ORDER * (mix[item.id]! / mixTotal) * between(`${seed}:units:${location.id}:${item.id}:${day}:${hour}`, 0.8, 1.2)));
          itemSales.push({ locationId: location.id, itemId: item.id, date: day, hour, units, revenueCents: units * item.regularPriceCents, effectivePriceCents: item.regularPriceCents, promotion: false });
        }
        orderTotals.push({ locationId: location.id, date: day, hour, orders, promotion: false });
      }
    }
  }
  return { itemSales, orderTotals };
}

const cache = new Map<string, PlanningData>();
const CACHE_LIMIT = 40;

/**
 * Generates a full planning dataset from a seed: store traffic levels and daypart
 * shapes, item costs and mix, and dated local signals. Everything is fictional and
 * every adjustment is an assumption; the engine is unchanged and simply responds to it.
 */
export function loadMockPlanningData(request: PlanningRequest, seed: number): PlanningData {
  const key = `${seed}:${request.date}`;
  let base = cache.get(key);
  if (!base) {
    const menu = mockMenu(seed, request.date);
    const locations = mockLocations(seed);
    base = {
      request: { date: request.date, scenario: request.scenario },
      fixtureLabel: mockLabel(seed),
      chain: CHAIN,
      locations,
      menu,
      ...mockHistory(seed, request.date, locations, menu),
      contextSignals: mockSignals(seed, request.date, request.scenario),
      competitorOffers: COMPETITOR_OFFERS,
    };
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, base);
  }
  return { ...base, request };
}
