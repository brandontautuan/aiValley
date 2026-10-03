import type { ScenarioId } from "../../contracts/index.ts";

/** Hash routes: #/, #/week, #/month, #/strategy, #/plan, #/location/:id — each with optional ?date=&scenario=. */
export type Route =
  | { page: "today" }
  | { page: "week" }
  | { page: "month" }
  | { page: "strategy" }
  | { page: "plan" }
  | { page: "location"; id: string };

export interface ViewParams {
  date?: string;
  scenario?: ScenarioId;
}

const SCENARIO_IDS: ScenarioId[] = ["typical", "local-event"];

export function parseHash(hash = window.location.hash): { route: Route; params: ViewParams } {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const [, page, id] = path.split("/");
  const search = new URLSearchParams(query);
  const params: ViewParams = {};
  const date = search.get("date");
  const scenario = search.get("scenario");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) params.date = date;
  if (scenario && (SCENARIO_IDS.includes(scenario as ScenarioId) || /^mock-\d{1,9}$/.test(scenario))) params.scenario = scenario as ScenarioId;

  let route: Route = { page: "today" };
  if (page === "location" && id) route = { page: "location", id };
  else if (page === "week" || page === "month" || page === "strategy" || page === "plan") route = { page };
  return { route, params };
}

export function routePath(route: Route): string {
  return route.page === "today" ? "/" : route.page === "location" ? `/location/${route.id}` : `/${route.page}`;
}

/** Link to a path, carrying the date and scenario so views stay in sync across navigation and reloads. */
export function hrefFor(path: string, params: ViewParams): string {
  const search = new URLSearchParams();
  if (params.date) search.set("date", params.date);
  if (params.scenario) search.set("scenario", params.scenario);
  const query = search.toString();
  return `#${path}${query ? `?${query}` : ""}`;
}
