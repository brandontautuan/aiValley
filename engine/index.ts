import type {
  ContextSignal,
  HourOutlook,
  ItemOutlook,
  Location,
  LocationOutlook,
  OfferCandidate,
  OfferTerms,
  OfferWindow,
  PlanningData,
  PlanningRequest,
  ResponseScenario,
  Selection,
  ValidationIssue,
} from "../contracts/index.ts";

/** Pure, deterministic demand and pricing functions. No I/O, no model calls. */

/**
 * Every tunable the engine uses, in one place. These are judgment calls, not measured values.
 * Changing a value here changes engine behavior; `sparseTrial` is the only switch.
 */
export const ENGINE_POLICY = {
  /** Most recent same-weekday observations averaged into a baseline. */
  comparableWeeks: 8,
  /** Fewer same-weekday observations than this triggers the daypart fallback. */
  minObservations: 4,
  /** Bounds on the combined context adjustment for one hour. */
  adjustmentBounds: { min: -0.5, max: 1.0 },
  focusWindowHours: 3,
  /** A window averaging below this share of the day's average hour counts as soft. */
  softWindowShare: 0.6,
  /** Change vs. usual at or beyond this share classifies the day as busy or soft. */
  classificationThreshold: 0.1,
  /**
   * Assumed unit change per 1% discount (low/base/high). An explicit assumption, not elasticity.
   * Low means no response: nobody buys more because of the offer.
   */
  responsePerDiscountPct: { low: 0, base: 1.5, high: 3 } as Record<ResponseScenario["label"], number>,
  /**
   * Dayparts used by the sparse-history fallback. Local hours, start-inclusive, end-exclusive.
   * "morning" only applies to locations that open before 11:00; "dinner" runs to close.
   */
  dayparts: [
    { id: "morning", label: "morning (open–11:00)", startHour: 0, endHour: 11 },
    { id: "lunch", label: "lunch (11:00–14:00)", startHour: 11, endHour: 14 },
    { id: "afternoon", label: "afternoon (14:00–17:00)", startHour: 14, endHour: 17 },
    { id: "dinner", label: "dinner (17:00–close)", startHour: 17, endHour: 24 },
  ] as const,
  /**
   * Cautious trial: when history is sparse and the window is soft, allow only the smallest
   * discount, and only if its base scenario clears break-even. Off by default (keep price).
   */
  sparseTrial: false as boolean,
};

const {
  comparableWeeks: COMPARABLE_WEEKS,
  minObservations: MIN_OBSERVATIONS,
  adjustmentBounds: ADJUSTMENT_BOUNDS,
  focusWindowHours: FOCUS_WINDOW_HOURS,
  softWindowShare: SOFT_WINDOW_SHARE,
  classificationThreshold: CLASSIFICATION_THRESHOLD,
  responsePerDiscountPct: RESPONSE_PER_DISCOUNT_PCT,
} = ENGINE_POLICY;
export const DAYPARTS = ENGINE_POLICY.dayparts;
const RESPONSE_LABELS: Array<ResponseScenario["label"]> = ["low", "base", "high"];

/** Assumed unit change vs. regular price for a scenario, e.g. 0.15 = +15%. */
const assumedUnitChange = (label: ResponseScenario["label"], discountPct: number) => (RESPONSE_PER_DISCOUNT_PCT[label] * discountPct) / 100;

type Daypart = (typeof DAYPARTS)[number];
const daypartOf = (hour: number): Daypart => DAYPARTS.find((daypart) => hour >= daypart.startHour && hour < daypart.endHour)!;

/** Limitation that applies to every candidate whose item is a predefined bundle. */
export const BUNDLE_LIMITATION =
  "Bundle offers: the bundle's variable cost is taken as covering every component, and scenarios do not model customers switching from the separate items to the bundle (substitution/cannibalization).";

