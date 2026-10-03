# Restaurant Revenue Planner — Four-Person Build Plan

## 1. Product and demo scope

Build an AI-assisted revenue planner for a small restaurant chain. The operator's question is **“What should each location do tomorrow, and why?”**

The complete workflow is:

**Historical orders and local signals → demand outlook → offer comparison → AI explanation and social draft → manager review → saved action plan.**

Assume a 24–48 hour hackathon, one fictional bowl restaurant brand, three locations, five menu items, and an hourly outlook for a selected planning date. The proposed layout below is a starting structure, not a description of an existing repository. Adapt paths once during setup if needed, then freeze ownership.

### Essential capabilities

| Capability | MVP |
| --- | --- |
| Chain overview | Three locations, projected orders, demand classification, prioritized actions |
| Location outlook | Hourly baseline and adjusted outlook with relevant evidence |
| Pricing | Regular price, 5% off, 10% off, and optionally one predefined bundle |
| Local context | Curated event, holiday, weather, and competitor fixtures; optional Tavily competitor-research refresh |
| Review | Edit terms, recalculate economics, approve or dismiss |
| Social content | Exact-offer caption, proposed posting time, creative brief |
| Action plan | Approved terms persist after reload |

Defer POS writes, social publishing, scraping, maps, customer-level pricing, ordering, payments, inventory, staffing, and a general chat assistant. Start with fixtures; live integrations are stretch goals. Tavily-based competitor research is the one named stretch integration: it gathers attributed public-web evidence for manager review, never makes a live price change or treats a search result as a verified offer.

Approval means **saved plan**. It does not mean a live menu changed or a post was published.

## 2. Four roles and exclusive write ownership

Assign one person and their coding agent to each role. Split by module so people working on the same screen do not have to edit the same files.

| Role | Owns | Deliverable | Must not edit |
| --- | --- | --- | --- |
| A — Frontend and app setup | `web/**`, root app/tooling configuration explicitly listed below | Complete operator UI, API client, loading/error states, app scaffold | Server, engine, fixtures, AI module, shared contracts |
| B — API and persistence | `server/**`, `contracts/**` | API, orchestration, validation at write time, saved decisions, shared interface definitions | UI, demand formulas, fixture records, AI prompts |
| C — Demand and pricing | `engine/**` | Baselines, context adjustments, capacity checks, offer economics, deterministic recommendation | Routes, database, UI, data ingestion, AI calls |
| D — Data and AI content | `data/**`, `intelligence/**` | Fixtures and loader, evidence packets, AI explanations, social drafts, fallback content | UI, routes, persistence, pricing formulas, shared contracts |

All roles may read the full repository. Only the owner edits a path. This reduces overlap; it does not remove the need to coordinate interface changes.

### Shared/root ownership

- Role A owns the initial root scaffold: package manifest and lockfile, workspace/build configuration, environment example, ignore file, development scripts, and README. Record the exact filenames in the root `AGENTS.md` after choosing the stack.
- Role B owns shared types, schemas, example API payloads, and the contract version in `contracts/**`.
- The team lead owns this design document and the root ownership rules. Changing the product scope or ownership map is an explicit team decision.
- Each role owns its nested `AGENTS.md`, local checks, and `HANDOFF.md` within its assigned directory.
- New root files require an owner before creation. Formatting, dependency updates, and renames must stay inside the same boundaries.

If a teammate needs a dependency, they send Role A its name and purpose. Role A updates the root manifest and lockfile. Nobody else runs dependency commands that rewrite those files.

## 3. Proposed repository layout

```text
DESIGN.md
AGENTS.md
README.md
[root app configuration — Role A]
contracts/
  AGENTS.md
  [shared types, schemas, example requests and responses]
web/
  AGENTS.md
  HANDOFF.md
  [pages, components, styles, API client, frontend mocks]
server/
  AGENTS.md
  HANDOFF.md
  [routes, orchestration, repositories, decision storage]
engine/
  AGENTS.md
  HANDOFF.md
  [baseline, scenarios, candidates, economics, validation]
data/
  AGENTS.md
  [locations, menu, sales, events, holidays, competitors, loader]
intelligence/
  AGENTS.md
  HANDOFF.md
  [evidence packing, LLM adapter, response validation, fallbacks]
```

