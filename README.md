# Restaurant hackathon team setup

Use this pack alongside Restaurant_OS_Hackathon_Design.md at the repository root. This is a proposed ownership layout, not a description of your current repository. Adapt the paths once to the actual framework before everyone starts; preserve the four ownership boundaries.

## Ownership

| Person | Owns | Deliverable |
| --- | --- | --- |
| 1 — integration lead | App entry points, routing, src/platform, src/contracts, shared UI, dependency/config files | Running shell, seeded data, chain overview, integration |
| 2 — demand and context | src/demand | Location outlook, demand chart, local events, holidays, competitor evidence |
| 3 — pricing | src/pricing | Price candidates, margin calculations, guardrails, offer editor |
| 4 — campaigns and decisions | src/campaigns | AI explanations and social copy, approval persistence, action plan |

Give each person a vertical feature: their UI, feature logic, tests where useful, and server handler implementations belong under their owned folder. Person 1 wires handlers into the framework's server routes. Client imports must never pull in server secrets.

## Layout

- AGENTS.md — shared rules; maintained by Person 1
- Restaurant_OS_Hackathon_Design.md — agreed design; maintained by Person 1
- src/contracts — shared data types, fixture examples, feature integration signatures
- src/platform — app shell, shared UI, canonical fixtures, persistence adapter and route wiring
- src/demand/AGENTS.md — Person 2 instructions
- src/pricing/AGENTS.md — Person 3 instructions
- src/campaigns/AGENTS.md — Person 4 instructions
- src/platform/AGENTS.md — Person 1 instructions

Use each feature's index module as its public interface. Put feature tests and feature documentation inside that folder. For frameworks requiring top-level app, pages, or API directories, Person 1 owns those thin entry points and imports the feature implementation.

Do not restructure a working repo just to match these names. Map existing directories to the same owners instead, then update every instruction file consistently.

## Agree on contracts before parallel work

Spend the first 30–45 minutes agreeing on field names, data examples, and exported function/component signatures. Do not build an elaborate abstraction layer. A small set of shared types and realistic examples is enough.

Minimum contracts:
- Location: stable ID, name, timezone, opening hours, capacity.
- MenuItem: ID, location eligibility, regular price and variable cost in integer cents.
- SalesBucket: location/item/time identifiers, order counts and item units.
- ContextSignal and CompetitorOffer: stable IDs, applicability, timestamps and source/fixture labels.
- LocationOutlook: hourly baseline/scenario orders, item-level baseline/scenario units, evidence IDs and assumptions.
- PriceCandidate: item/window, price cents, contribution cents, assumed units, break-even units and validation issues.
- Recommendation: stable ID, revision, location/window, candidate, evidence IDs, assumptions and status.
- SocialDraft: recommendation ID/revision, exact offer terms, caption, posting time and creative brief.
- Decision: recommendation ID/revision, approved terms, action and timestamp.

Keep order counts separate from item units. Include dates/timezones in windows. Treat timestamps and money consistently. Distinguish observed inputs, assumed adjustments and model outputs.

Suggested logical integration:
- Person 2 exports computeLocationOutlook(input) and a location detail view.
- Person 3 exports evaluatePriceCandidates(input), validateOffer(input) and an offer editor.
- Person 4 exports explanation/draft generation, an action-plan view and decision operations.
- Person 1 supplies canonical input data, invokes these modules, and wires navigation.

These are suggested names, not claims about the language or framework. Define actual typed signatures for your chosen stack together.

## Parallel workflow

1. Person 1 creates the shell, shared contracts, fixture examples and placeholder feature interfaces.
2. Each person branches from that commit. Use team/platform, team/demand, team/pricing and team/campaigns.
3. Each person works only inside their assigned paths. If multiple agents run on one machine, use a separate checkout or git worktree for each branch.
4. People 2–4 build against the agreed examples without waiting for upstream feature completion.
5. A contract change is proposed to Person 1 with the exact field/signature, reason and affected consumers. Person 1 coordinates the update; nobody changes it silently.
6. Integrate a minimal end-to-end path early: select location → compute outlook → evaluate offer → generate draft → approve → reload saved plan.
7. Merge small changes regularly. Feature owners resolve conflicts in their feature; Person 1 handles shared wiring and the combined app.

AGENTS.md guides agents; it is not an access-control mechanism. Nested instructions apply to their directory scope, and an agent may still technically edit other paths. Give each session the explicit ownership prompt below and inspect its diff. Separate branches/worktrees isolate working files but do not prevent conflicts on shared paths.

## Starting prompt for each teammate

Read the root AGENTS.md, Restaurant_OS_Hackathon_Design.md, and the AGENTS.md in your assigned folder. You are Person [number], owning [folder]. Implement your complete feature within those paths. Use the agreed shared contracts and fixture examples. Do not edit another owner's files, dependencies, routing or contracts. Report required cross-folder changes to the integration lead with the exact proposed change. Inspect your diff before committing and report any paths outside your ownership. Use the existing framework and verification commands; do not invent repository structure or commands.

## Shared-file rule

Person 1 owns package manifests, lockfiles, app entry points, framework configuration, shared styles/components, CI, root documentation, canonical fixtures and shared contracts. Feature developers request changes instead of editing these files. Feature-local styles remain inside the feature.

Avoid a shared utils file that everybody touches. Keep local helpers local until there is a concrete need to move them. Use platform shared UI through its published interface; do not import another feature's internal files.

## Completion checks

- Person 1: app runs; navigation connects all features; deterministic demo reset works; canonical fixtures have visible labels.
- Person 2: only applicable location/time signals alter the outlook; assumptions and evidence remain visible.
- Person 3: the $14 regular-price/$5-cost/20-unit example gives $180 baseline contribution, $12.60 discounted price and 24 break-even units; guardrails reject invalid offers.
- Person 4: approved plans survive reload; edited offer revisions invalidate old copy; generation failure preserves the deterministic workflow.
- Together: rehearse the three-minute demo with no dependency on a live external integration.
