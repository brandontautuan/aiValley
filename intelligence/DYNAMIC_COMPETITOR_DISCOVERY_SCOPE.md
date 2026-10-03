# Dynamic competitor discovery scope

## Goal

Let a restaurant owner describe a location and either provide known competitors
or ask for a public-web candidate shortlist. The system must never silently
declare a business to be a competitor, infer a price, or use unreviewed web
research in pricing or social content.

The existing San Francisco profiles remain optional demo seeds. Production
profiles are location-specific, manager-owned records.

## Owner onboarding

The onboarding form collects the following per restaurant location:

- Restaurant name and street address
- City, state, postal code, and timezone
- Cuisine/category and service model (for example, fast-casual bowl counter)
- Optional price range and service channels
- Comparison definition: item/category, channel, distance radius, and relevant
  time window
- Optional known competitor names, storefront addresses, and official domains

The manager can edit these values at any time. Addresses and configured
competitors are stored server-side; API keys are never sent to the browser.

## Candidate discovery

When the manager chooses **Find possible competitors**, a server-side research
job performs a bounded public-web search for businesses near the configured
location that match the supplied comparison definition.

The job returns a shortlist, not canonical competitors. Every candidate has:

- Business name and discovered storefront/location text
- Official website when found, plus the source URL and retrieval timestamp
- A short source-backed reason it may be relevant
- Distance/location limitations and a `needs_review` status

Candidate discovery has strict limits: one configured location, a small maximum
result count, a timeout, daily per-location rate limit, and cached completed
jobs. It must not search for personal data, bypass access controls, or treat
retrieved page text as instructions.

## Manager confirmation

The manager can confirm, edit, or reject each candidate.

- **Confirm** creates a configured competitor profile with a stable ID, named
  storefront/location aliases, and one or more official domains.
- **Edit** corrects a name, address, comparison category, or domain before
  confirmation.
- **Reject** preserves the audit record and prevents the candidate from being
  searched again for that profile unless the manager explicitly restores it.

Only confirmed profiles are eligible for offer research. Discovery itself does
not create a competitor offer or change a recommendation.

## Offer research and comparison

For confirmed profiles, the existing Tavily refresh runs a narrow search using
the configured storefront aliases and official-domain allowlist. It retrieves
primary-source menu, ordering, and promotion pages where available.

Each source initially becomes attributed `needs_review` evidence. Exact item,
price, portion, inclusions, channel, availability, and terms are left empty
unless they are explicitly visible in the source and confirmed by the manager.

The manager can then promote an eligible record into the canonical comparable
offer dataset. Promotion records the actor, timestamp, source snapshot,
collection time, and reason. Only a fresh, verified, comparable promoted record
creates a new planning-data snapshot and triggers recalculation.

## UI states

1. **Describe your location** — onboarding form and known-competitor entry.
2. **Possible competitors** — reviewable candidate cards with sources and
   confirm/edit/reject actions.
3. **Researching offers** — per-competitor progress, timeout, and retry state.
4. **Review public-web evidence** — source link, collection time, stated facts,
   limitations, and comparison status.
5. **Comparable offers** — only manager-promoted records appear beside the
   restaurant's offer and economics.

Fixtures, failed research, no candidates, and empty comparisons all have clear
empty states. A manager can always continue planning without competitor data.

## API and persistence additions

The server/contracts owner should add versioned contracts and routes for:

- `POST /api/restaurant-profiles` — create/update an owner-managed location
  profile.
- `POST /api/locations/:id/competitor-discovery` — start a bounded discovery
  job.
- `GET /api/competitor-discovery/:id` — return job status and candidate packet.
- `POST /api/competitor-candidates/:id/decision` — confirm, edit, or reject a
  candidate.
- `POST /api/locations/:id/competitor-research` — refresh only confirmed
  competitor profiles.
- `POST /api/competitor-evidence/:id/promotion` — auditable manager promotion
  into canonical comparable offers.

The web owner should add onboarding, candidate-review, evidence-review, and
empty/error states. The server owns validation, authorization, rate limits,
durable persistence, and the server-only Tavily adapter wiring.

## Acceptance criteria

- A manager can describe a new location without any preconfigured competitor.
- A discovery run produces attributed candidates or a clear unavailable/empty
  result; it does not alter pricing.
- Only manager-confirmed candidates are searched for offers.
- Only manager-promoted, verified, fresh comparable offers influence a new
  planning snapshot.
- Every research and promotion record exposes source, timestamps, status, and
  limitations.
- No client bundle contains external-provider credentials.
