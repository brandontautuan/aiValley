import type {
  ActionPlanResponse,
  ApiError,
  DecisionResponse,
  LocationOutlookResponse,
  OfferTerms,
  OverviewResponse,
  Recommendation,
  ScenarioId,
} from "../../contracts/index.ts";

/** Error carrying the server's ApiError shape. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError;
  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, { code: "INTERNAL", message: "Cannot reach the API server. Is `npm run dev` running?", retryable: true });
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(response.status, json ?? { code: "INTERNAL", message: `HTTP ${response.status}`, retryable: true });
  }
  return json as T;
}

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** Typed client for the Role B API. All economics come from the server. */
export const api = {
  overview: (date: string, scenario: ScenarioId) => request<OverviewResponse>("GET", `/api/overview?${qs({ date, scenario })}`),
  outlook: (locationId: string, date: string, scenario: ScenarioId) =>
    request<LocationOutlookResponse>("GET", `/api/locations/${locationId}/outlook?${qs({ date, scenario })}`),
  openRecommendation: (locationId: string, date: string, scenario: ScenarioId) =>
    request<Recommendation>("POST", "/api/recommendations", { locationId, date, scenario }),
  editRecommendation: (id: string, expectedRevision: number, terms: OfferTerms) =>
    request<Recommendation>("PATCH", `/api/recommendations/${id}`, { expectedRevision, terms }),
  explain: (id: string, expectedRevision: number) => request<Recommendation>("POST", `/api/recommendations/${id}/explanation`, { expectedRevision }),
  socialDraft: (id: string, expectedRevision: number) => request<Recommendation>("POST", `/api/recommendations/${id}/social-draft`, { expectedRevision }),
  decide: (id: string, expectedRevision: number, action: "approve" | "dismiss") =>
    request<DecisionResponse>("POST", `/api/recommendations/${id}/decision`, { expectedRevision, action }),
  actionPlan: (date: string) => request<ActionPlanResponse>("GET", `/api/action-plan?${qs({ date })}`),
  reset: () => request<{ ok: true }>("POST", "/api/demo/reset"),
};