export const ENGINE_ASSUMPTIONS = [
  "Context adjustments are fixture assumptions, not calibrated effects.",
  "Discount response is an assumption, not elasticity learned from traffic: low = +0% units (no response), base = 1.5× the discount percentage, high = 3× (10% off → +0% / +15% / +30%).",
  "Contribution is before fixed costs; it is not total restaurant profit.",
  "Item mix is assumed unchanged by context adjustments.",
  `Sparse history: an hour with fewer than ${MIN_OBSERVATIONS} same-weekday observations uses the average hour of its daypart (${DAYPARTS.map((daypart) => daypart.label).join(", ")}) across weekdays or weekends.`,
  "Discount scenarios ignore substitution and cannibalization: demand shifted from other items or from other hours is not modeled.",
  "Break-even compares against expected units at the regular price for this scenario, not the raw historical baseline.",
  BUNDLE_LIMITATION,
  "Units per order are assumed stable: when an hour's expected orders exceed capacity, item units are scaled down to the serviceable share, and a discount's assumed response is capped where the implied orders would exceed capacity.",
];

const round1 = (value: number) => Math.round(value * 10) / 10;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function isWeekend(date: string): boolean {
  const day = weekdayOf(date);
  return day === 0 || day === 6;
}

/** "YYYY-MM-DDTHH:mm" in the location's timezone, comparable as a string. */
export function toLocalKey(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const hourKey = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00`;

function signalCoversHour(signal: ContextSignal, location: Location, date: string, hour: number): boolean {
  if (!signal.locationIds.includes(location.id)) return false;
  const start = toLocalKey(signal.start, location.timezone);
  const end = toLocalKey(signal.end, location.timezone);
  return start < hourKey(date, hour + 1) && end > hourKey(date, hour);
}

/** Combined adjustment for one hour: one record per dedupe key, bounded. */
function hourAdjustment(signals: ContextSignal[], location: Location, date: string, hour: number, field: "assumedOrderAdjustment" | "assumedUnitAdjustment") {
  const byKey = new Map<string, ContextSignal>();
  for (const signal of signals) {
    if (!signalCoversHour(signal, location, date, hour) || signal[field] === 0) continue;
    const current = byKey.get(signal.dedupeKey);
    if (!current || Math.abs(signal[field]) > Math.abs(current[field])) byKey.set(signal.dedupeKey, signal);
  }
  const applied = [...byKey.values()];
  const raw = sum(applied.map((signal) => signal[field]));
  return {
    adjustment: Math.min(ADJUSTMENT_BOUNDS.max, Math.max(ADJUSTMENT_BOUNDS.min, raw)),
    signalIds: applied.map((signal) => signal.id),
  };
}

function averageOf<T extends { date: string; hour: number; promotion: boolean }>(
  buckets: T[],
  date: string,
  hour: number,
  value: (bucket: T) => number,
): { mean: number; count: number; fallback: boolean; daypart: Daypart } {
  const weekday = weekdayOf(date);
  const daypart = daypartOf(hour);
  const sameWeekday = buckets
    .filter((bucket) => bucket.hour === hour && !bucket.promotion && bucket.date < date && weekdayOf(bucket.date) === weekday)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, COMPARABLE_WEEKS);
  if (sameWeekday.length >= MIN_OBSERVATIONS) {
    return { mean: sum(sameWeekday.map(value)) / sameWeekday.length, count: sameWeekday.length, fallback: false, daypart };
  }
  // Sparse fallback: the average hour of this hour's daypart, across weekdays or weekends, over the available history.
  const weekend = isWeekend(date);
  const broader = buckets.filter(
    (bucket) => bucket.hour >= daypart.startHour && bucket.hour < daypart.endHour && !bucket.promotion && bucket.date < date && isWeekend(bucket.date) === weekend,
  );
  return { mean: broader.length ? sum(broader.map(value)) / broader.length : 0, count: broader.length, fallback: true, daypart };
}

function openHours(location: Location): number[] {
  const hours: number[] = [];
  for (let hour = location.openingHours.open; hour < location.openingHours.close; hour += 1) hours.push(hour);
  return hours;
}

export function calculateLocationOutlook(data: PlanningData, request: PlanningRequest): LocationOutlook {
  const location = data.locations.find((entry) => entry.id === request.locationId);
  if (!location) throw new Error(`Unknown location ${request.locationId}`);
  const { date, scenario } = request;
  const capacityShare = data.chain.policy.capacityWarningShare;
  const orderBuckets = data.orderTotals.filter((bucket) => bucket.locationId === location.id);
  const hours = openHours(location);
  let observationCount = Infinity;
  const orderFallbackDayparts = new Set<Daypart>();
  const itemFallbackDayparts = new Set<Daypart>();
  const sparseItemNames: string[] = [];

  const hourly: HourOutlook[] = hours.map((hour) => {
    const baseline = averageOf(orderBuckets, date, hour, (bucket) => bucket.orders);
    if (baseline.fallback) orderFallbackDayparts.add(baseline.daypart);
    observationCount = Math.min(observationCount, baseline.count);
    const { adjustment, signalIds } = hourAdjustment(data.contextSignals, location, date, hour, "assumedOrderAdjustment");
    const scenarioOrders = round1(baseline.mean * (1 + adjustment));
    return {
      hour,
      baselineOrders: round1(baseline.mean),
      scenarioOrders,
      serviceableOrders: Math.min(scenarioOrders, location.hourlyCapacityOrders),
      capacityOrders: location.hourlyCapacityOrders,
      adjustment,
      signalIds,
    };
  });

  /** Share of each hour's scenario orders that fits within capacity (1 when unconstrained). */
  const serviceableShare = new Map(hourly.map((hour) => [hour.hour, hour.scenarioOrders > hour.capacityOrders ? hour.serviceableOrders / hour.scenarioOrders : 1]));
  const capped = hourly.filter((hour) => hour.scenarioOrders > hour.capacityOrders);

  const items: ItemOutlook[] = data.menu
    .filter((item) => item.eligibleLocationIds.includes(location.id))
    .map((item) => {
      const buckets = data.itemSales.filter((bucket) => bucket.locationId === location.id && bucket.itemId === item.id);
      return {
        itemId: item.id,
        hours: hours.map((hour) => {
          const baseline = averageOf(buckets, date, hour, (bucket) => bucket.units);
          if (baseline.fallback) {
            itemFallbackDayparts.add(baseline.daypart);
            if (!sparseItemNames.includes(item.name)) sparseItemNames.push(item.name);
          }
          observationCount = Math.min(observationCount, baseline.count);
          const { adjustment } = hourAdjustment(data.contextSignals, location, date, hour, "assumedUnitAdjustment");
          // Assumes stable units per order: units shrink with the orders the kitchen cannot serve.
          return { hour, baselineUnits: round1(baseline.mean), scenarioUnits: round1(baseline.mean * (1 + adjustment) * serviceableShare.get(hour)!) };
        }),
      };
    });

  const totals = {
    baselineOrders: round1(sum(hourly.map((hour) => hour.baselineOrders))),
    scenarioOrders: round1(sum(hourly.map((hour) => hour.scenarioOrders))),
    serviceableOrders: round1(sum(hourly.map((hour) => hour.serviceableOrders))),
  };
  const changeVsUsual = totals.baselineOrders > 0 ? (totals.scenarioOrders - totals.baselineOrders) / totals.baselineOrders : 0;
  const peak = hourly.reduce((best, hour) => (hour.scenarioOrders > best.scenarioOrders ? hour : best), hourly[0]);
  const constrained = peak.scenarioOrders >= location.hourlyCapacityOrders * capacityShare;

  // Choose the 3-hour window that needs attention.
  const windows = hourly.slice(0, hourly.length - FOCUS_WINDOW_HOURS + 1).map((first, index) => {
    const slice = hourly.slice(index, index + FOCUS_WINDOW_HOURS);
    return { startHour: first.hour, avg: sum(slice.map((hour) => hour.scenarioOrders)) / slice.length, hasPeak: slice.includes(peak) };
  });
  const dayAvg = totals.scenarioOrders / hourly.length;
  let focus: (typeof windows)[number];
  let focusReason: LocationOutlook["focusReason"];
  if (constrained) {
    focus = windows.filter((window) => window.hasPeak).reduce((best, window) => (window.avg > best.avg ? window : best));
    focusReason = "capacity-peak";
  } else {
    focus = windows.reduce((best, window) => (window.avg < best.avg ? window : best));
    focusReason = focus.avg / dayAvg < SOFT_WINDOW_SHARE ? "soft-window" : "no-clear-window";
  }

  const classification = constrained
    ? "constrained"
    : changeVsUsual >= CLASSIFICATION_THRESHOLD
      ? "busy"
      : changeVsUsual <= -CLASSIFICATION_THRESHOLD
        ? "soft"
        : "typical";

  const notes: string[] = [];
  const dayKind = isWeekend(date) ? "weekend" : "weekday";
  const daypartList = (dayparts: Set<Daypart>) => DAYPARTS.filter((daypart) => dayparts.has(daypart)).map((daypart) => daypart.label).join(", ");
  if (orderFallbackDayparts.size) notes.push(`Sparse same-weekday order history; daypart fallback used: hours in ${daypartList(orderFallbackDayparts)} use that daypart's average hour across ${dayKind} days.`);
  if (itemFallbackDayparts.size) {
    notes.push(
      `${orderFallbackDayparts.size ? "Item sales history is also sparse" : "Order history is sufficient, but item sales history is sparse"} for ${sparseItemNames.join(", ")}; daypart fallback used for units in ${daypartList(itemFallbackDayparts)} across ${dayKind} days.`,
    );
  }
  if (constrained) notes.push(`Peak of ${peak.scenarioOrders} orders at ${peak.hour}:00 is at or above ${Math.round(capacityShare * 100)}% of capacity (${location.hourlyCapacityOrders}/hour).`);
  if (capped.length) notes.push(`Item units at ${capped.map((hour) => `${hour.hour}:00`).join(", ")} are scaled to serviceable orders (assumes stable units per order).`);
  notes.push("Baseline excludes hours with past promotions.");

  return {
    locationId: location.id,
    date,
    scenario,
    timezone: location.timezone,
    hours: hourly,
    items,
    totals,
    changeVsUsual: Math.round(changeVsUsual * 1000) / 1000,
    classification,
    focusWindow: { date, startHour: focus.startHour, endHour: focus.startHour + FOCUS_WINDOW_HOURS },
    focusReason,
    appliedSignalIds: [...new Set(hourly.flatMap((hour) => hour.signalIds))],
    evidenceQuality: orderFallbackDayparts.size || itemFallbackDayparts.size ? "sparse" : "good",
    observationCount: Number.isFinite(observationCount) ? observationCount : 0,
    notes,
  };
}

