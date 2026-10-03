# Coffee-Shop Strategy Integration Notes

These requests are outside Role B ownership. They describe the changes needed
to support the San Francisco coffee-shop strategy planner while retaining the
existing deterministic demand and pricing regime.

## Role C — `engine/**` — completed for the coffee demo

**Implemented change:** Candidate eligibility is product-agnostic.

`engine/index.ts` now selects items where `item.offerEligible === true` and
the item is eligible for the location.

Baseline, demand adjustment, capacity, contribution, break-even, validation,
and recommendation rules remain unchanged.

`MenuItem.offerEligible` is part of the current shared contract.

## Role D — `data/**` and `intelligence/**` — completed for the coffee demo

**Implemented change:** Harborline Coffee is the fictional San Francisco
coffee-shop demo chain, with coffee fixtures and coffee-specific fallback copy.

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

## Role A — `web/**` — branding completed; strategy UI remains deferred

Visible branding now uses Harborline Coffee. The UI still needs to display
Role B's strategy-run lifecycle, ranked actions, evidence freshness, and the
manager approval boundary.

### ZooWork environment example

Please add these **empty placeholders only** to `.env.example` (Role A owns
that root file):

```env
ZOOWORK_GROWTH_PLANNER_URL=
ZOOWORK_API_KEY=
```

Never add a real endpoint containing credentials or a real API key to Git.
Developers set actual values in their untracked local `.env`; deployed
environments set them through their secret manager. The server treats either
missing value as an optional-integration fallback and keeps the deterministic,
manager-reviewable strategy workflow available.

## Role B Follow-Up

Strategy-run contracts, routes, persistence, and optional ZooWork Growth
Planner orchestration are present. Band orchestration, Tavily route wiring, and
the strategy UI remain stretch work. Existing one-day recommendations remain
the authoritative economics and approval artifacts; strategy runs reference
them rather than replacing them.
