import type { Chain, CompetitorOffer, ContextSignal, Location, MenuItem } from "../contracts/index.ts";
import type { CompetitorProfile } from "../intelligence/competitorResearch.ts";

/** Fictional demo chain. Nothing here is live restaurant, event or competitor data. */
export const FIXTURE_LABEL = "Demo fixtures — fictional coffee chain, events and competitors; not live data";

/** Fixed so the demo is repeatable regardless of today's date. A Monday. */
export const DEFAULT_PLANNING_DATE = "2026-10-05";

/** Last date of the generated sales history (8 weeks ending the day before the demo date). */
export const HISTORY_END_DATE = "2026-10-04";
export const HISTORY_WEEKS = 8;

export const CHAIN: Chain = {
  id: "harborline-coffee",
  name: "Disney Cafe",
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
    profile: "Office district: strong weekday coffee rush, quiet mid-afternoon.",
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
    profile: "Near the arena: demand concentrates before events; small espresso bar.",
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
    profile: "Neighborhood café: steady mornings and weekend breakfast orders.",
  },
];

/**
 * SF pilot research configuration. These are named public businesses and their
 * primary domains, not fixture offers and not evidence that a current price or
 * promotion exists. A research result still requires manager review.
 */
export const SF_COMPETITOR_PROFILES: Record<string, CompetitorProfile[]> = {
  downtown: [
    { id: "blue-bottle-downtown", name: "Blue Bottle Coffee", officialDomains: ["bluebottlecoffee.com"], locationAliases: ["Downtown San Francisco", "Financial District"] },
    { id: "philz-downtown", name: "Philz Coffee", officialDomains: ["philzcoffee.com"], locationAliases: ["Downtown San Francisco", "Financial District"] },
  ],
  arena: [
    { id: "blue-bottle-mission-bay", name: "Blue Bottle Coffee", officialDomains: ["bluebottlecoffee.com"], locationAliases: ["Mission Bay", "Chase Center"] },
    { id: "sightglass-mission-bay", name: "Sightglass Coffee", officialDomains: ["sightglasscoffee.com"], locationAliases: ["Mission Bay", "Dogpatch"] },
  ],
  residential: [
    { id: "ritual-mission", name: "Ritual Coffee Roasters", officialDomains: ["ritualcoffee.com"], locationAliases: ["Mission District", "Valencia Street"] },
    { id: "four-barrel-mission", name: "Four Barrel Coffee", officialDomains: ["fourbarrelcoffee.com"], locationAliases: ["Mission District", "Valencia Street"] },
  ],
};

const ALL = LOCATIONS.map((location) => location.id);

export const MENU: MenuItem[] = [
  { id: "coffee-pastry-pair", name: "Coffee & Pastry Pair", category: "bundle", offerEligible: true, regularPriceCents: 1400, variableCostCents: 500, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ALL },
  { id: "iced-latte", name: "Iced Latte", category: "coffee", offerEligible: true, regularPriceCents: 650, variableCostCents: 230, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ALL },
  { id: "drip-coffee", name: "Drip Coffee", category: "coffee", offerEligible: false, regularPriceCents: 400, variableCostCents: 100, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ALL },
  // Deliberately stale cost so the guardrail is demonstrable.
  { id: "oat-milk-latte", name: "Oat Milk Latte", category: "coffee", offerEligible: true, regularPriceCents: 700, variableCostCents: 280, costUpdatedAt: "2026-06-01T09:00:00-07:00", eligibleLocationIds: ALL },
  { id: "weekend-breakfast-set", name: "Weekend Breakfast Set", category: "food", offerEligible: true, regularPriceCents: 1500, variableCostCents: 600, costUpdatedAt: "2026-09-15T09:00:00-07:00", eligibleLocationIds: ["residential"] },
];

/** Share of item units by item (before eligibility). Order → units uses UNITS_PER_ORDER. */
export const ITEM_MIX: Record<string, number> = {
  "coffee-pastry-pair": 0.36,
  "iced-latte": 0.27,
  "drip-coffee": 0.2,
  "oat-milk-latte": 0.13,
  "weekend-breakfast-set": 0.04,
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
  { locationId: "downtown", itemId: "coffee-pastry-pair", date: "2026-09-21", startHour: 14, endHour: 17, discountPct: 10, unitLift: 0.35 },
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
    id: "comp-downtown-market-cup-afternoon",
    locationId: "downtown",
    competitorName: "Market Cup Coffee (fictional)",
    itemDescription: "Afternoon coffee and pastry pair",
    priceCents: 1200,
    portion: "12 oz coffee and pastry",
    inclusions: "Coffee and one pastry",
    channel: "in-store",
    terms: "Weekdays 2–5 p.m.",
    availability: "Mon–Fri 14:00–17:00",
    source: "Fixture: menu board photo",
    sourceLabel: "fixture",
    sourceUrl: null,
    collectedAt: "2026-09-28T16:00:00-07:00",
    comparability: "comparable",
    comparabilityNotes: "Similar coffee-and-pastry bundle and in-store channel; size may differ from our Coffee & Pastry Pair.",
  },
  {
    id: "comp-arena-stadium-espresso-combo",
    locationId: "arena",
    competitorName: "Stadium Espresso (fictional)",
    itemDescription: "Pre-event espresso and snack combo",
    priceCents: 1100,
    portion: "Double espresso and snack",
    inclusions: "Includes a snack",
    channel: "in-store",
    terms: "Event days only",
    availability: "Event days from 16:00",
    source: "Fixture: competitor flyer",
    sourceLabel: "fixture",
    sourceUrl: null,
    collectedAt: "2026-09-30T12:00:00-07:00",
    comparability: "noncomparable",
    comparabilityNotes: "Different service format and event window; not a like-for-like coffee offer.",
  },
  {
    id: "comp-residential-neighborhood-breakfast-set",
    locationId: "residential",
    competitorName: "Neighborhood Roasters (fictional)",
    itemDescription: "Weekend coffee and breakfast set",
    priceCents: 1400,
    portion: "Two coffees and a pastry",
    inclusions: "Excludes delivery fee",
    channel: "online",
    terms: "Weekends, online orders",
    availability: "Sat–Sun",
    source: "Fixture: online menu",
    sourceLabel: "fixture",
    sourceUrl: null,
    collectedAt: "2026-09-27T18:00:00-07:00",
    comparability: "comparable",
    comparabilityNotes: "Comparable to our Weekend Breakfast Set, but online price excludes a delivery fee.",
  },
];
