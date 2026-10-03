import assert from "node:assert/strict";
import type { OfferTerms, PlanningData } from "../contracts/index.ts";
import { loadPlanningData } from "../data/index.ts";
import { breakEvenUnits, BUNDLE_LIMITATION, calculateLocationOutlook, candidateLimitations, DAYPARTS, discountedPriceCents, ENGINE_ASSUMPTIONS, ENGINE_POLICY, evaluateOffers, selectRecommendedCandidate } from "./index.ts";

const date = "2026-10-05";

// $14 price / $5 cost / 20 units fixture from the design.
const price = discountedPriceCents(1400, 10);
assert.equal(price, 1260);
assert.equal(price - 500, 760);
assert.equal(20 * (1400 - 500), 18_000);
assert.equal(breakEvenUnits(20, 1400, price, 500), 24);
assert.equal(Math.round(26 * (price - 500)), 19_760);
assert.equal(breakEvenUnits(20, 1400, 400, 500), null, "nonpositive contribution must not divide");

// The same $14 / $5 / 20-unit example, end to end through the engine on a minimal inline dataset.
{
  const window = { date, startHour: 14, endHour: 17 };
  const unitsByHour: Record<number, number> = { 14: 7, 15: 7, 16: 6 }; // 20 units across the window
  const mondays = ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
  const openHours = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const example: PlanningData = {
    request: { date, scenario: "typical" },
    fixtureLabel: "engine/check.ts inline example",
    chain: { id: "example-chain", name: "Example Chain", currency: "USD", policy: { maxDiscountPct: 10, minContributionPerUnitCents: 300, costFreshnessDays: 60, capacityWarningShare: 0.9 } },
    locations: [{ id: "example", chainId: "example-chain", name: "Example Shop", timezone: "America/Los_Angeles", latitude: 0, longitude: 0, openingHours: { open: 10, close: 20 }, hourlyCapacityOrders: 100, profile: "inline example" }],
    menu: [{ id: "example-pair", name: "Example Pair", category: "bundle", offerEligible: true, regularPriceCents: 1400, variableCostCents: 500, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ["example"] }],
    orderTotals: mondays.flatMap((day) => openHours.map((hour) => ({ locationId: "example", date: day, hour, orders: 10, promotion: false }))),
    itemSales: mondays.flatMap((day) =>
      openHours.map((hour) => {
        const units = unitsByHour[hour] ?? 10;
        return { locationId: "example", itemId: "example-pair", date: day, hour, units, revenueCents: units * 1400, effectivePriceCents: 1400, promotion: false };
      }),
    ),
    contextSignals: [],
    competitorOffers: [],
  };
  const outlook = calculateLocationOutlook(example, { date, scenario: "typical", locationId: "example" });
  assert.equal(outlook.evidenceQuality, "good");
  const [keepPrice, tenPct] = evaluateOffers(example, outlook, { locationId: "example", itemId: "example-pair", window, discountPct: 10 });

  assert.equal(keepPrice.kind, "no-change");
  assert.equal(keepPrice.referenceUnits, 20);
  assert.equal(keepPrice.referenceContributionCents, 18_000, "baseline contribution is $180");

  assert.deepEqual(tenPct.issues, []);
  assert.equal(tenPct.valid, true);
  assert.equal(tenPct.proposedPriceCents, 1260);
  assert.equal(tenPct.contributionPerUnitCents, 760);
  assert.equal(tenPct.referenceUnits, 20);
  assert.equal(tenPct.referenceContributionCents, 18_000);
  assert.equal(tenPct.breakEvenUnits, 24);
  // The 26-unit scenario from the design is the high response here (20 units + 30%).
  const high = tenPct.responseScenarios.find((scenario) => scenario.label === "high")!;
  assert.equal(high.units, 26);
  assert.equal(high.contributionCents, 19_760, "26 units at $7.60 is $197.60");
  assert.ok(high.units >= tenPct.breakEvenUnits! && high.contributionCents > tenPct.referenceContributionCents!, "26 units clears the 24-unit break-even");
  assert.equal(26 * tenPct.contributionPerUnitCents!, 19_760);
  assert.equal(breakEvenUnits(tenPct.referenceUnits, tenPct.regularPriceCents, tenPct.proposedPriceCents, tenPct.variableCostCents!), 24);
}

const outlookFor = (locationId: string, scenario: "typical" | "local-event") => {
  const data = loadPlanningData({ date, scenario });
  return { data, outlook: calculateLocationOutlook(data, { date, scenario, locationId }) };
};

