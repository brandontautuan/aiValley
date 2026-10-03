# Restaurant hackathon shared agent instructions

Read Restaurant_OS_Hackathon_Design.md before implementing. The product is a daily revenue planner for three restaurant locations: demand/context → price or promotion review → matching social draft → saved manager-approved plan.

## Ownership

- Person 1: src/platform, src/contracts, shared UI, application/server entry points, dependencies, configuration, CI and root documentation.
- Person 2: src/demand.
- Person 3: src/pricing.
- Person 4: src/campaigns.

Read the scoped AGENTS.md for your assigned folder. Edit only your owned paths. Do not change another owner's files, even for a convenient fix. Describe the needed change to its owner. Do not rename or reformat unrelated files.

These are proposed paths. If this repository uses another layout, the integration lead must establish the actual path-to-owner map before parallel implementation.

## Contracts and integration

Shared contracts are maintained by Person 1. Use the agreed contracts and examples; do not silently change fields or integration signatures. Propose changes with affected consumers. Use feature public interfaces and avoid importing feature internals across ownership boundaries.

Feature implementation and relevant tests stay inside the feature folder. Person 1 owns thin framework route wrappers and imports feature handlers from their owned modules.

## Scope and behavior

Keep demand calculations, pricing economics and validation deterministic. AI explains evidence and drafts content. Never invent competitor offers, observed demand, events or measured revenue lift. Label fixtures and assumptions. Manager approval saves a plan; it does not execute a live price change or publish content.

Use integer cents for money and explicit location timezones for time windows. Separate item units from orders. Credentials and AI calls stay server-side. Client bundles must not import server-only modules.

## Working practice

Use the existing stack and discover actual run/build/check commands from the repository. Ask Person 1 for dependency or configuration changes. Avoid microservices, multi-agent orchestration and speculative abstractions. Preserve useful existing code.

Before handoff, run relevant available checks, inspect the diff and report: files changed, behavior delivered, verification performed, and integration needs. Do not claim checks passed unless they ran successfully.

Branches/worktrees isolate work. Do not commit or overwrite another teammate's uncommitted edits. No force pushes, broad resets or destructive cleanup.
