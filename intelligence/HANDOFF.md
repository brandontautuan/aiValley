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
- `intelligence/competitorResearch.ts`: Tavily boundary (stretch goal), moved here from `src/campaigns`. It has no SDK and no environment access.

## Contract version
1.

## How to run/check
`node --experimental-strip-types data/check.ts` · `node --experimental-strip-types intelligence/check.ts`

## Checks completed
- Fixture determinism and no future data leaking into history.
- Captions match the exact terms.
- Unsupported model numbers or evidence fall back to the template, and so does a model failure.
- Tavily returns `unavailable` without a transport.

## Next
- Implement a server-side `ContentModel`, e.g. a Claude call that reads `ANTHROPIC_API_KEY`. Hand it to B so it can be passed into `createPlanner`.
- Implement a `TavilyResearchTransport` that reads `TAVILY_API_KEY`.
