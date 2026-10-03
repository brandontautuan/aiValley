import { loadPlanningData } from "./fixtures.ts";
import { createPlanStore } from "./persistence.ts";

const data = loadPlanningData();
if (data.locations.length !== 3) throw new Error("Expected three fixture locations");
if (!data.menu.every((item) => Number.isInteger(item.regularPriceCents) && Number.isInteger(item.variableCostCents))) {
  throw new Error("Menu money must be integer cents");
}

const store = createPlanStore();
store.save({
  id: "check-plan",
  recommendationId: "check-recommendation",
  revision: 1,
  locationId: "downtown",
  status: "approved",
  savedAt: "2026-10-03T12:00:00-07:00",
});
if (store.list().length !== 1) throw new Error("Expected plan-store round trip");

console.log("Platform checks passed");
