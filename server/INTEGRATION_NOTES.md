# Coffee-Shop Strategy Integration Notes

These requests are outside Role B ownership. They describe the changes needed
to support the San Francisco coffee-shop strategy planner while retaining the
existing deterministic demand and pricing regime.

## Role C — `engine/**`

**Needed change:** Make candidate eligibility product-agnostic.

**Current behavior:** `engine/index.ts` selects offer items with
`item.category === "bowl"`, so coffee-shop fixtures produce no candidates.

**Requested behavior:** Select items where `item.offerEligible === true` and
the item is eligible for the location. Keep all baseline, demand adjustment,
capacity, contribution, break-even, validation, and recommendation rules
unchanged.

**Contract dependency:** Role B will publish the `MenuItem.offerEligible`
field with the next coordinated contract version.

## Role D — `data/**` and `intelligence/**`

**Needed change:** Replace the Bowlhouse fixtures with a San Francisco coffee
shop chain and coffee-shop marketing language.

**Fixture expectations:**

- Locations, menu items, order history, item units, and relevant local context
  should describe coffee shops.
- Menu items should use the coordinated `coffee`, `food`, or `bundle`
  categories and set `offerEligible` deliberately.
- Preserve integer-cent prices, variable costs, location timezones, opening
  hours, capacity, and labeled fixture assumptions.
- Provide source-backed, bounded trend evidence for the strategy workflow;
  do not make unreviewed evidence directly change deterministic pricing.

**AI/content expectations:** Replace Bowlhouse-specific names, bowl language,
and the bowl emoji in fallback explanation and social-draft templates. Retain
the exact-term and evidence validation already present.

## Role A — `web/**`

**Needed change:** Replace visible Bowlhouse branding and bowl-specific copy
with the selected coffee-shop brand. The UI will eventually need to display
Role B's strategy-run lifecycle, ranked actions, evidence freshness, and the
manager approval boundary.

## Role B Follow-Up

After the affected owners agree to the `MenuItem` change, Role B will bump the
shared contract version and add strategy-run contracts, routes, persistence,
and ZooWork/Band orchestration. Existing one-day recommendations remain the
authoritative economics and approval artifacts; strategy runs reference them
rather than replacing them.
