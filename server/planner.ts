import {
  CONTRACT_VERSION,
  type ActionPlanResponse,
  type ApiError,
  type ContentRequest,
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
  type SavedPlan,
  type ScenarioId,
  type SocialDraft,
} from "../contracts/index.ts";
import { DEFAULT_PLANNING_DATE, loadPlanningData } from "../data/index.ts";
import { calculateLocationOutlook, ENGINE_ASSUMPTIONS, evaluateOffers, selectRecommendedCandidate } from "../engine/index.ts";
import { BRAND_TONE, generateExplanation, generateSocialDraft, type ContentModel, type ContentPacket } from "../intelligence/index.ts";
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

function parseDate(value: unknown): string {
  const date = value ?? DEFAULT_PLANNING_DATE;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) fail(400, "BAD_REQUEST", "date must be YYYY-MM-DD");
  return date as string;
}

function parseScenario(value: unknown): ScenarioId {
  const scenario = value ?? "typical";
  if (!SCENARIO_IDS.includes(scenario as ScenarioId)) fail(400, "BAD_REQUEST", `scenario must be one of ${SCENARIO_IDS.join(", ")}`);
  return scenario as ScenarioId;
}

function parseRevision(value: unknown): number {
  if (!Number.isInteger(value)) fail(400, "BAD_REQUEST", "expectedRevision must be an integer");
  return value as number;
}

const hourLabel = (candidate: OfferCandidate) => `${candidate.terms.window.startHour}:00–${candidate.terms.window.endHour}:00`;

export interface PlannerOptions {
  store: Store;
  model?: ContentModel;
  now?: () => Date;
}

export function createPlanner({ store, model, now = () => new Date() }: PlannerOptions) {
  function compute(date: string, scenario: ScenarioId, locationId: string) {
    const data = loadPlanningData({ date, scenario });
    const location = data.locations.find((entry) => entry.id === locationId);
    if (!location) return fail(404, "NOT_FOUND", `Unknown location ${locationId}`);
    const outlook = calculateLocationOutlook(data, { date, scenario, locationId });
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

  return {
    overview(query: { date?: unknown; scenario?: unknown }): OverviewResponse {
      const date = parseDate(query.date);
      const scenario = parseScenario(query.scenario);
      const data = loadPlanningData({ date, scenario });
      const locations: LocationSummary[] = data.locations.map((location) => {
        const outlook = calculateLocationOutlook(data, { date, scenario, locationId: location.id });
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

    /** Creates the draft for a location/date/scenario, or returns the existing one. */
    createRecommendation(body: Partial<CreateRecommendationRequest>): Recommendation {
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

    /** Revalidates and saves a decision. Approving the same revision twice is idempotent. */
    decide(id: string, body: Partial<DecisionRequest>): DecisionResponse {
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
    },

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
