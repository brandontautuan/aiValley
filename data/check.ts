import assert from "node:assert/strict";
import { loadPlanningData } from "./index.ts";
import { buildHistory, holidaySignals, parseSalesCsv, planningDataFromSnapshot, weatherSignals, type LiveConfig, type LiveSnapshot } from "./live.ts";

const a = loadPlanningData({ date: "2026-10-05", scenario: "typical" });
const b = loadPlanningData({ date: "2026-10-05", scenario: "typical" });
assert.deepEqual(a, b, "fixture loading is deterministic");

assert.equal(a.locations.length, 3);
assert.equal(a.chain.name, "Project Northstar");
assert.equal(a.menu.length, 5);
assert.ok(a.menu.every((item) => Number.isInteger(item.regularPriceCents) && (item.variableCostCents === null || Number.isInteger(item.variableCostCents))));
assert.ok(a.itemSales.every((bucket) => bucket.date < "2026-10-05"), "no future sales leak into history");
const days = new Set(a.orderTotals.map((bucket) => bucket.date));
assert.equal(days.size, 56, "8 weeks of history");
assert.ok(a.itemSales.some((bucket) => bucket.promotion), "a labeled past promotion exists");

const event = loadPlanningData({ date: "2026-10-05", scenario: "local-event" });
assert.ok(event.contextSignals.some((signal) => signal.id === "ctx-arena-concert"));
assert.ok(!a.contextSignals.some((signal) => signal.id === "ctx-arena-concert"));

const ids = event.contextSignals.map((signal) => signal.id).concat(event.competitorOffers.map((offer) => offer.id));
assert.equal(new Set(ids).size, ids.length, "evidence IDs are unique");
assert.ok(a.competitorOffers.every((offer) => offer.sourceLabel === "fixture" && offer.collectedAt.includes("-07:00")));

// Mock scenarios: stable per seed, different across seeds, and history never reaches the planning date.
const mock = loadPlanningData({ date: "2026-10-05", scenario: "mock-7" });
assert.deepEqual(mock, loadPlanningData({ date: "2026-10-05", scenario: "mock-7" }), "a mock seed is deterministic");
assert.notDeepEqual(mock.orderTotals, loadPlanningData({ date: "2026-10-05", scenario: "mock-8" }).orderTotals, "different seeds give different history");
assert.ok(mock.fixtureLabel.includes("Mock dataset #7"));
assert.ok(mock.itemSales.every((bucket) => bucket.date < "2026-10-05") && new Set(mock.orderTotals.map((bucket) => bucket.date)).size === 56);
assert.ok(mock.menu.every((item) => Number.isInteger(item.variableCostCents) && item.variableCostCents! < item.regularPriceCents));
assert.ok(mock.contextSignals.every((signal) => signal.title.endsWith("(mock)") && signal.scenarioIds.includes("mock-7") && signal.start.startsWith("2026-10-05")));
const mockIds = mock.contextSignals.map((signal) => signal.id);
assert.equal(new Set(mockIds).size, mockIds.length, "mock signal IDs are unique");
assert.deepEqual(a, loadPlanningData({ date: "2026-10-05", scenario: "typical" }), "mock loading leaves the curated fixtures untouched");