Do not create a general shared utility directory that everyone edits. Put a helper with its owning module or ask Role B to expose a genuinely shared definition through contracts.

Keep runtime-generated database files out of tracked source. Each local development instance gets its own runtime data path; this prevents teammates from changing the same database file through normal app usage.

## 4. Agree on interfaces before parallel implementation

During the first 30–60 minutes, A creates the scaffold, B writes minimal contracts, C confirms calculation inputs, and D confirms the fixture/evidence shape. Then freeze contract version 1 and work against it.

Role B publishes shared definitions and representative payloads for:

| Contract | Required contents |
| --- | --- |
| `PlanningRequest` | Planning date, scenario ID, location ID where relevant |
| `PlanningData` | Locations, menu, hourly sales, applicable context, competitor offers, chain policy |
| `LocationOutlook` | Hourly order baseline/scenario, item-unit baseline/scenario, capacity, evidence IDs, quality notes |
| `OfferCandidate` | ID, item/bundle, location, window, regular/proposed price, contribution, break-even units, response scenarios, validation results |
| `Recommendation` | ID, revision, selected candidate, deterministic reason, evidence snapshot, status |
| `Explanation` | Summary, evidence IDs, assumptions, risks, generation source |
| `SocialDraft` | Recommendation ID/revision, exact terms, caption, posting time, creative brief, generation source |
| `SavedPlan` | Recommendation ID/revision, final terms, decision timestamp, saved content if current |
| `ApiError` | Stable code, message, field issues if applicable, retryable flag |

### Conventions to freeze

- Currency is USD; represent money as integer cents. Round percentage-derived prices using one shared documented rule before calculating contribution.
- Dates are `YYYY-MM-DD` in the location's timezone; timestamps include offsets. Do not interpret tomorrow from the server timezone.
- Windows use start-inclusive, end-exclusive boundaries.
- IDs are stable strings. All evidence references resolve to supplied records.
- Item units and customer order counts are distinct fields. Capacity is measured in orders per hour.
- Scenario effects are explicitly assumed unless backed by supplied observations.
- Recommendation statuses are `draft`, `approved`, and `dismissed`.
- Revision is an integer changed whenever reviewed terms change; approval/content requests include the revision they target.
- A successful response and an error response have agreed shapes. Example fixtures cover both.

Role A may build frontend mocks **inside `web/**`** using B's published examples. C and D may write module-local sample inputs. They do not maintain alternative shared schemas.

## 5. Module boundaries and call flow

The server orchestrates the workflow; the engine performs calculations; the data module supplies records; the AI module explains the computed decision.

| Interface | Owner | Caller | Responsibility |
| --- | --- | --- | --- |
| `loadPlanningData(request)` | D | B | Load and normalize fixtures with provenance |
| `calculateLocationOutlook(data, request)` | C | B | Compute baseline, scenario, capacity, evidence applicability |
| `evaluateOffers(data, outlook, terms?)` | C | B | Compute/validate candidates and edited terms |
| `selectRecommendedCandidate(candidates, outlook)` | C | B | Deterministic selection including no change |
| `generateExplanation(packet)` | D | B | Explain a computed decision using valid evidence |
| `generateSocialDraft(packet)` | D | B | Draft copy matching exact current terms |
| `saveDecision(recommendation, expectedRevision)` | B | B | Revalidate and persist an approved/dismissed decision |

These are logical interfaces; the team may implement them as functions or service methods. Keep them in one backend deployment. Do not add microservices for ownership separation.

Recommended sequence:

