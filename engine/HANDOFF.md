# Role C handoff — demand and pricing

## Ready interfaces and paths
`engine/index.ts` exports:
- `calculateLocationOutlook(data, request)`: same-weekday/hour baseline over up to 8 weeks, excluding promotion hours, with a sparse fallback. Applies context adjustments deduplicated by `dedupeKey` and bounded to [-50%, +100%], plus capacity, classification, and the focus window (softest 3-hour window, or the constrained peak).
- `evaluateOffers(data, outlook, terms?, existingOffers?)`: keep-price, 5% off and 10% off, or the edited terms. Applies all guardrails from DESIGN.md §9. Each discount carries low/base/high response scenarios: low = +0% units (no response), base = 1.5 × the discount %, high = 3 × the discount % (10% off → +0 / +15 / +30%). These are assumptions, not learned elasticity. `ResponseScenario`'s shape is unchanged.
- `selectRecommendedCandidate(candidates, outlook)`: keep-price for capacity peaks, sparse history or a normal day; otherwise the best valid discount whose base scenario clears break-even, or keep-price when none does.
- `discountedPriceCents`, `breakEvenUnits`, `ENGINE_ASSUMPTIONS` (now states the exact response values), `toLocalKey`.

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
- Downtown (soft window 14:00–17:00, Signature Bowl) now gets keep-price: base units stay below break-even for both 5% and 10%.
- Sparse-history fallback.

## Dependencies requested from other roles
- **B:** `server/check.ts` line 33 expects Downtown `selectedKind === "discount"` and line 44 expects a `$12.60` caption on the default recommendation. Both fail with C1, so `npm run check` fails at `server/check.ts` (typecheck, engine, data and intelligence pass). Please update once the demo story below is decided.
- **D / team lead:** decide the demo story. Under these assumptions no fixture item can earn a discount recommendation: base response clears break-even only when variable cost is at most about 23% (10% off) or 28% (5% off) of price, and every fixture item is at 35% or more. Options: accept keep-price at Downtown and show the discount as a manager-edited trial, or change the selection policy (FRAMEWORK.md C4).

## Known blockers and fallback behavior
- `npm run check` fails at `server/check.ts` until B updates it (above). The engine was not loosened to force a discount.
- With no engine-recommended discount, all three locations currently return keep-price; managers can still edit in a discount, which is validated as before.

## Known limitations
- Response values (0 / 1.5× / 3× the discount %) are assumptions to tune, not measurements.
- No bundle candidate yet.
