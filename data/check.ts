import assert from "node:assert/strict";
import { loadPlanningData } from "./index.ts";

const a = loadPlanningData({ date: "2026-10-05", scenario: "typical" });
const b = loadPlanningData({ date: "2026-10-05", scenario: "typical" });
assert.deepEqual(a, b, "fixture loading is deterministic");

assert.equal(a.locations.length, 3);
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

console.log("✓ data checks passed");
