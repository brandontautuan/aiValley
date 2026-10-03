# Role B Server Architecture

## Scope

Role B owns `server/**` and `contracts/**`. This layer is the authoritative
API, orchestration, revision boundary, and durable local store. It does not
calculate demand or pricing, load fixtures, generate campaign copy, or render
the UI.

## Runtime Entry Points

- `server/index.ts` is the Node HTTP server and thin route table.
- `server/planner.ts` owns all API behavior. `createPlanner(...)` is the
  framework-free public server interface.
- `server/store.ts` persists state atomically to `$DATA_DIR/store.json`
  (default `.data/store.json`). The store remains untracked.
- `contracts/index.ts` is the shared type and API source of truth.

## Core Workflow

1. The server loads planning data from Role D.
2. The server requests outlooks and offer candidates from Role C.
3. It persists a recommendation with revision `1`.
4. An offer edit calls Role C again, increments the revision, and moves any
   prior explanation/social copy into `staleContent`.
5. Content generation only attaches when its target revision is still current.
6. Approval revalidates the selected offer through Role C and writes a durable
   `SavedPlan`. Repeating the same approval is idempotent.

## Strategy Workflow

`StrategyRun` is a separate, durable wrapper around the one-day
recommendation. It supports horizons from 1 through 365 days:

- 1–7 days: `hourly`
- 8–90 days: `daily`
- 91–365 days: `weekly`

Creating a run also creates or reuses the corresponding recommendation. The
server ranks promotion, organic-campaign, and hold/monitor actions. Promotion
actions hold the linked recommendation ID and revision; approving one calls
the existing offer-approval path, so C's guardrails run immediately before a
plan is saved.

`StrategyWorkflow` in `server/planner.ts` is the server-only adapter boundary
for ZooWork orchestration and optional Band research rooms. Its result can add
ZooWork/Band identifiers and bounded `TrendEvidence`. Only evidence marked
`verified` is included in a ranked action's evidence IDs. When the adapter is
missing or fails, the server emits a `workflow-fallback` event and still
returns a conservative, manager-reviewable strategy.

## API Surface

- `GET /api/overview`
- `GET /api/locations/:id/outlook`
- `POST /api/recommendations`
- `GET|PATCH /api/recommendations/:id`
- `POST /api/recommendations/:id/explanation`
- `POST /api/recommendations/:id/social-draft`
- `POST /api/recommendations/:id/decision`
- `POST /api/strategy-runs`
- `GET /api/strategy-runs/:id`
- `POST /api/strategy-runs/:id/approve`
- `GET /api/action-plan`
- `POST /api/demo/reset`

All write requests use JSON. Recommendation and strategy approvals require an
`expectedRevision`; stale writes return `STALE_REVISION` with HTTP 409.

## Verification

Run `node --experimental-strip-types --no-warnings server/check.ts`.
The server check covers the recommendation lifecycle, invalid/overlapping
offers, stale content, idempotent approvals, persistence across restart,
reset, strategy horizon validation, workflow fallback, and verified-evidence
filtering. `npm run check` additionally requires the root dependencies to be
installed by Role A.

## Current Integration Work

`server/INTEGRATION_NOTES.md` records the coffee-shop changes requested from
Roles A, C, and D. No live ZooWork, Band, or Tavily transport is configured
yet; wire credentials only in server-owned code and preserve the fallback path.