1. B loads D's data.
2. B asks C for outlook, candidates, and selection.
3. B creates a persisted draft and revision.
4. B optionally asks D to explain the computed result.
5. A displays the typed response and requests edits through B.
6. B sends edited terms to C, saves a new revision, and invalidates old social content.
7. B requests social content for the current revision, or generates it after approval.
8. B revalidates and saves the manager decision; A refreshes the action plan.

D never selects or changes prices. A never duplicates financial formulas in the UI. B never reimplements C's pricing rules.

## 6. API contract owned by Role B

| Operation | Proposed endpoint | Behavior |
| --- | --- | --- |
| Chain overview | `GET /api/overview?date=...&scenario=...` | Three branch summaries and priority list |
| Location outlook | `GET /api/locations/:id/outlook?date=...&scenario=...` | Chart series, evidence, candidate comparison |
| Create draft | `POST /api/recommendations` | Persist selected planning context and computed offer |
| Edit draft | `PATCH /api/recommendations/:id` | Require expected revision; recalculate and increment revision |
| Explanation | `POST /api/recommendations/:id/explanation` | Add validated explanation or deterministic fallback |
| Social draft | `POST /api/recommendations/:id/social-draft` | Generate content for the requested current revision |
| Competitor research (stretch) | `POST /api/locations/:id/competitor-research` | Start an on-demand, server-side Tavily research refresh; return a job ID or a feature-unavailable response |
| Competitor research result (stretch) | `GET /api/competitor-research/:id` | Return progress and a normalized, attributed review packet; never alter candidates or plans by itself |
| Approve/dismiss | `POST /api/recommendations/:id/decision` | Require expected revision and action; revalidate before approval |
| Saved plan | `GET /api/action-plan?date=...` | Return persisted approved plans |
| Reset demo | `POST /api/demo/reset` | Clear demo decisions and restore the fixture baseline |

Use a conflict error for stale revision requests. If a model result arrives after an edit, discard it or retain it as stale history; never attach it to the latest revision.

Approving the same revision twice must not create duplicate action-plan entries. Editing an approved recommendation creates a new draft revision; existing approved terms remain a historical snapshot until another revision is approved.

## 7. Role A — Frontend and app setup

Build the operator journey and make the application easy to run.

### Deliverables

1. Root scaffold and a working start command.
2. Chain overview with date/scenario selectors and three location cards.
3. Location detail with hourly chart, evidence panel, item selection, and offer comparison.
4. Review panel with edits, validation errors, approve/dismiss controls.
5. Social draft with caption, posting window, creative brief, and copy action.
6. Saved action plan, loading states, empty states, model-fallback label, and visible fixture labels.

### Implementation rules

- Read contracts and display backend numbers without recalculating economics.
- Use a typed API adapter to isolate mock/live switching; keep both implementations under `web/**`.
- Invalidated captions become visibly stale and unavailable as current copy.
- Keep selected date/scenario consistent when moving between overview and detail.
- Use “Approve plan” and “Saved,” not “Published.”
- Treat maps, chat, elaborate animations, and generated graphics as optional.

### Done when

The entire journey works against contract mocks, then against the real API. The UI explains no-change recommendations and remains usable when AI content is unavailable.

## 8. Role B — API, contracts, and persistence

Own the interfaces connecting all roles and the stateful decision workflow.

### Deliverables

1. Minimal shared schemas/types and versioned example payloads before other roles depend on them.
2. API routes and request/response validation.
3. Orchestration using C and D's exported interfaces.
4. Recommendation revisions, edits, approval/dismissal, persisted action plan.
5. Content invalidation and stale-result protection.
6. Demo reset and deterministic error behavior.

### Implementation rules

- Persist input/evidence snapshots and final reviewed terms.
- Validate edited and approved terms through C's engine.
- Keep model credentials and calls server-side through D's adapter.
- Store records in a small persistent store; choose the simplest team-supported option.
- Keep AI explanation optional for approval and expose fallback state.
- Reject invalid IDs and stale revisions; prevent duplicate approvals.

