import { createServer } from "node:http";
import { loadPlanningData } from "./fixtures.ts";

const port = Number(process.env.PORT ?? 3000);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (request.method === "GET" && url.pathname === "/api/health") {
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/planning-data") {
    const date = url.searchParams.get("date") ?? undefined;
    response.end(JSON.stringify(loadPlanningData(date)));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ code: "NOT_FOUND", message: "Route not found" }));
});

server.listen(port, () => {
  console.log(`Restaurant Revenue Planner API listening on http://localhost:${port}`);
});
