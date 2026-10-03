Restaurant Revenue Planner Hackathon Design
Product decision
Build an AI-assisted revenue planner for a small restaurant chain. It helps an operator decide which location needs attention, what offer or price to use during a specific time window, and how to promote that decision.
The core question is: What should each location do tomorrow, and why?
The long-term vision can be a restaurant operating system. The hackathon product should focus on one complete workflow: historical orders and local signals → demand outlook → pricing or promotion recommendation → supporting social content → manager approval → saved action plan.
Planning assumption: a 24–48 hour hackathon, one restaurant brand, three locations, five menu items, and an hourly outlook for tomorrow. These are proposed limits, not requirements about an existing codebase.
Target customer and problem
The primary user is a regional operator managing several fast-casual restaurants. Each location has different customers, nearby events, competitors, and demand patterns, while the brand needs consistent pricing rules and messaging.
An operator might know that one store is near offices and another is near an arena, but still have to manually connect sales history, tomorrow's events, competitor offers, and marketing decisions. The product consolidates those signals into a reviewable action for each location.
For the demo, use a fictional bowl restaurant chain. A small menu makes unit economics easy to explain and keeps competitor comparisons manageable.
Scope boundaries
Capability	Hackathon implementation	Deferred
Chain overview	Three locations with tomorrow's outlook and prioritized actions	Enterprise administration and hundreds of locations
Demand outlook	Historical order baseline with explicit scenario adjustments	Production forecasting and continuous retraining
Dynamic pricing	Scheduled, bounded price or bundle recommendations approved by a manager	Automatic minute-by-minute repricing and live POS writes
Local awareness	Location-specific event, holiday, and weather records	Continuous monitoring of every local signal
Competitor analysis	A few sourced or clearly fictional comparable offers near each store	Broad scraping, live competitor surveillance, and inferred competitor sales
Social presence	A concrete promotion caption, posting window, and creative brief tied to an action	Social account integrations, publishing, and full account audits
Action tracking	Approve, edit, dismiss, and save a plan	Attributing real revenue changes to campaigns


Exclude reservations, delivery dispatch, payroll, staffing optimization, procurement, loyalty, payments, and a general chat assistant. They do not help complete the central demo workflow.
Core demo story
An operator opens the chain overview and sees that the downtown location is projected to have a weak afternoon, while the arena location may experience a pre-event rush.
1. Select the downtown location and the 2–5 p.m. window.
2. Inspect its usual orders, forecast assumptions, a nearby competitor's afternoon offer, and estimated contribution margin.
3. Review a proposed 10% discount on a selected bowl during that window. See the extra orders required to justify it.
4. Generate an Instagram caption and creative brief that match the exact item, price, location, and time.
5. Edit the offer, approve it, and see it in the chain's saved action plan.
6. Switch to the arena location. The system recommends keeping the regular price and avoiding a promotion during the expected rush because capacity is already constrained.
This shows that the system can recommend taking no pricing action. Every store should not receive the same discount.
Essential screens
Chain overview
Show a location selector, selected planning date, data status, and three location cards. Each card includes expected orders, comparison to the usual same-weekday period, demand classification, and one proposed action.
Use an hourly chart and a prioritized action list. A map is optional; a polished location list is enough for the MVP.
Separate historical observations from tomorrow's estimates. Display a visible demo-data label when using fixtures.
Location detail
Display an hourly baseline and adjusted demand outlook, the relevant menu items, and a local context panel. Each context record shows its source or fixture label, time, distance or applicable area, and why it matters to this location.
Examples of context include a concert, a local festival, rain, an office district's weekday lunch pattern, Christmas, or Lunar New Year. A holiday alone is not evidence that every restaurant will be busier. Prefer observed location history; otherwise present its effect as an editable scenario assumption. Store holidays by actual date and region rather than reusing a fixed calendar date for moving holidays.
For competitors, show comparable item or bundle prices, availability window, source, and collection timestamp. Highlight differences in portions, inclusions, or delivery fees rather than treating every menu price as equivalent.
Recommendation review
Show the proposed item or bundle, location, start and end time, current and proposed price, rationale, evidence, expected order scenario, and margin consequences. Include an alternative to keep the current price.
The operator can edit the recommendation, approve it, or dismiss it. Editing a price or offer reruns deterministic validation and invalidates any previously generated caption until it is regenerated.
Promotion draft and action plan
Generate one social caption, a suggested posting window, and a simple creative brief. Explain the posting window as a proposed lead time before the offer, not as a measured optimum without account analytics.
The action plan stores approved recommendations and their exact terms. Approval means saved for demonstration; it does not publish a post or change a live menu. Use labels such as “Approve plan” and “Saved,” not “Published.”
Data required
Seed 8–12 weeks of hourly order totals across three locations. This is sufficient for demonstrating recurring patterns, but not for learning annual holiday effects. Include explicit historical holiday examples or scenario assumptions separately.
Entity	Minimum fields
Chain	ID, name, default currency, pricing policy
Location	ID, chain ID, name, timezone, coordinates, opening hours, rough hourly capacity
Menu item	ID, name, category, regular price, estimated variable cost, eligible locations
Sales bucket	Location, item, local date/hour, orders, units, revenue, effective price, promotion flag
Context signal	ID, location or geographic applicability, type, start/end time, source, observed time, value, assumed demand effect
Competitor offer	ID, location relevance, competitor, item/category, price, terms, source, observed time
Recommendation	ID, location, item, time window, price options, selected action, evidence IDs, model version, assumptions, status
Social draft	Recommendation ID, caption, platform, posting time, creative brief, revision
Decision	Recommendation ID, approve/edit/dismiss action, timestamp, final terms