// Downtown: soft afternoon, but under the conservative response assumptions (C1)
// neither discount's base scenario reaches break-even → keep price.
{
  const { data, outlook } = outlookFor("downtown", "typical");
  assert.equal(outlook.focusReason, "soft-window");
  assert.deepEqual([outlook.focusWindow.startHour, outlook.focusWindow.endHour], [14, 17]);
  assert.ok(outlook.observationCount >= 7, "promotion hours are excluded but history is not sparse");
  const candidates = evaluateOffers(data, outlook);
  assert.deepEqual(candidates.map((candidate) => candidate.kind), ["no-change", "discount", "discount"]);
  assert.ok(candidates.every((candidate) => candidate.itemName === "Coffee & Pastry Pair"));

  // Response assumptions: low = no response, base = 1.5 × discount %, high = 3 × discount %.
  const [, fivePct, tenPct] = candidates;
  assert.deepEqual(fivePct.responseScenarios.map((scenario) => [scenario.label, scenario.assumedUnitChange]), [["low", 0], ["base", 0.075], ["high", 0.15]]);
  assert.deepEqual(tenPct.responseScenarios.map((scenario) => [scenario.label, scenario.assumedUnitChange]), [["low", 0], ["base", 0.15], ["high", 0.3]]);
  for (const candidate of [fivePct, tenPct]) {
    const [low, base] = candidate.responseScenarios;
    assert.equal(low.units, candidate.referenceUnits, "low scenario assumes no extra units");
    assert.ok(low.contributionCents < candidate.referenceContributionCents!, "a discount with no response loses contribution");
    assert.ok(candidate.valid && base.units < candidate.breakEvenUnits!, "base response stays below break-even");
  }

  // Not capacity-constrained, so the capacity cap (C2) leaves Downtown's numbers unchanged.
  assert.ok(outlook.hours.every((hour) => hour.scenarioOrders < hour.capacityOrders && hour.serviceableOrders === hour.scenarioOrders));
  assert.ok(!outlook.notes.some((note) => note.includes("scaled to serviceable orders")));
  assert.deepEqual(candidates.map((candidate) => [candidate.referenceUnits, candidate.referenceContributionCents, candidate.breakEvenUnits]), [[13.5, 12_150, null], [13.5, 12_150, 15], [13.5, 12_150, 16]]);
  assert.deepEqual(fivePct.responseScenarios.map((scenario) => [scenario.units, scenario.contributionCents]), [[13.5, 11_205], [14.5, 12_035], [15.5, 12_865]]);
  assert.deepEqual(tenPct.responseScenarios.map((scenario) => [scenario.units, scenario.contributionCents]), [[13.5, 10_260], [15.5, 11_780], [17.6, 13_376]]);

  const selection = selectRecommendedCandidate(candidates, outlook);
  assert.equal(selection.selectedCandidateId, candidates[0].id);
  assert.match(selection.reason, /no discount clears its break-even/);
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

  // Capacity cap (C2): units follow serviceable orders, and no response scenario implies orders above capacity.
  const overCapacity = outlook.hours.filter((hour) => hour.scenarioOrders > hour.capacityOrders);
  assert.deepEqual(overCapacity.map((hour) => hour.hour), [18]);
  assert.ok(outlook.notes.some((note) => note.includes("scaled to serviceable orders")));
  const { itemId, window } = candidates[0].terms;
  const itemHours = outlook.items.find((entry) => entry.itemId === itemId)!.hours.filter((hour) => hour.hour >= window.startHour && hour.hour < window.endHour);
  // Raw demand: the same day with capacity lifted out of the way.
  const unconstrained = { ...data, locations: data.locations.map((location) => (location.id === "arena" ? { ...location, hourlyCapacityOrders: 1000 } : location)) };
  const rawItemHours = calculateLocationOutlook(unconstrained, { date, scenario: "local-event", locationId: "arena" }).items.find((entry) => entry.itemId === itemId)!.hours;
  let maxServiceableUnits = 0;
  for (const itemHour of itemHours) {
    const hour = outlook.hours.find((entry) => entry.hour === itemHour.hour)!;
    const rawUnits = rawItemHours.find((entry) => entry.hour === itemHour.hour)!.scenarioUnits;
    if (hour.scenarioOrders > hour.capacityOrders) {
      assert.ok(itemHour.scenarioUnits < rawUnits, `units at ${hour.hour}:00 are scaled below raw demand`);
      assert.ok(Math.abs(itemHour.scenarioUnits - (rawUnits * hour.serviceableOrders) / hour.scenarioOrders) < 0.1, "scaled by the serviceable share of orders");
    } else assert.equal(itemHour.scenarioUnits, rawUnits, `units at ${hour.hour}:00 are not scaled`);
    maxServiceableUnits += (itemHour.scenarioUnits * hour.capacityOrders) / hour.serviceableOrders;
  }
  assert.equal(candidates[0].referenceUnits, Math.round(itemHours.reduce((total, hour) => total + hour.scenarioUnits, 0) * 10) / 10);
  for (const candidate of candidates.filter((entry) => entry.kind === "discount")) {
    for (const scenario of candidate.responseScenarios) {
      assert.ok(scenario.units >= candidate.referenceUnits, "the cap never pushes units below the regular-price reference");
      assert.ok(scenario.units <= maxServiceableUnits + 0.05, `${candidate.terms.discountPct}% ${scenario.label} stays within serviceable units`);
      assert.equal(scenario.contributionCents, Math.round(scenario.units * candidate.contributionPerUnitCents!));
    }
    const high = candidate.responseScenarios.at(-1)!;
    assert.ok(high.units < candidate.referenceUnits * (1 + high.assumedUnitChange) - 0.05, "the high response is capped by capacity");
    assert.ok(candidate.breakEvenUnits! > maxServiceableUnits, "break-even is out of reach within capacity");
  }

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
  const [keepPriceNoCost, discountNoCost] = evaluateOffers(missingCost, outlook, terms({}));
  assert.ok(discountNoCost.issues.some((issue) => issue.code === "MISSING_COST" && issue.severity === "error"));
  assert.equal(discountNoCost.valid, false);
  // Keep-price with an unknown cost is flagged as a warning and stays approvable.
  assert.deepEqual(keepPriceNoCost.issues.map((issue) => [issue.code, issue.severity]), [["MISSING_COST", "warning"]]);
  assert.equal(keepPriceNoCost.valid, true);
  assert.equal(keepPriceNoCost.contributionPerUnitCents, null);
  assert.deepEqual(evaluateOffers(data, outlook, terms({}))[0].issues, [], "keep-price with a known cost carries no issue");
  const thinMargin = { ...data, chain: { ...data.chain, policy: { ...data.chain.policy, maxDiscountPct: 80 } } };
  assert.ok(evaluateOffers(thinMargin, outlook, terms({ discountPct: 70 }))[1].issues.some((issue) => issue.code === "NONPOSITIVE_CONTRIBUTION"));
  assert.ok(evaluateOffers(thinMargin, outlook, terms({ discountPct: 50 }))[1].issues.some((issue) => issue.code === "BELOW_MIN_CONTRIBUTION"));
}

