import type { Chain, CompetitorOffer, ContextSignal, Location, MenuItem } from "../contracts/index.ts";

/** Fictional demo chain. Nothing here is live restaurant, event or competitor data. */
export const FIXTURE_LABEL = "Demo fixtures — fictional chain, events and competitors; not live data";

/** Fixed so the demo is repeatable regardless of today's date. A Monday. */
export const DEFAULT_PLANNING_DATE = "2026-10-05";

/** Last date of the generated sales history (8 weeks ending the day before the demo date). */
export const HISTORY_END_DATE = "2026-10-04";
export const HISTORY_WEEKS = 8;

export const CHAIN: Chain = {
  id: "bowlhouse",
  name: "Bowlhouse",
  currency: "USD",
  policy: {
    maxDiscountPct: 10,
    minContributionPerUnitCents: 300,
    costFreshnessDays: 45,
    capacityWarningShare: 0.9,
  },
};

const TZ = "America/Los_Angeles";

export const LOCATIONS: Location[] = [
  {
    id: "downtown",
    chainId: CHAIN.id,
    name: "Downtown",
    timezone: TZ,
    latitude: 37.7897,
    longitude: -122.4011,
    openingHours: { open: 10, close: 20 },
    hourlyCapacityOrders: 55,
    profile: "Office district: strong weekday lunch, quiet mid-afternoon.",
  },
  {
    id: "arena",
    chainId: CHAIN.id,
    name: "Arena",
    timezone: TZ,
    latitude: 37.768,
    longitude: -122.3877,
    openingHours: { open: 11, close: 22 },
    hourlyCapacityOrders: 40,
    profile: "Next to the arena: demand concentrates before events; small kitchen.",
  },
  {
    id: "residential",
    chainId: CHAIN.id,
    name: "Residential",
    timezone: TZ,
    latitude: 37.7599,
    longitude: -122.4148,
    openingHours: { open: 11, close: 21 },
    hourlyCapacityOrders: 32,
    profile: "Neighborhood store: steady evenings, family orders on weekends.",
  },
];

const ALL = LOCATIONS.map((location) => location.id);

export const MENU: MenuItem[] = [
  { id: "signature-bowl", name: "Signature Bowl", category: "bowl", regularPriceCents: 1400, variableCostCents: 500, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ALL },
  { id: "miso-salmon-bowl", name: "Miso Salmon Bowl", category: "bowl", regularPriceCents: 1600, variableCostCents: 650, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ALL },
  { id: "crispy-chicken-bowl", name: "Crispy Chicken Bowl", category: "bowl", regularPriceCents: 1450, variableCostCents: 575, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ALL },
  // Deliberately stale cost so the guardrail is demonstrable.
  { id: "tofu-greens-bowl", name: "Tofu Greens Bowl", category: "bowl", regularPriceCents: 1200, variableCostCents: 425, costUpdatedAt: "2026-06-01T09:00:00-07:00", eligibleLocationIds: ALL },
  { id: "family-bowl-kit", name: "Family Bowl Kit", category: "bundle", regularPriceCents: 4200, variableCostCents: 1700, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ["residential"] },
];

/** Share of item units by item (before eligibility). Order → units uses UNITS_PER_ORDER. */
export const ITEM_MIX: Record<string, number> = {
  "signature-bowl": 0.36,
  "crispy-chicken-bowl": 0.26,
  "miso-salmon-bowl": 0.2,
  "tofu-greens-bowl": 0.14,
  "family-bowl-kit": 0.04,
};
export const UNITS_PER_ORDER = 1.25;

/** Typical orders per local hour. Hours outside opening hours are closed. */
export const HOURLY_ORDER_PROFILE: Record<string, { weekday: Record<number, number>; weekend: Record<number, number> }> = {
  downtown: {
    weekday: { 10: 14, 11: 38, 12: 46, 13: 30, 14: 12, 15: 9, 16: 11, 17: 18, 18: 16, 19: 10 },
    weekend: { 10: 6, 11: 12, 12: 16, 13: 14, 14: 9, 15: 8, 16: 8, 17: 10, 18: 10, 19: 7 },
  },
  arena: {
    weekday: { 11: 10, 12: 18, 13: 15, 14: 10, 15: 9, 16: 12, 17: 20, 18: 24, 19: 22, 20: 15, 21: 9 },
    weekend: { 11: 12, 12: 20, 13: 18, 14: 14, 15: 13, 16: 15, 17: 22, 18: 25, 19: 22, 20: 16, 21: 10 },
  },
  residential: {
    weekday: { 11: 8, 12: 14, 13: 10, 14: 9, 15: 9, 16: 12, 17: 18, 18: 26, 19: 24, 20: 14 },
    weekend: { 11: 12, 12: 18, 13: 15, 14: 12, 15: 12, 16: 15, 17: 22, 18: 28, 19: 26, 20: 16 },
  },
};

/** One labeled past promotion so the baseline must exclude discounted hours. */
export const HISTORICAL_PROMOTIONS = [
  { locationId: "downtown", itemId: "signature-bowl", date: "2026-09-21", startHour: 14, endHour: 17, discountPct: 10, unitLift: 0.35 },
];

