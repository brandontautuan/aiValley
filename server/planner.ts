import {
  CONTRACT_VERSION,
  type ActionPlanResponse,
  type ApiError,
  type ApproveStrategyRunRequest,
  type ContentRequest,
  type CompetitorResearchResponse,
  type Location,
  type CreateStrategyRunRequest,
  type CreateRecommendationRequest,
  type DecisionRequest,
  type DecisionResponse,
  type EditRecommendationRequest,
  type Explanation,
  type LocationOutlookResponse,
  type LocationSummary,
  type OfferCandidate,
  type OfferTerms,
  type OverviewResponse,
  type Recommendation,
  type ReviewMonitoringResponse,
  type SavedPlan,
  type ScenarioId,
  type SocialDraft,
  type StrategyRun,
  type StrategyRunEvent,
  type StrategyRunResponse,
  type TrendEvidence,
} from "../contracts/index.ts";
import { DEFAULT_PLANNING_DATE, loadPlanningData, mockSeed, SF_COMPETITOR_PROFILES } from "../data/index.ts";
import { calculateLocationOutlook, ENGINE_ASSUMPTIONS, evaluateOffers, selectRecommendedCandidate } from "../engine/index.ts";
import { BRAND_TONE, generateExplanation, generateSocialDraft, REVIEW_LIMITATIONS, searchCompetitorOffers, searchReviews, type ContentModel, type ContentPacket, type TavilySearchTransport } from "../intelligence/index.ts";
import type { Store } from "./store.ts";

export class ApiFailure extends Error {
  readonly status: number;
  readonly body: ApiError;
  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

const fail = (status: number, code: ApiError["code"], message: string, extra: Partial<ApiError> = {}): never => {
  throw new ApiFailure(status, { code, message, retryable: false, ...extra });
};

const SCENARIO_IDS: ScenarioId[] = ["typical", "local-event"];

function requireHistoricalData(observationCount: number): void {
  if (observationCount === 0) {
    fail(422, "NO_HISTORICAL_DATA", "This demo has no historical sales for that planning date. Choose August 11, 2026 or a later date.");
  }
}

function parseDate(value: unknown): string {
  const date = value ?? DEFAULT_PLANNING_DATE;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) fail(400, "BAD_REQUEST", "date must be YYYY-MM-DD");
  return date as string;
}

function parseScenario(value: unknown): ScenarioId {
  const scenario = value ?? "typical";
  if (typeof scenario === "string" && mockSeed(scenario) !== null) return scenario as ScenarioId;
  if (!SCENARIO_IDS.includes(scenario as ScenarioId)) fail(400, "BAD_REQUEST", `scenario must be one of ${SCENARIO_IDS.join(", ")}, or mock-<seed>`);
  return scenario as ScenarioId;
}

function parseRevision(value: unknown): number {
  if (!Number.isInteger(value)) fail(400, "BAD_REQUEST", "expectedRevision must be an integer");
  return value as number;
}

function parseHorizonDays(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 365) {
    fail(400, "BAD_REQUEST", "horizonDays must be an integer from 1 through 365");
  }
  return value as number;
}

const hourLabel = (candidate: OfferCandidate) => `${candidate.terms.window.startHour}:00–${candidate.terms.window.endHour}:00`;

/** Server-side boundary for ZooWork orchestration and optional Band research rooms. */
export interface StrategyWorkflowEvidence {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  claim: string;
  locationRelevance: string;
  limitations: string[];
}

export interface StrategyWorkflowInput {
  /** Local correlation ID only; adapters must not transmit it to third parties. */
  strategyRunId: string;
  locationId: string;
  planningDate: string;
  scenario: ScenarioId;
  horizonDays: number;
  resolution: StrategyRun["resolution"];
  location: Location;
  deterministicRecommendation: {
    id: string;
    revision: number;
    selected: OfferCandidate;
    summary: string;
  };
  /** Curated, bounded records only. Never raw social or customer data. */
  boundedEvidence: StrategyWorkflowEvidence[];
}

export interface StrategyWorkflow {
  run(input: StrategyWorkflowInput): Promise<{ zooWorkRunId?: string; bandRoomId?: string; evidence: TrendEvidence[] }>;
}

