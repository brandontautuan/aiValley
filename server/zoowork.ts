import type { Location, OfferCandidate, TrendEvidence } from "../contracts/index.ts";
import type { StrategyWorkflow } from "./planner.ts";

const MAX_EVIDENCE = 12;
const MAX_TEXT_LENGTH = 600;
const REQUEST_TIMEOUT_MS = 30_000;

interface ZooWorkEvent {
  eventType?: string;
  payload?: Record<string, unknown>;
  runId?: string;
  cursor?: string;
}

interface ZooWorkClient {
  createSession(agentId: string, input: { initial_events: Array<{ type: "user.message"; content: string }> }): Promise<{ session_id: string }>;
  streamEvents(agentId: string, sessionId: string, options: { cursor?: string; signal: AbortSignal }): AsyncIterable<ZooWorkEvent>;
}

interface ZooWorkSdk {
  createZooworkClient(input: { apiKey: string }): ZooWorkClient;
}

export interface ZooWorkWorkflowOptions {
  /** A running private ZooWork agent, copied from its details dialog. */
  agentId: string;
  client: ZooWorkClient;
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

/** Runs the configured private Growth Planner through ZooWork's Session API. */
export function createZooWorkStrategyWorkflow({ agentId, client, now = () => new Date(), timeoutMs = REQUEST_TIMEOUT_MS }: ZooWorkWorkflowOptions): StrategyWorkflow {
  return {
    async run(input) {
      const session = await client.createSession(agentId, {
        initial_events: [{ type: "user.message", content: JSON.stringify(toZooWorkRequest(input)) }],
      });
      const result = await readRun(client, agentId, session.session_id, timeoutMs);
      if (result.outcome !== "succeeded") throw new Error(`ZooWork run ${result.outcome ?? "did not finish"}`);

      const zooWorkRunId = result.runId ?? session.session_id;
      return {
        zooWorkRunId,
        evidence: normalizeEvidence(parseAgentJson(result.text), zooWorkRunId, input.location.name, now().toISOString()),
      };
    },
  };
}

/** Loads the optional SDK only when both server-only credentials are configured. */
export async function createZooWorkStrategyWorkflowFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<StrategyWorkflow | undefined> {
  const agentId = env.ZOOWORK_AGENT_ID?.trim();
  const apiKey = env.ZOOWORK_API_KEY?.trim();
  if (!agentId || !apiKey) return undefined;
  try {
    const packageName = "@zoowork-ai/sdk";
    const sdk = (await import(packageName)) as ZooWorkSdk;
    return createZooWorkStrategyWorkflow({ agentId, client: sdk.createZooworkClient({ apiKey }) });
  } catch {
    return undefined;
  }
}

async function readRun(client: ZooWorkClient, agentId: string, sessionId: string, timeoutMs: number): Promise<{ outcome?: string; runId?: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let cursor: string | undefined;
  let runId: string | undefined;
  let text = "";
  try {
    // ZooWork streams may close while idle; reconnect from the opaque cursor.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for await (const event of client.streamEvents(agentId, sessionId, { ...(cursor ? { cursor } : {}), signal: controller.signal })) {
        cursor = event.cursor ?? cursor;
        runId = event.runId ?? runId;
        text += assistantText(event);
        if (event.eventType === "run.finished") return { outcome: stringValue(event.payload?.status), runId, text };
      }
      if (controller.signal.aborted) break;
    }
    throw new Error("ZooWork event stream ended before the run finished");
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function assistantText(event: ZooWorkEvent): string {
  if (event.eventType !== "agent.assistant") return "";
  const content = asRecord(event.payload?.message).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const record = asRecord(block);
      return record.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .join("");
}

function toZooWorkRequest(input: Parameters<StrategyWorkflow["run"]>[0]): ZooWorkRunInput {
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

function parseAgentJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

function normalizeEvidence(payload: unknown, runId: string, defaultLocation: string, retrievedAt: string): TrendEvidence[] {
  const root = asRecord(payload);
  const entries = Array.isArray(root.evidence) ? root.evidence.slice(0, MAX_EVIDENCE) : [];
  return entries.map((value, index) => {
    const entry = asRecord(value);
    const sourceUrl = stringValue(entry.sourceUrl) ?? stringValue(entry.url) ?? stringValue(entry.link) ?? "about:blank";
    const sourceTitle = stringValue(entry.sourceTitle) ?? stringValue(entry.title) ?? "ZooWork research item";
    const claim = stringValue(entry.claim) ?? stringValue(entry.summary) ?? stringValue(entry.text) ?? "ZooWork returned an evidence item without a claim.";
    const suppliedLimitations = Array.isArray(entry.limitations) ? entry.limitations.filter((item): item is string => typeof item === "string") : [];
    const limitations = [...suppliedLimitations, ...(sourceUrl === "about:blank" ? ["Source URL was not supplied; this item cannot be verified."] : [])].slice(0, 5).map((item) => truncate(item, 240));
    const explicitlyVerified = entry.status === "verified" || entry.verified === true;
    return {
      id: stringValue(entry.id) ?? `${runId}-evidence-${index + 1}`,
      sourceUrl: truncate(sourceUrl, 1_000),
      sourceTitle: truncate(sourceTitle),
      retrievedAt: isoTimestamp(entry.retrievedAt) ?? retrievedAt,
      ...(isoTimestamp(entry.publishedAt) ? { publishedAt: isoTimestamp(entry.publishedAt) } : {}),
      claim: truncate(claim),
      locationRelevance: truncate(stringValue(entry.locationRelevance) ?? defaultLocation),
      status: explicitlyVerified && sourceUrl !== "about:blank" ? "verified" : entry.status === "rejected" ? "rejected" : "needs_review",
      limitations,
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncate(value: string, maximum = MAX_TEXT_LENGTH): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
