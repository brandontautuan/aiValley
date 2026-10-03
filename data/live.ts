import { readFileSync, statSync } from "node:fs";
import type { Chain, ChainPolicy, ContextSignal, ItemSalesBucket, Location, MenuItem, OpeningHours, OrderBucket, PlanningData, PlanningRequest, ScenarioId } from "../contracts/index.ts";
import { addDays, localIso } from "./mock.ts";

/**
 * Real-data path: sales transactions and public-web context normalized into the same
 * PlanningData the fixtures produce. Everything here is pure except `loadSnapshot`;
 * network access lives in data/fetch.ts.
 */

/** One line item of a sale. Date and hour are local to the store. */
export interface SalesRow {
  orderId: string;
  date: string;
  hour: number;
  store: string;
  item: string;
  category: string;
  quantity: number;
  unitPriceCents: number;
}

export interface LiveConfig {
  chain: { name: string; policy: ChainPolicy };
  /** ISO 3166-1 alpha-2 country for public holidays. */
  country: string;
  /** Keyed by the store name used in the sales file. Capacity and hours are derived when omitted. */
  stores: Record<string, { latitude: number; longitude: number; timezone: string; hourlyCapacityOrders?: number; openingHours?: OpeningHours }>;
  /** Variable cost assumed as this share of price for items without a supplied cost. Omit to leave costs unknown. */
  assumeCostShare?: number;
}

export type ItemCosts = Record<string, { variableCostCents: number; costUpdatedAt: string }>;

export interface LiveSnapshot {
  version: 1;
  fetchedAt: string;
  source: string;
  assumptions: string[];
  chain: Chain;
  locations: Location[];
  menu: MenuItem[];
  /** History in the source's own dates; re-dated at load time when it is older than the planning date. */
  itemSales: ItemSalesBucket[];
  orderTotals: OrderBucket[];
  contextSignals: ContextSignal[];
}

/** The contract has no live scenario yet, so snapshot signals are active in both curated scenarios. */
const LIVE_SCENARIOS: ScenarioId[] = ["typical", "local-event"];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86_400_000;

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const SALES_COLUMNS = ["order_id", "date", "time", "store", "item", "quantity", "unit_price"] as const;

/**
 * Parses a transaction export with one line item per row and the columns
 * order_id, date (YYYY-MM-DD), time (HH:MM, 24h, store-local), store, item, quantity,
 * unit_price (decimal currency) and optionally category.
 */
export function parseSalesCsv(text: string): SalesRow[] {
  const [header, ...lines] = parseCsv(text);
  const columns = (header ?? []).map((name) => name.trim().toLowerCase());
  const missing = SALES_COLUMNS.filter((name) => !columns.includes(name));
  if (missing.length) throw new Error(`Sales CSV is missing column(s): ${missing.join(", ")}`);
  const at = (name: string) => columns.indexOf(name);
  const rows: SalesRow[] = [];
  lines.forEach((line, index) => {
    if (line.length === 1 && line[0] === "") return;
    const cell = (name: string) => (line[at(name)] ?? "").trim();
    const hour = Number(cell("time").slice(0, 2));
    const quantity = Number(cell("quantity"));
    const unitPriceCents = Math.round(Number(cell("unit_price")) * 100);
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(cell("date")) && /^\d{2}:\d{2}/.test(cell("time")) && hour < 24 && cell("order_id") && cell("store") && cell("item") && Number.isFinite(quantity) && Number.isFinite(unitPriceCents);
    if (!valid) throw new Error(`Sales CSV row ${index + 2} is invalid: ${line.join(",")}`);
    rows.push({ orderId: cell("order_id"), date: cell("date"), hour, store: cell("store"), item: cell("item"), category: at("category") >= 0 ? cell("category") : "", quantity, unitPriceCents });
  });
  return rows;
}

/** An hour whose average price is below this share of the regular price is treated as a past promotion. */
const PROMOTION_PRICE_SHARE = 0.97;
/** An hour counts as open when the store traded in it on at least this share of its trading days. */
const OPEN_HOUR_DAY_SHARE = 0.5;
/** Capacity assumed as this multiple of the busiest observed hour when the config does not supply one. */
const ASSUMED_CAPACITY_HEADROOM = 1.25;

/**
 * Aggregates line items into the hourly buckets the engine reads: the most recent `weeks`
 * of history, the top `items` products by units, orders counted as distinct order IDs, and
 * a zero row for every open hour of every day the store traded. Opening hours come from
 * the config, or else from the hours the store usually trades in.
 */