// Sparse history uses the documented daypart fallback and reports it.
{
  const data = loadPlanningData({ date, scenario: "typical" });
  const recent = <T extends { date: string }>(buckets: T[]) => buckets.filter((bucket) => bucket.date >= "2026-09-20");
  const sparse = { ...data, orderTotals: recent(data.orderTotals), itemSales: recent(data.itemSales) };
  const outlook = calculateLocationOutlook(sparse, { date, scenario: "typical", locationId: "downtown" });
  assert.equal(outlook.evidenceQuality, "sparse");
  assert.ok(outlook.hours.every((hour) => hour.baselineOrders > 0));
  assert.ok(outlook.items.every((item) => item.hours.every((hour) => hour.baselineUnits > 0)));
  assert.ok(outlook.notes.some((note) => note.includes("order history") && note.includes("daypart fallback used")));

  // Every hour in a daypart shares that daypart's average; the dayparts differ from each other.
  assert.deepEqual(DAYPARTS.map((daypart) => [daypart.id, daypart.startHour, daypart.endHour]), [["morning", 0, 11], ["lunch", 11, 14], ["afternoon", 14, 17], ["dinner", 17, 24]]);
  const byDaypart = DAYPARTS.map((daypart) => outlook.hours.filter((hour) => hour.hour >= daypart.startHour && hour.hour < daypart.endHour).map((hour) => hour.baselineOrders));
  assert.deepEqual(byDaypart.map((orders) => orders.length), [1, 3, 3, 3], "downtown opens at 10:00, so one morning hour");
  for (const orders of byDaypart) assert.equal(new Set(orders).size, 1);
  assert.equal(new Set(byDaypart.map((orders) => orders[0])).size, DAYPARTS.length);
  // The lunch value is the mean of the weekday lunch-hour buckets, not a single hour's history.
  const lunchBuckets = sparse.orderTotals.filter((bucket) => bucket.locationId === "downtown" && bucket.hour >= 11 && bucket.hour < 14 && !bucket.promotion && ![0, 6].includes(new Date(`${bucket.date}T12:00:00Z`).getUTCDay()));
  assert.equal(byDaypart[1][0], Math.round((lunchBuckets.reduce((total, bucket) => total + bucket.orders, 0) / lunchBuckets.length) * 10) / 10);
  assert.equal(selectRecommendedCandidate(evaluateOffers(sparse, outlook), outlook).selectedCandidateId.startsWith("no-change"), true);

  // Evidence quality is the worse of order and item history.
  const itemSparse = { ...data, itemSales: recent(data.itemSales) };
  const itemOutlook = calculateLocationOutlook(itemSparse, { date, scenario: "typical", locationId: "downtown" });
  assert.equal(itemOutlook.evidenceQuality, "sparse");
  assert.deepEqual(itemOutlook.hours, outlookFor("downtown", "typical").outlook.hours, "order baselines are untouched");
  assert.ok(itemOutlook.notes.some((note) => note.startsWith("Order history is sufficient, but item sales history is sparse")));
  assert.ok(!itemOutlook.notes.some((note) => note.includes("order history;")));
  assert.ok(evaluateOffers(itemSparse, itemOutlook).filter((candidate) => candidate.kind === "discount").every((candidate) => candidate.issues.some((issue) => issue.code === "SPARSE_HISTORY")));
}

