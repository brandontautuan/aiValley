// Vercel serverless entry for the planner API. vercel.json rewrites every /api/* request here.
// The server is TypeScript run by Node's built-in type stripping (Node >= 22.18), so its sources
// are shipped as-is (vercel.json `includeFiles`) and imported at runtime instead of being compiled.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Vercel functions only have temporary storage: saved plans last as long as this instance does.
const DATA_DIR = join(tmpdir(), "revenue-planner");
let handler;

async function load() {
  const entry = pathToFileURL(join(process.cwd(), "server", "index.ts")).href;
  const { createHandler, createPlannerFromEnv } = await import(entry);
  const { planner } = await createPlannerFromEnv(DATA_DIR);
  return createHandler(planner);
}

export default async function (request, response) {
  // The rewrite passes the original path as ?__path=; restore it so the route table sees /api/<path>.
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.searchParams.get("__path");
  if (path !== null) {
    url.searchParams.delete("__path");
    request.url = `/api/${path}${url.search}`;
  }
  try {
    handler ??= load();
    await (await handler)(request, response);
  } catch (error) {
    handler = undefined;
    console.error(error);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ code: "INTERNAL", message: "The API failed to start. Check the function logs.", retryable: true }));
  }
}
