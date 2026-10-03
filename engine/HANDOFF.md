# Role C handoff — demand and pricing

## Ready interfaces and paths
`engine/index.ts` exports:
- `calculateLocationOutlook(data, request)`: same-weekday/hour baseline over up to 8 weeks, excluding promotion hours. An hour with fewer than 4 same-weekday observations falls back to the average hour of its daypart (see `DAYPARTS`) across weekdays or weekends. `evidenceQuality` is the worse of order and item history, `observationCount` is the smallest sample across both, and `notes` says which history was sparse and which dayparts were used. Applies context adjustments deduplicated by `dedupeKey` and bounded to [-50%, +100%], plus capacity, classification, and the focus window (softest 3-hour window, or the constrained peak). When an hour's scenario orders exceed capacity, each item's `scenarioUnits` for that hour is scaled by `serviceableOrders / scenarioOrders` and a note is added to `notes`; unconstrained hours are unchanged.
- `evaluateOffers(data, outlook, terms?, existingOffers?)`: keep-price, 5% off and 10% off, or the edited terms. Applies all guardrails from DESIGN.md §9. A discount on an item with `offerEligible: false` (Drip Coffee) is rejected with `ITEM_NOT_ELIGIBLE`; keeping its price is allowed. A keep-price candidate whose item has no known cost carries `MISSING_COST` as a warning and stays valid. Each discount carries low/base/high response scenarios: low = +0% units (no response), base = 1.5 × the discount %, high = 3 × the discount % (10% off → +0 / +15 / +30%). These are assumptions, not learned elasticity. `ResponseScenario`'s shape is unchanged. Response units are capped per hour so the implied orders never exceed capacity (orders are assumed to move in proportion to the item's units); `referenceUnits` is the serviceable figure.
- `selectRecommendedCandidate(candidates, outlook, policy?)`: keep-price for capacity peaks, sparse history or a normal day; otherwise the best valid discount whose base scenario clears break-even, or keep-price when none does. The optional third argument defaults to `ENGINE_POLICY`; existing two-argument callers behave exactly as before. With `{ sparseTrial: true }`, sparse history plus a soft window may select the smallest discount only (5%), and only if its base scenario clears break-even.
- `selectionFacts(candidates, outlook, policy?)`: the same decision as `selectRecommendedCandidate` (both read one shared rule), returned as `{ selectedCandidateId, reasonCode, comparedCandidateId, reasonFacts: { breakEvenUnits, baseUnits, referenceUnits, peakOrders, capacity } }`. Unit facts describe the selected discount; for keep-price they describe the discount closest to its break-even (`comparedCandidateId`). Types `SelectionReasonCode` and `SelectionFacts` are exported from the engine until the contract carries them.
- `BUNDLE_LIMITATION` and `candidateLimitations(data, candidate)`: the bundle note (variable cost covers every component; switching from the separate items to the bundle is not modeled) and a pure helper returning it for candidates whose item has category `bundle`. The note is also a line in `ENGINE_ASSUMPTIONS`.
- `ENGINE_POLICY`: every tunable in one object (`comparableWeeks`, `minObservations`, `adjustmentBounds`, `focusWindowHours`, `softWindowShare`, `classificationThreshold`, `responsePerDiscountPct`, `dayparts`, `sparseTrial`). `sparseTrial` is `false` by default. `DAYPARTS` is the same array as `ENGINE_POLICY.dayparts`.
- `DAYPARTS`: morning (open–11:00), lunch (11:00–14:00), afternoon (14:00–17:00), dinner (17:00–close).
- `discountedPriceCents`, `breakEvenUnits`, `toLocalKey`.
- `ENGINE_ASSUMPTIONS`: response values, stable units per order, the daypart fallback, no substitution/cannibalization modeling, and the break-even basis (expected units at the regular price for the scenario, a deliberate deviation from the §9 `baseline_units` formula).

See `engine/FRAMEWORK.md` for design alignment, as-built behavior and the work queue.

## Contract version
1.