/** Price after a percentage discount, rounded half up to the cent. */
export function discountedPriceCents(regularPriceCents: number, discountPct: number): number {
  return Math.round((regularPriceCents * (100 - discountPct)) / 100);
}

/** Units needed at the proposed price to match reference contribution. Null when not computable. */
export function breakEvenUnits(referenceUnits: number, regularPriceCents: number, proposedPriceCents: number, variableCostCents: number): number | null {
  const proposedContribution = proposedPriceCents - variableCostCents;
  if (proposedContribution <= 0) return null;
  return Math.ceil((referenceUnits * (regularPriceCents - variableCostCents)) / proposedContribution - 1e-9);
}

function windowsOverlap(a: OfferWindow, b: OfferWindow): boolean {
  return a.date === b.date && a.startHour < b.endHour && b.startHour < a.endHour;
}

function daysBetween(fromIso: string, toDate: string): number {
  return (Date.parse(`${toDate}T12:00:00Z`) - Date.parse(fromIso)) / 86_400_000;
}

function buildCandidate(data: PlanningData, outlook: LocationOutlook, terms: OfferTerms, existingOffers: OfferTerms[]): OfferCandidate {
  const { policy } = data.chain;
  const location = data.locations.find((entry) => entry.id === terms.locationId);
  const item = data.menu.find((entry) => entry.id === terms.itemId);
  const issues: ValidationIssue[] = [];
  const kind = terms.discountPct === 0 ? "no-change" : "discount";
  const { window } = terms;

  if (!location || !item) {
    issues.push({ code: "ITEM_NOT_ELIGIBLE", severity: "error", field: "itemId", message: "Unknown item or location." });
  } else if (!item.eligibleLocationIds.includes(location.id)) {
    issues.push({ code: "ITEM_NOT_ELIGIBLE", severity: "error", field: "itemId", message: `${item.name} is not sold at ${location.name}.` });
  }
  if (!Number.isInteger(window.startHour) || !Number.isInteger(window.endHour) || window.startHour >= window.endHour || window.date !== outlook.date) {
    issues.push({ code: "INVALID_WINDOW", severity: "error", field: "window", message: "Window must be whole hours on the planning date with start before end." });
  } else if (location && (window.startHour < location.openingHours.open || window.endHour > location.openingHours.close)) {
    issues.push({ code: "CLOSED_HOURS", severity: "error", field: "window", message: `${location.name} is open ${location.openingHours.open}:00–${location.openingHours.close}:00.` });
  }

  const regularPriceCents = item?.regularPriceCents ?? 0;
  const variableCostCents = item?.variableCostCents ?? null;
  const proposedPriceCents = discountedPriceCents(regularPriceCents, terms.discountPct);
  const windowHours = outlook.hours.filter((hour) => hour.hour >= window.startHour && hour.hour < window.endHour);
  const itemHours = (outlook.items.find((entry) => entry.itemId === terms.itemId)?.hours ?? []).filter((hour) => hour.hour >= window.startHour && hour.hour < window.endHour);
  const referenceUnits = round1(sum(itemHours.map((hour) => hour.scenarioUnits)));
  /**
   * Units an assumed response cannot deliver because the implied orders would exceed capacity.
   * Assumes stable units per order, so an hour's orders move in proportion to the item's units.
   */
  const unservedUnits = (unitChange: number) =>
    sum(
      itemHours.map((itemHour) => {
        const hour = windowHours.find((entry) => entry.hour === itemHour.hour);
        if (!hour || hour.serviceableOrders <= 0) return 0;
        return itemHour.scenarioUnits * Math.max(0, 1 + unitChange - hour.capacityOrders / hour.serviceableOrders);
      }),
    );
  const windowOrders = round1(sum(windowHours.map((hour) => hour.scenarioOrders)));
  const windowCapacityOrders = sum(windowHours.map((hour) => hour.capacityOrders));

  if (kind === "discount") {
    if (item && location && item.eligibleLocationIds.includes(location.id) && !item.offerEligible) {
      issues.push({ code: "ITEM_NOT_ELIGIBLE", severity: "error", field: "itemId", message: `${item.name} is not eligible for promotions.` });
    }
    if (!Number.isInteger(terms.discountPct) || terms.discountPct < 0 || terms.discountPct >= 100) {
      issues.push({ code: "INVALID_DISCOUNT", severity: "error", field: "discountPct", message: "Discount must be a whole percentage from 0 to 99." });
    } else if (terms.discountPct > policy.maxDiscountPct) {
      issues.push({ code: "DISCOUNT_ABOVE_CEILING", severity: "error", field: "discountPct", message: `Chain policy caps discounts at ${policy.maxDiscountPct}%.` });
    }
    if (variableCostCents === null || !item?.costUpdatedAt) {
      issues.push({ code: "MISSING_COST", severity: "error", field: "itemId", message: "Variable cost is unknown; margin-based offers are blocked." });
    } else if (daysBetween(item.costUpdatedAt, outlook.date) > policy.costFreshnessDays) {
      issues.push({ code: "STALE_COST", severity: "error", field: "itemId", message: `Variable cost is older than ${policy.costFreshnessDays} days; refresh it before discounting.` });
    }
    if (variableCostCents !== null) {
      const contribution = proposedPriceCents - variableCostCents;
      if (contribution <= 0) {
        issues.push({ code: "NONPOSITIVE_CONTRIBUTION", severity: "error", field: "discountPct", message: "Proposed price does not cover variable cost." });
      } else if (contribution < policy.minContributionPerUnitCents) {
        issues.push({ code: "BELOW_MIN_CONTRIBUTION", severity: "error", field: "discountPct", message: `Contribution per unit is below the chain minimum of $${(policy.minContributionPerUnitCents / 100).toFixed(2)}.` });
      }
    }
    if (existingOffers.some((offer) => offer.locationId === terms.locationId && offer.itemId === terms.itemId && windowsOverlap(offer.window, window))) {
      issues.push({ code: "OVERLAPPING_OFFER", severity: "error", field: "window", message: "Another approved offer covers this item, store and time." });
    }
    const highChange = assumedUnitChange("high", terms.discountPct);
    if (windowHours.some((hour) => hour.scenarioOrders * (1 + highChange) >= hour.capacityOrders * policy.capacityWarningShare)) {
      issues.push({ code: "CAPACITY_CONFLICT", severity: "warning", field: "window", message: "Projected demand plus the offer's assumed response could exceed kitchen capacity." });
    }
    if (outlook.evidenceQuality === "sparse") {
      issues.push({ code: "SPARSE_HISTORY", severity: "warning", message: "Baseline uses a sparse-history fallback." });
    }
  }

  if (kind === "no-change" && item && variableCostCents === null) {
    issues.push({ code: "MISSING_COST", severity: "warning", field: "itemId", message: "Variable cost is unknown; contribution cannot be shown for the regular price." });
  }

  const contributionPerUnitCents = variableCostCents === null ? null : proposedPriceCents - variableCostCents;
  const referenceContributionCents = variableCostCents === null ? null : Math.round(referenceUnits * (regularPriceCents - variableCostCents));
  const responseScenarios: ResponseScenario[] =
    kind === "discount" && contributionPerUnitCents !== null
      ? RESPONSE_LABELS.map((label) => {
          const change = assumedUnitChange(label, terms.discountPct);
          const units = round1(referenceUnits * (1 + change) - unservedUnits(change));
          return { label, assumedUnitChange: change, units, contributionCents: Math.round(units * contributionPerUnitCents) };
        })
      : [];

  return {
    id: `${kind}:${terms.itemId}:${window.startHour}-${window.endHour}:${terms.discountPct}`,
    kind,
    terms,
    itemName: item?.name ?? terms.itemId,
    regularPriceCents,
    proposedPriceCents,
    variableCostCents,
    contributionPerUnitCents,
    referenceUnits,
    referenceContributionCents,
    breakEvenUnits:
      kind === "discount" && variableCostCents !== null ? breakEvenUnits(referenceUnits, regularPriceCents, proposedPriceCents, variableCostCents) : null,
    responseScenarios,
    windowOrders,
    windowCapacityOrders,
    issues,
    valid: !issues.some((issue) => issue.severity === "error"),
  };
}