### Done when

The API supports the entire workflow, approved plans survive reload/restart, and conflicting revisions cannot save mismatched terms or content.

## 9. Role C — Demand, economics, and guardrails

Own pure calculation functions that can be checked without a UI, database, or model.

### Demand baseline

Calculate average item units for matching location, weekday, and hour over comparable recent weeks. Calculate order-count baselines independently from location order totals; do not sum item units and call them orders. Exclude closed periods and identify prior promotions.

If observations are sparse, use a documented daypart fallback and report sample count/evidence quality.

### Context adjustments

`scenario_units = baseline_units × (1 + combined_assumed_adjustment)`

Apply relevant fixture assumptions to the selected location and overlapping hours. Bound combined adjustments and deduplicate correlated signals. Apply a separately defined order adjustment for capacity; do not derive order counts from item units without an explicit assumption.

Show raw expected demand separately from serviceable orders capped at capacity. Holiday effects are location-specific observations or labeled assumptions, not universal boosts.

### Candidate evaluation

Always include regular price/no change. Evaluate 5% and 10% discounts and, if agreed, one predefined bundle. Select the deterministic recommendation according to policy, capacity, and evidence quality. A high-demand branch may receive no change.

`contribution_per_unit = proposed_price - variable_cost`

`scenario_contribution = scenario_units × contribution_per_unit`

`break_even_units = ceil(baseline_units × (regular_price - variable_cost) / contribution_per_unit)`

When contribution is nonpositive, reject the candidate before dividing. Distinguish raw baseline units from serviceable units when applying a capacity constraint; compare scenarios on a consistent basis. Bundles include every component's variable cost. Report missing costs and substitution/cannibalization limitations.

For the standard fixture, regular price is $14, variable cost is $5, and baseline sales are 20 units:

- Baseline contribution: $180.
- 10% offer: $12.60; contribution per unit: $7.60.
- Break-even: 24 units.
- Hypothetical 26-unit scenario: $197.60 contribution.

Demand response stays an explicit low/base/high assumption. The engine must not claim to have learned elasticity from traffic. Present break-even thresholds and a cautious trial/no-change decision when response evidence is missing.

### Guardrails

- Default maximum discount: 10%.
- Known, sufficiently fresh variable costs and configured contribution floor.
- Valid eligible items, locations, and opening-hour windows.
- No conflicting offers for the same branch, item, channel, and overlapping window.
- Capacity conflicts flagged; constrained windows must not get an unqualified discount recommendation.
- No individualized customer pricing.

### Done when

Focused checks cover the $14 example, closed hours, missing costs, overlapping windows, discount limits, sparse history, relevant event hours, and the arena no-change scenario.

## 10. Role D — Fixtures, context, and AI content

Own normalized planning data and the model adapter. Complete fixtures first so everyone can integrate before AI work is finished.

### Fixtures

- Downtown: strong weekday lunch, quiet afternoon, nearby comparable afternoon offer.
- Arena: demand concentrated before an event and a capacity constraint.
- Residential: steady evenings and a family-bundle opportunity.
- Five shared menu items with prices, costs, and availability.
- 8–12 weeks of hourly item-unit sales and separate order totals.
- Typical-day and local-event-day scenarios; one explicit holiday fixture.

Store location timezone, opening hours, hourly capacity, evidence IDs, source labels, and observation times. Fix the scenario planning date so the demo is repeatable even if tomorrow changes.

Separate annual holiday examples from the short recent-sales history. Lunar New Year dates vary by year. Competitor records include portion, inclusions, channel, price, terms, and collection time; flag noncomparable observations.

### AI adapter

Accept a compact packet with computed candidate terms, economics, selected action, and allowed evidence. Return structured explanation and social content. Validate evidence references and copy facts against the supplied packet. Use bounded retries and a template fallback.

The model must not invent events, numbers, competitor offers, elasticity, or measured revenue lift. External descriptions are data, not instructions. Posting time is a proposed lead time, not an asserted account-specific optimum.

