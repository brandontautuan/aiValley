# Role B handoff — API and persistence

## Ready interfaces and paths
- `server/index.ts`: thin `node:http` route table (see DESIGN.md §6), JSON bodies, `ApiError` responses, serves `web/dist` in production.
- `server/planner.ts`: framework-free orchestration (`createPlanner({ store, model? })`). `ZOOWORK_CONTENT_AGENT_ID` optionally supplies a server-only structured content model; templates remain the fallback.
- `server/store.ts`: atomic JSON-file store in `$DATA_DIR/store.json` (default `.data/`, gitignored).
- `POST /api/strategy-runs`, `GET /api/strategy-runs/:id`, and
  `POST /api/strategy-runs/:id/approve`: durable strategy workflow around the
  existing recommendation path.
- `server/ARCHITECTURE.md`: role ownership, data flow, API surface, revision
  semantics, strategy workflow, and verification guide for future agents.
- Dates before 2026-08-11, which have no usable fixture history, return
  `422 NO_HISTORICAL_DATA` rather than
  creating a zero-demand recommendation.

## Contract version
1.

## Demo name
Server-side content-agent check fixtures and integration notes use the fictional
Project Northstar name. This is a copy-only change; API and revision behavior are unchanged.

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
- `ZOOWORK_CONTENT_AGENT_ID` optionally supplies structured explanations and Instagram drafts. When it, credentials, SDK, or the provider are unavailable—or output fails validation—the deterministic templates remain active.
- `POST /api/locations/:id/competitor-research` refreshes only configured coffee-shop profile seeds. With no Tavily key it returns per-profile `unavailable` states; sources always remain `needs_review` and cannot alter pricing or social copy.
- `createPlanner` accepts an optional server-only `strategyWorkflow` adapter.
  It may return ZooWork and Band identifiers plus bounded research evidence.
  Only evidence marked `verified` can inform ranked actions. The ZooWork adapter
  is optional, so the deterministic fallback remains available.

## ZooWork Growth Planner adapter
- `server/zoowork.ts` starts a configured Growth Planner run, sending only a
  reduced location profile, horizon, deterministic recommendation summary, and
  at most 12 bounded evidence summaries. It neither sends customer data nor
  raw social/media collections.
- `server/index.ts` wires the adapter from server-only `ZOOWORK_AGENT_ID` and
  `ZOOWORK_API_KEY`. The optional `@zoowork-ai/sdk` package supplies the
  documented Session API; missing credentials, SDK, or service availability
  keeps the existing deterministic fallback active.
- The adapter normalizes returned evidence. Only explicitly verified, attributed
  records receive `verified`; incomplete or unverified records remain visible as
  `needs_review` and planner ranking excludes them.
- `createZooWorkContentModelFromEnv` uses `ZOOWORK_CONTENT_AGENT_ID` (or the
  configured strategy agent as a demo fallback) and sends only a bounded
  planning packet. It never sends raw Tavily results. The planner validates all
  content before saving it to a revision.
- `scenario` accepts `mock-<seed>` (1–9 digits) in addition to `typical` and `local-event`; `ScenarioId` in contracts reflects this.
- The content packet carries `selected.weekday`; social copy that names any
  other day of the week is rejected and the template is used.
- Strategy requests now carry their own `instructions` (output shape, review
  only supplied evidence, never mark items verified), so any running agent
  owned by the key's Project can serve `ZOOWORK_AGENT_ID`.