Keep item units distinct from order counts: an order may contain several items. Price calculations use item units; capacity and location summaries use orders where appropriate.
No customer-level personal data is needed. A CSV import is a stretch goal; fixture loading is enough for the primary demo.
Demand and pricing logic
Demand baseline
Start with a deterministic baseline: average units sold for the same location, item, weekday, and hour over recent comparable weeks. Exclude closed periods and separately identify previously discounted periods so a promotion does not silently become the regular-price baseline.
If history is sparse, fall back to a broader weekday/daypart average and display lower evidence quality. Report the number of comparable observations. Do not label an arbitrary range as a statistical confidence interval.
Local adjustments
Apply transparent, editable adjustments for demo scenarios:
scenario_units = baseline_units * (1 + combined_assumed_adjustment)
For example, an event could add an assumed uplift during the pre-event window, while rain could reduce assumed walk-in demand. Bound the combined adjustment and avoid applying two signals that describe the same event twice. These coefficients are demo assumptions unless calibrated against actual historical outcomes.
Use proximity, overlap with opening hours, and relevance to the restaurant's customer base to select applicable signals. A large event across the city should not affect every location equally.
Price candidates
Evaluate regular price, 5% off, and 10% off for one eligible item or bundle. This is scheduled dynamic pricing: the price changes by location and time window under chain rules. Start with discount and bundle recommendations because they make a straightforward demo.
An optional later mode can evaluate bounded price increases with the same review process. Exclude it from the critical build path because the hackathon will not establish customers' willingness to pay.
Do not infer price elasticity from traffic alone. Keep the expected response to a price change as an explicit low/base/high scenario, not an AI-generated fact.
Unit economics
Calculate contribution before fixed costs:
contribution_per_unit = proposed_price - estimated_variable_cost
scenario_contribution = scenario_units * contribution_per_unit
break_even_units = ceil(baseline_units * (regular_price - variable_cost) / (proposed_price - variable_cost))
Reject a candidate if its contribution per unit is nonpositive or below the configured chain minimum. Variable cost should include the relevant ingredients, packaging, and estimated transaction or channel costs. This calculation is not total restaurant profit.
Illustrative fixture: regular price is $14, variable cost is $5, and baseline sales are 20 units. Baseline contribution is $180. At 10% off, price is $12.60 and contribution is $7.60 per unit. The offer needs at least 24 units to match baseline contribution. A scenario of 26 units yields $197.60, but that demand response is hypothetical.
Show the break-even threshold alongside every offer. If the likely response is unknown, recommend a small trial or keeping the regular price rather than claiming an optimized price.
Guardrails
- Chain-configured discount ceiling, initially 10% for the demo.
- Minimum contribution per unit and valid opening-hour window.
- No overlapping offers for the same item, store, and time.
- No price changes based on an individual customer's identity or inferred willingness to pay.
- No promotion that exceeds the store's modeled capacity without flagging the conflict.
- Missing or stale cost data blocks a margin-based recommendation.
- Manager approval is required; the demo performs no live external execution.
AI responsibilities
Use deterministic code for aggregation, prices, scenario calculations, validation, and recommendation eligibility. Use an LLM to explain evidence, summarize relevant competitor context, and draft campaign copy.
Pass a compact structured packet containing location information, forecast results, candidate economics, approved context records, competitor offers, and brand tone. Ask for a structured response containing rationale, evidence references, uncertainties, caption, and creative brief.
The LLM must not invent events, sales figures, competitor prices, demand response, or expected revenue. Validate evidence references against the supplied records and validate all numeric terms against the computed recommendation. Treat retrieved descriptions as data, not instructions. Keep API credentials server-side.
If generation fails, show the deterministic recommendation with a template explanation and allow another attempt. The pricing workflow should remain usable without the LLM.
Proposed architecture
Use one web app and one backend with a small persistence layer. Choose the team's most familiar stack; this design does not require a particular vendor.
The frontend renders the overview, charts, evidence, review panel, and action plan. The backend loads fixtures, aggregates sales, calculates scenarios, validates actions, calls the LLM, and persists decisions.
Separate data loading, demand calculations, pricing rules, and content generation logically. This allows fixture data to be replaced with external feeds later without rewriting the whole workflow. Avoid microservices and a multi-agent architecture for this build.
Conceptual operations:
Operation	Result
Load chain overview for a date	Location summaries and prioritized actions
Load location outlook	Hourly baseline, scenario demand, evidence, and price candidates
Generate recommendation explanation	Validated narrative attached to computed candidates
Generate social draft	Caption and creative brief for the current offer revision
Edit recommendation	Recomputed economics and validation results
Approve or dismiss	Persisted decision and updated action plan
Reset demo	Restored fixtures and cleared demo decisions