// Assumptions name the daypart fallback, cannibalization and the break-even basis.
for (const phrase of ["daypart", "cannibalization", "Break-even compares against expected units at the regular price"]) {
  assert.ok(ENGINE_ASSUMPTIONS.some((assumption) => assumption.includes(phrase)), `assumptions mention ${phrase}`);
}

// ENGINE_POLICY holds every tunable; the cautious sparse trial is off by default.
{
  assert.deepEqual(
    { ...ENGINE_POLICY, dayparts: ENGINE_POLICY.dayparts.map((daypart) => daypart.id) },
    {
      comparableWeeks: 8,
      minObservations: 4,
      adjustmentBounds: { min: -0.5, max: 1 },
      focusWindowHours: 3,
      softWindowShare: 0.6,
      classificationThreshold: 0.1,
      responsePerDiscountPct: { low: 0, base: 1.5, high: 3 },
      dayparts: ["morning", "lunch", "afternoon", "dinner"],
      sparseTrial: false,
    },
  );
  assert.equal(DAYPARTS, ENGINE_POLICY.dayparts);

  const data = loadPlanningData({ date, scenario: "typical" });
  const recent = <T extends { date: string }>(buckets: T[]) => buckets.filter((bucket) => bucket.date >= "2026-09-20");
  const sparse = { ...data, orderTotals: recent(data.orderTotals), itemSales: recent(data.itemSales) };
  const outlook = calculateLocationOutlook(sparse, { date, scenario: "typical", locationId: "downtown" });
  assert.equal(outlook.evidenceQuality, "sparse");
  assert.equal(outlook.focusReason, "soft-window");
  const kindAndPct = (candidates: ReturnType<typeof evaluateOffers>, sparseTrial?: boolean, from = outlook) => {
    const selection = sparseTrial === undefined ? selectRecommendedCandidate(candidates, from) : selectRecommendedCandidate(candidates, from, { sparseTrial });
    const selected = candidates.find((candidate) => candidate.id === selection.selectedCandidateId)!;
    return { kind: selected.kind, pct: selected.terms.discountPct, reason: selection.reason };
  };

  // Fixture costs: even the 5% base scenario misses break-even, so both settings keep price.
  const atFixtureCost = evaluateOffers(sparse, outlook);
  assert.equal(kindAndPct(atFixtureCost).kind, "no-change");
  assert.equal(kindAndPct(atFixtureCost, false).kind, "no-change");
  assert.equal(kindAndPct(atFixtureCost, true).kind, "no-change");

  // A low-cost, high-volume item where both discounts clear break-even in the base scenario.
  // (Volume matters: break-even rounds up to whole units, which a +7.5% response on ~13 units cannot reach.)
  const itemId = atFixtureCost[0].terms.itemId;
  const lowCost = {
    ...sparse,
    menu: sparse.menu.map((item) => (item.id === itemId ? { ...item, variableCostCents: 100 } : item)),
    itemSales: sparse.itemSales.map((bucket) => (bucket.itemId === itemId ? { ...bucket, units: bucket.units * 10 } : bucket)),
  };
  const lowCostOutlook = calculateLocationOutlook(lowCost, { date, scenario: "typical", locationId: "downtown" });
  assert.deepEqual([lowCostOutlook.evidenceQuality, lowCostOutlook.focusReason], ["sparse", "soft-window"]);
  const candidates = evaluateOffers(lowCost, lowCostOutlook);
  assert.equal(candidates[0].terms.itemId, itemId);
  for (const candidate of candidates.filter((entry) => entry.kind === "discount")) {
    assert.ok(candidate.valid && candidate.responseScenarios[1].units >= candidate.breakEvenUnits!, `${candidate.terms.discountPct}% clears break-even at low cost`);
  }
  assert.equal(kindAndPct(candidates, undefined, lowCostOutlook).kind, "no-change", "default policy keeps price on sparse history");
  assert.equal(kindAndPct(candidates, false, lowCostOutlook).kind, "no-change");
  const trial = kindAndPct(candidates, true, lowCostOutlook);
  assert.deepEqual([trial.kind, trial.pct], ["discount", 5], "the trial allows only the smallest discount, never 10%");
  assert.match(trial.reason, /Cautious trial of 5% off/);

  // The switch has no effect when history is good or when capacity is the concern.
  for (const [locationId, scenario] of [["downtown", "typical"], ["arena", "local-event"]] as const) {
    const good = outlookFor(locationId, scenario);
    const goodCandidates = evaluateOffers(good.data, good.outlook);
    assert.deepEqual(selectRecommendedCandidate(goodCandidates, good.outlook, { sparseTrial: true }), selectRecommendedCandidate(goodCandidates, good.outlook));
  }
}

