# Role C handoff — demand and pricing

## Ready interfaces and paths
`engine/index.ts` exports:
- `calculateLocationOutlook(data, request)`: same-weekday/hour baseline over up to 8 weeks, excluding promotion hours. An hour with fewer than 4 same-weekday observations falls back to the average hour of its daypart (see `DAYPARTS`) across weekdays or weekends. `evidenceQuality` is the worse of order and item history, `observationCount` is the smallest sample across both, and `notes` says which history was sparse and which dayparts were used. Applies context adjustments deduplicated by `dedupeKey` and bounded to [-50%, +100%], plus capacity, classification, and the focus window (softest 3-hour window, or the constrained peak). When an hour's scenario orders exceed capacity, each item's `scenarioUnits` for that hour is scaled by `serviceableOrders / scenarioOrders` and a note is added to `notes`; unconstrained hours are unchanged.
- `evaluateOffers(data, outlook, terms?, existingOffers?)`: keep-price, 5% off and 10% off, or the edited terms. Applies all guardrails from DESIGN.md §9. A keep-price candidate whose item has no known cost carries `MISSING_COST` as a warning and stays valid. Each discount carries low/base/high response scenarios: low = +0% units (no response), base = 1.5 × the discount %, high = 3 × the discount % (10% off → +0 / +15 / +30%). These are assumptions, not learned elasticity. `ResponseScenario`'s shape is unchanged. Response units are capped per hour so the implied orders never exceed capacity (orders are assumed to move in proportion to the item's units); `referenceUnits` is the serviceable figure.
- `selectRecommendedCandidate(candidates, outlook)`: keep-price for capacity peaks, sparse history or a normal day; otherwise the best valid discount whose base scenario clears break-even, or keep-price when none does.
- `DAYPARTS`: morning (open–11:00), lunch (11:00–14:00), afternoon (14:00–17:00), dinner (17:00–close).
- `discountedPriceCents`, `breakEvenUnits`, `toLocalKey`.
- `ENGINE_ASSUMPTIONS`: response values, stable units per order, the daypart fallback, no substitution/cannibalization modeling, and the break-even basis (expected units at the regular price for the scenario, a deliberate deviation from the §9 `baseline_units` formula).

See `engine/FRAMEWORK.md` for design alignment, as-built behavior and the work queue.

## Contract version
1.

## How to run/check
`node --experimental-strip-types engine/check.ts`

## Checks completed
- The $14 / $5 / 20-unit example gives 1260¢ price, 760¢ contribution, 24-unit break-even and 19,760¢ at 26 units.
- Response assumptions: +0 / +7.5 / +15% at 5% off and +0 / +15 / +30% at 10% off; the low scenario keeps reference units and loses contribution.
- Guardrails: ceiling, closed hours, invalid window, stale cost, missing cost, nonpositive and below-minimum contribution, eligibility, overlap.
- The arena event affects only arena hours 16–20 and duplicate records aren't stacked; the arena gets a keep-price decision. `CAPACITY_CONFLICT` still uses the high scenario (now +30% at 10% off) and still flags both arena discounts.
- Downtown (soft window 14:00–17:00, Coffee & Pastry Pair) now gets keep-price: base units stay below break-even for both 5% and 10%.
- Capacity cap (C2), Arena event day: only 18:00 exceeds capacity (40.4 vs 40 orders) and its item units are scaled by the serviceable share; other hours equal raw demand. No discount scenario exceeds the window's serviceable units (about 56.8 for the Coffee & Pastry Pair, 17:00–20:00), so 10% off high is 56.8 units, not 68.8, and both break-evens (58 and 63) are out of reach within capacity.
- Downtown typical-day numbers are unchanged by C2 (asserted exactly: 13.5 reference units, break-even 15/16, all response units and contributions).
- Sparse history (C6): with two weeks of data every Downtown hour uses its daypart average (equal within a daypart, different between dayparts, lunch equals the mean of weekday lunch buckets), baselines stay positive, the note names the fallback, and selection keeps price.
- Item-only sparse history marks the outlook sparse, leaves order baselines untouched, adds the item-history note and puts `SPARSE_HISTORY` on discounts.
- Missing cost: error on the discount, warning on keep-price (still valid); no issue when cost is known.

## Dependencies requested from other roles
- **B:** `server/check.ts` line 37 expects Downtown `selectedKind === "discount"` and line 49 expects a `$12.60` caption on the default recommendation (line numbers as of main @ c35194b). Both fail with C1, so `npm run check` fails at `server/check.ts` (typecheck, engine, data and intelligence pass). Please update once the demo story below is decided.
- **B (contract request, optional):** `ItemHourOutlook` has one `scenarioUnits` field, so after C2 it holds serviceable units and raw demand units are no longer visible per item.
  ```text
  Needed change: ItemHourOutlook add `serviceableUnits: number` (then `scenarioUnits` goes back to raw demand), mirroring HourOutlook.scenarioOrders / serviceableOrders
  Owning role/path: B, contracts/index.ts
  Current contract/version: 1
  Proposed input/output: { hour, baselineUnits, scenarioUnits (raw), serviceableUnits (capped) }
  Reason and affected callers: DESIGN.md §9 "show raw expected demand separately from serviceable"; callers: server/planner.ts, web charts, intelligence packets
  Temporary behavior while waiting: scenarioUnits is the serviceable value; outlook.notes names the scaled hours
  ```
- **D / team lead:** decide the demo story. Under these assumptions no fixture item can earn a discount recommendation: base response clears break-even only when variable cost is at most about 23% (10% off) or 28% (5% off) of price, and every offer-eligible fixture item is at 35% or more (after the coffee-shop pivot too). Options: accept keep-price at Downtown and show the discount as a manager-edited trial, or change the selection policy (FRAMEWORK.md C4).

## Known blockers and fallback behavior
- `npm run check` fails at `server/check.ts` until B updates it (above). The engine was not loosened to force a discount.
- With no engine-recommended discount, all three locations currently return keep-price; managers can still edit in a discount, which is validated as before.

## Known limitations
- Response values (0 / 1.5× / 3× the discount %) are assumptions to tune, not measurements.
- Raw (uncapped) item units are not exposed until B adds a field (request above).
- The capacity cap assumes whole-store orders move in proportion to the discounted item's units, which overstates the order impact of a single item; it is the same basis `CAPACITY_CONFLICT` uses.
- The daypart fallback flattens the shape inside a daypart (every hour gets the daypart's average hour), so a sparse-history focus window is only approximate; selection keeps price in that case anyway.
- One sparse item marks the whole location outlook sparse, because `evidenceQuality` is a single field per outlook.
- No separate bundle candidate; the default item is whichever `offerEligible` item has the most expected units in the focus window (today the Coffee & Pastry Pair).