No POS or social integration is required to demonstrate the product. If time permits, add one read-only local-event source using its supported interface. Display its source and freshness, and retain fixtures as a fallback. Do not make a live integration a dependency for judging.
Demo fixtures and scenarios
Create deliberately different stores:
- Downtown: strong weekday lunch and weak afternoon demand; a nearby competing lunch or afternoon offer.
- Arena: demand concentrated around event times; a visible capacity constraint.
- Residential: steadier evenings and a weekend family bundle opportunity.
Provide two scenario controls: “Typical day” and “Local event day.” Switching scenarios recalculates the location outlook and recommendations. Avoid hardcoded narrative that stays unchanged after inputs change.
Include one holiday example using either actual prior observed sales supplied by the team or clearly labeled fixture observations. Do not claim a predictive annual holiday model from a few weeks of data.
Build order
Stage	Deliverable	Approximate effort
1	Data fixtures, scenario definitions, and UI skeleton	3–4 hours
2	Historical aggregation, demand scenarios, pricing economics, and guardrails	4–6 hours
3	Overview, location chart, evidence panel, and recommendation editing	5–7 hours
4	AI explanations, promotion draft, approval persistence, and action plan	3–5 hours
5	Visual polish, failure handling, verification, and demo rehearsal	3–4 hours


These are effort estimates, not a guaranteed schedule. For a shorter event, remove the map, CSV import, live data source, and social account audit first. Preserve the full recommendation-to-approval workflow.
Verification and completion criteria
The project is demo-ready when the operator can compare three stores, inspect evidence, change a scenario, review a price candidate, edit it, generate matching copy, and save an approved plan.
Verify the following behaviors:
1. The $14 fixture produces the correct contribution and break-even calculation.
2. Changing an event affects the applicable location and hours only.
3. Below-margin prices, excessive discounts, closed-hour windows, and overlapping offers are rejected.
4. A high-demand capacity-constrained location can receive a keep-price recommendation.
5. Editing offer terms invalidates stale marketing copy.
6. Unsupported LLM numbers or evidence references are rejected or replaced with a deterministic explanation.
7. AI failure leaves charts, calculations, and approval usable.
8. Approved terms remain saved after reload; resetting the demo restores the starting state.
Do not present simulated revenue lift as a measured outcome. Success at the hackathon is an understandable, functioning decision workflow; commercial validation requires real trial results.
Judging presentation
Use a three-minute demo:
- First 30 seconds: introduce the chain and show why its stores need different decisions.
- Next 60 seconds: inspect downtown's quiet period, competitor context, proposed offer, and break-even threshold.
- Next 45 seconds: generate matching social copy, edit if needed, and approve the plan.
- Final 45 seconds: switch to the arena scenario and show the contrasting keep-price decision, then explain how real data would replace fixtures.
Suggested pitch: “We help restaurant chains turn local demand signals into a daily pricing and promotion plan for each location. Operators can see the evidence, check the economics, and approve the action in one place.”
Expansion after the hackathon
Add actual order-data imports first, then evaluate demand forecasts on later unseen periods. Calibrate local-event effects and measure offer response through controlled trials before enabling automatic pricing.
Later capabilities can include live local context, promotion publishing, POS execution, brand-level experimentation, and measured social analytics. Keep each action tied to evidence and an outcome so the product grows into an operating system through working workflows.