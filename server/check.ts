import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { ActionPlanResponse, DecisionResponse, LocationOutlookResponse, OverviewResponse, Recommendation, StrategyRunResponse } from "../contracts/index.ts";
import { createApp } from "./index.ts";
import { createPlanner, type PlannerOptions } from "./planner.ts";
import { createFileStore } from "./store.ts";
import { createZooWorkStrategyWorkflow, createZooWorkStrategyWorkflowFromEnv } from "./zoowork.ts";

const dataDir = mkdtempSync(join(tmpdir(), "planner-check-"));
const date = "2026-10-05";

async function withServer<T>(
  run: (call: <R>(method: string, path: string, body?: unknown) => Promise<{ status: number; json: R }>) => Promise<T>,
  options: Omit<PlannerOptions, "store"> = {},
): Promise<T> {
  const server = createApp(createPlanner({ store: createFileStore(dataDir), ...options })).listen(0);
  await new Promise((done) => server.once("listening", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    return await run(async (method, path, body) => {
      const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, json: await response.json() };
    });
  } finally {
    server.close();
  }
}

try {
  await withServer(async (call) => {
    const overview = (await call<OverviewResponse>("GET", `/api/overview?date=${date}&scenario=local-event`)).json;
    assert.equal(overview.locations.length, 3);
    assert.equal(overview.locations.find((entry) => entry.location.id === "arena")!.selectedKind, "no-change");
    assert.equal(overview.locations.find((entry) => entry.location.id === "downtown")!.selectedKind, "no-change");

    const outlook = (await call<LocationOutlookResponse>("GET", `/api/locations/downtown/outlook?date=${date}`)).json;
    assert.equal(outlook.outlook.hours.length, 10);
    assert.equal((await call("GET", "/api/locations/nowhere/outlook")).status, 404);
    assert.equal((await call("GET", "/api/overview?scenario=bogus")).status, 400);

    const unavailableResearch = await call<{ results: Array<{ run: { status: string } }> }>("POST", "/api/locations/downtown/competitor-research", { date });
    assert.equal(unavailableResearch.status, 200);
    assert.ok(unavailableResearch.json.results.every((result) => result.run.status === "unavailable"));

    let rec = (await call<Recommendation>("POST", "/api/recommendations", { date, scenario: "typical", locationId: "downtown" })).json;
    assert.equal(rec.revision, 1);
    assert.equal((await call<Recommendation>("POST", "/api/recommendations", { date, scenario: "typical", locationId: "downtown" })).json.id, rec.id, "create is idempotent");

    rec = (await call<Recommendation>("POST", `/api/recommendations/${rec.id}/social-draft`, { expectedRevision: 1 })).json;
    assert.ok(rec.socialDraft?.caption.includes("Downtown"));
    assert.ok(rec.socialDraft?.creativeBrief.includes("no offer"));

    // Editing terms makes a new revision and invalidates copy.
    const terms = { ...rec.candidates.find((candidate) => candidate.id === rec.selectedCandidateId)!.terms, discountPct: 5 };
    rec = (await call<Recommendation>("PATCH", `/api/recommendations/${rec.id}`, { expectedRevision: 1, terms })).json;
    assert.equal(rec.revision, 2);
    assert.equal(rec.socialDraft, null);
    assert.equal(rec.staleContent.length, 1);
    assert.equal((await call("POST", `/api/recommendations/${rec.id}/social-draft`, { expectedRevision: 1 })).status, 409, "stale revision rejected");

    // Invalid edits are recorded but cannot be approved.
    rec = (await call<Recommendation>("PATCH", `/api/recommendations/${rec.id}`, { expectedRevision: 2, terms: { ...terms, discountPct: 20 } })).json;
    const blocked = await call<{ code: string }>("POST", `/api/recommendations/${rec.id}/decision`, { expectedRevision: 3, action: "approve" });
    assert.equal(blocked.status, 422);
    assert.equal(blocked.json.code, "VALIDATION_FAILED");

    rec = (await call<Recommendation>("PATCH", `/api/recommendations/${rec.id}`, { expectedRevision: 3, terms })).json;
    rec = (await call<Recommendation>("POST", `/api/recommendations/${rec.id}/social-draft`, { expectedRevision: 4 })).json;
    const first = (await call<DecisionResponse>("POST", `/api/recommendations/${rec.id}/decision`, { expectedRevision: 4, action: "approve" })).json;
    const again = (await call<DecisionResponse>("POST", `/api/recommendations/${rec.id}/decision`, { expectedRevision: 4, action: "approve" })).json;
    assert.equal(first.plan!.id, again.plan!.id);
    assert.ok(first.plan!.socialDraft?.caption.includes("$13.30"));
  });

  // Fresh server process over the same store: approval survived restart, no duplicates.
  await withServer(async (call) => {
    const plan = (await call<ActionPlanResponse>("GET", `/api/action-plan?date=${date}`)).json;
    assert.equal(plan.plans.length, 1);
    assert.equal(plan.plans[0].finalTerms.proposedPriceCents, 1330);

    // Another recommendation avoids the approved window by default, and forcing overlapping terms is rejected.
    let other = (await call<Recommendation>("POST", "/api/recommendations", { date, scenario: "local-event", locationId: "downtown" })).json;
    assert.ok(other.selectedCandidateId.startsWith("no-change"), "engine does not propose an overlapping offer");
    const overlappingTerms = { ...plan.plans[0].finalTerms.terms, discountPct: 10 };
    other = (await call<Recommendation>("PATCH", `/api/recommendations/${other.id}`, { expectedRevision: 1, terms: overlappingTerms })).json;
    const overlap = await call<{ issues: Array<{ code: string }> }>("POST", `/api/recommendations/${other.id}/decision`, { expectedRevision: 2, action: "approve" });
    assert.equal(overlap.status, 422);
    assert.ok(overlap.json.issues.some((issue) => issue.code === "OVERLAPPING_OFFER"));

    assert.equal((await call("POST", "/api/demo/reset")).status, 200);
    assert.equal((await call<ActionPlanResponse>("GET", `/api/action-plan?date=${date}`)).json.plans.length, 0);
    assert.equal((await call<Recommendation>("POST", "/api/recommendations", { date, scenario: "typical", locationId: "downtown" })).json.revision, 1, "reset restores the starting state");

    const strategy = await call<StrategyRunResponse>("POST", "/api/strategy-runs", { date, scenario: "typical", locationId: "downtown", horizonDays: 7 });
    assert.equal(strategy.status, 200);
    assert.equal(strategy.json.strategyRun.status, "awaiting_approval");
    assert.equal(strategy.json.strategyRun.resolution, "hourly");
    assert.equal(strategy.json.strategyRun.evidence.length, 0);
    assert.equal(strategy.json.strategyRun.events.at(-2)?.type, "workflow-fallback");
    const hold = strategy.json.strategyRun.rankedActions.find((action) => action.kind === "hold-monitor");
    assert.ok(hold, "downtown strategy keeps the deterministic hold-and-monitor candidate");

    const longStrategy = await call<StrategyRunResponse>("POST", "/api/strategy-runs", { date, scenario: "typical", locationId: "downtown", horizonDays: 365 });
    assert.equal(longStrategy.status, 200);
    assert.equal(longStrategy.json.strategyRun.resolution, "weekly");
    assert.equal((await call("POST", "/api/strategy-runs", { date, scenario: "typical", locationId: "downtown", horizonDays: 0 })).status, 400);

    const staleStrategy = await call("POST", `/api/strategy-runs/${strategy.json.strategyRun.id}/approve`, { expectedRevision: 0, actionId: hold.id });
    assert.equal(staleStrategy.status, 409);
    const approvedStrategy = await call<StrategyRunResponse>("POST", `/api/strategy-runs/${strategy.json.strategyRun.id}/approve`, { expectedRevision: 1, actionId: hold.id });
    assert.equal(approvedStrategy.status, 200);
    assert.equal(approvedStrategy.json.strategyRun.status, "approved");
    const approvedAgain = await call<StrategyRunResponse>("POST", `/api/strategy-runs/${strategy.json.strategyRun.id}/approve`, { expectedRevision: 1, actionId: hold.id });
    assert.equal(approvedAgain.status, 200, "strategy approval is idempotent");
  });

  await withServer(
    async (call) => {
      assert.equal((await call("POST", "/api/demo/reset")).status, 200);
      const strategy = await call<StrategyRunResponse>("POST", "/api/strategy-runs", { date, scenario: "typical", locationId: "downtown", horizonDays: 3 });
      assert.equal(strategy.status, 200);
      assert.equal(strategy.json.strategyRun.zooWorkRunId, "zoo-demo-run");
      assert.equal(strategy.json.strategyRun.bandRoomId, "band-demo-room");
      assert.equal(strategy.json.strategyRun.events.at(-2)?.type, "evidence-received");
      const organic = strategy.json.strategyRun.rankedActions.find((action) => action.kind === "organic-campaign")!;
      assert.deepEqual(organic.evidenceIds, ["trend-verified"], "unreviewed evidence cannot influence ranked actions");
    },
    {
      strategyWorkflow: {
        async run() {
          return {
            zooWorkRunId: "zoo-demo-run",
            bandRoomId: "band-demo-room",
            evidence: [
              {
                id: "trend-verified",
                sourceUrl: "https://example.com/verified",
                sourceTitle: "Verified local signal",
                retrievedAt: "2026-10-03T12:00:00Z",
                claim: "Public discussion describes a nearby cafe as a study destination.",
                locationRelevance: "San Francisco",
                status: "verified",
                limitations: ["Demo evidence only."],
              },
              {
                id: "trend-unreviewed",
                sourceUrl: "https://example.com/unreviewed",
                sourceTitle: "Unreviewed local signal",
                retrievedAt: "2026-10-03T12:00:00Z",
                claim: "Unreviewed claim.",
                locationRelevance: "San Francisco",
                status: "needs_review",
                limitations: ["Manager review required."],
              },
            ],
          };
        },
      },
    },
  );

  let zooWorkRequest: unknown;
  await withServer(
    async (call) => {
      assert.equal((await call("POST", "/api/demo/reset")).status, 200);
      const strategy = await call<StrategyRunResponse>("POST", "/api/strategy-runs", { date, scenario: "typical", locationId: "downtown", horizonDays: 3 });
      assert.equal(strategy.json.strategyRun.zooWorkRunId, "zoo-live-run");
      assert.equal(strategy.json.strategyRun.evidence.length, 2);
      assert.deepEqual(strategy.json.strategyRun.rankedActions.find((action) => action.kind === "organic-campaign")!.evidenceIds, ["confirmed-trend"]);
    },
    {
      strategyWorkflow: createZooWorkStrategyWorkflow({
        agentId: "agt-growth-planner",
        client: {
          async createSession(_agentId, input) {
            zooWorkRequest = JSON.parse(input.initial_events[0]!.content);
            return { session_id: "zoo-session" };
          },
          async *streamEvents() {
            yield {
              eventType: "agent.assistant",
              runId: "zoo-live-run",
              cursor: "evt-1",
              payload: {
                message: {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        evidence: [
                          { id: "confirmed-trend", sourceUrl: "https://example.com/confirmed", sourceTitle: "Confirmed trend", claim: "A local trend has been independently verified.", locationRelevance: "Downtown", status: "verified", limitations: [] },
                          { id: "review-trend", sourceTitle: "Incomplete trend", claim: "Needs review.", locationRelevance: "Downtown", limitations: [] },
                        ],
                      }),
                    },
                  ],
                },
              },
            };
            yield { eventType: "run.finished", runId: "zoo-live-run", cursor: "evt-2", payload: { status: "succeeded" } };
          },
        },
      }),
    },
  );
  assert.deepEqual(Object.keys(zooWorkRequest as Record<string, unknown>).sort(), ["deterministicRecommendation", "evidence", "horizon", "location"]);
  assert.equal(await createZooWorkStrategyWorkflowFromEnv({}), undefined, "missing server-only ZooWork credentials leaves fallback active");

  // The route returns Tavily sources only as manager-review evidence.
  await withServer(
    async (call) => {
      const research = await call<{ results: Array<{ run: { status: string }; evidence: Array<{ observationStatus: string; priceCents: number | null }> }> }>("POST", "/api/locations/downtown/competitor-research", { date });
      assert.equal(research.status, 200);
      assert.ok(research.json.results.every((result) => result.run.status === "completed"));
      assert.ok(research.json.results.flatMap((result) => result.evidence).every((evidence) => evidence.observationStatus === "needs_review" && evidence.priceCents === null));
    },
    {
      tavilySearchTransport: {
        async search() {
          return { providerRequestId: "tavily-server-check", sources: [{ url: "https://bluebottlecoffee.com/menu", title: "Official menu", claimText: "Source-backed menu snippet", retrievedAt: "2026-10-03T12:00:00Z" }] };
        },
      },
    },
  );
  console.log("✓ server workflow checks passed");
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
