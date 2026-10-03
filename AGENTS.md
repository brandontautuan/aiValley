# Repository instructions

Read DESIGN.md before working. Implement only the hackathon scope.

## Ownership
- A: web/** and the root scaffold: package.json, package-lock.json, tsconfig.json,
  .gitignore, .env.example, scripts/**, README.md.
- B: server/** and contracts/**.
- C: engine/**.
- D: data/** and intelligence/**.
- Team lead: DESIGN.md and this root AGENTS.md.

Read all directories as needed, but edit only your assigned paths.
Do not rename/delete/format another role's files or update shared dependencies.
For a needed change outside your ownership, send the owner a concrete request.
Use module-local mocks/stubs while waiting; do not create alternative contracts.

contracts/** is the source of truth for inputs, outputs, money, times, errors,
and revision rules. B owns contract changes and coordinates affected callers.

Keep money in cents, orders distinct from item units, and assumptions labeled.
Pricing calculations belong to C. AI copy belongs to D. API/state belongs to B.
UI belongs to A. Approval saves a plan; it performs no external publication.

Use your own branch and checkout/worktree. Keep generated runtime data untracked.
Inspect changed paths before committing. Keep HANDOFF.md current in your area.
Run checks relevant to your changes and report unresolved blockers honestly.

## Stack and commands
- TypeScript everywhere. The server runs on Node >= 22.12 with built-in type
  stripping (no build step); the web app is React + Vite.
- Import local files with explicit `.ts`/`.tsx` extensions and use `import type`
  for type-only imports (Node strips types; it does not resolve or rewrite paths).
- Use only erasable TypeScript (no enums, namespaces or parameter properties).
- `npm run dev` (API :3000 + web :5173), `npm run check` (typecheck + all module
  checks), `npm run build && npm start` (single-port demo on :3000).
- Each module's deterministic checks live in its own `check.ts`.
