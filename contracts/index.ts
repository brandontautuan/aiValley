/**
 * Shared contracts, version 1. Owned by Role B.
 *
 * Conventions (frozen for v1):
 * - Money is integer USD cents. Percentage-derived prices round half up to the cent.
 * - Dates are YYYY-MM-DD in the location's timezone; hours are local 0–23.
 * - Windows are start-inclusive, end-exclusive local hours on one date.
 * - Timestamps are ISO 8601 with an offset.
 * - Item units and customer orders are separate fields. Capacity is orders per hour.
 * - Scenario adjustments are assumptions unless backed by supplied observations.
 * - Revision increments whenever reviewed terms change; writes target a revision.
 */

export const CONTRACT_VERSION = 1;

export type Cents = number;
/** `mock-<seed>` selects a randomly generated, fictional dataset that is stable for a given seed. */
export type ScenarioId = "typical" | "local-event" | `mock-${number}`;
export type RecommendationStatus = "draft" | "approved" | "dismissed";
export type GenerationSource = "model" | "template";
export type SourceLabel = "fixture" | "public-web" | "manager";

export interface PlanningRequest {
  date: string;
  scenario: ScenarioId;
  locationId?: string;
}

// ---------- Planning data (supplied by Role D's loader) ----------

export interface ChainPolicy {
  maxDiscountPct: number;
  minContributionPerUnitCents: Cents;
  /** Variable costs older than this, relative to the planning date, block margin recommendations. */
  costFreshnessDays: number;
  /** Utilization at or above this share of hourly capacity is treated as constrained. */
  capacityWarningShare: number;
}

export interface Chain {
  id: string;
  name: string;
  currency: "USD";
  policy: ChainPolicy;
}

export interface OpeningHours {
  /** Local hour the location opens (inclusive). */
  open: number;
  /** Local hour the location closes (exclusive). */
  close: number;
}

export interface Location {
  id: string;
  chainId: string;
  name: string;
  timezone: string;
  latitude: number;
  longitude: number;
  openingHours: OpeningHours;
  hourlyCapacityOrders: number;
  profile: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: "coffee" | "food" | "bundle";
  /** Explicitly controls whether this item may receive a promotion candidate. */
  offerEligible: boolean;
  regularPriceCents: Cents;
  /** Ingredients, packaging and estimated transaction cost. Null when unknown. */
  variableCostCents: Cents | null;
  costUpdatedAt: string | null;
  eligibleLocationIds: string[];
}

/** Item units sold for one location/item/local hour. */
export interface ItemSalesBucket {
  locationId: string;
  itemId: string;
  date: string;
  hour: number;
  units: number;
  revenueCents: Cents;
  effectivePriceCents: Cents;
  promotion: boolean;
}

/** Customer orders for one location/local hour, independent of item units. */
export interface OrderBucket {
  locationId: string;
  date: string;
  hour: number;
  orders: number;
  promotion: boolean;
}

export interface ContextSignal {
  id: string;
  type: "event" | "holiday" | "weather" | "pattern";
  title: string;
  locationIds: string[];
  /** Scenarios in which this record is active. */
  scenarioIds: ScenarioId[];
  start: string;
  end: string;
  distanceKm: number | null;
  source: string;
  sourceLabel: SourceLabel;
  observedAt: string;
  /** Records describing the same real-world cause share a key and are applied once. */
  dedupeKey: string;
  assumedOrderAdjustment: number;
  assumedUnitAdjustment: number;
  whyItMatters: string;
}

export interface CompetitorOffer {
  id: string;
  locationId: string;
  competitorName: string;
  itemDescription: string;
  priceCents: Cents | null;
  portion: string | null;
  inclusions: string | null;
  channel: "in-store" | "delivery" | "online" | null;
  terms: string | null;
  availability: string | null;
  source: string;
  sourceLabel: SourceLabel;
  sourceUrl: string | null;
  collectedAt: string;
  comparability: "comparable" | "noncomparable" | "needs_review";
  comparabilityNotes: string;
}

export interface PlanningData {
  request: PlanningRequest;
  fixtureLabel: string;
  chain: Chain;
  locations: Location[];
  menu: MenuItem[];
  itemSales: ItemSalesBucket[];
  orderTotals: OrderBucket[];
  contextSignals: ContextSignal[];
  competitorOffers: CompetitorOffer[];
}

// ---------- Outlook (computed by Role C) ----------

export type DemandClassification = "soft" | "typical" | "busy" | "constrained";

export interface HourOutlook {
  hour: number;
  baselineOrders: number;
  scenarioOrders: number;
  /** Scenario orders capped at hourly capacity. */
  serviceableOrders: number;
  capacityOrders: number;
  adjustment: number;
  signalIds: string[];
}