export interface PlannerOptions {
  store: Store;
  model?: ContentModel;
  strategyWorkflow?: StrategyWorkflow;
  /** Server-only transport; a missing key returns explicit unavailable research states. */
  tavilySearchTransport?: TavilySearchTransport;
  now?: () => Date;
}

export function createPlanner({ store, model, strategyWorkflow, tavilySearchTransport, now = () => new Date() }: PlannerOptions) {
  function compute(date: string, scenario: ScenarioId, locationId: string) {
    const data = loadPlanningData({ date, scenario });
    const location = data.locations.find((entry) => entry.id === locationId);
    if (!location) return fail(404, "NOT_FOUND", `Unknown location ${locationId}`);
    const outlook = calculateLocationOutlook(data, { date, scenario, locationId });
    requireHistoricalData(outlook.observationCount);
    return { data, location, outlook };
  }

  /** Approved, current discount terms from other recommendations (for overlap checks). */
  function approvedOffers(excludeRecommendationId: string, date: string): OfferTerms[] {
    return store
      .read()
      .plans.filter((plan) => !plan.superseded && plan.planningDate === date && plan.recommendationId !== excludeRecommendationId && plan.finalTerms.kind === "discount")
      .map((plan) => plan.finalTerms.terms);
  }

  function getRecommendation(id: string): Recommendation {
    return store.read().recommendations[id] ?? fail(404, "NOT_FOUND", `Unknown recommendation ${id}`);
  }

  function requireRevision(recommendation: Recommendation, expected: number) {
    if (recommendation.revision !== expected) {
      fail(409, "STALE_REVISION", `Recommendation is at revision ${recommendation.revision}, not ${expected}. Reload and retry.`, { retryable: true });
    }
  }

  function selectedCandidate(recommendation: Recommendation): OfferCandidate {
    return recommendation.candidates.find((candidate) => candidate.id === recommendation.selectedCandidateId)!;
  }

  function strategyResolution(horizonDays: number): StrategyRun["resolution"] {
    return horizonDays <= 7 ? "hourly" : horizonDays <= 90 ? "daily" : "weekly";
  }

  function strategyEvent(runId: string, index: number, type: StrategyRunEvent["type"], message: string, at: string): StrategyRunEvent {
    return { id: `${runId}-event-${index}`, at, type, message };
  }

  function verifiedEvidence(evidence: TrendEvidence[]): TrendEvidence[] {
    return evidence.filter((entry) => entry.status === "verified");
  }

  /** Limits third-party research input to relevant fixture summaries and public attribution. */
  function boundedWorkflowEvidence(data: ReturnType<typeof loadPlanningData>, locationId: string): StrategyWorkflowEvidence[] {
    const context = data.contextSignals
      .filter((signal) => signal.locationIds.includes(locationId))
      .map((signal) => ({
        id: signal.id,
        sourceUrl: signal.source,
        sourceTitle: signal.title,
        claim: signal.whyItMatters,
        locationRelevance: `Applies to ${locationId} for the selected scenario.`,
        limitations: ["Curated planning fixture; treat its adjustment as an assumption."],
      }));
    const competitors = data.competitorOffers
      .filter((offer) => offer.locationId === locationId)
      .map((offer) => ({
        id: offer.id,
        sourceUrl: offer.sourceUrl ?? offer.source,
        sourceTitle: `${offer.competitorName}: ${offer.itemDescription}`,
        claim: `${offer.competitorName} lists ${offer.itemDescription}${offer.priceCents === null ? "" : ` at ${(offer.priceCents / 100).toFixed(2)} USD`}.`,
        locationRelevance: `Competitor fixture for ${locationId}.`,
        limitations: [offer.comparabilityNotes, "Curated competitor fixture; manager review is required."].filter(Boolean),
      }));
    return [...context, ...competitors].slice(0, 12);
  }

  /** Ranked actions use only verified evidence; offer economics always come from Role C. */
  function rankStrategyActions(recommendation: Recommendation, evidence: TrendEvidence[]): StrategyRun["rankedActions"] {
    const selected = selectedCandidate(recommendation);
    const verifiedIds = verifiedEvidence(evidence).map((entry) => entry.id);
    const promotion = selected.kind === "discount" && selected.valid;
    const actions: StrategyRun["rankedActions"] = [
      promotion
        ? {
            id: `${recommendation.id}-promotion`,
            rank: 1,
            kind: "promotion",
            title: `Trial ${selected.terms.discountPct}% off ${selected.itemName}`,
            rationale: `${recommendation.deterministicReason} Review the break-even threshold before approval.`,
            evidenceIds: verifiedIds,
            recommendationId: recommendation.id,
            recommendationRevision: recommendation.revision,
          }
        : {
            id: `${recommendation.id}-hold`,
            rank: 1,
            kind: "hold-monitor",
            title: "Hold price and monitor demand",
            rationale: recommendation.deterministicReason,
            evidenceIds: verifiedIds,
          },
      {
        id: `${recommendation.id}-organic`,
        rank: 2,
        kind: "organic-campaign",
        title: "Prepare a local awareness campaign",
        rationale:
          verifiedIds.length > 0
            ? `Use ${verifiedIds.length} verified local research signal${verifiedIds.length === 1 ? "" : "s"} to guide copy; do not state unsupported performance claims.`
            : "No verified social trend is available yet; use a conservative location-aware message and monitor response.",
        evidenceIds: verifiedIds,
      },
      {
        id: `${recommendation.id}-monitor`,
        rank: 3,
        kind: "hold-monitor",
        title: "Reassess after the next evidence refresh",
        rationale: "Keep the current plan under review; research is time-sensitive and does not establish long-term demand or elasticity.",
        evidenceIds: [],
      },
    ];
    return actions;
  }

  function packetFor(recommendation: Recommendation): ContentPacket {
    const { data, location, outlook } = compute(recommendation.planningDate, recommendation.scenario, recommendation.locationId);
    return {
      recommendationId: recommendation.id,
      revision: recommendation.revision,
      location,
      outlook,
      selected: selectedCandidate(recommendation),
      deterministicReason: recommendation.deterministicReason,
      contextSignals: data.contextSignals.filter((signal) => recommendation.evidenceIds.includes(signal.id)),
      competitorOffers: data.competitorOffers.filter((offer) => recommendation.evidenceIds.includes(offer.id)),
      assumptions: recommendation.assumptions,
      brandTone: BRAND_TONE,
    };
  }

  /** Attaches generated content only if it still targets the current revision. */
  function attachContent(id: string, content: Explanation | SocialDraft, field: "explanation" | "socialDraft"): Recommendation {
    let stale = false;
    const state = store.write((draft) => {
      const recommendation = draft.recommendations[id];
      if (recommendation.revision !== content.revision) {
        recommendation.staleContent.push(content);
        stale = true;
        return;
      }
      if (field === "explanation") recommendation.explanation = content as Explanation;
      else recommendation.socialDraft = content as SocialDraft;
      recommendation.updatedAt = now().toISOString();
    });
    if (stale) fail(409, "STALE_REVISION", "Terms changed while content was generating; regenerate for the current revision.", { retryable: true });
    return state.recommendations[id];
  }

  /** Creates the draft for a location/date/scenario, or returns the existing one. */
  function createRecommendationDraft(body: Partial<CreateRecommendationRequest>): Recommendation {
    const date = parseDate(body.date);
    const scenario = parseScenario(body.scenario);
    if (typeof body.locationId !== "string") return fail(400, "BAD_REQUEST", "locationId is required");
    const id = `rec-${body.locationId}-${date}-${scenario}`;
    const existing = store.read().recommendations[id];
    if (existing) return existing;

    const { data, outlook } = compute(date, scenario, body.locationId);
    const candidates = evaluateOffers(data, outlook, undefined, approvedOffers(id, date));
    const selection = selectRecommendedCandidate(candidates, outlook);
    const timestamp = now().toISOString();
    const recommendation: Recommendation = {
      id,
      revision: 1,
      locationId: body.locationId,
      planningDate: date,
      scenario,
      status: "draft",
      candidates,
      selectedCandidateId: selection.selectedCandidateId,
      deterministicReason: selection.reason,
      evidenceIds: [
        ...data.contextSignals.filter((signal) => outlook.appliedSignalIds.includes(signal.id)).map((signal) => signal.id),
        ...data.competitorOffers.filter((offer) => offer.locationId === body.locationId).map((offer) => offer.id),
      ],
      assumptions: ENGINE_ASSUMPTIONS,
      explanation: null,
      socialDraft: null,
      staleContent: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return store.write((state) => {
      state.recommendations[id] = recommendation;
    }).recommendations[id];
  }

  /** Revalidates and saves a decision. Approving the same revision twice is idempotent. */
  function decideRecommendation(id: string, body: Partial<DecisionRequest>): DecisionResponse {
    const recommendation = getRecommendation(id);
    requireRevision(recommendation, parseRevision(body.expectedRevision));
    if (body.action !== "approve" && body.action !== "dismiss") return fail(400, "BAD_REQUEST", "action must be approve or dismiss");
    const planId = `plan-${id}-r${recommendation.revision}`;

    if (body.action === "dismiss") {
      const state = store.write((draft) => {
        draft.recommendations[id].status = "dismissed";
        draft.recommendations[id].updatedAt = now().toISOString();
        for (const plan of draft.plans) if (plan.recommendationId === id) plan.superseded = true;
      });
      return { recommendation: state.recommendations[id], plan: null };
    }

    const existingPlan = store.read().plans.find((plan) => plan.id === planId && !plan.superseded);
    if (existingPlan) return { recommendation, plan: existingPlan };

    const { data, location, outlook } = compute(recommendation.planningDate, recommendation.scenario, recommendation.locationId);
    const current = selectedCandidate(recommendation);
    const revalidated = evaluateOffers(data, outlook, current.terms, approvedOffers(id, recommendation.planningDate)).at(-1)!;
    if (!revalidated.valid) {
      fail(422, "VALIDATION_FAILED", "These terms no longer pass the guardrails.", { issues: revalidated.issues.filter((issue) => issue.severity === "error") });
    }
    const plan: SavedPlan = {
      id: planId,
      recommendationId: id,
      revision: recommendation.revision,
      locationId: location.id,
      locationName: location.name,
      planningDate: recommendation.planningDate,
      scenario: recommendation.scenario,
      finalTerms: revalidated,
      socialDraft: recommendation.socialDraft?.revision === recommendation.revision ? recommendation.socialDraft : null,
      decidedAt: now().toISOString(),
      superseded: false,
    };
    const state = store.write((draft) => {
      draft.recommendations[id].status = "approved";
      draft.recommendations[id].updatedAt = plan.decidedAt;
      draft.plans = draft.plans.filter((entry) => entry.id !== planId);
      for (const entry of draft.plans) if (entry.recommendationId === id) entry.superseded = true;
      draft.plans.push(plan);
    });
    return { recommendation: state.recommendations[id], plan };
  }

  return {
    overview(query: { date?: unknown; scenario?: unknown }): OverviewResponse {
      const date = parseDate(query.date);
      const scenario = parseScenario(query.scenario);
      const data = loadPlanningData({ date, scenario });
      const locations: LocationSummary[] = data.locations.map((location) => {
        const outlook = calculateLocationOutlook(data, { date, scenario, locationId: location.id });
        requireHistoricalData(outlook.observationCount);
        const candidates = evaluateOffers(data, outlook);
        const selection = selectRecommendedCandidate(candidates, outlook);
        const selected = candidates.find((candidate) => candidate.id === selection.selectedCandidateId)!;
        const proposedAction =
          selected.kind === "discount"
            ? `Trial ${selected.terms.discountPct}% off ${selected.itemName}, ${hourLabel(selected)}`
            : outlook.focusReason === "capacity-peak"
              ? `Keep regular price; protect capacity ${hourLabel(selected)}`
              : "Keep regular price";
        return {
          location,
          totals: outlook.totals,
          changeVsUsual: outlook.changeVsUsual,
          classification: outlook.classification,
          focusWindow: outlook.focusWindow,
          proposedAction,
          selectedKind: selected.kind,
          priority: selected.kind === "discount" ? 1 : outlook.focusReason === "capacity-peak" ? 2 : 3,
        };
      });
      locations.sort((a, b) => a.priority - b.priority);
      return { contractVersion: CONTRACT_VERSION, date, scenario, fixtureLabel: data.fixtureLabel, locations };
    },

    locationOutlook(locationId: string, query: { date?: unknown; scenario?: unknown }): LocationOutlookResponse {
      const date = parseDate(query.date);
      const scenario = parseScenario(query.scenario);
      const { data, location, outlook } = compute(date, scenario, locationId);
      const candidates = evaluateOffers(data, outlook, undefined, approvedOffers("", date));
      return {
        contractVersion: CONTRACT_VERSION,
        fixtureLabel: data.fixtureLabel,
        location,
        outlook,
        menu: data.menu.filter((item) => item.eligibleLocationIds.includes(location.id)),
        contextSignals: data.contextSignals.filter((signal) => signal.locationIds.includes(location.id)),
        competitorOffers: data.competitorOffers.filter((offer) => offer.locationId === location.id),
        candidates,
        selection: selectRecommendedCandidate(candidates, outlook),
      };
    },

    createRecommendation: createRecommendationDraft,

    /** Refreshes only approved coffee-demo profile seeds; web evidence never becomes an offer automatically. */
    async competitorResearch(locationId: string, body: { date?: unknown } = {}): Promise<CompetitorResearchResponse> {
      const date = parseDate(body.date);
      const data = loadPlanningData({ date, scenario: "typical", locationId });
      const location = data.locations.find((entry) => entry.id === locationId) ?? fail(404, "NOT_FOUND", `Unknown location ${locationId}`);
      const competitors = SF_COMPETITOR_PROFILES[locationId] ?? [];
      if (competitors.length === 0) fail(404, "NOT_FOUND", `No configured competitor profiles for ${locationId}`);
      const batch = await searchCompetitorOffers(
        { locationId, locationName: `${location.name}, San Francisco`, planningDate: date, competitors },
        tavilySearchTransport,
        now(),
      );
      return { contractVersion: CONTRACT_VERSION, fixtureLabel: data.fixtureLabel, results: batch.results };
    },

    /** Public review excerpts for the configured competitors; read-only context that never feeds pricing. */
    async reviewMonitoring(locationId: string, body: { date?: unknown } = {}): Promise<ReviewMonitoringResponse> {
      const date = parseDate(body.date);
      const data = loadPlanningData({ date, scenario: "typical", locationId });
      const location = data.locations.find((entry) => entry.id === locationId) ?? fail(404, "NOT_FOUND", `Unknown location ${locationId}`);
      const subjects = SF_COMPETITOR_PROFILES[locationId] ?? [];
      if (subjects.length === 0) fail(404, "NOT_FOUND", `No configured competitor profiles for ${locationId}`);
      const results = await searchReviews({ locationId, locationName: `${location.name}, San Francisco`, planningDate: date, subjects }, tavilySearchTransport, now());
      return { contractVersion: CONTRACT_VERSION, fixtureLabel: data.fixtureLabel, limitations: REVIEW_LIMITATIONS, results };
    },

    /** Creates a durable, approval-gated strategy run around the existing offer recommendation. */
    async createStrategyRun(body: Partial<CreateStrategyRunRequest>): Promise<StrategyRunResponse> {
      const date = parseDate(body.date);
      const scenario = parseScenario(body.scenario);
      const locationId = typeof body.locationId === "string" ? body.locationId : fail(400, "BAD_REQUEST", "locationId is required");
      const horizonDays = parseHorizonDays(body.horizonDays);
      // Verifies the location through the same data boundary as recommendations.
      const { data, location } = compute(date, scenario, locationId);
      const id = `strategy-${locationId}-${date}-${scenario}-${horizonDays}`;
      const existing = store.read().strategyRuns[id];
      if (existing) return { contractVersion: CONTRACT_VERSION, strategyRun: existing };

      const timestamp = now().toISOString();
      const initial: StrategyRun = {
        id,
        revision: 1,
        locationId,
        planningDate: date,
        scenario,
        horizonDays,
        resolution: strategyResolution(horizonDays),
        status: "researching",
        evidence: [],
        rankedActions: [],
        approvedActionId: null,
        events: [
          strategyEvent(id, 1, "created", `Strategy run created for a ${horizonDays}-day planning horizon.`, timestamp),
          strategyEvent(id, 2, "workflow-started", "Requested research and strategy orchestration.", timestamp),
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.write((state) => {
        state.strategyRuns[id] = initial;
      });

      const recommendation = createRecommendationDraft({ date, scenario, locationId });
      let evidence: TrendEvidence[] = [];
      let zooWorkRunId: string | undefined;
      let bandRoomId: string | undefined;
      let fallbackMessage = "No strategy workflow is configured; ranked the deterministic recommendation with a conservative research fallback.";

      if (strategyWorkflow) {
        try {
          const result = await strategyWorkflow.run({
            strategyRunId: id,
            locationId,
            planningDate: date,
            scenario,
            horizonDays,
            resolution: initial.resolution,
            location,
            deterministicRecommendation: {
              id: recommendation.id,
              revision: recommendation.revision,
              selected: selectedCandidate(recommendation),
              summary: recommendation.deterministicReason,
            },
            boundedEvidence: boundedWorkflowEvidence(data, locationId),
          });
          zooWorkRunId = result.zooWorkRunId;
          bandRoomId = result.bandRoomId;
          evidence = result.evidence.filter(
            (entry) =>
              typeof entry.id === "string" &&
              typeof entry.sourceUrl === "string" &&
              typeof entry.sourceTitle === "string" &&
              typeof entry.claim === "string" &&
              Array.isArray(entry.limitations),
          );
          fallbackMessage = `${zooWorkRunId ? `ZooWork run ${zooWorkRunId}` : "Workflow"} returned ${evidence.length} research record${evidence.length === 1 ? "" : "s"}; only verified records informed ranked actions.`;
        } catch {
          fallbackMessage = "Strategy workflow was unavailable; retained the deterministic recommendation and a conservative research fallback.";
        }
      }

      const completedAt = now().toISOString();
      const state = store.write((draft) => {
        const run = draft.strategyRuns[id] ?? fail(404, "NOT_FOUND", `Unknown strategy run ${id}`);
        run.status = "awaiting_approval";
        run.zooWorkRunId = zooWorkRunId;
        run.bandRoomId = bandRoomId;
        run.evidence = evidence;
        run.rankedActions = rankStrategyActions(recommendation, evidence);
        run.events.push(
          strategyEvent(id, 3, evidence.length > 0 ? "evidence-received" : "workflow-fallback", fallbackMessage, completedAt),
          strategyEvent(id, 4, "ranked", "Ranked actions are ready for manager review.", completedAt),
        );
        run.updatedAt = completedAt;
      });
      return { contractVersion: CONTRACT_VERSION, strategyRun: state.strategyRuns[id] ?? fail(404, "NOT_FOUND", `Unknown strategy run ${id}`) };
    },

    getStrategyRun(id: string): StrategyRunResponse {
      const strategyRun = store.read().strategyRuns[id] ?? fail(404, "NOT_FOUND", `Unknown strategy run ${id}`);
      return { contractVersion: CONTRACT_VERSION, strategyRun };
    },

    /** Approves one ranked action and revalidates any linked pricing recommendation. */
    approveStrategyRun(id: string, body: Partial<ApproveStrategyRunRequest>): StrategyRunResponse {
      const run = store.read().strategyRuns[id] ?? fail(404, "NOT_FOUND", `Unknown strategy run ${id}`);
      const expectedRevision = parseRevision(body.expectedRevision);
      if (run.revision !== expectedRevision) {
        fail(409, "STALE_REVISION", `Strategy run is at revision ${run.revision}, not ${expectedRevision}. Reload and retry.`, { retryable: true });
      }
      if (typeof body.actionId !== "string") fail(400, "BAD_REQUEST", "actionId is required");
      const action = run.rankedActions.find((entry) => entry.id === body.actionId) ?? fail(400, "BAD_REQUEST", "actionId is not part of this strategy run");
      if (run.status === "approved") {
        if (run.approvedActionId === action.id) return { contractVersion: CONTRACT_VERSION, strategyRun: run };
        fail(409, "STALE_REVISION", "A different action has already been approved for this strategy run.", { retryable: true });
      }
      if (run.status !== "awaiting_approval") fail(409, "STALE_REVISION", "Strategy run is not ready for approval.", { retryable: true });

      if (action.recommendationId) {
        const recommendation = getRecommendation(action.recommendationId);
        if (recommendation.revision !== action.recommendationRevision) {
          fail(409, "STALE_REVISION", "The linked offer changed after this strategy was ranked. Create a new strategy run.", { retryable: true });
        }
        decideRecommendation(recommendation.id, { expectedRevision: recommendation.revision, action: "approve" });
      }

      const approvedAt = now().toISOString();
      const state = store.write((draft) => {
        const current = draft.strategyRuns[id] ?? fail(404, "NOT_FOUND", `Unknown strategy run ${id}`);
        current.status = "approved";
        current.approvedActionId = action.id;
        current.events.push(strategyEvent(id, current.events.length + 1, "approved", `Manager approved: ${action.title}.`, approvedAt));
        current.updatedAt = approvedAt;
      });
      return { contractVersion: CONTRACT_VERSION, strategyRun: state.strategyRuns[id] ?? fail(404, "NOT_FOUND", `Unknown strategy run ${id}`) };
    },

    getRecommendation,

    /** Re-evaluates edited terms through the engine and creates a new revision. */
    editRecommendation(id: string, body: Partial<EditRecommendationRequest>): Recommendation {
      const recommendation = getRecommendation(id);
      requireRevision(recommendation, parseRevision(body.expectedRevision));
      const terms = body.terms;
      if (!terms || typeof terms.itemId !== "string" || typeof terms.discountPct !== "number" || !terms.window) return fail(400, "BAD_REQUEST", "terms with itemId, window and discountPct are required");
      const normalized: OfferTerms = { ...terms, locationId: recommendation.locationId, window: { ...terms.window, date: recommendation.planningDate } };
      const { data, outlook } = compute(recommendation.planningDate, recommendation.scenario, recommendation.locationId);
      const candidates = evaluateOffers(data, outlook, normalized, approvedOffers(id, recommendation.planningDate));
      const selected = candidates.at(-1)!;

      return store.write((state) => {
        const current = state.recommendations[id];
        current.staleContent.push(...[current.explanation, current.socialDraft].filter((content) => content !== null));
        current.explanation = null;
        current.socialDraft = null;
        current.candidates = candidates;
        current.selectedCandidateId = selected.id;
        current.deterministicReason = selected.valid
          ? `Manager-edited terms: ${selected.kind === "discount" ? `${selected.terms.discountPct}% off ${selected.itemName} at ${(selected.proposedPriceCents / 100).toFixed(2)} USD` : `regular price for ${selected.itemName}`}, ${hourLabel(selected)}.`
          : `Manager-edited terms fail validation: ${selected.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" ")}`;
        current.revision += 1;
        current.status = "draft";
        current.updatedAt = now().toISOString();
        // Previously approved terms stay in the plan until a newer revision is approved.
      }).recommendations[id];
    },

    async explain(id: string, body: Partial<ContentRequest>): Promise<Recommendation> {
      const recommendation = getRecommendation(id);
      requireRevision(recommendation, parseRevision(body.expectedRevision));
      const explanation = await generateExplanation(packetFor(recommendation), model, now());
      return attachContent(id, explanation, "explanation");
    },

    async socialDraft(id: string, body: Partial<ContentRequest>): Promise<Recommendation> {
      const recommendation = getRecommendation(id);
      requireRevision(recommendation, parseRevision(body.expectedRevision));
      const draft = await generateSocialDraft(packetFor(recommendation), model, now());
      return attachContent(id, draft, "socialDraft");
    },

    decide: decideRecommendation,

    actionPlan(query: { date?: unknown }): ActionPlanResponse {
      const date = parseDate(query.date);
      return { date, plans: store.read().plans.filter((plan) => plan.planningDate === date).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1)) };
    },

    reset(): { ok: true } {
      store.reset();
      return { ok: true };
    },
  };
}

export type Planner = ReturnType<typeof createPlanner>;