/**
 * Limitations that apply to one candidate, for display next to it. The contract has no
 * per-candidate note or matching issue code yet (request to B in HANDOFF.md).
 */
export function candidateLimitations(data: PlanningData, candidate: OfferCandidate): string[] {
  const item = data.menu.find((entry) => entry.id === candidate.terms.itemId);
  return item?.category === "bundle" ? [BUNDLE_LIMITATION] : [];
}

/** Default item for a window: the eligible single item with the most expected units. */
function defaultItemId(data: PlanningData, outlook: LocationOutlook): string {
  const { startHour, endHour } = outlook.focusWindow;
  const eligible = data.menu.filter((item) => item.offerEligible && item.eligibleLocationIds.includes(outlook.locationId));
  const unitsFor = (itemId: string) =>
    sum(outlook.items.find((entry) => entry.itemId === itemId)?.hours.filter((hour) => hour.hour >= startHour && hour.hour < endHour).map((hour) => hour.scenarioUnits) ?? []);
  return eligible.reduce((best, item) => (unitsFor(item.id) > unitsFor(best.id) ? item : best)).id;
}

/**
 * Evaluates offer candidates. Without terms: regular price, 5% and 10% off for the
 * focus window's top item. With edited terms: regular price plus those terms.
 * `existingOffers` are already-approved offers used for overlap checks.
 */