export interface ItemHourOutlook {
  hour: number;
  baselineUnits: number;
  scenarioUnits: number;
}

export interface ItemOutlook {
  itemId: string;
  hours: ItemHourOutlook[];
}

export interface LocationOutlook {
  locationId: string;
  date: string;
  scenario: ScenarioId;
  timezone: string;
  hours: HourOutlook[];
  items: ItemOutlook[];
  totals: { baselineOrders: number; scenarioOrders: number; serviceableOrders: number };
  /** Scenario orders relative to the usual same-weekday baseline, e.g. 0.12 = +12%. */
  changeVsUsual: number;
  classification: DemandClassification;
  /** The window the engine focuses on: softest open window, or the constrained peak. */
  focusWindow: OfferWindow;
  focusReason: "soft-window" | "capacity-peak" | "no-clear-window";
  appliedSignalIds: string[];
  evidenceQuality: "good" | "sparse";
  observationCount: number;
  notes: string[];
}

// ---------- Offers and recommendations (computed by Role C, persisted by Role B) ----------

export interface OfferWindow {
  date: string;
  startHour: number;
  endHour: number;
}

export interface OfferTerms {
  locationId: string;
  itemId: string;
  window: OfferWindow;
  discountPct: number;
}

export interface ValidationIssue {
  code:
    | "DISCOUNT_ABOVE_CEILING"
    | "INVALID_DISCOUNT"
    | "NONPOSITIVE_CONTRIBUTION"
    | "BELOW_MIN_CONTRIBUTION"
    | "MISSING_COST"
    | "STALE_COST"
    | "CLOSED_HOURS"
    | "INVALID_WINDOW"
    | "ITEM_NOT_ELIGIBLE"
    | "OVERLAPPING_OFFER"
    | "CAPACITY_CONFLICT"
    | "SPARSE_HISTORY";
  severity: "error" | "warning";
  field?: string;
  message: string;
}

export interface ResponseScenario {
  label: "low" | "base" | "high";
  /** Assumed unit change vs. regular price, e.g. 0.3 = +30%. Not a measured elasticity. */
  assumedUnitChange: number;
  units: number;
  contributionCents: Cents;
}

export interface OfferCandidate {
  id: string;
  kind: "no-change" | "discount";
  terms: OfferTerms;
  itemName: string;
  regularPriceCents: Cents;
  proposedPriceCents: Cents;
  variableCostCents: Cents | null;
  contributionPerUnitCents: Cents | null;
  /** Scenario-adjusted units expected in the window at the regular price. */
  referenceUnits: number;
  referenceContributionCents: Cents | null;
  /** Units needed at the proposed price to match reference contribution. Null for no change or invalid. */
  breakEvenUnits: number | null;
  responseScenarios: ResponseScenario[];
  windowOrders: number;
  windowCapacityOrders: number;
  issues: ValidationIssue[];
  valid: boolean;
}

export interface Selection {
  selectedCandidateId: string;
  reason: string;
}

export interface Explanation {
  recommendationId: string;
  revision: number;
  summary: string;
  evidenceIds: string[];
  assumptions: string[];
  risks: string[];
  source: GenerationSource;
  generatedAt: string;
}

export interface SocialDraft {
  recommendationId: string;
  revision: number;
  platform: "instagram";
  terms: { itemName: string; priceCents: Cents; regularPriceCents: Cents; locationName: string; window: OfferWindow };
  caption: string;
  postAt: string;
  postingRationale: string;
  creativeBrief: string;
  source: GenerationSource;
  generatedAt: string;
}

export interface Recommendation {
  id: string;
  revision: number;
  locationId: string;
  planningDate: string;
  scenario: ScenarioId;
  status: RecommendationStatus;
  candidates: OfferCandidate[];
  selectedCandidateId: string;
  deterministicReason: string;
  evidenceIds: string[];
  assumptions: string[];
  /** Present only when generated for the current revision. */
  explanation: Explanation | null;
  socialDraft: SocialDraft | null;
  /** Content generated for earlier revisions; never current copy. */
  staleContent: Array<Explanation | SocialDraft>;
  createdAt: string;
  updatedAt: string;
}

export interface SavedPlan {
  id: string;
  recommendationId: string;
  revision: number;
  locationId: string;
  locationName: string;
  planningDate: string;
  scenario: ScenarioId;
  finalTerms: OfferCandidate;
  socialDraft: SocialDraft | null;
  decidedAt: string;
  /** True once a newer revision is approved or the recommendation is dismissed. */
  superseded: boolean;
}

// ---------- Strategy runs (orchestrated by Role B) ----------

export type StrategyRunStatus = "researching" | "drafting" | "awaiting_approval" | "approved" | "failed";
export type StrategyResolution = "hourly" | "daily" | "weekly";
export type TrendEvidenceStatus = "verified" | "needs_review" | "rejected";