// Live path: no network here. A small transaction export becomes hourly buckets and a dated snapshot.
const liveConfig: LiveConfig = {
  chain: { name: "Test Cafe", policy: a.chain.policy },
  country: "US",
  stores: { "Main St": { latitude: 40.7, longitude: -74, timezone: "America/New_York", openingHours: { open: 9, close: 12 } } },
  assumeCostShare: 0.3,
};
const salesRows = parseSalesCsv(
  [
    "order_id,date,time,store,item,category,quantity,unit_price",
    'A1,2026-09-28,09:15,Main St,"Latte, large",Coffee,2,5.00',
    "A1,2026-09-28,09:15,Main St,Scone,Bakery,1,3.00",
    'A2,2026-09-28,09:40,Main St,"Latte, large",Coffee,1,5.00',
    'A3,2026-09-28,11:05,Main St,"Latte, large",Coffee,2,4.00',
    "",
  ].join("\n"),
);
assert.equal(salesRows.length, 4);
assert.equal(salesRows[0]!.item, "Latte, large", "quoted fields keep their commas");
assert.throws(() => parseSalesCsv("order_id,date\n1,2026-09-28"), /missing column/);
const fetchedAt = "2026-10-01T12:00:00Z";
const history = buildHistory(salesRows, liveConfig, { weeks: 8, items: 5, fetchedAt });
assert.deepEqual(history.orderTotals.map((bucket) => bucket.orders), [2, 0, 1], "orders are distinct order IDs and empty open hours are zero rows");
const latte = history.itemSales.filter((bucket) => bucket.itemId === "latte-large");
assert.deepEqual(latte.map((bucket) => bucket.units), [3, 0, 2], "units are summed separately from orders");
assert.deepEqual(latte.map((bucket) => bucket.promotion), [false, false, true], "an hour sold below the regular price is a past promotion");
assert.equal(history.orderTotals[2]!.promotion, true);
const latteItem = history.menu.find((item) => item.id === "latte-large")!;
assert.deepEqual([latteItem.regularPriceCents, latteItem.variableCostCents, latteItem.category], [500, 150, "coffee"]);
assert.equal(history.locations[0]!.hourlyCapacityOrders, 3, "capacity falls back to a labeled assumption");
assert.equal(history.assumptions.length, 2);
assert.equal(buildHistory(salesRows, { ...liveConfig, assumeCostShare: undefined }, { weeks: 8, items: 5, fetchedAt }).menu[0]!.variableCostCents, null, "costs stay unknown unless supplied or assumed");
assert.throws(() => buildHistory(salesRows, { ...liveConfig, stores: {} }, { weeks: 8, items: 5, fetchedAt }), /No store settings/);

const store = history.locations[0]!;
const hours = ["08", "09", "10", "11", "12"];
const weather = weatherSignals(store, { time: hours.map((hour) => `2026-10-05T${hour}:00`), precipitation: [9, 0.6, 5, 0, 9], precipitation_probability: [90, 20, 80, 10, 90], apparent_temperature: [15, 15, 15, 31, 15] }, fetchedAt);
assert.deepEqual(
  weather.map((signal) => [signal.title, signal.start, signal.end, signal.assumedOrderAdjustment]),
  [["Heavy rain forecast", "2026-10-05T09:00:00-04:00", "2026-10-05T11:00:00-04:00", -0.2], ["Hot weather forecast", "2026-10-05T11:00:00-04:00", "2026-10-05T12:00:00-04:00", 0.1]],
  "weather outside opening hours is ignored and consecutive hours merge",
);
const holidays = holidaySignals([store], [{ date: "2026-10-12", name: "Columbus Day", global: true }, { date: "2026-10-13", name: "Regional Day", global: false }, { date: "2027-01-01", name: "New Year's Day", global: true }], fetchedAt, "2026-10-01", "2026-11-30");
assert.deepEqual(holidays.map((signal) => [signal.id, signal.assumedOrderAdjustment]), [["holiday-2026-10-12-columbus-day", 0]]);

const snapshot: LiveSnapshot = { version: 1, fetchedAt, source: "check", ...history, contextSignals: [...weather, ...holidays] };
const current = planningDataFromSnapshot(snapshot, { date: "2026-10-05", scenario: "typical" });
assert.ok(current.orderTotals.every((bucket) => bucket.date === "2026-09-28"), "recent history keeps its own dates");
const later = planningDataFromSnapshot(snapshot, { date: "2026-11-11", scenario: "typical" });
assert.ok(later.orderTotals.every((bucket) => bucket.date === "2026-11-09"), "old history is re-dated by whole weeks, keeping the weekday");
assert.ok(later.fixtureLabel.includes("re-dated forward 42 days") && !current.fixtureLabel.includes("re-dated"));
assert.equal(planningDataFromSnapshot(snapshot, { date: "2026-09-28", scenario: "typical" }).orderTotals.length, 0, "history never reaches the planning date");
assert.ok(current.contextSignals.every((signal) => signal.sourceLabel === "public-web") && current.competitorOffers.length === 0);

console.log("✓ data checks passed");
