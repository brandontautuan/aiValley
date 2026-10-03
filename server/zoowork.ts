import type { Location, OfferCandidate, TrendEvidence } from "../contracts/index.ts";
import type { StrategyWorkflow } from "./planner.ts";

const MAX_EVIDENCE = 12;
const MAX_TEXT_LENGTH = 600;
const REQUEST_TIMEOUT_MS = 8_000;

type FetchLike = typeof fetch;

export interface ZooWorkWorkflowOptions {
  /** Full server-side endpoint that starts the configured Growth Planner. */
  runUrl: string;
  apiKey: string;
  fetch?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
}

interface ZooWorkEvidenceInput {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  claim: string;
  locationRelevance: string;
  limitations: string[];
}

interface ZooWorkRunInput {
  location: Pick<Location, "id" | "name" | "timezone" | "profile">;
  horizon: { days: number; resolution: "hourly" | "daily" | "weekly" };
  deterministicRecommendation: {
    id: string;
    revision: number;
    kind: OfferCandidate["kind"];
    itemName: string;
    proposedPriceCents: number;
    window: OfferCandidate["terms"]["window"];
    summary: string;
  };
  evidence: ZooWorkEvidenceInput[];
}

/**
 * A deliberately small integration boundary. The URL is configured as a full
 * Growth Planner run endpoint so this app does not guess at a vendor path.
 */
export function createZooWorkStrategyWorkflow({ runUrl, apiKey, fetch: request = fetch, now = () => new Date(), timeoutMs = REQUEST_TIMEOUT_MS }: ZooWorkWorkflowOptions): StrategyWorkflow {
  const endpoint = new URL(runUrl).toString();

  return {
    async run(input) {
      const payload = toZooWorkRequest(input);
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await request(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ planner: "growth-planner", input: payload }),
        signal,
      });
      if (!response.ok) throw new Error(`ZooWork returned ${response.status}`);

      const body: unknown = await response.json();
      const record = asRecord(body);
      const zooWorkRunId = stringAt(record, ["runId"]) ?? stringAt(asRecord(record.run), ["id"]) ?? stringAt(record, ["id"]) ?? stringAt(asRecord(record.data), ["id"]);
      if (!zooWorkRunId) throw new Error("ZooWork response did not include a run ID");

      return {
        zooWorkRunId,
        evidence: normalizeEvidence(body, zooWorkRunId, input.location.name, now()),
      };
    },
  };
}

/** Returns no workflow when the server has not been configured for ZooWork. */
export function createZooWorkStrategyWorkflowFromEnv(env: NodeJS.ProcessEnv = process.env): StrategyWorkflow | undefined {
  const runUrl = env.ZOOWORK_GROWTH_PLANNER_URL?.trim();
  const apiKey = env.ZOOWORK_API_KEY?.trim();
  if (!runUrl || !apiKey) return undefined;
  try {
    return createZooWorkStrategyWorkflow({ runUrl, apiKey });
  } catch {
    // A malformed optional integration must not prevent the demo API starting.
    return undefined;
  }
}

function toZooWorkRequest(input: Parameters<StrategyWorkflow["run"]>[0]): ZooWorkRunInput {
  if (!input.location || !input.deterministicRecommendation || !input.boundedEvidence || !input.resolution) {
    throw new Error("ZooWork workflow requires the planner's bounded strategy context");
  }
  const selected = input.deterministicRecommendation.selected;
  return {
    location: pickLocation(input.location),
    horizon: { days: input.horizonDays, resolution: input.resolution },
    deterministicRecommendation: {
      id: input.deterministicRecommendation.id,
      revision: input.deterministicRecommendation.revision,
      kind: selected.kind,
      itemName: selected.itemName,
      proposedPriceCents: selected.proposedPriceCents,
      window: selected.terms.window,
      summary: truncate(input.deterministicRecommendation.summary),
    },
    evidence: input.boundedEvidence.slice(0, MAX_EVIDENCE).map((evidence) => ({
      id: truncate(evidence.id, 120),
      sourceUrl: truncate(evidence.sourceUrl, 1_000),
      sourceTitle: truncate(evidence.sourceTitle),
      claim: truncate(evidence.claim),
      locationRelevance: truncate(evidence.locationRelevance),
      limitations: evidence.limitations.slice(0, 4).map((limitation) => truncate(limitation, 240)),
    })),
  };
}

function pickLocation(location: Location): ZooWorkRunInput["location"] {
  return { id: location.id, name: location.name, timezone: location.timezone, profile: location.profile };
}

function normalizeEvidence(payload: unknown, runId: string, defaultLocation: string, retrievedAt: string): TrendEvidence[] {
  const entries = evidenceFrom(payload).slice(0, MAX_EVIDENCE);
  return entries.map((value, index) => {
    const entry = asRecord(value);
    const sourceUrl = nonEmpty(entry.sourceUrl) ?? nonEmpty(entry.url) ?? nonEmpty(entry.link) ?? "about:blank";
    const sourceTitle = nonEmpty(entry.sourceTitle) ?? nonEmpty(entry.title) ?? "ZooWork research item";
    const claim = nonEmpty(entry.claim) ?? nonEmpty(entry.summary) ?? nonEmpty(entry.text) ?? "ZooWork returned an evidence item without a claim.";
    const suppliedLimitations = Array.isArray(entry.limitations) ? entry.limitations.filter((item): item is string => typeof item === "string") : [];
    const limitations = [...suppliedLimitations, ...(sourceUrl === "about:blank" ? ["Source URL was not supplied; this item cannot be verified."] : [])].slice(0, 5).map((item) => truncate(item, 240));
    const explicitlyVerified = entry.status === "verified" || entry.verified === true;
    return {
      id: nonEmpty(entry.id) ?? `${runId}-evidence-${index + 1}`,
      sourceUrl: truncate(sourceUrl, 1_000),
      sourceTitle: truncate(sourceTitle),
      retrievedAt: isoTimestamp(entry.retrievedAt) ?? retrievedAt,
      ...(isoTimestamp(entry.publishedAt) ? { publishedAt: isoTimestamp(entry.publishedAt) } : {}),
      claim: truncate(claim),
      locationRelevance: truncate(nonEmpty(entry.locationRelevance) ?? defaultLocation),
      status: explicitlyVerified && sourceUrl !== "about:blank" ? "verified" : entry.status === "rejected" ? "rejected" : "needs_review",
      limitations,
    };
  });
}

function evidenceFrom(payload: unknown): unknown[] {
  const root = asRecord(payload);
  const candidates = [root.evidence, asRecord(root.output).evidence, asRecord(root.result).evidence, asRecord(root.data).evidence];
  return candidates.find(Array.isArray) ?? [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringAt(record: Record<string, unknown>, path: string[]): string | undefined {
  const value = path.reduce<unknown>((current, key) => asRecord(current)[key], record);
  return nonEmpty(value);
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncate(value: string, maximum = MAX_TEXT_LENGTH): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
