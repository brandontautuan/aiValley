# Temporary integration notes

The initial repository contained only team instructions. To unblock parallel work, a barebones Person 1 platform foundation was added on 2026-10-03:

- `package.json` uses Node's built-in TypeScript type stripping; it deliberately adds no external dependency.
- `src/contracts/index.ts` is a minimal shared-contract placeholder. Person 1 remains responsible for freezing and revising it with affected owners.
- `src/platform/fixtures.ts` supplies labeled demo fixtures for three locations and five menu items.
- `src/platform/persistence.ts` is intentionally in-memory. Replace it with durable local storage before claiming approved plans survive restart.
- `src/platform/server.ts` exposes only `GET /api/health` and `GET /api/planning-data`; feature owners should provide handlers that Person 1 wires as thin routes.

## Pending owner work

- Person 2: demand baseline/context logic and location-outlook interface in `src/demand`.
- Person 3: offer economics/validation and review interface in `src/pricing`.
- Person 4: campaigns, Tavily evidence, social drafts, and decision handlers in `src/campaigns`.
- Person 1: finalize contracts, persistence, route wiring, config including server-only `TAVILY_API_KEY`, and shared app UI.

Tavily evidence must remain attributed and `needs_review` until a manager verifies and promotes it. It must not directly change an offer, recommendation, or social draft.
