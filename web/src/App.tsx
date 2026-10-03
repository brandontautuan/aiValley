import { useEffect, useState } from "react";
import type { ScenarioId } from "../../contracts/index.ts";
import { api } from "./api.ts";
import { brand } from "./brand.ts";
import { ActionPlan } from "./components/ActionPlan.tsx";
import { LocationDetail } from "./components/LocationDetail.tsx";
import { Month } from "./components/Month.tsx";
import { ScenarioToggle } from "./components/ScenarioToggle.tsx";
import { BrandMark } from "./components/BrandMark.tsx";
import { UiIcon } from "./components/UiIcon.tsx";
import { Strategy } from "./components/StrategyPanel.tsx";
import { HowItWorks } from "./components/HowItWorks.tsx";
import { SponsorFooter } from "./components/SponsorTag.tsx";
import { Today } from "./components/Today.tsx";
import { Week } from "./components/Week.tsx";
import { mockSeedOf, scenarioLabel } from "./format.ts";
import { hrefFor, parseHash, routePath, type Route } from "./nav.ts";

const DEFAULT_DATE = "2026-10-05";
// The first fixture observation is August 10; forecasts need prior history.
// The API still rejects unsupported dates from manually edited links or direct requests.
const EARLIEST_DEMO_DATE = "2026-08-11";

const TABS: Array<{ path: string; label: string; icon: "calendar" | "bookmark" | "grid" | "chart" | "compass" | "layers"; active: (route: Route) => boolean }> = [
  { path: "/plan", label: "Saved plans", icon: "bookmark", active: (route) => route.page === "plan" },
  { path: "/", label: "Daily planning", icon: "calendar", active: (route) => route.page === "today" || route.page === "location" },
  { path: "/week", label: "Week outlook", icon: "chart", active: (route) => route.page === "week" },
  { path: "/month", label: "Month calendar", icon: "grid", active: (route) => route.page === "month" },
  { path: "/strategy", label: "Strategy", icon: "compass", active: (route) => route.page === "strategy" },
  { path: "/how-it-works", label: "How it works", icon: "layers", active: (route) => route.page === "how-it-works" },
];

export function App() {
  const [initial] = useState(parseHash);
  const [route, setRoute] = useState<Route>(initial.route);
  const [date, setDate] = useState(initial.params.date ?? DEFAULT_DATE);
  const [scenario, setScenario] = useState<ScenarioId>(initial.params.scenario ?? "typical");
  // Bumped after a demo reset so every view refetches.
  const [epoch, setEpoch] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

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
    setResetting(true);
    setResetError(null);
    try {
      await api.reset();
      setDate(DEFAULT_DATE);
      setScenario("typical");
      setRoute({ page: "today" });
      setEpoch((value) => value + 1);
    } catch {
      setResetError("The demo could not be reset. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  const params = { date, scenario };

  return (
    <div className="app">
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Skip to content</a>
      <header className="topbar">
        <a className="brand" href={hrefFor("/", params)}>
          <BrandMark className="logo" title={brand.name} />
          <span>
            <strong>{brand.name}</strong>
          </span>
        </a>
        <nav className="tabs" aria-label="Main views">
          {TABS.map((tab) => (
            <a key={tab.path} href={hrefFor(tab.path, params)} className={tab.active(route) ? "active" : ""} aria-current={tab.active(route) ? "page" : undefined}>
              <UiIcon name={tab.icon} />
              {tab.label}
            </a>
          ))}
        </nav>
        <div className="controls">
          <label className="date-control">
            <span>Planning date</span>
            <input type="date" min={EARLIEST_DEMO_DATE} value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
          </label>
        </div>
      </header>
      <div className="demo-strip">
        <span>{mockSeedOf(scenario) !== null ? `Mock data #${mockSeedOf(scenario)} · Random fictional sales, costs, and local signals; competitor offers are sample records. Forecasts are estimates.` : brand.fixtureNotice}</span>
        <details className="demo-settings">
          <summary><UiIcon name="sliders" size={16} />{scenarioLabel(scenario)} · Demo settings<UiIcon className="menu-chevron" name="chevronDown" size={16} /></summary>
          <div className="panel demo-options">
            <p>Try a different day to see how local events affect the suggestions.</p>
            <ScenarioToggle value={scenario} onChange={setScenario} compact />
            <p className="small muted">Reset clears saved plans and edits for this demo.</p>
            <button disabled={resetting} onClick={resetDemo}>{resetting ? "Resetting…" : "Reset demo"}</button>
          </div>
        </details>
      </div>
      {resetError && <p className="error" role="alert">{resetError}</p>}
      <main id="main-content" tabIndex={-1} key={`${epoch}:${date}:${scenario}`}>
        {route.page === "today" && <Today date={date} scenario={scenario} />}
        {route.page === "week" && <Week date={date} scenario={scenario} />}
        {route.page === "month" && <Month date={date} scenario={scenario} />}
        {route.page === "location" && <LocationDetail key={route.id} locationId={route.id} date={date} scenario={scenario} />}
        {route.page === "strategy" && <Strategy date={date} scenario={scenario} />}
        {route.page === "plan" && <ActionPlan date={date} scenario={scenario} />}
        {route.page === "how-it-works" && <HowItWorks params={params} />}
      </main>
      <SponsorFooter href={hrefFor("/how-it-works", params)} />
    </div>
  );
}
