# Person 3 pricing and offer review

You own src/pricing only. Read the root design and shared contracts. Do not edit src/contracts, src/platform, src/demand, src/campaigns, routing, dependencies or shared fixtures.

## Deliver

- Regular-price, 5%-off and 10%-off candidates for an eligible item/window.
- Contribution calculations, break-even units and low/base/high response scenarios.
- Discount ceiling, minimum contribution, hours, overlap and capacity validation.
- Offer editor and comparison view with keep-current-price alternative.
- Public calculation/validation/view interfaces agreed with Person 1.

Accept the shared outlook contract. Use agreed examples while demand is being implemented. Keep tests and local helpers inside src/pricing.

## Rules

Use integer cents and explicit rounding. Check nonpositive denominators before break-even calculations. Missing/stale variable costs block margin recommendations. Contribution is before fixed costs; do not call it total profit.

Treat additional units from discounts as an assumption. Traffic does not establish elasticity. Keep-price is a valid recommendation, especially when capacity is constrained.

Offer edits produce a new revision and require revalidation. Expose that revision to campaigns so stale copy/approval cannot be reused. Coordinate contract changes through Person 1.

## Completion

Verify the $14 price/$5 cost/20 unit fixture: baseline contribution $180; 10%-off price $12.60; contribution/unit $7.60; break-even 24 units. Verify invalid offers are rejected. Do not implement live POS updates or social generation.
