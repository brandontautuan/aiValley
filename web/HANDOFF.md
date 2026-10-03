# Role A handoff — simplified planning UI

## Disney Cafe update
- Displayed UI name and document title are Disney Cafe Daily Planner. The logo uses a small abstract star rather than a character or official mark.
- DM Sans body text and Alegreya headings, warm neutral surfaces, copper actions, blue information, and gold save emphasis form the updated visual language. Navigation tabs, buttons, and disclosures now have distinct states and brief motion with reduced-motion support.
- Each store review now shows nearby competitor context immediately after the recommendation, with a visible public-source research action and deeper sample evidence. A jump link in the store header makes it easy to find.
- The navbar exposes Daily planning, Saved plans, Week outlook, Month calendar, and Strategy directly. Social media planning, caption creation, and explanation are visible on the store review page; the header links directly to that section.
- `web/design/disney-cafe-reference.png` is the toned-down comp used as a composition reference; current typography and color reflect the user's later feedback.

## Ready interfaces and paths
- `web/src/App.tsx`: Daily planning, Saved plans, Week outlook, Month calendar, and Strategy are all visible in the main navigation. One planning-date control; scenario and reset controls are under Demo settings. Date/scenario/location changes remount review state to prevent mixing contexts.
- The date control begins after the first fixed-fixture observation (2026-08-11);
  direct links remain protected by API validation.
- `web/src/components/Today.tsx`: action-first store cards, a short reason, optional demand details, and one saved-store count. Saved cards display the persisted terms and link to their saved scenario, even when another scenario is being explored.
- `web/src/components/LocationDetail.tsx`: selected terms, reason, customer price, amount left after item costs, and discount sales target appear first. Nearby competitor context and research and the social media plan/copy workflow are visible sections with jump controls. Forecast and optional price edits remain disclosed; assumptions and selected-offer warnings remain visible.
- `TermsEditor.tsx` / `DecisionBar.tsx`: unapplied edits block approval and dismissal, with Update/Discard controls. End time must follow start time. Approval explicitly saves a plan without changing menus or publishing posts.
- `OptionCards.tsx`: preserves server amounts and fractional sales estimates rather than rounding up and falsely claiming break-even. Invalid options cannot be selected.
- `PromotePanel.tsx`: optional caption workflow, plain-language stale warning, copy-failure feedback, and a post preview only once content exists. Outdated content cannot be copied as current.
- `ActionPlan.tsx`: saved decisions first; schedule and captions are expandable. Empty days have a direct review link.
- `web/src/styles.css`: a wider desktop review page and demand chart without horizontal scrolling, responsive cards and disclosures, and keyboard focus/skip link.
- Existing URL routes and API contracts remain unchanged. All changes are confined to Role A paths.

## Contract version
1 (`contracts/index.ts`).

## How to run/check
- `npm run dev` for development.
- `npm run check` for typechecking and deterministic module checks.
- `npm run build && npm start` for the production demo.
- Working branch: `codex/reject-no-history-dates`.
- Local review preview: http://localhost:3107, with separate temporary demo data at `/private/tmp/disney-cafe-final-preview`. No existing runtime data was reset.

## Checks completed
- Repository typecheck, engine, data, intelligence, and server checks passed.
- Production build passed; diff whitespace check passed.
- Browser: collapsed daily overview, custom 5% offer, unapplied-edit approval protection, recalculation, template caption generation, subsequent 10% edit invalidating the caption, approval, and saved-plan persistence after reload.
- Browser: local-event scenario retains the selected date and shows the arena capacity explanation.
- Final browser checks cover saved terms/scenario links and desktop layout. At 1280px, the expanded demand chart and all hour labels fit the review width without horizontal overflow.

## Dependencies requested from other roles
None for this revision. Prior optional requests remain: B may add a range endpoint for Week/Month request efficiency; D may add more dated context records beyond Oct 5.

## Integrated remote changes
- Preserved the remote ZooWork adapter, data/engine changes, and dependency configuration without modifying their implementation.
- Random mock-data scenarios remain available in Demo settings. Their seed, saved-plan labels, and URL state are preserved; applied mock/event signals appear inside each store’s expandable demand details.
- The remote SocialMediaPlan receives current context and appears in the visible social media workspace.

## Known blockers and fallback behavior
- Live API only; there is still no frontend mock adapter.
- Competitor research needs server-side Tavily configuration; without it, the existing unavailable state preserves ordinary planning.
- The API snapshots social content at approval. A caption generated afterward can be copied, but does not update an already saved plan; the UI now explains this limitation.
- AI failure uses the existing labeled template fallback. Pricing calculations, contracts, API/state, and generated AI copy remain with their owning modules.
