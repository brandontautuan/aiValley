# Contracts — owned by Role B
contracts/index.ts is the single source of truth for shared types, money/time
conventions, revision rules and API payloads (CONTRACT_VERSION).
Only B edits this directory. Before changing a field or signature, agree it with
every affected caller (web, engine, data, intelligence), then bump
CONTRACT_VERSION if the change is breaking. Do not create parallel schemas.
