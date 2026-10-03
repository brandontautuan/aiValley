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
`node --experimental-strip-types data/check.ts` · `node --experimental-strip-types intelligence/check.ts` (neither uses the network)

## Checks completed
- Fixture determinism and no future data leaking into history.
- Captions match the exact terms.
- Unsupported model numbers or evidence fall back to the template, and so does a model failure.
- Tavily returns `unavailable` without a transport; the deterministic transport test produces review-only evidence with no inferred price.

## Mock random datasets
- `data/mock.ts`: scenario `mock-<seed>` generates a fictional dataset from the seed — store traffic level, daypart shape and capacity, item costs and mix, and 0–2 dated local signals per store. The same seed and date always give the same data; history is the 8 weeks before the planning date. Curated fixtures are untouched.
- The engine is unchanged. Across seeds 1–60 on 2026-10-05 it returned roughly 14% discounts, 26% capacity holds and 60% other keep-price decisions.
- Every mock signal is titled "(mock)" and its adjustment is an assumption; `fixtureLabel` reads "Mock dataset #<seed> …".

## Live data snapshot (opt-in)
- `data/fetch.ts` builds a snapshot from the internet and writes it to `.data/live/snapshot.json` (untracked): `node --experimental-strip-types data/fetch.ts`.
  - With no arguments it downloads the Maven Analytics public "Coffee Shop Sales" practice dataset (a fictitious chain with three New York stores, Jan–Jun 2023, so not a real business's sales; needs the `unzip` command), plus the Open-Meteo 16-day forecast and Nager.Date public holidays. None need a key.
  - `--sales <csv path or URL> --config <json> [--costs <csv>]` imports a real transaction export instead. Formats: `parseSalesCsv` and `LiveConfig` in `data/live.ts`.
- `data/live.ts` (pure apart from reading the snapshot file): CSV parsing, hourly aggregation, weather and holiday normalization, and `planningDataFromSnapshot`.
- `loadPlanningData` serves the snapshot for `typical` and `local-event` only when `PLANNING_SNAPSHOT=<path>` is set. Unset, nothing changes; `mock-<seed>` is never affected.
- Labeled assumptions, all listed in `fixtureLabel`:
  - History older than a week before the planning date is re-dated forward by whole weeks.
  - Capacity is 1.25× the busiest observed hour unless the config supplies it.
  - Costs are unknown (discounts blocked) unless a costs file or `assumeCostShare` is given.
  - Weather adjustments are the judgment values in `WEATHER_ASSUMPTIONS`; holidays carry no adjustment.
- Snapshot location IDs differ from the fixture stores, so recommendations saved from fixture data return 404 until the demo is reset, and `SF_COMPETITOR_PROFILES` has no entries for them.

### Requests to other roles
- B: add a `live` value to `ScenarioId` and `parseScenario`, so live data is a selectable scenario instead of an environment switch; add a `SourceLabel` for POS-imported records.
- A: show `fixtureLabel` from the API in the header for non-mock scenarios (it currently shows the static `brand.fixtureNotice`, which mislabels a live snapshot as fixtures); add `PLANNING_SNAPSHOT=` to `.env.example`.

## Next
- Implement a server-side `ContentModel`, e.g. a Claude call that reads `ANTHROPIC_API_KEY`. Hand it to B so it can be passed into `createPlanner`.
- B needs to provide/freeze a contract for configured competitor profiles and a research response, then wire `searchCompetitorOffers({ locationId, locationName, planningDate, competitors: SF_COMPETITOR_PROFILES[locationId] }, createTavilySearchTransport({ apiKey: process.env.TAVILY_API_KEY }))` into the current `POST /api/locations/:id/competitor-research` 501 stub. The server, not this module, reads the key. Return only its review-only evidence; manager promotion into canonical competitor offers remains a separate auditable write.
