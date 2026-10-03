# Role D handoff — data and AI content

## Ready interfaces and paths
- `data/index.ts`: `loadPlanningData({ date, scenario })` returns deterministic fixtures from `data/fixtures.ts`:
  - 3 stores and 5 items
  - 8 weeks of generated hourly orders and units, with one labeled past promotion
  - event, weather and holiday signals
  - competitor offers
  The demo date is fixed at 2026-10-05, a Monday.
- `intelligence/index.ts`:
  - `generateExplanation(packet, model?)` and `generateSocialDraft(packet, model?)` return template output, or validated model output when a `ContentModel` is supplied.
  - `validateGeneratedContent` rejects unknown evidence IDs and any price or percentage that is not in the packet.
- `intelligence/competitorResearch.ts`: bounded, per-configured-competitor research request, unavailable/failure behavior, and evidence normalization. `searchCompetitorOffers` produces only attributable `needs_review` evidence with null offer facts.
- `intelligence/tavilySearchTransport.ts`: server-only native-fetch Tavily Search adapter. It accepts an injected API key, sends a bounded advanced search, and returns source URL/title/excerpt/timestamps. It returns `undefined` when no key is supplied.
- `data/SF_COMPETITOR_PROFILES`: SF pilot profiles keyed by the three fixture locations. Each profile supplies a specific storefront alias and an official-domain allowlist. The adapter sends this allowlist to Tavily and rejects returned sources outside it.

## Contract version
1.

## How to run/check
`node --experimental-strip-types data/check.ts` · `node --experimental-strip-types intelligence/check.ts`

## Checks completed
- Fixture determinism and no future data leaking into history.
- Captions match the exact terms.
- Unsupported model numbers or evidence fall back to the template, and so does a model failure.
- Tavily returns `unavailable` without a transport; the deterministic transport test produces review-only evidence with no inferred price.

## Next
- Implement a server-side `ContentModel`, e.g. a Claude call that reads `ANTHROPIC_API_KEY`. Hand it to B so it can be passed into `createPlanner`.
- B needs to provide/freeze a contract for configured competitor profiles and a research response, then wire `searchCompetitorOffers({ locationId, locationName, planningDate, competitors: SF_COMPETITOR_PROFILES[locationId] }, createTavilySearchTransport({ apiKey: process.env.TAVILY_API_KEY }))` into the current `POST /api/locations/:id/competitor-research` 501 stub. The server, not this module, reads the key. Return only its review-only evidence; manager promotion into canonical competitor offers remains a separate auditable write.