## How to run/check
`node --experimental-strip-types engine/check.ts`

## Checks completed
- The $14 / $5 / 20-unit example gives 1260¢ price, 760¢ contribution, 24-unit break-even and 19,760¢ at 26 units, both as plain arithmetic and end to end through `evaluateOffers` on a minimal inline dataset (C7).
- Response assumptions: +0 / +7.5 / +15% at 5% off and +0 / +15 / +30% at 10% off; the low scenario keeps reference units and loses contribution.
- Guardrails: ceiling, closed hours, invalid window, stale cost, missing cost, nonpositive and below-minimum contribution, eligibility, overlap.
- The arena event affects only arena hours 16–20 and duplicate records aren't stacked; the arena gets a keep-price decision. `CAPACITY_CONFLICT` still uses the high scenario (now +30% at 10% off) and still flags both arena discounts.
- Downtown (soft window 14:00–17:00, Coffee & Pastry Pair) now gets keep-price: base units stay below break-even for both 5% and 10%.
- Capacity cap (C2), Arena event day: only 18:00 exceeds capacity (40.4 vs 40 orders) and its item units are scaled by the serviceable share; other hours equal raw demand. No discount scenario exceeds the window's serviceable units (about 56.8 for the Coffee & Pastry Pair, 17:00–20:00), so 10% off high is 56.8 units, not 68.8, and both break-evens (58 and 63) are out of reach within capacity.
- Downtown typical-day numbers are unchanged by C2 (asserted exactly: 13.5 reference units, break-even 15/16, all response units and contributions).
- Sparse history (C6): with two weeks of data every Downtown hour uses its daypart average (equal within a daypart, different between dayparts, lunch equals the mean of weekday lunch buckets), baselines stay positive, the note names the fallback, and selection keeps price.
- Item-only sparse history marks the outlook sparse, leaves order baselines untouched, adds the item-history note and puts `SPARSE_HISTORY` on discounts.
- `ENGINE_POLICY` values are asserted, and the cautious trial is covered with both settings: off keeps price; on picks 5% (never 10%) for a low-cost, high-volume item on sparse history, still keeps price at fixture costs, and changes nothing when history is good or capacity is the concern.
- Bundles and eligibility (C3): every default candidate is the Coffee & Pastry Pair and carries the bundle note; a non-bundle item carries none; Drip Coffee never gets a default candidate and an edited discount on it is rejected; the Weekend Breakfast Set appears only in Residential's outlook and is rejected elsewhere.
- `selectionFacts` (C5): always agrees with `selectRecommendedCandidate`; Downtown gives `NO_DISCOUNT_CLEARS_BREAK_EVEN` with 15 / 14.5 / 13.5 units and 48 of 55 orders, Arena event day `CAPACITY_PEAK`, Residential `DEMAND_WITHIN_USUAL`, sparse history `SPARSE_HISTORY`, and a clearing discount (and the cautious trial) `DISCOUNT_CLEARS_BREAK_EVEN`.
- Missing cost: error on the discount, warning on keep-price (still valid); no issue when cost is known.

## Dependencies requested from other roles
- **B (resolved):** `server/check.ts` was aligned with the keep-price outcome on main (`ead9e8e`); `npm run check` passes.
- **B (contract request, optional):** `ItemHourOutlook` has one `scenarioUnits` field, so after C2 it holds serviceable units and raw demand units are no longer visible per item.
  ```text
  Needed change: ItemHourOutlook add `serviceableUnits: number` (then `scenarioUnits` goes back to raw demand), mirroring HourOutlook.scenarioOrders / serviceableOrders
  Owning role/path: B, contracts/index.ts
  Current contract/version: 1
  Proposed input/output: { hour, baselineUnits, scenarioUnits (raw), serviceableUnits (capped) }
  Reason and affected callers: DESIGN.md §9 "show raw expected demand separately from serviceable"; callers: server/planner.ts, web charts, intelligence packets
  Temporary behavior while waiting: scenarioUnits is the serviceable value; outlook.notes names the scaled hours
  ```
