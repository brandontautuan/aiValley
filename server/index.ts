import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { ApiFailure, createPlanner, type Planner } from "./planner.ts";
import { createFileStore } from "./store.ts";
import { createZooWorkStrategyWorkflowFromEnv } from "./zoowork.ts";
import { createTavilySearchTransport } from "../intelligence/index.ts";

const ROOT = resolve(import.meta.dirname, "..");
const WEB_DIST = join(ROOT, "web", "dist");
const MAX_BODY_BYTES = 64 * 1024;

type Handler = (planner: Planner, params: string[], query: Record<string, string>, body: unknown) => unknown;

/** Thin route table; all behavior lives in planner.ts. */
const routes: Array<[method: string, pattern: RegExp, handler: Handler]> = [
  ["GET", /^\/api\/health$/, () => ({ ok: true })],
  ["GET", /^\/api\/overview$/, (planner, _params, query) => planner.overview(query)],
  ["GET", /^\/api\/locations\/([\w-]+)\/outlook$/, (planner, [id], query) => planner.locationOutlook(id, query)],
  ["POST", /^\/api\/recommendations$/, (planner, _params, _query, body) => planner.createRecommendation(body as object)],
  ["GET", /^\/api\/recommendations\/([\w-]+)$/, (planner, [id]) => planner.getRecommendation(id)],
  ["PATCH", /^\/api\/recommendations\/([\w-]+)$/, (planner, [id], _query, body) => planner.editRecommendation(id, body as object)],
  ["POST", /^\/api\/recommendations\/([\w-]+)\/explanation$/, (planner, [id], _query, body) => planner.explain(id, body as object)],
  ["POST", /^\/api\/recommendations\/([\w-]+)\/social-draft$/, (planner, [id], _query, body) => planner.socialDraft(id, body as object)],
  ["POST", /^\/api\/recommendations\/([\w-]+)\/decision$/, (planner, [id], _query, body) => planner.decide(id, body as object)],
  ["POST", /^\/api\/strategy-runs$/, (planner, _params, _query, body) => planner.createStrategyRun(body as object)],
  ["GET", /^\/api\/strategy-runs\/([\w-]+)$/, (planner, [id]) => planner.getStrategyRun(id)],
  ["POST", /^\/api\/strategy-runs\/([\w-]+)\/approve$/, (planner, [id], _query, body) => planner.approveStrategyRun(id, body as object)],
  ["GET", /^\/api\/action-plan$/, (planner, _params, query) => planner.actionPlan(query)],
  ["POST", /^\/api\/demo\/reset$/, (planner) => planner.reset()],
  [
    "POST",
    /^\/api\/locations\/([\w-]+)\/competitor-research$/,
    (planner, [id], _query, body) => planner.competitorResearch(id, body as { date?: unknown }),
  ],
];

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET") return undefined;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new ApiFailure(413, { code: "BAD_REQUEST", message: "Request body too large", retryable: false });
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiFailure(400, { code: "BAD_REQUEST", message: "Body must be JSON", retryable: false });
  }
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };

/** Serves the production web build when present (npm run build && npm start). */
function serveStatic(pathname: string, response: ServerResponse): boolean {
  if (!existsSync(WEB_DIST)) return false;
  const candidate = normalize(join(WEB_DIST, pathname));
  const file = candidate.startsWith(WEB_DIST) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(WEB_DIST, "index.html");
  response.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  response.end(readFileSync(file));
  return true;
}

export function createApp(planner: Planner) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const send = (status: number, payload: unknown) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify(payload));
    };

    if (!url.pathname.startsWith("/api/")) {
      if (request.method === "GET" && serveStatic(url.pathname, response)) return;
      return send(404, { code: "NOT_FOUND", message: "Run `npm run dev` and open the Vite URL, or `npm run build` first.", retryable: false });
    }

    const route = routes.find(([method, pattern]) => method === request.method && pattern.test(url.pathname));
    if (!route) return send(404, { code: "NOT_FOUND", message: `No route for ${request.method} ${url.pathname}`, retryable: false });

    try {
      const params = url.pathname.match(route[1])!.slice(1);
      const body = await readJson(request);
      send(200, await route[2](planner, params, Object.fromEntries(url.searchParams), body));
    } catch (error) {
      if (error instanceof ApiFailure) return send(error.status, error.body);
      console.error(error);
      send(500, { code: "INTERNAL", message: "Unexpected server error", retryable: true });
    }
  });
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.env.PORT ?? 3000);
  const dataDir = resolve(ROOT, process.env.DATA_DIR ?? ".data");
  const strategyWorkflow = await createZooWorkStrategyWorkflowFromEnv();
  const planner = createPlanner({
    store: createFileStore(dataDir),
    // Missing credentials or SDK keep the manager-reviewable fallback available.
    strategyWorkflow,
    tavilySearchTransport: createTavilySearchTransport({ apiKey: process.env.TAVILY_API_KEY }),
  });
  createApp(planner).listen(port, () => {
    console.log(`Revenue planner API on http://localhost:${port} (store: ${dataDir})`);
  });
}