export const CONTEXT_SIGNALS: ContextSignal[] = [
  {
    id: "ctx-arena-concert",
    type: "event",
    title: "Evening concert at the arena (fictional)",
    locationIds: ["arena"],
    scenarioIds: ["local-event"],
    start: "2026-10-05T16:00:00-07:00",
    end: "2026-10-05T20:00:00-07:00",
    distanceKm: 0.3,
    source: "Fixture: arena event calendar",
    sourceLabel: "fixture",
    observedAt: "2026-10-02T10:00:00-07:00",
    dedupeKey: "arena-concert-2026-10-05",
    assumedOrderAdjustment: 0.7,
    assumedUnitAdjustment: 0.7,
    whyItMatters: "Doors open at 18:00; pre-show walk-ups concentrate in the four hours before and during entry.",
  },
  {
    id: "ctx-arena-concert-listing",
    type: "event",
    title: "Same concert, ticketing listing (fictional duplicate)",
    locationIds: ["arena"],
    scenarioIds: ["local-event"],
    start: "2026-10-05T17:00:00-07:00",
    end: "2026-10-05T20:00:00-07:00",
    distanceKm: 0.3,
    source: "Fixture: ticketing listing",
    sourceLabel: "fixture",
    observedAt: "2026-10-02T11:00:00-07:00",
    dedupeKey: "arena-concert-2026-10-05",
    assumedOrderAdjustment: 0.5,
    assumedUnitAdjustment: 0.5,
    whyItMatters: "Second source for the same event; deduplicated so the uplift is not applied twice.",
  },
  {
    id: "ctx-downtown-rain",
    type: "weather",
    title: "Light afternoon rain forecast",
    locationIds: ["downtown"],
    scenarioIds: ["typical", "local-event"],
    start: "2026-10-05T14:00:00-07:00",
    end: "2026-10-05T17:00:00-07:00",
    distanceKm: null,
    source: "Fixture: weather forecast",
    sourceLabel: "fixture",
    observedAt: "2026-10-04T08:00:00-07:00",
    dedupeKey: "downtown-rain-2026-10-05",
    assumedOrderAdjustment: -0.1,
    assumedUnitAdjustment: -0.1,
    whyItMatters: "Downtown afternoon traffic is mostly walk-in office workers; rain is assumed to reduce it slightly.",
  },
  {
    id: "ctx-holiday-lunar-new-year-2026",
    type: "holiday",
    title: "Lunar New Year 2026 (historical example, Feb 17)",
    locationIds: ["residential"],
    scenarioIds: ["typical", "local-event"],
    start: "2026-02-17T00:00:00-08:00",
    end: "2026-02-18T00:00:00-08:00",
    distanceKm: null,
    source: "Fixture: holiday calendar (date varies by year)",
    sourceLabel: "fixture",
    observedAt: "2026-01-05T09:00:00-08:00",
    dedupeKey: "lunar-new-year-2026",
    assumedOrderAdjustment: 0,
    assumedUnitAdjustment: 0,
    whyItMatters: "Kept as a dated example only; eight weeks of history cannot establish an annual holiday effect.",
  },
];

export const COMPETITOR_OFFERS: CompetitorOffer[] = [
  {
    id: "comp-downtown-greenleaf-afternoon",
    locationId: "downtown",
    competitorName: "Greenleaf Bowls (fictional)",
    itemDescription: "Afternoon grain bowl special",
    priceCents: 1150,
    portion: "Regular bowl, smaller protein portion",
    inclusions: "Bowl only",
    channel: "in-store",
    terms: "Weekdays 2–5 p.m.",
    availability: "Mon–Fri 14:00–17:00",
    source: "Fixture: menu board photo",
    sourceLabel: "fixture",
    sourceUrl: null,
    collectedAt: "2026-09-28T16:00:00-07:00",
    comparability: "comparable",
    comparabilityNotes: "Similar bowl and channel; protein portion is smaller than our Signature Bowl.",
  },
  {
    id: "comp-arena-stadium-grill-combo",
    locationId: "arena",
    competitorName: "Stadium Grill (fictional)",
    itemDescription: "Pre-game burger combo",
    priceCents: 1600,
    portion: "Burger, fries",
    inclusions: "Includes a drink",
    channel: "in-store",
    terms: "Event days only",
    availability: "Event days from 16:00",
    source: "Fixture: competitor flyer",
    sourceLabel: "fixture",
    sourceUrl: null,
    collectedAt: "2026-09-30T12:00:00-07:00",
    comparability: "noncomparable",
    comparabilityNotes: "Different category and includes a drink; not a like-for-like bowl price.",
  },
  {
    id: "comp-residential-familyco-meal",
    locationId: "residential",
    competitorName: "FamilyCo Kitchen (fictional)",
    itemDescription: "Family meal for four",
    priceCents: 3800,
    portion: "Four mains, two sides",
    inclusions: "Excludes delivery fee",
    channel: "online",
    terms: "Weekends, online orders",
    availability: "Sat–Sun",
    source: "Fixture: online menu",
    sourceLabel: "fixture",
    sourceUrl: null,
    collectedAt: "2026-09-27T18:00:00-07:00",
    comparability: "comparable",
    comparabilityNotes: "Comparable to our Family Bowl Kit, but online price excludes a delivery fee.",
  },
];