// Bundles, offer eligibility and location eligibility (C3).
{
  assert.match(BUNDLE_LIMITATION, /cannibalization/);
  assert.match(BUNDLE_LIMITATION, /covering every component/);
  assert.ok(ENGINE_ASSUMPTIONS.includes(BUNDLE_LIMITATION));

  for (const locationId of ["downtown", "arena", "residential"]) {
    for (const scenario of ["typical", "local-event"] as const) {
      const { data, outlook } = outlookFor(locationId, scenario);
      const candidates = evaluateOffers(data, outlook);
      for (const candidate of candidates) {
        const item = data.menu.find((entry) => entry.id === candidate.terms.itemId)!;
        assert.ok(item.offerEligible, `${item.name} is offer-eligible`);
        assert.notEqual(item.id, "drip-coffee", "Drip Coffee never gets a default candidate");
        assert.ok(item.eligibleLocationIds.includes(locationId));
        // The default item is the Coffee & Pastry Pair, a predefined bundle: every candidate carries the note.
        assert.equal(item.category, "bundle");
        assert.deepEqual(candidateLimitations(data, candidate), [BUNDLE_LIMITATION]);
      }
      // The Weekend Breakfast Set only appears at Residential.
      assert.equal(outlook.items.some((item) => item.itemId === "weekend-breakfast-set"), locationId === "residential");
    }
  }

  const { data, outlook } = outlookFor("downtown", "typical");
  const window = { date, startHour: 14, endHour: 17 };
  // A non-bundle item carries no bundle note.
  const latte = evaluateOffers(data, outlook, { locationId: "downtown", itemId: "iced-latte", window, discountPct: 5 });
  assert.ok(latte.every((candidate) => candidateLimitations(data, candidate).length === 0));
  assert.equal(latte[1].valid, true);
  // Drip Coffee cannot be discounted even when a manager asks for it; keeping its price is fine.
  const [dripKeep, dripDiscount] = evaluateOffers(data, outlook, { locationId: "downtown", itemId: "drip-coffee", window, discountPct: 5 });
  assert.deepEqual(dripKeep.issues, []);
  assert.ok(dripDiscount.issues.some((issue) => issue.code === "ITEM_NOT_ELIGIBLE" && issue.severity === "error"));
  assert.equal(dripDiscount.valid, false);
  // The Weekend Breakfast Set is rejected outside Residential and accepted there.
  assert.equal(evaluateOffers(data, outlook, { locationId: "downtown", itemId: "weekend-breakfast-set", window, discountPct: 5 })[1].valid, false);
  const residential = outlookFor("residential", "typical");
  const breakfast = evaluateOffers(residential.data, residential.outlook, { locationId: "residential", itemId: "weekend-breakfast-set", window: { date, startHour: 13, endHour: 16 }, discountPct: 5 })[1];
  assert.ok(!breakfast.issues.some((issue) => issue.code === "ITEM_NOT_ELIGIBLE"));
}

console.log("✓ engine checks passed");