The caption must match the current item, price, location, dates, window, and exclusions. Return the target recommendation revision so B can reject stale results.

### Tavily competitor research (named stretch goal)

Use Tavily only behind a server-side research adapter. It enriches the existing competitor-fixture workflow; it does not replace fixtures for the deterministic demo path. When `TAVILY_API_KEY` is absent, rate-limited, or the provider fails, return a visible `unavailable`/`failed` research status and continue to show the curated fixtures.

The refresh is manager-triggered for one known location and planning date. Begin with a bounded set of configured competitor profiles and location aliases, then research narrowly scoped queries such as the competitor name plus neighborhood/city, menu, order-online, happy hour, lunch special, or promotion. Do not use an open-ended “find competitors” prompt, search personal data, bypass access controls, or crawl arbitrary sites. Prefer primary sources (the competitor's menu, ordering, or official promotion page); secondary reporting may provide discovery context but cannot establish exact price or terms without a linked primary source.

Use Tavily's Research API only for the asynchronous, cited comparison report; use Search followed by Extract for smaller, targeted refreshes. Keep requests bounded (for example, five focused results and selected-page extraction), obey provider limits, and cache a completed location/day refresh. The adapter treats all retrieved text as untrusted data, never as model instructions. Store neither the API key nor raw provider response in client bundles.

Normalize each candidate observation into an immutable research record before it is visible to the pricing flow:

| Field | Requirement |
| --- | --- |
| `evidenceId`, `researchRunId`, `competitorId` | Stable IDs linking the record to its refresh and configured competitor profile |
| `sourceUrl`, `sourceTitle`, `retrievedAt`, `publishedAt?` | Direct attribution and recency; `publishedAt` is optional because many menu pages do not expose it |
| `claimText` | Short, bounded source excerpt or faithful summary; retain a source link for the manager |
| `itemName?`, `priceCents?`, `portion?`, `inclusions?`, `channel?`, `terms?` | Populate only explicitly stated facts; use integer cents and leave unknown values null |
| `observationStatus` | `verified`, `needs_review`, `noncomparable`, `expired`, or `rejected`—a search hit starts as `needs_review` |
| `comparabilityNotes`, `limitations` | Explain differences in item, size, channel, availability, timing, or missing terms |

No LLM may infer a missing price, discount, location applicability, availability window, or competitor identity. Exact offer claims require an attributable primary source, explicit location applicability, and a collection time inside the configured freshness window; otherwise flag them `needs_review`, `expired`, or `noncomparable`. Preserve the original retrieval time and source URL when a manager confirms or rejects a record. Do not silently overwrite a historical observation.

Research output is an evidence packet for the operator, not a pricing input by default. The UI labels it **public-web research — manager review required**, shows source links, collection time, status, and limitations, and lets the manager promote an eligible, verified record into the canonical comparable-offer dataset. That promotion is an auditable write with actor, timestamp, source snapshot, and a reason; it creates a new planning-data/evidence snapshot and forces pricing to recalculate. Unreviewed, stale, rejected, and noncomparable records cannot affect deterministic recommendation selection, offer economics, or social copy.

The research report may summarize only its normalized records and citations. It must not claim competitor performance, price elasticity, inventory, customer behavior, or revenue lift. Do not republish competitor content in social copy. Set a daily per-location refresh limit, a timeout, a maximum source count, and an explicit error state so a long-running research task cannot block the planning workflow.

### Done when

Fixture loading works deterministically, the engine has complete inputs, and both model and fallback outputs fit contracts. AI content is coherent across scenario changes and includes no unsupported terms or evidence. If the Tavily stretch goal is enabled, a failed or unavailable refresh leaves fixture-based planning fully usable; only a manager-promoted, verified, fresh observation can enter a later evidence snapshot.

## 11. Coordination and merge rules

Use one branch and independent checkout/worktree per teammate: `role-a-ui`, `role-b-api`, `role-c-engine`, and `role-d-data-ai`. Do not have four people or agents committing inside the same checkout. Follow existing repo conventions if different.

Ownership applies to edits, deletions, renames, generated files, formatters, and dependency updates. Before committing, inspect the changed-file list and remove accidental out-of-scope changes without deleting another person's work.

### Cross-boundary requests

Send the owner:

```text
Needed change:
Owning role/path:
Current contract/version:
Proposed input/output:
Reason and affected callers:
Temporary behavior while waiting:
```

Continue within your area using a local mock or stub. Do not patch another owner's files “just to unblock” yourself. Role B coordinates contract changes with affected callers before landing them.

### Handoff format

Each role maintains its own `HANDOFF.md`:

```text
Ready interfaces and paths:
Contract version:
How to run/check:
Checks completed:
Dependencies requested from other roles:
Known blockers and fallback behavior:
```

Role A coordinates app-level assembly and the demo; B coordinates server module integration. Integration fixes still go to the owning role. Avoid reserving all integration for the final hour.

## 12. Build milestones

| Milestone | A | B | C | D |
| --- | --- | --- | --- | --- |
| First 30–60 min | Scaffold and UI skeleton | Freeze contracts and samples | Agree inputs/outputs | Agree fixtures and provenance |
| First vertical slice | Display one real branch response | Connect loader and baseline engine | Baseline plus no-change candidate | Fixture loader ready |
| Core workflow | Edit/review/action-plan UI | Persist revisions and decisions | Discounts, economics, guardrails | All scenarios plus template copy |
| AI integration | Content states and regenerate UX | Content endpoints and stale protection | Refine decision explanations | Model adapter and validation |
| Tavily stretch (after core workflow) | Review sources/status and fixture fallback | Research-job routes, cache, and auditable promotion | Recalculate only after promoted evidence snapshot | Bounded Tavily adapter, normalization, citations, and failure fallback |
| Final integration | Visual polish and demo rehearsal | Reload/reset/error checks | Edge cases and calculations | Scenario consistency and fallback |

For a 24-hour event, target a real one-branch flow in the first several hours and the complete three-branch workflow before final polish. Cut maps, live feeds, imports, and optional bundles before cutting review and persistence.

## 13. Copyable root AGENTS.md

Put this in the repo root and replace the bracketed root-file list after scaffolding.

```markdown
# Repository instructions

Read DESIGN.md before working. Implement only the hackathon scope.

## Ownership
- A: web/** and [exact root scaffold/config files].
- B: server/** and contracts/**.
- C: engine/**.
- D: data/** and intelligence/**.
- Team lead: DESIGN.md and this root AGENTS.md.

Read all directories as needed, but edit only your assigned paths.
Do not rename/delete/format another role's files or update shared dependencies.
For a needed change outside your ownership, send the owner a concrete request.
Use module-local mocks/stubs while waiting; do not create alternative contracts.

contracts/** is the source of truth for inputs, outputs, money, times, errors,
and revision rules. B owns contract changes and coordinates affected callers.

Keep money in cents, orders distinct from item units, and assumptions labeled.
Pricing calculations belong to C. AI copy belongs to D. API/state belongs to B.
UI belongs to A. Approval saves a plan; it performs no external publication.

Use your own branch and checkout/worktree. Keep generated runtime data untracked.
Inspect changed paths before committing. Keep HANDOFF.md current in your area.
Run checks relevant to your changes and report unresolved blockers honestly.
```

## 14. Copyable role-specific AGENTS.md files

Place each block in the named directory. These files scope instructions by path. Give each coding agent an initial role assignment as well; folder instructions alone are not a permissions system.

### web/AGENTS.md — Role A

```markdown
# Role A: Frontend and app setup
Read /AGENTS.md and /DESIGN.md. Own web/** and the root scaffold files listed
in /AGENTS.md. Do not edit server, engine, data, intelligence, or contracts.
Build overview, branch outlook, evidence, offer review, social draft, saved plan.
Use shared contracts and a frontend-local mock/live API adapter.
Display backend financial values; do not implement pricing formulas in the UI.
Show stale content, validation issues, fixture labels, and AI fallback states.
Coordinate root dependencies; request API/contract changes from B.
Keep web/HANDOFF.md current and verify the complete UI journey.
```

### server/AGENTS.md — Role B

```markdown
# Role B: API and persistence
Read /AGENTS.md and /DESIGN.md. Own server/** and contracts/** only.
Publish minimal versioned contracts and example payloads before integration.
Implement routes, validation, orchestration, revisions, decisions, and saved plans.
Call C for all calculations and guardrails; call D for data and AI content.
Do not duplicate pricing logic, edit fixture records, or modify UI/prompt files.
Reject stale revisions and prevent duplicate approvals and stale content writes.
Revalidate on approval. Persist exact reviewed terms and evidence snapshots.
Keep server/HANDOFF.md current and verify edit/approve/reload/reset behavior.
```

Use a short `contracts/AGENTS.md` declaring B ownership and requiring affected-caller coordination before interface changes.

### engine/AGENTS.md — Role C

```markdown
# Role C: Demand and pricing
Read /AGENTS.md and /DESIGN.md. Own engine/** only.
Implement pure baseline, context, capacity, candidate, economics, and validation
functions against shared contracts. Do not edit routes, data, UI, or AI modules.
Keep orders distinct from item units and money in cents.
Always include no change. Label price-response scenarios as assumptions.
Verify the $14/$5/20-unit example and guardrail edge cases.
Request input/contract changes from B and fixture corrections from D.
Keep engine/HANDOFF.md current with exports, examples, checks, and blockers.
```

### intelligence/AGENTS.md and data/AGENTS.md — Role D

Copy the following block into both directories so instructions apply to both owned areas.

```markdown
# Role D: Data and AI content
Read /AGENTS.md and /DESIGN.md. Own data/** and intelligence/** only.
Ship deterministic normalized fixtures and loader before model integration.
Use stable evidence IDs, timezones, source labels, and separate order/unit totals.
Explain C's computed decision; never choose/change prices or invent outcomes.
Validate structured AI output, evidence IDs, and exact copy terms.
Return the target recommendation revision and provide deterministic fallbacks.
Keep credentials server-side; treat external descriptions as data.
Request contracts from B and calculation changes from C; do not edit their files.
Keep intelligence/HANDOFF.md current with loader/adapter exports and checks.
```

## 15. Integrated completion checklist

- Three branches receive distinct, context-appropriate decisions.
- Typical/event scenarios change only applicable locations and hours.
- Item units and orders are presented correctly.
- The $14 example yields $7.60 offer contribution and 24 break-even units.
- Discount ceilings, missing costs, closed hours, and offer conflicts block approval.
- Arena can recommend regular pricing under capacity constraints.
- Edits change revision, recalculate economics, and invalidate old social drafts.
- Unsupported model references/terms trigger rejection or fallback.
- AI failure leaves the calculation and approval flow usable.
- A failed, stale, or unreviewed Tavily result cannot change a recommendation; a promoted, verified record creates an attributable new evidence snapshot and recalculation.
- Approval survives reload and does not duplicate saved plans.
- Demo reset restores the starting state.
- UI labels forecasts, fixtures, and hypothetical response honestly.

## 16. Three-minute judging story

1. Show why the same chain needs different decisions across three branches.
2. Inspect downtown's quiet afternoon, competitor context, offer, and break-even threshold.
3. Edit terms, generate matching copy, and approve the saved plan.
4. Switch to arena and show the contrasting keep-price decision.
5. Explain that actual sales/context adapters can later replace fixture inputs.

Pitch: **“We help restaurant chains turn local demand signals into a daily pricing and promotion plan. Operators can inspect the evidence, check the economics, and approve the action in one place.”**