/** Bounded, attributable research output. Raw media and comment collections are not persisted here. */
export interface TrendEvidence {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  retrievedAt: string;
  publishedAt?: string;
  claim: string;
  locationRelevance: string;
  status: TrendEvidenceStatus;
  limitations: string[];
}

export interface RankedAction {
  id: string;
  rank: number;
  kind: "organic-campaign" | "promotion" | "hold-monitor";
  title: string;
  rationale: string;
  evidenceIds: string[];
  /** Present only when this action depends on a current deterministic offer. */
  recommendationId?: string;
  recommendationRevision?: number;
}

export interface StrategyRunEvent {
  id: string;
  at: string;
  type: "created" | "workflow-started" | "evidence-received" | "ranked" | "workflow-fallback" | "approved";
  message: string;
}

export interface StrategyRun {
  id: string;
  revision: number;
  locationId: string;
  planningDate: string;
  scenario: ScenarioId;
  horizonDays: number;
  resolution: StrategyResolution;
  status: StrategyRunStatus;
  zooWorkRunId?: string;
  bandRoomId?: string;
  evidence: TrendEvidence[];
  rankedActions: RankedAction[];
  approvedActionId: string | null;
  events: StrategyRunEvent[];
  createdAt: string;
  updatedAt: string;
}

// ---------- API payloads (Role B) ----------

export interface LocationSummary {
  location: Location;
  totals: LocationOutlook["totals"];
  changeVsUsual: number;
  classification: DemandClassification;
  focusWindow: OfferWindow;
  proposedAction: string;
  selectedKind: OfferCandidate["kind"];
  priority: number;
}

export interface OverviewResponse {
  contractVersion: number;
  date: string;
  scenario: ScenarioId;
  fixtureLabel: string;
  locations: LocationSummary[];
}

export interface LocationOutlookResponse {
  contractVersion: number;
  fixtureLabel: string;
  location: Location;
  outlook: LocationOutlook;
  menu: MenuItem[];
  contextSignals: ContextSignal[];
  competitorOffers: CompetitorOffer[];
  candidates: OfferCandidate[];
  selection: Selection;
}

export interface CreateRecommendationRequest {
  date: string;
  scenario: ScenarioId;
  locationId: string;
}

export interface EditRecommendationRequest {
  expectedRevision: number;
  terms: OfferTerms;
}

export interface ContentRequest {
  expectedRevision: number;
}

export interface DecisionRequest {
  expectedRevision: number;
  action: "approve" | "dismiss";
}

export interface DecisionResponse {
  recommendation: Recommendation;
  plan: SavedPlan | null;
}

export interface ActionPlanResponse {
  date: string;
  plans: SavedPlan[];
}

export interface CreateStrategyRunRequest {
  date: string;
  scenario: ScenarioId;
  locationId: string;
  /** One to 365 days, inclusive. */
  horizonDays: number;
}

export interface ApproveStrategyRunRequest {
  expectedRevision: number;
  actionId: string;
}

export interface StrategyRunResponse {
  contractVersion: number;
  strategyRun: StrategyRun;
}

// ---------- Competitor research (server-only Tavily refresh) ----------

export type CompetitorResearchStatus = "queued" | "running" | "completed" | "unavailable" | "failed";

export interface CompetitorResearchRun {
  id: string;
  status: CompetitorResearchStatus;
  locationId: string;
  planningDate: string;
  providerRunId?: string;
  createdAt: string;
  errorCode?: "TAVILY_UNAVAILABLE" | "TAVILY_FAILED";
}

/** Public-web source awaiting manager verification; it is not a comparable offer. */
export interface CompetitorResearchEvidence {
  evidenceId: string;
  researchRunId: string;
  competitorId: string;
  sourceUrl: string;
  sourceTitle: string;
  retrievedAt: string;
  publishedAt?: string;
  claimText: string;
  itemName: null;
  priceCents: null;
  portion: null;
  inclusions: null;
  channel: null;
  terms: null;
  observationStatus: "needs_review";
  comparabilityNotes: string;
  limitations: string[];
}

export interface CompetitorResearchResult {
  run: CompetitorResearchRun;
  evidence: CompetitorResearchEvidence[];
}

export interface CompetitorResearchResponse {
  contractVersion: number;
  fixtureLabel: string;
  results: CompetitorResearchResult[];
}

export interface ApiError {
  code:
    | "NOT_FOUND"
    | "BAD_REQUEST"
    | "STALE_REVISION"
    | "VALIDATION_FAILED"
    | "WORKFLOW_FAILED"
    | "FEATURE_UNAVAILABLE"
    | "INTERNAL";
  message: string;
  issues?: ValidationIssue[];
  retryable: boolean;
}
