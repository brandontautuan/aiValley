# Role C Engine Framework

Matches `main` @ `c35194b` (after the coffee-shop pivot and Role B's strategy runs). §0 includes the findings from the Claude Code orientation review.
Role C owns `engine/**` only. Inputs and outputs are defined in `contracts/index.ts` (Role B), data comes from `data/index.ts` (Role D), and `server/planner.ts` (Role B) is the only caller.

Rules: pure and deterministic, with no I/O, model calls, clock reads or env vars. Money is in integer cents, orders are separate from item units, and every assumption is labeled.

---

## 0. Design alignment (DESIGN.md §9 is the source of truth)

Every item here traces to a DESIGN.md requirement. Nothing adds scope beyond the design unless it's marked **optional**.

| DESIGN.md §9 requirement | Status on main | Work item |
| --- | --- | --- |
| Units by location/weekday/hour over comparable weeks; orders computed separately | ✅ | — |
| Exclude closed periods; identify prior promotions | ✅ | — |
| Sparse history → **documented daypart fallback** + sample count | ✅ daypart fallback (`DAYPARTS`), weekday/weekend split; quality and count use the worse of order and item history (C6 done) | — |
| `scenario_units = baseline × (1 + adj)`, bounded, correlated signals deduped | ✅ (`dedupeKey`, clamp) | — |
| Separate order adjustment for capacity | ✅ | — |
| Raw demand shown separately from serviceable orders | ✅ | — |
| Holiday effects location-specific or labeled | ✅ via fixtures + `ENGINE_ASSUMPTIONS` | — |
| Always include regular price; evaluate 5% and 10% | ✅ | — |
| One predefined bundle **if agreed** | ✅ the default item (Coffee & Pastry Pair) is a predefined bundle; its cost covers all components and the cannibalization limit is labeled via `BUNDLE_LIMITATION` (C3 done). Per-candidate attachment needs a contract field | request to B (optional) |
| Contribution, break-even, reject nonpositive before dividing | ✅ | — |
| Break-even formula uses `baseline_units` | ⚠️ **deliberate deviation**: uses scenario-adjusted reference units (documented in `contracts/index.ts`), so the offer is compared against the same day's expected demand. Kept, and stated in `ENGINE_ASSUMPTIONS` (C6 done). | — |
| Distinguish raw vs serviceable units; compare scenarios consistently | ✅ item units scaled to serviceable orders; response units capped at capacity (C2 done). Raw item units are not exposed: needs a contract field | request to B (optional) |
| Report missing costs **and substitution/cannibalization limitations** | ✅ `MISSING_COST` is an error on discounts and a warning on keep-price; cannibalization stated in `ENGINE_ASSUMPTIONS` (C6 done) | — |
| Demand response is explicit low/base/high assumption, no learned elasticity | ✅ low +0%, base 1.5×, high 3× the discount % (C1 done) | — |
| Cautious trial/no-change when response evidence is missing | ✅ keep-price by default; optional cautious 5% trial behind `ENGINE_POLICY.sparseTrial` (C4 done) | — |
| Guardrails: 10% max, fresh costs + floor, eligibility, hours, overlap, capacity flag, no individualized pricing | ✅ (no customer-level inputs exist) | — |
| Overlap check includes **channel** | ⚠️ ignored, because `OfferTerms` has no channel field | request to B (optional) |
| Checks: $14, closed hours, missing cost, overlap, discount limit, sparse, event hours, arena no-change | ✅ all present; the $14 example also runs end to end through `evaluateOffers` (C7 done) | — |

Architecture stays as the design defines it:
- one backend
- B orchestrates and C computes
- D explains and never chooses prices
- A never recalculates
- contract changes go through B

No new folders, services or dependencies.

---

## 1. How the engine fits

```
data.loadPlanningData({ date, scenario })            (D)
        │
server/planner.ts                                     (B)
        ├─► engine.calculateLocationOutlook(data, { date, scenario, locationId })
        ├─► engine.evaluateOffers(data, outlook, terms?, approvedOffers)
        ├─► engine.selectRecommendedCandidate(candidates, outlook)
        ├─► engine.ENGINE_ASSUMPTIONS  → shown in UI
        │
        ├─► intelligence.generateExplanation / generateSocialDraft   (D, uses C's numbers + reason)
        └─► web/ renders C's numbers as-is                           (A)
```

B calls `evaluateOffers` with edited terms on every edit and re-runs it before approval, so the same input must always give the same output.

---

## 2. Public exports (`engine/index.ts`)

| Export | Returns | Contract type |
| --- | --- | --- |
| `calculateLocationOutlook(data, request)` | hourly outlook, items, totals, classification, focus window | `LocationOutlook` |
| `evaluateOffers(data, outlook, terms?, existingOffers?)` | no-change + 5% + 10%, or no-change + edited terms | `OfferCandidate[]` |
| `selectRecommendedCandidate(candidates, outlook)` | chosen id + plain-English reason | `Selection` |
| `discountedPriceCents(regular, pct)` | `Math.round(regular × (100 − pct) / 100)` | — |
| `breakEvenUnits(ref, regular, proposed, cost)` | `ceil(ref × (regular − cost) / (proposed − cost))`, null if ≤ 0 | — |
| `ENGINE_ASSUMPTIONS` | labels shown to the manager | `string[]` |
| `selectionFacts(candidates, outlook)` | reason code + the numbers behind the selection | engine type `SelectionFacts` (not in contracts yet) |
| `ENGINE_POLICY`, `DAYPARTS` | every tunable; the daypart table | — |
| `BUNDLE_LIMITATION`, `candidateLimitations(data, candidate)` | bundle note and per-candidate helper | — |
| `toLocalKey(iso, tz)` | local `YYYY-MM-DDTHH:mm` for window comparisons | — |

Changing any export's shape needs Role B's agreement first, since B, A and D all depend on it.

---

## 3. As built

### Demand outlook
| Step | Implementation | Constant |
| --- | --- | --- |
| Baseline | Mean of the up to 8 most recent same weekday + hour observations before the planning date, excluding `promotion` hours (an excluded hour is replaced by an older week if one exists, so the span can exceed 8 weeks). Only the location's opening hours are computed. Orders come from `orderTotals`, units from `itemSales`; the two are never mixed. | `COMPARABLE_WEEKS = 8` |
| Sparse fallback | Fewer than 4 observations → the average hour of that hour's daypart (`DAYPARTS`: morning open–11, lunch 11–14, afternoon 14–17, dinner 17–close) across all weekdays or all weekends, over the whole supplied history. Applied to orders and units alike; either one sets `evidenceQuality: "sparse"` and a note says which. `observationCount` is the smallest sample across order and item history. | `MIN_OBSERVATIONS = 4` |
| Context | Signal applies if its location matches and its window overlaps the hour (local tz). Scenario filtering is done by D's loader, not the engine; the engine ignores `scenarioIds`. Records with a zero adjustment are skipped (the holiday fixture is 0/0, so it has no effect). One record per `dedupeKey` (largest absolute value), summed, clamped per hour. Orders and units use separate adjustments; `signalIds`/`appliedSignalIds` list only signals with a nonzero *order* adjustment. | `ADJUSTMENT_BOUNDS = [-0.5, +1.0]` |
| Capacity | Item `scenarioUnits` in an hour whose orders exceed capacity are scaled by `serviceableOrders / scenarioOrders` (stable units per order). `serviceableOrders = min(scenarioOrders, hourlyCapacityOrders)`; constrained if peak ≥ `policy.capacityWarningShare` × capacity | policy |
| Classification | constrained, else busy/soft at ±10% vs usual, else typical | `CLASSIFICATION_THRESHOLD = 0.1` |
| Focus window | If constrained: the busiest 3-hour window containing the peak hour (`capacity-peak`). Otherwise: the softest 3-hour window, `soft-window` if < 60% of the day's average, else `no-clear-window` | `FOCUS_WINDOW_HOURS = 3`, `SOFT_WINDOW_SHARE = 0.6` |

### Offers
- The default item is the `offerEligible` menu item sold at the location with the most expected units in the focus window (any category; today that is the Coffee & Pastry Pair).
- Candidates are no-change, 5% off and 10% off. If edited terms are passed, they're no-change (same item and window) plus those terms; edited terms at 0% give no-change only.
- Reference units are the scenario units in the window at the regular price, already scaled to serviceable orders.
- Response scenarios: `units = ref × (1 + multiplier × pct/100)` with multipliers low 0, base 1.5, high 3 (10% off → +0 / +15 / +30%). Only discount candidates with a known cost get them. Per hour, the unit multiplier is capped at `capacityOrders / serviceableOrders`, so implied orders never exceed capacity.

### Guardrails (`ValidationIssue.code`)
`DISCOUNT_ABOVE_CEILING`, `INVALID_DISCOUNT`, `NONPOSITIVE_CONTRIBUTION`, `BELOW_MIN_CONTRIBUTION`, `MISSING_COST`, `STALE_COST`, `CLOSED_HOURS`, `INVALID_WINDOW`, `ITEM_NOT_ELIGIBLE`, `OVERLAPPING_OFFER` (all errors). `CAPACITY_CONFLICT` and `SPARSE_HISTORY` are warnings.

Only `ITEM_NOT_ELIGIBLE`, `INVALID_WINDOW` and `CLOSED_HOURS` are checked on every candidate; the rest apply to discount candidates only (including `ITEM_NOT_ELIGIBLE` for an item with `offerEligible: false`), except that keep-price with an unknown cost gets `MISSING_COST` as a warning. `OVERLAPPING_OFFER` matches on location, item and overlapping window. `CAPACITY_CONFLICT` fires when any window hour's scenario orders, lifted by the high response, reach `capacityWarningShare` × capacity.

### Selection
1. `capacity-peak` → keep price
2. sparse evidence → keep price. If `sparseTrial` is on and the window is soft: the smallest discount only, when its base units ≥ break-even.
3. `soft-window` → the best valid discount with no `CAPACITY_CONFLICT` whose base units ≥ break-even. Highest base contribution wins; if none qualifies, keep price.
4. Otherwise → keep price (demand within usual range)

### Verified (`engine/check.ts`)
- $14 example via `discountedPriceCents`/`breakEvenUnits` and end to end through `evaluateOffers` on a minimal inline dataset, and the nonpositive contribution guard
- Downtown's soft window is 14:00–17:00 on the Coffee & Pastry Pair, but since C1 neither 5% nor 10% reaches break-even in the base scenario, so Downtown keeps price. The check asserts the exact response values and that outcome.
- The Arena event changes only Arena 16:00–20:00 and isn't double-counted; Arena keeps price, and its discounts are flagged with `CAPACITY_CONFLICT`
- Every guardrail code except `INVALID_DISCOUNT` and the `SPARSE_HISTORY` warning, which no check asserts
- Capacity cap: Arena event-day units follow serviceable orders and no discount scenario exceeds serviceable units; Downtown's typical-day numbers are asserted unchanged
- Sparse fallback: daypart averages are used and reported, baselines stay positive, selection keeps price; item-only sparse history is reported separately
- `MISSING_COST` warning on keep-price

---

## 4. Work queue

Order: **all work items (C1–C7) are done.** What remains are the optional contract requests to B in `HANDOFF.md`.

### C1. Make the response assumptions conservative (engine-only) — DONE
Outcome: no discount is selected anywhere on the current fixtures. Base response clears break-even only when variable cost is at most about 23% (10% off) or 28% (5% off) of price; every offer-eligible fixture item is at 35% or more (Drip Coffee is 25% but is not offer-eligible). `server/check.ts` still expects a Downtown discount and fails until B and D decide the demo story (see `HANDOFF.md`).

Original brief:
Today, 10% off assumes +10/+30/+50%. Even "low" assumes a lift, and base +30% makes discounts easy to justify.
- Change to explicit per-scenario values. Low is **+0%** (nobody responds). Base and high scale with the discount, e.g. base 1.5×, high 3× → for 10% off: +0 / +15 / +30%.
- Update the `ENGINE_ASSUMPTIONS` wording to match.
- **Check:** Downtown should still get a discount if base units still clear break-even. If not, that's a real finding: either the soft window isn't soft enough or the trial should be 5%. Confirm with D whether the fixture story still holds, and update `engine/check.ts`.

### C2. Cap units at capacity (engine-only) — DONE
Outcome: on the Arena event day only 18:00 is over capacity; the window's discount scenarios top out near 56.8 units, below both break-evens (58 and 63). Downtown is unchanged.

Original brief:
Orders are capped today, but item units and response-scenario units are not.
- Scale each hour's units by `serviceableOrders / scenarioOrders` when constrained. This is a labeled assumption: units per order stay stable.
- Cap response-scenario units per hour the same way, using the order response implied by the unit change.
- Add an `ENGINE_ASSUMPTIONS` line.
- **Check:** in the Arena event, discount scenarios can't exceed serviceable units, and reference contribution compares consistently with keep-price.

### C3. Predefined bundle — DONE (as bundle labeling)
Outcome: `BUNDLE_LIMITATION` in `ENGINE_ASSUMPTIONS`, `candidateLimitations()` helper, and discounts on `offerEligible: false` items rejected with `ITEM_NOT_ELIGIBLE`. No issue code fits the bundle note, so a contract request is in `HANDOFF.md`.

Background:
The bowl fixtures are gone. The default item filter now uses `MenuItem.offerEligible`, and the default item at every location is already a bundle-category item (Coffee & Pastry Pair), priced and checked like any other item; its `variableCostCents` covers its components. The Residential-only item is now the Weekend Breakfast Set (`category: "food"`).
- No engine work is needed unless the team wants a *second*, location-specific candidate (e.g. the Weekend Breakfast Set at Residential) alongside the default item. That needs agreement on which item, and from B only if `OfferCandidate.kind` should distinguish it.
- Add a substitution/cannibalization limitation note either way; the design requires it (also listed in C6).
- **Check (if built):** Residential evaluates the extra item; Downtown and Arena never get it.

### C4. Selection and policy tuning (engine-only) — DONE
Outcome: `ENGINE_POLICY` exported with all tunables; behavior unchanged with the default `sparseTrial: false`. Finding: break-even rounds up to whole units, so in low-volume windows a 5% offer cannot clear it even at near-zero cost (see `HANDOFF.md`).

Original brief:
- The design suggests a *cautious trial* for low evidence instead of a flat keep-price. Option: allow only the smallest discount (5%) when evidence is sparse and the window is soft. Keep it off if the team prefers a stricter demo.
- Move tunables (`ADJUSTMENT_BOUNDS`, `CLASSIFICATION_THRESHOLD`, `SOFT_WINDOW_SHARE`, response values) into one exported `ENGINE_POLICY` constant. The UI can then show them, and later B could move them into `ChainPolicy`.

### C5. Structured reason for D (optional, beyond the design; only if the team agrees; needs Role B) — DONE (engine side)
Outcome: exported `selectionFacts(candidates, outlook)` returns the code and facts today with no contract change; the request to add them to `Selection` is in `HANDOFF.md`.

Original brief:
`Selection.reason` is free text. D has to explain it without inventing numbers.
- **Ask B:** add `reasonCode` + `reasonFacts` (e.g. `{ breakEvenUnits, baseUnits, peakOrders, capacity }`) to `Selection`. Keep `reason` for display.
- Codes: `CAPACITY_PEAK`, `SPARSE_HISTORY`, `DISCOUNT_CLEARS_BREAK_EVEN`, `NO_DISCOUNT_CLEARS_BREAK_EVEN`, `DEMAND_WITHIN_USUAL`.

### C6. Close remaining design gaps (engine-only) — DONE
- **Daypart fallback** (design: "documented daypart fallback"). When same-weekday hours are sparse, average across the hour's daypart: lunch 11–14, afternoon 14–17, dinner 17–close. Keep the weekday/weekend split, and document the dayparts in `ENGINE_ASSUMPTIONS`.
- **Cannibalization note** (design: "Report … substitution/cannibalization limitations"). Add an `ENGINE_ASSUMPTIONS` line saying discount scenarios ignore shifts from other items and other hours.
- **Check:** sparse test still passes and reports which daypart it used.
- **Item-history quality.** Compute `observationCount`/`evidenceQuality` from both order and item history (worst of the two), and add a note when item history is the sparse one.
- **Missing cost on keep-price.** Attach `MISSING_COST` as a *warning* to the no-change candidate when cost is unknown, so the manager sees contribution can't be shown. Keep-price itself stays valid.
- **Break-even basis.** Add an `ENGINE_ASSUMPTIONS` line: "Break-even compares against expected units at the regular price for this scenario, not the raw historical baseline."

### C7. Strengthen checks (engine-only) — DONE
- Build a minimal `PlanningData` fixture inside `engine/check.ts` (one location, one item at $14 / $5, 20 reference units in a window). Assert via `evaluateOffers`: 1260¢ price, 760¢ contribution, 18,000¢ reference contribution, break-even 24, and 19,760¢ for a 26-unit scenario.

---

## 5. Requests to send (copy-paste)

**To B (contracts):**
```text
Needed change: (1) only if C3 is agreed: OfferCandidate.kind add "bundle"; (2) Selection add reasonCode + reasonFacts;
  (3) optional: OfferTerms add channel so the overlap guardrail can match DESIGN.md §9
Owning role/path: B, contracts/index.ts
Current contract/version: 1 (main @ c35194b)
Proposed input/output: see engine/FRAMEWORK.md §4 C3 and C5
Reason and affected callers: optional location-specific bundle (DESIGN.md §9); lets D explain without inventing numbers. Callers: server/planner.ts, web OfferTable, intelligence
Temporary behavior while waiting: engine keeps current shapes; bundle and reasonCode off
```

**To D (fixtures/AI), after C1 lands:**
```text
FYI: discount response assumptions are now low +0% / base 1.5× / high 3× the discount %.
Please confirm the Downtown soft-window fixture still supports the intended demo story
(10% or 5% trial). No change needed in data/ unless it doesn't.
```

---

## 6. Workflow
1. Branch `role-c-engine`; edit only `engine/**`.
2. After each item, run `node --experimental-strip-types engine/check.ts`, then `npm run check` for typecheck + server checks.
3. Update `engine/HANDOFF.md` (exports, checks, limitations) and commit.
4. Open a PR into `main`.

## 7. Sponsor tools
None in the engine; it's pure math. Tavily lives in `intelligence/competitorResearch.ts` (D). A model provider such as Novita plugs into D's `ContentModel`.
