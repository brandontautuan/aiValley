# Campaigns handoff

## Ready interfaces and paths

- `competitorResearch.ts` exports a server-only, dependency-free Tavily boundary.
- `createTavilyResearchRequest(input)` creates a bounded request for configured competitors only.
- `startCompetitorResearch(input, transport)` returns queued, unavailable, or failed without blocking fixture planning.
- `normalizeRetrievedSource(run, competitorId, source)` returns attributed evidence in `needs_review` status with offer fields intentionally null.

## Integration required from Person 1

1. Define shared request/result contracts in `src/contracts` after agreeing the final field names.
2. Configure `TAVILY_API_KEY` server-side and provide a `TavilyResearchTransport` implementation; do not expose the key to a client bundle.
3. Wire routes that start a job and retrieve/persist its status/results.
4. Provide the auditable manager-promotion path into canonical competitor data. Only promoted, verified, fresh evidence may trigger an updated pricing snapshot.

## Verification

No project manifest or TypeScript checker exists yet. The module has no external runtime dependency and awaits the platform-selected TypeScript/build configuration for execution checks.
