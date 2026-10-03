import assert from "node:assert/strict";
import type { OfferTerms } from "../contracts/index.ts";
import { loadPlanningData } from "../data/index.ts";
import { breakEvenUnits, calculateLocationOutlook, discountedPriceCents, evaluateOffers, selectRecommendedCandidate } from "./index.ts";

const date = "2026-10-05";

// $14 price / $5 cost / 20 units fixture from the design.
const price = discountedPriceCents(1400, 10);
assert.equal(price, 1260);
assert.equal(price - 500, 760);
assert.equal(20 * (1400 - 500), 18_000);
assert.equal(breakEvenUnits(20, 1400, price, 500), 24);
assert.equal(Math.round(26 * (price - 500)), 19_760);
assert.equal(breakEvenUnits(20, 1400, 400, 500), null, "nonpositive contribution must not divide");

const outlookFor = (locationId: string, scenario: "typical" | "local-event") => {
  const data = loadPlanningData({ date, scenario });
  return { data, outlook: calculateLocationOutlook(data, { date, scenario, locationId }) };
};

// Downtown: soft afternoon → discount trial.
{
  const { data, outlook } = outlookFor("downtown", "typical");
  assert.equal(outlook.focusReason, "soft-window");
  assert.deepEqual([outlook.focusWindow.startHour, outlook.focusWindow.endHour], [14, 17]);
  assert.ok(outlook.observationCount >= 7, "promotion hours are excluded but history is not sparse");
  const candidates = evaluateOffers(data, outlook);
  assert.deepEqual(candidates.map((candidate) => candidate.kind), ["no-change", "discount", "discount"]);
  const selection = selectRecommendedCandidate(candidates, outlook);
  const selected = candidates.find((candidate) => candidate.id === selection.selectedCandidateId)!;
  assert.equal(selected.kind, "discount");
  assert.equal(selected.itemName, "Coffee & Pastry Pair");
}

// Arena: event changes only arena event hours, and leads to keep-price.
{
  const typical = outlookFor("arena", "typical").outlook;
  const { data, outlook } = outlookFor("arena", "local-event");
  for (const hour of outlook.hours) {
    const before = typical.hours.find((entry) => entry.hour === hour.hour)!;
    if (hour.hour >= 16 && hour.hour < 20) assert.ok(hour.scenarioOrders > before.scenarioOrders, `event raises ${hour.hour}:00`);
    else assert.equal(hour.scenarioOrders, before.scenarioOrders, `event leaves ${hour.hour}:00 unchanged`);
  }
  assert.ok(outlook.hours.every((hour) => hour.adjustment <= 0.7), "duplicate event records are not stacked");
  assert.equal(outlook.classification, "constrained");
  const candidates = evaluateOffers(data, outlook);
  assert.equal(candidates.find((candidate) => candidate.id === selectRecommendedCandidate(candidates, outlook).selectedCandidateId)!.kind, "no-change");
  assert.ok(candidates.filter((candidate) => candidate.kind === "discount").every((candidate) => candidate.issues.some((issue) => issue.code === "CAPACITY_CONFLICT")));

  const downtownTypical = outlookFor("downtown", "typical").outlook;
  const downtownEvent = outlookFor("downtown", "local-event").outlook;
  assert.deepEqual(downtownEvent.hours, downtownTypical.hours, "arena event does not affect downtown");
}

// Guardrails.
{
  const { data, outlook } = outlookFor("downtown", "typical");
  const terms = (overrides: Partial<OfferTerms>): OfferTerms => ({ locationId: "downtown", itemId: "coffee-pastry-pair", window: { date, startHour: 14, endHour: 17 }, discountPct: 10, ...overrides });
  const issuesFor = (overrides: Partial<OfferTerms>, existing: OfferTerms[] = []) => evaluateOffers(data, outlook, terms(overrides), existing)[1].issues.map((issue) => issue.code);

  assert.ok(issuesFor({ discountPct: 15 }).includes("DISCOUNT_ABOVE_CEILING"));
  assert.ok(issuesFor({ window: { date, startHour: 19, endHour: 22 } }).includes("CLOSED_HOURS"));
  assert.ok(issuesFor({ window: { date, startHour: 16, endHour: 14 } }).includes("INVALID_WINDOW"));
  assert.ok(issuesFor({ itemId: "oat-milk-latte" }).includes("STALE_COST"));
  assert.ok(issuesFor({ itemId: "weekend-breakfast-set" }).includes("ITEM_NOT_ELIGIBLE"));
  assert.ok(issuesFor({}, [terms({ window: { date, startHour: 16, endHour: 18 } })]).includes("OVERLAPPING_OFFER"));
  assert.deepEqual(issuesFor({}), []);

  const missingCost = { ...data, menu: data.menu.map((item) => (item.id === "coffee-pastry-pair" ? { ...item, variableCostCents: null } : item)) };
  assert.ok(evaluateOffers(missingCost, outlook, terms({}))[1].issues.some((issue) => issue.code === "MISSING_COST"));
  const thinMargin = { ...data, chain: { ...data.chain, policy: { ...data.chain.policy, maxDiscountPct: 80 } } };
  assert.ok(evaluateOffers(thinMargin, outlook, terms({ discountPct: 70 }))[1].issues.some((issue) => issue.code === "NONPOSITIVE_CONTRIBUTION"));
  assert.ok(evaluateOffers(thinMargin, outlook, terms({ discountPct: 50 }))[1].issues.some((issue) => issue.code === "BELOW_MIN_CONTRIBUTION"));
}

// Sparse history falls back and reports it.
{
  const data = loadPlanningData({ date, scenario: "typical" });
  const sparse = { ...data, orderTotals: data.orderTotals.filter((bucket) => bucket.date >= "2026-09-20"), itemSales: data.itemSales.filter((bucket) => bucket.date >= "2026-09-20") };
  const outlook = calculateLocationOutlook(sparse, { date, scenario: "typical", locationId: "downtown" });
  assert.equal(outlook.evidenceQuality, "sparse");
  assert.ok(outlook.hours.every((hour) => hour.baselineOrders > 0));
  assert.equal(selectRecommendedCandidate(evaluateOffers(sparse, outlook), outlook).selectedCandidateId.startsWith("no-change"), true);
}

console.log("✓ engine checks passed");
