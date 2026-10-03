import { useEffect, useState } from "react";
import type { ScenarioId } from "../../contracts/index.ts";
import { api } from "./api.ts";
import { brand } from "./brand.ts";
import { ActionPlan } from "./components/ActionPlan.tsx";
import { LocationDetail } from "./components/LocationDetail.tsx";
import { Month } from "./components/Month.tsx";
import { ScenarioToggle } from "./components/ScenarioToggle.tsx";
import { Strategy } from "./components/StrategyPanel.tsx";
import { Today } from "./components/Today.tsx";
import { Week } from "./components/Week.tsx";
import { hrefFor, parseHash, routePath, type Route } from "./nav.ts";

const DEFAULT_DATE = "2026-10-05";

const TABS: Array<{ path: string; label: string; active: (route: Route) => boolean }> = [
  { path: "/", label: "Today", active: (route) => route.page === "today" || route.page === "location" },
  { path: "/week", label: "Week", active: (route) => route.page === "week" },
  { path: "/month", label: "Month", active: (route) => route.page === "month" },
  { path: "/strategy", label: "Strategy", active: (route) => route.page === "strategy" },
  { path: "/plan", label: "Action plan", active: (route) => route.page === "plan" },
];

export function App() {
  const [initial] = useState(parseHash);
  const [route, setRoute] = useState<Route>(initial.route);
  const [date, setDate] = useState(initial.params.date ?? DEFAULT_DATE);
  const [scenario, setScenario] = useState<ScenarioId>(initial.params.scenario ?? "typical");
  // Bumped after a demo reset so every view refetches.
  const [epoch, setEpoch] = useState(0);

  // Links may omit ?date/&scenario; those keep the current values.
  useEffect(() => {
    const onHash = () => {
      const next = parseHash();
      setRoute(next.route);
      if (next.params.date) setDate(next.params.date);
      if (next.params.scenario) setScenario(next.params.scenario);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Keep the URL in sync so reloads and shared links restore the same view.
  useEffect(() => {
    const target = hrefFor(routePath(route), { date, scenario });
    if (window.location.hash !== target) window.history.replaceState(null, "", target);
  }, [route, date, scenario]);

  async function resetDemo() {
    if (!window.confirm("Reset the demo? Saved plans and edits will be cleared.")) return;
    await api.reset();
    setDate(DEFAULT_DATE);
    setScenario("typical");
    setRoute({ page: "today" });
    setEpoch((value) => value + 1);
  }

  const params = { date, scenario };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={hrefFor("/", params)}>
          <span className="logo" aria-hidden>{brand.logoGlyph}</span>
          <span>
            <strong>{brand.name}</strong>
            <span className="muted"> {brand.product}</span>
          </span>
        </a>
        <nav className="tabs" aria-label="Views">
          {TABS.map((tab) => (
            <a key={tab.path} href={hrefFor(tab.path, params)} className={tab.active(route) ? "active" : ""} aria-current={tab.active(route) ? "page" : undefined}>
              {tab.label}
            </a>
          ))}
        </nav>
        <div className="controls">
          <label className="date-control">
            <span>Planning date</span>
            <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
          </label>
          <ScenarioToggle value={scenario} onChange={setScenario} compact />
          <button className="ghost" onClick={resetDemo}>Reset demo</button>
        </div>
      </header>
      <div className="fixture-banner">{brand.fixtureNotice}</div>
      <main key={epoch}>
        {route.page === "today" && <Today date={date} scenario={scenario} onScenario={setScenario} />}
        {route.page === "week" && <Week date={date} scenario={scenario} />}
        {route.page === "month" && <Month date={date} scenario={scenario} />}
        {route.page === "location" && <LocationDetail locationId={route.id} date={date} scenario={scenario} />}
        {route.page === "strategy" && <Strategy date={date} scenario={scenario} />}
        {route.page === "plan" && <ActionPlan date={date} scenario={scenario} />}
      </main>
    </div>
  );
}
