import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { ActionPlanResponse, DecisionResponse, LocationOutlookResponse, OverviewResponse, Recommendation } from "../contracts/index.ts";
import { createApp } from "./index.ts";
import { createPlanner } from "./planner.ts";
import { createFileStore } from "./store.ts";

const dataDir = mkdtempSync(join(tmpdir(), "planner-check-"));
const date = "2026-10-05";

async function withServer<T>(run: (call: <R>(method: string, path: string, body?: unknown) => Promise<{ status: number; json: R }>) => Promise<T>): Promise<T> {
  const server = createApp(createPlanner({ store: createFileStore(dataDir) })).listen(0);
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
    assert.equal(overview.locations.find((entry) => entry.location.id === "downtown")!.selectedKind, "discount");

    const outlook = (await call<LocationOutlookResponse>("GET", `/api/locations/downtown/outlook?date=${date}`)).json;
    assert.equal(outlook.outlook.hours.length, 10);
    assert.equal((await call("GET", "/api/locations/nowhere/outlook")).status, 404);
    assert.equal((await call("GET", "/api/overview?scenario=bogus")).status, 400);

    let rec = (await call<Recommendation>("POST", "/api/recommendations", { date, scenario: "typical", locationId: "downtown" })).json;
    assert.equal(rec.revision, 1);
    assert.equal((await call<Recommendation>("POST", "/api/recommendations", { date, scenario: "typical", locationId: "downtown" })).json.id, rec.id, "create is idempotent");

    rec = (await call<Recommendation>("POST", `/api/recommendations/${rec.id}/social-draft`, { expectedRevision: 1 })).json;
    assert.ok(rec.socialDraft?.caption.includes("$12.60"));

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
  });
  console.log("✓ server workflow checks passed");
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