export function buildHistory(
  rows: SalesRow[],
  config: LiveConfig,
  options: { weeks: number; items: number; fetchedAt: string; costs?: ItemCosts },
): Pick<LiveSnapshot, "chain" | "locations" | "menu" | "itemSales" | "orderTotals" | "assumptions"> {
  if (!rows.length) throw new Error("Sales file has no rows.");
  const lastDate = rows.reduce((max, row) => (row.date > max ? row.date : max), "");
  const firstDate = addDays(lastDate, -(options.weeks * 7 - 1));
  const kept = rows.filter((row) => row.date >= firstDate);
  const assumptions: string[] = [];
  const chainId = slug(config.chain.name);

  interface Bucket { orders: Set<string>; items: Map<string, { units: number; revenueCents: number }> }
  const buckets = new Map<string, Bucket>();
  const stores = new Map<string, { days: Set<string>; hourDays: Map<number, Set<string>>; items: Set<string> }>();
  const products = new Map<string, { units: number; category: string; prices: Map<number, number> }>();

  for (const row of kept) {
    const key = `${row.store}|${row.date}|${row.hour}`;
    const bucket = buckets.get(key) ?? { orders: new Set(), items: new Map() };
    buckets.set(key, bucket);
    bucket.orders.add(row.orderId);
    const sold = bucket.items.get(row.item) ?? { units: 0, revenueCents: 0 };
    bucket.items.set(row.item, sold);
    sold.units += row.quantity;
    sold.revenueCents += row.quantity * row.unitPriceCents;

    const store = stores.get(row.store) ?? { days: new Set(), hourDays: new Map(), items: new Set() };
    stores.set(row.store, store);
    store.days.add(row.date);
    store.hourDays.set(row.hour, (store.hourDays.get(row.hour) ?? new Set()).add(row.date));
    store.items.add(row.item);

    const product = products.get(row.item) ?? { units: 0, category: row.category, prices: new Map() };
    products.set(row.item, product);
    product.units += row.quantity;
    product.prices.set(row.unitPriceCents, (product.prices.get(row.unitPriceCents) ?? 0) + row.quantity);
  }

  const storeNames = [...stores.keys()].sort();
  const top = [...products].sort((a, b) => b[1].units - a[1].units || a[0].localeCompare(b[0])).slice(0, options.items);
  const menu: MenuItem[] = top.map(([name, product]) => {
    // Regular price is the price most units sold at.
    const regularPriceCents = [...product.prices].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
    const supplied = options.costs?.[name];
    const assumed = !supplied && config.assumeCostShare !== undefined;
    return {
      id: slug(name),
      name,
      category: /coffee|tea|espresso|chocolate|drink|beverage/i.test(product.category) ? "coffee" : "food",
      offerEligible: true,
      regularPriceCents,
      variableCostCents: supplied ? supplied.variableCostCents : assumed ? Math.round(regularPriceCents * config.assumeCostShare!) : null,
      costUpdatedAt: supplied ? supplied.costUpdatedAt : assumed ? options.fetchedAt : null,
      eligibleLocationIds: storeNames.filter((store) => stores.get(store)!.items.has(name)).map(slug),
    };
  });
  const suppliedCount = top.filter(([name]) => options.costs?.[name]).length;
  if (suppliedCount < top.length) {
    assumptions.push(
      config.assumeCostShare !== undefined
        ? `Variable cost for ${top.length - suppliedCount} of ${top.length} items is assumed at ${Math.round(config.assumeCostShare * 100)}% of price, not a measured cost.`
        : `Variable cost is unknown for ${top.length - suppliedCount} of ${top.length} items, so discounts on them are blocked.`,
    );
  }

  const locations: Location[] = [];
  const itemSales: ItemSalesBucket[] = [];
  const orderTotals: OrderBucket[] = [];
  const assumedCapacity: string[] = [];
  for (const name of storeNames) {
    const settings = config.stores[name];
    if (!settings) throw new Error(`No store settings for "${name}". Add it under "stores" in the config file.`);
    const store = stores.get(name)!;
    const id = slug(name);
    // Derived hours ignore the odd early or late sale; sales outside them are left out of the buckets.
    const regular = [...store.hourDays].filter(([, days]) => days.size >= store.days.size * OPEN_HOUR_DAY_SHARE).map(([hour]) => hour);
    const openingHours = settings.openingHours ?? { open: Math.min(...regular), close: Math.max(...regular) + 1 };
    const items = menu.filter((item) => item.eligibleLocationIds.includes(id));
    let peak = 0;

    for (const date of [...store.days].sort()) {
      for (let hour = openingHours.open; hour < openingHours.close; hour += 1) {
        const bucket = buckets.get(`${name}|${date}|${hour}`);
        const orders = bucket?.orders.size ?? 0;
        peak = Math.max(peak, orders);
        let hourPromotion = false;
        for (const item of items) {
          const sold = bucket?.items.get(item.name) ?? { units: 0, revenueCents: 0 };
          const effectivePriceCents = sold.units > 0 ? Math.round(sold.revenueCents / sold.units) : item.regularPriceCents;
          const promotion = effectivePriceCents < item.regularPriceCents * PROMOTION_PRICE_SHARE;
          hourPromotion ||= promotion;
          itemSales.push({ locationId: id, itemId: item.id, date, hour, units: sold.units, revenueCents: sold.revenueCents, effectivePriceCents, promotion });
        }
        orderTotals.push({ locationId: id, date, hour, orders, promotion: hourPromotion });
      }
    }

    if (settings.hourlyCapacityOrders === undefined) assumedCapacity.push(name);
    locations.push({
      id,
      chainId,
      name,
      timezone: settings.timezone,
      latitude: settings.latitude,
      longitude: settings.longitude,
      openingHours,
      hourlyCapacityOrders: settings.hourlyCapacityOrders ?? Math.ceil(peak * ASSUMED_CAPACITY_HEADROOM),
      profile: `Imported sales: ${store.days.size} trading days, busiest hour ${peak} orders.`,
    });
  }
  if (assumedCapacity.length) assumptions.push(`Hourly capacity for ${assumedCapacity.join(", ")} is assumed at ${ASSUMED_CAPACITY_HEADROOM}× the busiest observed hour.`);

  return { chain: { id: chainId, name: config.chain.name, currency: "USD", policy: config.chain.policy }, locations, menu, itemSales, orderTotals, assumptions };
}

