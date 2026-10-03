# Bowlhouse Revenue Planner

An AI-assisted daily revenue planner for a small restaurant chain. It answers one question: **what should each location do tomorrow, and why?**

Historical orders and local signals → demand outlook → offer comparison → explanation and social draft → manager review → saved action plan.

All data is fictional demo fixtures. Approving saves a plan only; nothing is published and no live menu changes.

## Run it

Requires Node 22.12 or later.

```bash
npm install
npm run dev          # API on :3000 + web on http://localhost:5173
npm run check        # typecheck + every module's deterministic checks
npm run build && npm start   # single-port demo on http://localhost:3000
```

Saved plans live in `.data/store.json`, which is gitignored and separate for each checkout. Use **Reset demo** in the UI, or `POST /api/demo/reset`, to restore the starting state. Copy `.env.example` to `.env` for optional settings.

## Demo script (3 minutes)

1. **Locations**, Typical day. The three stores get different decisions: Downtown gets a discount trial, and the other two keep the regular price.
2. **Downtown.** Show the soft 2–5 p.m. window, the rain assumption, the comparable competitor offer, and the 10%-off break-even threshold.
3. **Edit the offer** (for example to 5%) and click **Recalculate**. The revision bumps and any old copy goes stale. Then **Generate copy** and **Approve plan**. The plan appears under **Action plan** and survives a reload.
4. Switch the scenario to **Local event day** and open **Arena**. The pre-concert rush hits capacity, so the planner recommends keeping the regular price.
5. Close by explaining that real sales and context feeds would replace `data/fixtures.ts`.

## Layout and ownership

| Path | Role | What |
| --- | --- | --- |
| `web/**`, root scaffold | A: frontend and app setup | React UI, API client, `package.json`, `tsconfig.json`, `scripts/`, this README |
| `server/**`, `contracts/**` | B: API and persistence | Routes, orchestration, revisions, decisions, store; shared types |
| `engine/**` | C: demand and pricing | Baseline, scenarios, capacity, offer economics, guardrails, selection |
| `data/**`, `intelligence/**` | D: data and AI content | Fixtures and loader; explanations, social drafts, validation, Tavily boundary |
| `DESIGN.md`, `AGENTS.md` | Team lead | Product design and ownership rules |

Read `AGENTS.md`, `DESIGN.md`, and the `AGENTS.md` and `HANDOFF.md` in your own directory before starting. Work on your role branch (`role-a-ui`, `role-b-api`, `role-c-engine`, `role-d-data-ai`) in its own checkout or worktree, and edit only the paths you own.

## How the pieces connect

```
web ──HTTP──▶ server/index.ts ─▶ server/planner.ts
                                   ├─ data.loadPlanningData()
                                   ├─ engine.calculateLocationOutlook / evaluateOffers / selectRecommendedCandidate
                                   ├─ intelligence.generateExplanation / generateSocialDraft  (template fallback)
                                   └─ server/store.ts (JSON file)
```

Shared types and conventions are in `contracts/index.ts`:
- money in integer cents
- local `YYYY-MM-DD` dates and hours
- windows include the start hour and exclude the end hour
- orders and item units kept separate
- revision-checked writes

## Stretch goals

- **Model adapter.** Implement `ContentModel` in `intelligence/` and pass it into `createPlanner`. Output that fails validation falls back to templates.
- **Tavily competitor research.** `intelligence/competitorResearch.ts` is ready. The endpoint currently returns `FEATURE_UNAVAILABLE`.
