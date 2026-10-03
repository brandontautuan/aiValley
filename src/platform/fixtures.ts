import type { PlanningData } from "../contracts/index.ts";

/** Stable demo data; live/Tavily research never mutates this fixture snapshot. */
export function loadPlanningData(planningDate = "2026-10-04"): PlanningData {
  return {
    planningDate,
    fixtureLabel: "Demo fixtures — not live restaurant or competitor data",
    locations: [
      { id: "downtown", name: "Downtown", timezone: "America/Los_Angeles", hourlyCapacityOrders: 42 },
      { id: "arena", name: "Arena", timezone: "America/Los_Angeles", hourlyCapacityOrders: 48 },
      { id: "residential", name: "Residential", timezone: "America/Los_Angeles", hourlyCapacityOrders: 35 },
    ],
    menu: [
      { id: "signature-bowl", name: "Signature Bowl", regularPriceCents: 1400, variableCostCents: 500 },
      { id: "miso-salmon-bowl", name: "Miso Salmon Bowl", regularPriceCents: 1600, variableCostCents: 650 },
      { id: "tofu-greens-bowl", name: "Tofu Greens Bowl", regularPriceCents: 1200, variableCostCents: 425 },
      { id: "crispy-chicken-bowl", name: "Crispy Chicken Bowl", regularPriceCents: 1450, variableCostCents: 575 },
      { id: "family-bowl-kit", name: "Family Bowl Kit", regularPriceCents: 4200, variableCostCents: 1700 },
    ],
    competitorOffers: [
      {
        id: "fixture-downtown-afternoon",
        locationId: "downtown",
        competitorName: "Example nearby bowl shop",
        sourceLabel: "fixture",
        collectedAt: "2026-09-28T16:00:00-07:00",
        comparability: "noncomparable",
        notes: "Fixture only; manager must review live research before relying on a comparable offer.",
      },
    ],
  };
}
