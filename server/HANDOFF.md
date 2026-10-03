# Role B handoff — API and persistence

## Ready interfaces and paths
- `server/index.ts`: thin `node:http` route table (see DESIGN.md §6), JSON bodies, `ApiError` responses, serves `web/dist` in production.
- `server/planner.ts`: framework-free orchestration (`createPlanner({ store, model? })`).
- `server/store.ts`: atomic JSON-file store in `$DATA_DIR/store.json` (default `.data/`, gitignored).
- `POST /api/strategy-runs`, `GET /api/strategy-runs/:id`, and
  `POST /api/strategy-runs/:id/approve`: durable strategy workflow around the
  existing recommendation path.
- `server/ARCHITECTURE.md`: role ownership, data flow, API surface, revision
  semantics, strategy workflow, and verification guide for future agents.

## Contract version
1.

## How to run/check
`npm run dev:server` · `node --experimental-strip-types server/check.ts`

## Checks completed
`server/check.ts` drives the full workflow over HTTP:
- overview and outlook
- idempotent create
- copy generation
- edit, which creates a new revision and marks old copy stale
- stale-revision 409
- guardrail 422
- idempotent approval
- restart persistence
- overlap rejection
- reset
- strategy-run horizon validation, workflow fallback, stale approval, and
  idempotent approval

## Behavior notes
- A recommendation ID is `rec-<location>-<date>-<scenario>`; `POST /api/recommendations` returns the existing one.
- An edit keeps the previous approved plan active until a newer revision is approved; dismissal supersedes it.
- Model content that comes back for an old revision is stored in `staleContent` and never attached as current.

## Known blockers and fallback behavior
- No model adapter is wired: `createPlanner` accepts an optional `model`, and template content is used when it's absent.
- The competitor-research endpoints return 501 `FEATURE_UNAVAILABLE` (stretch goal).
- `createPlanner` accepts an optional server-only `strategyWorkflow` adapter.
  It may return ZooWork and Band identifiers plus bounded research evidence.
  Only evidence marked `verified` can inform ranked actions; no adapter is
  configured yet, so the deterministic fallback remains available.
