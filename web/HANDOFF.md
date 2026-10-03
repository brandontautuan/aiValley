# Role A handoff — web and app setup

## Ready interfaces and paths
- `web/src/App.tsx`: shell, hash routing (`#/`, `#/location/:id`, `#/strategy`, `#/plan`), date/scenario selectors, demo reset.
- `web/src/brand.ts`: all visible brand/product copy (Harborline Coffee); swap here to rebrand.
- `web/src/components/`: Overview, LocationDetail (chart + evidence), OfferTable, ReviewPanel (edit/approve/dismiss), ContentPanel (explanation + Instagram draft, stale copy), ActionPlan, StrategyPanel.
- `web/src/components/StrategyPanel.tsx`: multi-day strategy runs — build control (location + horizon), run view with status/revision, ranked actions with linked-recommendation and evidence refs, per-action approval honoring `expectedRevision` (reloads on `STALE_REVISION`), research-evidence list with freshness/status/limitations and empty-evidence fallback, and an event timeline.
- `web/src/api.ts`: typed client for every Role B endpoint (incl. `createStrategyRun`/`strategyRun`/`approveStrategyRun`); surfaces `ApiError` bodies.

## Contract version
1 (`contracts/index.ts`).

## How to run/check
`npm run dev`, then open http://localhost:5173. `npm run check` typechecks the UI.

## Checks completed
- Typecheck and production build pass.
- Rendered the overview and location pages against the real API in headless Chrome.

## Dependencies requested from other roles
None outstanding.

## Known blockers and fallback behavior
- There is no mock adapter yet; the UI runs against the live API only. Add `web/src/mockApi.ts` if the backend becomes unavailable.
- Date and scenario live in app state, not the URL, so a page reload resets them to the defaults.
- Tavily research UI is not built; the endpoint returns `FEATURE_UNAVAILABLE`.
