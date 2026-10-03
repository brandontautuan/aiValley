# Role B: API and persistence
Read /AGENTS.md and /DESIGN.md. Own server/** and contracts/** only.
Publish minimal versioned contracts and example payloads before integration.
Implement routes, validation, orchestration, revisions, decisions, and saved plans.
Call C for all calculations and guardrails; call D for data and AI content.
Do not duplicate pricing logic, edit fixture records, or modify UI/prompt files.
Reject stale revisions and prevent duplicate approvals and stale content writes.
Revalidate on approval. Persist exact reviewed terms and evidence snapshots.
Keep server/HANDOFF.md current and verify edit/approve/reload/reset behavior.
