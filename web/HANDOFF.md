# Role A handoff — simplified planning UI

## Ready interfaces and paths
- `web/src/App.tsx`: Daily planning and Saved plans are primary navigation. Week, Month, and Strategy remain under More views. One planning-date control; scenario and reset controls are under Demo settings. Date/scenario/location changes remount review state to prevent mixing contexts.
- `web/src/components/Today.tsx`: action-first store cards, a short reason, optional demand details, and one saved-store count. Saved cards display the persisted terms and link to their saved scenario, even when another scenario is being explored.
- `web/src/components/LocationDetail.tsx`: selected terms, reason, customer price, amount left after item costs, and discount sales target appear first. Forecast/evidence, comparisons/custom edits, social drafts, and competitor research are collapsed and explain their purpose. Assumptions and selected-offer warnings remain visible.
- `TermsEditor.tsx` / `DecisionBar.tsx`: unapplied edits block approval and dismissal, with Update/Discard controls. End time must follow start time. Approval explicitly saves a plan without changing menus or publishing posts.
- `OptionCards.tsx`: preserves server amounts and fractional sales estimates rather than rounding up and falsely claiming break-even. Invalid options cannot be selected.
- `PromotePanel.tsx`: optional caption workflow, plain-language stale warning, copy-failure feedback, and a post preview only once content exists. Outdated content cannot be copied as current.
- `ActionPlan.tsx`: saved decisions first; schedule and captions are expandable. Empty days have a direct review link.
- `web/src/styles.css`: responsive cards and disclosures, keyboard focus/skip link, phone-friendly controls, and contained chart scrolling.
- Existing URL routes and API contracts remain unchanged. All changes are confined to Role A paths.

## Contract version
1 (`contracts/index.ts`).

## How to run/check
- `npm run dev` for development.
- `npm run check` for typechecking and deterministic module checks.
- `npm run build && npm start` for the production demo.
- Working branch: `codex/simpler-planning-ui`, isolated managed worktree.
- Local review preview: http://localhost:3107, with separate temporary demo data at `/private/tmp/harborline-ui-review`. No existing runtime data was reset.

## Checks completed
- Repository typecheck, engine, data, intelligence, and server checks passed.
- Production build passed; diff whitespace check passed.
- Browser: collapsed daily overview, custom 5% offer, unapplied-edit approval protection, recalculation, template caption generation, subsequent 10% edit invalidating the caption, approval, and saved-plan persistence after reload.
- Browser: local-event scenario retains the selected date and shows the arena capacity explanation.
- Responsive checks include 390px phone width; saved plans and expanded forecast have no page-level horizontal overflow.
- Final browser checks also cover saved terms/scenario links and desktop layout.

## Dependencies requested from other roles
None for this revision. Prior optional requests remain: B may add a range endpoint for Week/Month request efficiency; D may add more dated context records beyond Oct 5.

## Integrated remote changes
- Preserved the remote ZooWork adapter, data/engine changes, and dependency configuration without modifying their implementation.
- Random mock-data scenarios remain available in Demo settings. Their seed, saved-plan labels, and URL state are preserved; applied mock/event signals appear inside each store’s expandable demand details.
- The remote SocialMediaPlan receives current context and appears inside the optional social-post section.

## Known blockers and fallback behavior
- Live API only; there is still no frontend mock adapter.
- Competitor research needs server-side Tavily configuration; without it, the existing unavailable state preserves ordinary planning.
- The API snapshots social content at approval. A caption generated afterward can be copied, but does not update an already saved plan; the UI now explains this limitation.
- AI failure uses the existing labeled template fallback. Pricing calculations, contracts, API/state, and generated AI copy remain with their owning modules.