- **B (contract request, optional):** there is no per-candidate way to carry a non-blocking limitation. No existing `ValidationIssue` code means "bundle/cannibalization limits", so the engine does not reuse one.
  ```text
  Needed change: ValidationIssue.code add "BUNDLE_LIMITATIONS" (warning), or OfferCandidate add `notes: string[]`
  Owning role/path: B, contracts/index.ts
  Current contract/version: 1
  Proposed input/output: bundle-category candidates carry the note from engine `BUNDLE_LIMITATION`
  Reason and affected callers: DESIGN.md §9 "Bundles include every component's variable cost. Report … substitution/cannibalization limitations"; callers: server/planner.ts, web OfferTable, intelligence packets
  Temporary behavior while waiting: the note is in ENGINE_ASSUMPTIONS (already shown via Recommendation.assumptions); callers that want it per candidate can call engine `candidateLimitations(data, candidate)`
  ```
- **B (contract request, optional):** `Selection.reason` is free text, so D has to explain the decision from a sentence. The engine can already supply a code and the numbers.
  ```text
  Needed change: Selection add `reasonCode` and `reasonFacts`
  Owning role/path: B, contracts/index.ts
  Current contract/version: 1
  Proposed input/output:
    reasonCode: "CAPACITY_PEAK" | "SPARSE_HISTORY" | "DISCOUNT_CLEARS_BREAK_EVEN" | "NO_DISCOUNT_CLEARS_BREAK_EVEN" | "DEMAND_WITHIN_USUAL"
    reasonFacts: { breakEvenUnits: number | null; baseUnits: number | null; referenceUnits: number; peakOrders: number; capacity: number }
    (keep `reason` for display; optionally also `comparedCandidateId: string | null`)
  Reason and affected callers: lets D explain the decision without parsing text or inventing numbers (DESIGN.md §10). Callers: server/planner.ts (store on Recommendation), intelligence packets, web
  Temporary behavior while waiting: call engine `selectionFacts(candidates, outlook)` next to `selectRecommendedCandidate`; it returns exactly these values today, with no contract change
  ```
- **D / team lead:** decide the demo story. Under these assumptions no fixture item can earn a discount recommendation: base response clears break-even only when variable cost is at most about 23% (10% off) or 28% (5% off) of price, and every offer-eligible fixture item is at 35% or more (after the coffee-shop pivot too). Options: accept keep-price at Downtown and show the discount as a manager-edited trial, or change the selection policy (FRAMEWORK.md C4).

## Known blockers and fallback behavior
- None in the engine. `npm run check` passes. The engine was not loosened to force a discount.
- With no engine-recommended discount, all three locations currently return keep-price; managers can still edit in a discount, which is validated as before.

## Known limitations
- Response values (0 / 1.5× / 3× the discount %) are assumptions to tune, not measurements.
- Raw (uncapped) item units are not exposed until B adds a field (request above).
- The capacity cap assumes whole-store orders move in proportion to the discounted item's units, which overstates the order impact of a single item; it is the same basis `CAPACITY_CONFLICT` uses.
- The daypart fallback flattens the shape inside a daypart (every hour gets the daypart's average hour), so a sparse-history focus window is only approximate; selection keeps price in that case anyway.
- Break-even rounds up to whole units while expected units are fractional. In a low-volume window (about 13 units at Downtown) a +7.5% base response adds one unit, which cannot reach a break-even that rounded up by more than that, so a 5% offer misses even at near-zero cost. This is part of why no discount is recommended on the fixtures (see C1); a decision for the team, not changed here.
- `ENGINE_POLICY` is a plain constant: only `sparseTrial` can be overridden per call. Moving the values into `ChainPolicy` would be a contract change for B.
- One sparse item marks the whole location outlook sparse, because `evidenceQuality` is a single field per outlook.
- The bundle note is not attached to the candidate object itself until B adds a field or code (request above).
- No separate bundle candidate; the default item is whichever `offerEligible` item has the most expected units in the focus window (today the Coffee & Pastry Pair).
