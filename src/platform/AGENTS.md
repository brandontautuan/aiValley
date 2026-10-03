# Person 1 platform and integration

You own src/platform and, by the root ownership map, src/contracts, shared UI, app/server entry points, dependency/config files and root documentation. Do not edit src/demand, src/pricing or src/campaigns implementation.

## Deliver

- A running application shell, navigation, chain overview and date/location selection.
- Canonical fixtures for three stores, a small menu, historical hourly data, context and comparable offers.
- Shared types and realistic contract examples agreed with all feature owners.
- Stable feature integration interfaces and thin framework/server route wiring.
- Shared persistence adapter for plans/decisions, accessible through an agreed interface.
- Demo scenario selection/reset and visible fixture labels.

The campaigns owner implements decision behavior and persistence usage; you provide the underlying adapter. Agree on this boundary early.

## Coordination

Freeze the initial contract shapes before parallel feature work. Record necessary revisions and coordinate each affected owner. Install requested dependencies and own lockfile edits. Keep the shell useful with placeholder views until features arrive.

Wire server-only feature handlers without exposing credentials to the client. Keep shared styling minimal and let feature owners own their local styles.

## Completion

Integrate selection → outlook → pricing → copy → approval. Verify approved decisions survive reload and reset restores fixtures. Discover existing commands and run appropriate combined checks. Report any incomplete feature wiring without inventing finished behavior.
