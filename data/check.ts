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

console.log("✓ data checks passed");