/** Thresholds and order adjustments for forecast weather. Judgment calls, not calibrated effects. */
export const WEATHER_ASSUMPTIONS = {
  rainMm: 0.5,
  rainProbabilityPct: 70,
  heavyRainMm: 4,
  hotC: 30,
  adjustment: { rain: -0.1, heavyRain: -0.2, heat: 0.1 },
};

/** The `hourly` block of an Open-Meteo forecast requested in the location's timezone. */
export interface HourlyForecast {
  time: string[];
  precipitation: Array<number | null>;
  precipitation_probability: Array<number | null>;
  apparent_temperature: Array<number | null>;
}

/** One signal per run of consecutive open hours with rain, or with heat, on a date. */
export function weatherSignals(location: Location, forecast: HourlyForecast, fetchedAt: string): ContextSignal[] {
  const signals: ContextSignal[] = [];
  let run: { kind: "rain" | "heat"; date: string; startHour: number; endHour: number; maxMm: number; maxPct: number; maxC: number } | null = null;
  const flush = () => {
    if (!run) return;
    const heavy = run.maxMm >= WEATHER_ASSUMPTIONS.heavyRainMm;
    const adjustment = run.kind === "heat" ? WEATHER_ASSUMPTIONS.adjustment.heat : heavy ? WEATHER_ASSUMPTIONS.adjustment.heavyRain : WEATHER_ASSUMPTIONS.adjustment.rain;
    const id = `weather-${location.id}-${run.date}-${run.kind}-${run.startHour}`;
    signals.push({
      id,
      type: "weather",
      title: run.kind === "heat" ? "Hot weather forecast" : heavy ? "Heavy rain forecast" : "Rain forecast",
      locationIds: [location.id],
      scenarioIds: LIVE_SCENARIOS,
      start: localIso(run.date, run.startHour, location.timezone),
      end: run.endHour === 24 ? localIso(addDays(run.date, 1), 0, location.timezone) : localIso(run.date, run.endHour, location.timezone),
      distanceKm: null,
      source: "Open-Meteo forecast",
      sourceLabel: "public-web",
      observedAt: fetchedAt,
      dedupeKey: id,
      assumedOrderAdjustment: adjustment,
      assumedUnitAdjustment: adjustment,
      whyItMatters:
        run.kind === "heat"
          ? `Forecast feels-like temperature reaches ${Math.round(run.maxC)}°C. The ${adjustment > 0 ? "+" : ""}${Math.round(adjustment * 100)}% adjustment is an assumption, not a measured effect.`
          : `Forecast rain up to ${run.maxMm} mm/h (${run.maxPct}% chance). Walk-in traffic is assumed to drop; the ${Math.round(adjustment * 100)}% adjustment is an assumption, not a measured effect.`,
    });
    run = null;
  };

  forecast.time.forEach((time, index) => {
    const date = time.slice(0, 10);
    const hour = Number(time.slice(11, 13));
    const mm = forecast.precipitation[index] ?? 0;
    const pct = forecast.precipitation_probability[index] ?? 0;
    const celsius = forecast.apparent_temperature[index] ?? 0;
    const open = hour >= location.openingHours.open && hour < location.openingHours.close;
    const kind = !open ? null : mm >= WEATHER_ASSUMPTIONS.rainMm || pct >= WEATHER_ASSUMPTIONS.rainProbabilityPct ? "rain" : celsius >= WEATHER_ASSUMPTIONS.hotC ? "heat" : null;
    if (run && (run.kind !== kind || run.date !== date || run.endHour !== hour)) flush();
    if (!kind) return;
    run ??= { kind, date, startHour: hour, endHour: hour, maxMm: 0, maxPct: 0, maxC: celsius };
    run.endHour = hour + 1;
    run.maxMm = Math.max(run.maxMm, mm);
    run.maxPct = Math.max(run.maxPct, pct);
    run.maxC = Math.max(run.maxC, celsius);
  });
  flush();
  return signals;
}