export function evaluateOffers(data: PlanningData, outlook: LocationOutlook, terms?: OfferTerms, existingOffers: OfferTerms[] = []): OfferCandidate[] {
  const base: OfferTerms = terms ?? { locationId: outlook.locationId, itemId: defaultItemId(data, outlook), window: outlook.focusWindow, discountPct: 0 };
  const discounts = terms ? (terms.discountPct === 0 ? [] : [terms.discountPct]) : [5, 10];
  return [0, ...discounts].map((discountPct) => buildCandidate(data, outlook, { ...base, discountPct }, existingOffers));
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const hourLabel = (window: OfferWindow) => `${window.startHour}:00–${window.endHour}:00`;

/**
 * Deterministic selection. Keeping the regular price is a valid outcome.
 * `policy` defaults to ENGINE_POLICY; pass `{ sparseTrial: true }` to allow the cautious trial.
 */
export function selectRecommendedCandidate(candidates: OfferCandidate[], outlook: LocationOutlook, policy: Pick<typeof ENGINE_POLICY, "sparseTrial"> = ENGINE_POLICY): Selection {
  const noChange = candidates.find((candidate) => candidate.kind === "no-change")!;
  const window = hourLabel(outlook.focusWindow);

  if (outlook.focusReason === "capacity-peak") {
    const peak = Math.max(...outlook.hours.map((hour) => hour.scenarioOrders));
    return {
      selectedCandidateId: noChange.id,
      reason: `Keep the regular price ${window}: demand peaks near ${peak} orders/hour against capacity of ${outlook.hours[0].capacityOrders}. A discount would add orders the kitchen cannot serve.`,
    };
  }
  if (outlook.evidenceQuality === "sparse") {
    if (policy.sparseTrial && outlook.focusReason === "soft-window") {
      // Cautious trial: only the smallest discount on offer, and only if its base scenario clears break-even.
      const smallest = candidates.filter((candidate) => candidate.kind === "discount").sort((a, b) => a.terms.discountPct - b.terms.discountPct)[0];
      const base = smallest?.responseScenarios.find((scenario) => scenario.label === "base");
      if (smallest && base && smallest.valid && !smallest.issues.some((issue) => issue.code === "CAPACITY_CONFLICT") && smallest.breakEvenUnits !== null && base.units >= smallest.breakEvenUnits) {
        return {
          selectedCandidateId: smallest.id,
          reason: `Cautious trial of ${smallest.terms.discountPct}% off ${smallest.itemName} ${window}: history is sparse, so only the smallest discount is considered. At ${dollars(smallest.proposedPriceCents)} it needs at least ${smallest.breakEvenUnits} units vs. about ${smallest.referenceUnits} expected at the regular price. Both the baseline and the demand response are assumptions to test.`,
        };
      }
    }
    return { selectedCandidateId: noChange.id, reason: "Keep the regular price: history is too sparse to justify a discount." };
  }
  if (outlook.focusReason === "soft-window") {
    const viable = candidates
      .filter((candidate) => candidate.kind === "discount" && candidate.valid && !candidate.issues.some((issue) => issue.code === "CAPACITY_CONFLICT"))
      .map((candidate) => ({ candidate, base: candidate.responseScenarios.find((scenario) => scenario.label === "base")! }))
      .filter(({ candidate, base }) => candidate.breakEvenUnits !== null && base.units >= candidate.breakEvenUnits)
      .sort((a, b) => b.base.contributionCents - a.base.contributionCents);
    if (viable.length) {
      const { candidate } = viable[0];
      return {
        selectedCandidateId: candidate.id,
        reason: `Trial ${candidate.terms.discountPct}% off ${candidate.itemName} ${window}: this is the softest window of the day. At ${dollars(candidate.proposedPriceCents)} it needs at least ${candidate.breakEvenUnits} units vs. about ${candidate.referenceUnits} expected at the regular price. The demand response is an assumption to test.`,
      };
    }
    return { selectedCandidateId: noChange.id, reason: `Keep the regular price ${window}: no discount clears its break-even threshold under the assumed response.` };
  }
  return { selectedCandidateId: noChange.id, reason: `Keep the regular price: demand is within the usual range (${Math.round(outlook.changeVsUsual * 100)}% vs. usual) and no window is unusually soft.` };
}
