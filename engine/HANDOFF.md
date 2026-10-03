# Role C handoff — demand and pricing

## Ready interfaces and paths
`engine/index.ts` exports:
- `calculateLocationOutlook(data, request)`: same-weekday/hour baseline over up to 8 weeks, excluding promotion hours, with a sparse fallback. Applies context adjustments deduplicated by `dedupeKey` and bounded to [-50%, +100%], plus capacity, classification, and the focus window (softest 3-hour window, or the constrained peak).
- `evaluateOffers(data, outlook, terms?, existingOffers?)`: keep-price, 5% off and 10% off, or the edited terms. Applies all guardrails from DESIGN.md §9.
- `selectRecommendedCandidate(candidates, outlook)`: keep-price for capacity peaks, sparse history or a normal day; otherwise the best valid discount whose base scenario clears break-even.
- `discountedPriceCents`, `breakEvenUnits`, `ENGINE_ASSUMPTIONS`.

## Contract version
1.

## How to run/check
`node --experimental-strip-types engine/check.ts`

## Checks completed
- The $14 / $5 / 20-unit example gives 1260¢ price, 760¢ contribution, 24-unit break-even and 19,760¢ at 26 units.
- Guardrails: ceiling, closed hours, invalid window, stale cost, missing cost, nonpositive and below-minimum contribution, eligibility, overlap.
- The arena event affects only arena hours 16–20 and duplicate records aren't stacked; the arena gets a keep-price decision.
- Downtown gets a 10% trial.
- Sparse-history fallback.

## Known limitations
- Response multipliers (1×/3×/5× the discount %) are placeholders to tune.
- No bundle candidate yet.
