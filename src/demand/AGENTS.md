# Person 2 demand and local context

You own src/demand only. Read the root design and shared contracts. Do not edit src/contracts, src/platform, src/pricing, src/campaigns, app routing, dependency files or canonical shared fixtures.

## Deliver

- Same-location/item/weekday/hour historical baseline with a sparse-data fallback.
- Scenario adjustments limited to applicable locations and time windows.
- Hourly demand chart and location context/evidence panel.
- Comparable competitor-offer view with terms, freshness and source labels.
- Public computation and view interfaces agreed with Person 1.

Use shared fixture inputs. Keep temporary examples and meaningful calculation checks inside src/demand. Request canonical fixture changes from Person 1.

## Rules

Distinguish item units from orders. Avoid double-counting overlapping event signals. Handle opening hours and explicit timezones. Mark adjustment coefficients as assumptions unless calibrated. A few weeks of history cannot establish an annual holiday effect.

Do not infer price elasticity or invent competitor sales. Show observation counts/evidence quality rather than arbitrary statistical confidence. Do not generate campaign copy or pricing decisions.

## Completion

Changing an event changes only relevant store/time results. Sparse history and missing context produce a usable result with visible limitations. Export the agreed outlook shape and report integration requirements.
