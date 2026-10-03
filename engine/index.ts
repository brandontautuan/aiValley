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

const COMPARABLE_WEEKS = 8;
const MIN_OBSERVATIONS = 4;
const ADJUSTMENT_BOUNDS = { min: -0.5, max: 1.0 };
const FOCUS_WINDOW_HOURS = 3;
const SOFT_WINDOW_SHARE = 0.6;
const CLASSIFICATION_THRESHOLD = 0.1;
/** Assumed unit change per 1% discount (low/base/high). An explicit assumption, not elasticity. */
const RESPONSE_MULTIPLIERS: Array<[ResponseScenario["label"], number]> = [
  ["low", 1],
  ["base", 3],
  ["high", 5],
];

export const ENGINE_ASSUMPTIONS = [
  "Context adjustments are fixture assumptions, not calibrated effects.",
  "Discount response (low/base/high) is assumed at 1×/3×/5× the discount percentage; it is not learned from traffic.",
  "Contribution is before fixed costs; it is not total restaurant profit.",
  "Item mix is assumed unchanged by context adjustments.",
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
): { mean: number; count: number; fallback: boolean } {
  const weekday = weekdayOf(date);
  const sameWeekday = buckets
    .filter((bucket) => bucket.hour === hour && !bucket.promotion && bucket.date < date && weekdayOf(bucket.date) === weekday)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, COMPARABLE_WEEKS);
  if (sameWeekday.length >= MIN_OBSERVATIONS) {
    return { mean: sum(sameWeekday.map(value)) / sameWeekday.length, count: sameWeekday.length, fallback: false };
  }
  // Sparse fallback: same weekday/weekend daypart hour over the available history.
  const weekend = isWeekend(date);
  const broader = buckets.filter((bucket) => bucket.hour === hour && !bucket.promotion && bucket.date < date && isWeekend(bucket.date) === weekend);
  return { mean: broader.length ? sum(broader.map(value)) / broader.length : 0, count: broader.length, fallback: true };
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
  let fallbackUsed = false;
  let observationCount = Infinity;

  const hourly: HourOutlook[] = hours.map((hour) => {
    const baseline = averageOf(orderBuckets, date, hour, (bucket) => bucket.orders);
    fallbackUsed ||= baseline.fallback;
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

  const items: ItemOutlook[] = data.menu
    .filter((item) => item.eligibleLocationIds.includes(location.id))
    .map((item) => {
      const buckets = data.itemSales.filter((bucket) => bucket.locationId === location.id && bucket.itemId === item.id);
      return {
        itemId: item.id,
        hours: hours.map((hour) => {
          const baseline = averageOf(buckets, date, hour, (bucket) => bucket.units);
          const { adjustment } = hourAdjustment(data.contextSignals, location, date, hour, "assumedUnitAdjustment");
          return { hour, baselineUnits: round1(baseline.mean), scenarioUnits: round1(baseline.mean * (1 + adjustment)) };
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
  if (fallbackUsed) notes.push("Sparse same-weekday history; some hours use a broader weekday/weekend average.");
  if (constrained) notes.push(`Peak of ${peak.scenarioOrders} orders at ${peak.hour}:00 is at or above ${Math.round(capacityShare * 100)}% of capacity (${location.hourlyCapacityOrders}/hour).`);
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
    evidenceQuality: fallbackUsed ? "sparse" : "good",
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
  const itemHours = outlook.items.find((entry) => entry.itemId === terms.itemId)?.hours ?? [];
  const referenceUnits = round1(sum(itemHours.filter((hour) => hour.hour >= window.startHour && hour.hour < window.endHour).map((hour) => hour.scenarioUnits)));
  const windowOrders = round1(sum(windowHours.map((hour) => hour.scenarioOrders)));
  const windowCapacityOrders = sum(windowHours.map((hour) => hour.capacityOrders));

  if (kind === "discount") {
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
    const highChange = (RESPONSE_MULTIPLIERS.at(-1)![1] * terms.discountPct) / 100;
    if (windowHours.some((hour) => hour.scenarioOrders * (1 + highChange) >= hour.capacityOrders * policy.capacityWarningShare)) {
      issues.push({ code: "CAPACITY_CONFLICT", severity: "warning", field: "window", message: "Projected demand plus the offer's assumed response could exceed kitchen capacity." });
    }
    if (outlook.evidenceQuality === "sparse") {
      issues.push({ code: "SPARSE_HISTORY", severity: "warning", message: "Baseline uses a sparse-history fallback." });
    }
  }

  const contributionPerUnitCents = variableCostCents === null ? null : proposedPriceCents - variableCostCents;
  const referenceContributionCents = variableCostCents === null ? null : Math.round(referenceUnits * (regularPriceCents - variableCostCents));
  const responseScenarios: ResponseScenario[] =
    kind === "discount" && contributionPerUnitCents !== null
      ? RESPONSE_MULTIPLIERS.map(([label, multiplier]) => {
          const assumedUnitChange = (multiplier * terms.discountPct) / 100;
          const units = round1(referenceUnits * (1 + assumedUnitChange));
          return { label, assumedUnitChange, units, contributionCents: Math.round(units * contributionPerUnitCents) };
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

/** Default item for a window: the eligible single item with the most expected units. */
function defaultItemId(data: PlanningData, outlook: LocationOutlook): string {
  const { startHour, endHour } = outlook.focusWindow;
  const eligible = data.menu.filter((item) => item.category === "bowl" && item.eligibleLocationIds.includes(outlook.locationId));
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

/** Deterministic selection. Keeping the regular price is a valid outcome. */
export function selectRecommendedCandidate(candidates: OfferCandidate[], outlook: LocationOutlook): Selection {
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
