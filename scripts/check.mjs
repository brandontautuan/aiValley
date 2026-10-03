// Runs every module's deterministic check file with Node's built-in type stripping.
import { spawnSync } from "node:child_process";

const checks = ["engine/check.ts", "data/check.ts", "intelligence/check.ts", "server/check.ts"];
let failed = false;
for (const file of checks) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", file], { stdio: "inherit" });
  if (result.status !== 0) { console.error(`✗ ${file}`); failed = true; }
}
process.exit(failed ? 1 : 0);