/** Nationwide public holidays in [from, to] as dated signals with no demand adjustment. */
export function holidaySignals(locations: Location[], holidays: Array<{ date: string; name: string; global: boolean }>, fetchedAt: string, from: string, to: string): ContextSignal[] {
  const timezone = locations[0]!.timezone;
  return holidays
    .filter((holiday) => holiday.global && holiday.date >= from && holiday.date <= to)
    .map((holiday) => ({
      id: `holiday-${holiday.date}-${slug(holiday.name)}`,
      type: "holiday",
      title: holiday.name,
      locationIds: locations.map((location) => location.id),
      scenarioIds: LIVE_SCENARIOS,
      start: localIso(holiday.date, 0, timezone),
      end: localIso(addDays(holiday.date, 1), 0, timezone),
      distanceKm: null,
      source: "Nager.Date public holidays",
      sourceLabel: "public-web",
      observedAt: fetchedAt,
      dedupeKey: `holiday-${holiday.date}`,
      assumedOrderAdjustment: 0,
      assumedUnitAdjustment: 0,
      whyItMatters: "Shown for awareness only; a few weeks of history cannot establish a holiday effect, so no adjustment is applied.",
    }));
}

let loaded: { path: string; mtimeMs: number; snapshot: LiveSnapshot } | null = null;
const dated = new Map<string, PlanningData>();
const CACHE_LIMIT = 40;

/** Reads a snapshot written by data/fetch.ts; re-reads only when the file changes. */
export function loadSnapshot(path: string): LiveSnapshot {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    throw new Error(`PLANNING_SNAPSHOT points to ${path}, which does not exist. Run: node --experimental-strip-types data/fetch.ts`);
  }
  if (loaded?.path === path && loaded.mtimeMs === mtimeMs) return loaded.snapshot;
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as LiveSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.orderTotals) || !Array.isArray(snapshot.itemSales) || !Array.isArray(snapshot.locations)) {
    throw new Error(`${path} is not a version 1 planning snapshot.`);
  }
  loaded = { path, mtimeMs, snapshot };
  dated.clear();
  return snapshot;
}

/**
 * Planning data for a date from a snapshot. When the history ends more than a week before
 * the planning date it is re-dated by whole weeks, so weekdays are preserved and the
 * engine's same-weekday baseline has observations. The label says when that happened.
 */
export function planningDataFromSnapshot(snapshot: LiveSnapshot, request: PlanningRequest): PlanningData {
  const key = `${snapshot.fetchedAt}:${request.date}`;
  let base = dated.get(key);
  if (!base) {
    const lastDate = snapshot.orderTotals.reduce((max, bucket) => (bucket.date > max ? bucket.date : max), "");
    const gap = lastDate ? dayNumber(request.date) - 1 - dayNumber(lastDate) : 0;
    const shift = gap > 0 ? Math.floor(gap / 7) * 7 : 0;
    const shifted = new Map<string, string>();
    const move = <T extends { date: string }>(bucket: T): T => {
      if (!shift) return bucket;
      if (!shifted.has(bucket.date)) shifted.set(bucket.date, addDays(bucket.date, shift));
      return { ...bucket, date: shifted.get(bucket.date)! };
    };
    const notes = [...(shift ? [`Sales history is re-dated forward ${shift} days to end before the planning date.`] : []), ...snapshot.assumptions];
    base = {
      request: { date: request.date, scenario: request.scenario },
      fixtureLabel: `Live snapshot fetched ${snapshot.fetchedAt.slice(0, 10)} — ${snapshot.source}. ${notes.join(" ")}`.trim(),
      chain: snapshot.chain,
      locations: snapshot.locations,
      menu: snapshot.menu,
      itemSales: snapshot.itemSales.map(move).filter((bucket) => bucket.date < request.date),
      orderTotals: snapshot.orderTotals.map(move).filter((bucket) => bucket.date < request.date),
      contextSignals: snapshot.contextSignals,
      competitorOffers: [],
    };
    if (dated.size >= CACHE_LIMIT) dated.delete(dated.keys().next().value!);
    dated.set(key, base);
  }
  return { ...base, request };
}
