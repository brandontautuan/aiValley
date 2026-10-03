import assert from "node:assert/strict";
import { loadPlanningData, SF_COMPETITOR_PROFILES } from "../data/index.ts";
import { calculateLocationOutlook, ENGINE_ASSUMPTIONS, evaluateOffers } from "../engine/index.ts";
import { BRAND_TONE, createTavilySearchTransport, generateExplanation, generateSocialDraft, normalizeRetrievedSource, searchCompetitorOffers, searchReviews, startCompetitorResearch, validateGeneratedContent, type ContentModel, type ContentPacket } from "./index.ts";

const date = "2026-10-05";
const data = loadPlanningData({ date, scenario: "typical" });
const outlook = calculateLocationOutlook(data, { date, scenario: "typical", locationId: "downtown" });
const selected = evaluateOffers(data, outlook).find((candidate) => candidate.terms.discountPct === 10)!;
const packet: ContentPacket = {
  recommendationId: "rec-check",
  revision: 2,
  location: data.locations[0],
  outlook,
  selected,
  deterministicReason: "Trial 10% off.",
  contextSignals: data.contextSignals.filter((signal) => signal.locationIds.includes("downtown")),
  competitorOffers: data.competitorOffers.filter((offer) => offer.locationId === "downtown"),
  assumptions: ENGINE_ASSUMPTIONS,
  brandTone: BRAND_TONE,
};

// Template copy states exactly the computed terms.
const draft = await generateSocialDraft(packet);
assert.equal(draft.revision, 2);
assert.equal(draft.source, "template");
assert.ok(draft.caption.includes("$12.60") && draft.caption.includes("Coffee & Pastry Pair") && draft.caption.includes("Disney Cafe Downtown"));
assert.deepEqual(validateGeneratedContent(packet, { text: draft.caption }), []);

// Unsupported model numbers or evidence fall back to the template.
const lyingModel: ContentModel = {
  explain: async () => ({ summary: "Sales will rise 40% to $9.99.", evidenceIds: ["made-up"], assumptions: [], risks: [] }),
  draftSocial: async () => ({ caption: "Coffee $9.99 today!", creativeBrief: "" }),
};
assert.equal((await generateExplanation(packet, lyingModel)).source, "template");
assert.equal((await generateSocialDraft(packet, lyingModel)).source, "template");
const failingModel: ContentModel = { explain: async () => { throw new Error("down"); }, draftSocial: async () => { throw new Error("down"); } };
assert.equal((await generateExplanation(packet, failingModel)).source, "template");
const explanation = await generateExplanation(packet);
assert.ok(explanation.evidenceIds.every((id) => packet.contextSignals.some((s) => s.id === id) || packet.competitorOffers.some((o) => o.id === id)));

// Tavily boundary: no transport → unavailable, never blocking.
const run = await startCompetitorResearch({ locationId: "downtown", locationName: "Downtown, San Francisco", planningDate: date, competitors: SF_COMPETITOR_PROFILES.downtown.slice(0, 1) }, undefined);
assert.equal(run.status, "unavailable");
const evidence = normalizeRetrievedSource(run, "blue-bottle-downtown", { url: "https://example.com/menu", title: "Menu", retrievedAt: "2026-10-03T12:00:00Z", claimText: "Afternoon coffee" });
assert.equal(evidence.observationStatus, "needs_review");
assert.equal(evidence.priceCents, null);

// A configured server-side transport produces attributable, review-only evidence.
const transport = createTavilySearchTransport({
  apiKey: "test-key",
  now: () => new Date("2026-10-03T12:00:00Z"),
  fetchImplementation: async () => new Response(JSON.stringify({
    request_id: "tavily-check",
    results: [{ url: "https://bluebottlecoffee.com/menu", title: "Official menu", content: "A source-backed menu snippet", published_date: "2026-10-01T00:00:00Z" }],
  }), { status: 200 }),
});
const batch = await searchCompetitorOffers(
  { locationId: "downtown", locationName: "Downtown, San Francisco", planningDate: date, competitors: SF_COMPETITOR_PROFILES.downtown.slice(0, 1) },
  transport,
  new Date("2026-10-03T12:00:00Z"),
);
assert.equal(batch.results[0].run.status, "completed");
assert.equal(batch.results[0].evidence[0].sourceUrl, "https://bluebottlecoffee.com/menu");
assert.equal(batch.results[0].evidence[0].priceCents, null);

// Review monitoring: unavailable without a transport; otherwise excerpts that name the business, tagged by topic only.
const reviewInput = { locationId: "downtown", locationName: "Downtown, San Francisco", planningDate: date, subjects: SF_COMPETITOR_PROFILES.downtown.slice(0, 1) };
assert.equal((await searchReviews(reviewInput, undefined))[0].run.status, "unavailable");
let reviewRequest: { query: string; allowedDomains: string[] } | undefined;
const [reviews] = await searchReviews(reviewInput, {
  async search(request) {
    reviewRequest = request;
    return {
      providerRequestId: "tavily-reviews",
      sources: [
        { url: "https://www.yelp.com/biz/blue-bottle", title: "Blue Bottle Coffee - Yelp", claimText: "Friendly staff but the line was slow and it is pricey.", retrievedAt: "2026-10-03T12:00:00Z" },
        { url: "https://www.yelp.com/biz/other-cafe", title: "Other Cafe - Yelp", claimText: "Great espresso.", retrievedAt: "2026-10-03T12:00:00Z" },
        { url: "not-a-url", title: "Blue Bottle Coffee", claimText: "Blue Bottle Coffee", retrievedAt: "2026-10-03T12:00:00Z" },
        { url: "https://www.yelp.com/search?find_desc=Blue+Bottle", title: "Blue Bottle Coffee San Francisco", claimText: "Blue Bottle Coffee 4.4", retrievedAt: "2026-10-03T12:00:00Z" },
        { url: "https://www.tripadvisor.com/Restaurant_Review-1", title: "Blue Bottle Coffee", claimText: "Skip to main content Sign in", retrievedAt: "2026-10-03T12:00:00Z" },
      ],
    };
  },
});
assert.ok(reviewRequest!.query.includes('"Blue Bottle Coffee"') && reviewRequest!.allowedDomains.includes("yelp.com"));
assert.equal(reviews.run.status, "completed");
assert.deepEqual(reviews.mentions.map((mention) => [mention.sourceSite, mention.themes, mention.status]), [["yelp.com", ["service", "wait", "price"], "needs_review"]]);
const failedReviews = await searchReviews(reviewInput, { async search() { throw new Error("down"); } });
assert.equal(failedReviews[0].run.status, "failed");

console.log("✓ intelligence checks passed");
