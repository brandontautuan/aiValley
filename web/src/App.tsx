import { useEffect, useState } from "react";
import type { ScenarioId } from "../../contracts/index.ts";
import { api } from "./api.ts";
import { brand } from "./brand.ts";
import { ActionPlan } from "./components/ActionPlan.tsx";
import { LocationDetail } from "./components/LocationDetail.tsx";
import { Overview } from "./components/Overview.tsx";

const DEFAULT_DATE = "2026-10-05";
const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "typical", label: "Typical day" },
  { id: "local-event", label: "Local event day" },
];

type Route = { page: "overview" } | { page: "location"; id: string } | { page: "plan" };

function parseHash(): Route {
  const [, page, id] = window.location.hash.replace(/^#/, "").split("/");
  if (page === "location" && id) return { page: "location", id };
  if (page === "plan") return { page: "plan" };
  return { page: "overview" };
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [date, setDate] = useState(DEFAULT_DATE);
  const [scenario, setScenario] = useState<ScenarioId>("typical");
  // Bumped after a demo reset so every view refetches.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  async function resetDemo() {
    if (!window.confirm("Reset the demo? Saved plans and edits will be cleared.")) return;
    await api.reset();
    setDate(DEFAULT_DATE);
    setScenario("typical");
    setEpoch((value) => value + 1);
    navigate("/");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>{brand.logoGlyph}</span>
          <div>
            <strong>{brand.name}</strong>
            <span className="muted"> {brand.product}</span>
          </div>
        </div>
        <nav className="tabs">
          <a href="#/" className={route.page !== "plan" ? "active" : ""}>Locations</a>
          <a href="#/plan" className={route.page === "plan" ? "active" : ""}>Action plan</a>
        </nav>
        <div className="controls">
          <label>
            <span>Planning date</span>
            <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
          </label>
          <label>
            <span>Scenario</span>
            <select value={scenario} onChange={(event) => setScenario(event.target.value as ScenarioId)}>
              {SCENARIOS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="ghost" onClick={resetDemo}>Reset demo</button>
        </div>
      </header>
      <div className="fixture-banner">{brand.fixtureNotice}</div>
      <main key={epoch}>
        {route.page === "overview" && <Overview date={date} scenario={scenario} />}
        {route.page === "location" && <LocationDetail locationId={route.id} date={date} scenario={scenario} />}
        {route.page === "plan" && <ActionPlan date={date} />}
      </main>
    </div>
  );
}
