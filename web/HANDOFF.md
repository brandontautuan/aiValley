# Role A handoff — web and app setup

## Ready interfaces and paths
- `web/src/App.tsx`: shell, tabs (Today, Week, Month, Strategy, Action plan), date picker, segmented scenario toggle, demo reset.
- `web/src/nav.ts`: hash routes `#/`, `#/week`, `#/month`, `#/strategy`, `#/plan`, `#/location/:id`, each with optional `?date=&scenario=`. Date and scenario live in the URL, so reloads and shared links restore the view. Links without a query keep the current values.
- `web/src/brand.ts`: all visible brand and product copy (Harborline Coffee). Edit this one file to rebrand.
- `web/src/insights.ts`: display-only helpers (sentences, daypart states, action labels). They interpret server numbers and compute no economics.
- `web/src/components/`:
  - **Today:** briefing cards with a mini hourly chart, a plain-language sentence and status, plus a "what changed" line for the event scenario.
  - **Week:** a 7-day store × day heatmap split into lunch, afternoon and evening, with event tags, a detail panel and a promotion-fatigue warning.
  - **Month:** a calendar of dated context records and saved plans, with the next 7 days outlined and a usual-pattern panel. It says clearly that it is not a forecast.
  - **LocationDetail:** a page of five parts:
    - `DemandChart`: annotated hourly chart showing the usual baseline behind the estimate, context and competitor notes, capacity and the offer window.
    - Recommendation card, dark when holding price for capacity.
    - Collapsible evidence.
    - `OptionCards`: break-even bar and low/base/high range for each option.
    - `TermsEditor`, `PromotePanel` (post preview checked field by field against the current terms, with a stale overlay), `SocialMediaPlan` (reviewable three-step cadence tied to applied local context and the selected action; no viral/performance claims), and a fixed `DecisionBar` at the bottom.
    - `CompetitorResearchPanel`: manager-triggered Tavily context refresh with compact competitor/source cards, attributed links, retrieval timestamps, excerpts, limitations, unavailable/failed states, and an explicit review-only boundary.
  - **ActionPlan:** day tabs, a store × hour timeline (promotion blocks, hold-price blocks, post-time pin), plan cards, replaced approvals, and "Copy plan as text".
  - **StrategyPanel:** multi-day strategy runs (owned by the other web session).
- `web/src/api.ts`: typed client for every Role B endpoint; surfaces `ApiError` bodies.

## Contract version
1 (`contracts/index.ts`).

## How to run/check
`npm run dev`, then open http://localhost:5173. `npm run check` typechecks the UI.

## Checks completed
- Typecheck, `npm run check` and the production build pass.
- In headless Chrome against a real API with an isolated store, I rendered:
  - Today in both scenarios.
  - Week and Month.
  - Downtown before and after an edit to 5%: the stale post shows "$12.60 ≠ $13.30", with a regenerate button.
  - Arena on event night: hold-price card and an approved plan.
  - The action-plan timeline.
- Layout fits at 520px wide. Chrome's headless minimum window width prevented a true 390px check.

## Dependencies requested from other roles
- **B (optional performance):** the Today, Week and Month views make one outlook request per store and day (21 for Week; up to 31 action-plan requests for Month). A range endpoint, e.g. `GET /api/outlook/range?start=&days=`, would cut this to one request.
- **D (content):** only Oct 5 has context records, so Week and Month look sparse on later days. More dated fixture events would make the forward views richer, e.g. a Thursday game, a Saturday concert, a holiday and rain days.

## Mock data
- `ScenarioToggle` has a third button, "Random mock data". Each press picks a new seed and sets the scenario to `mock-<seed>`; the seed is carried in the URL, so a dataset can be reloaded or shared.
- Today shows "What changed" chips for the mock signals that apply; Month still compares the two curated scenarios only.

## Known blockers and fallback behavior
- There is no mock adapter yet; the UI runs against the live API only.
- Public-web competitor research is available from a location page. It needs `TAVILY_API_KEY`; otherwise it visibly reports unavailable while fixture planning continues. It never changes a recommendation or promotion copy; an audited manager-promotion workflow is still required before a verified source could enter planning data.
