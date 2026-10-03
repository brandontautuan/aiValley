import type { LocationOutlookResponse, OverviewResponse, SavedPlan, ScenarioId } from "../../../contracts/index.ts";
import { api } from "../api.ts";
import { dateLabel, hour, pct, units, windowLabel } from "../format.ts";
import { actionLabel, selectedCandidate, storeSentence } from "../insights.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";
import { MiniChart } from "./MiniChart.tsx";
import { ScenarioToggle } from "./ScenarioToggle.tsx";

interface TodayData {
  overview: OverviewResponse;
  outlooks: Record<string, LocationOutlookResponse>;
  plans: SavedPlan[];
}

async function loadToday(date: string, scenario: ScenarioId): Promise<TodayData> {
  const [overview, plan] = await Promise.all([api.overview(date, scenario), api.actionPlan(date)]);
  const outlooks = await Promise.all(overview.locations.map((summary) => api.outlook(summary.location.id, date, scenario)));
  return {
    overview,
    outlooks: Object.fromEntries(outlooks.map((outlook) => [outlook.location.id, outlook])),
    plans: plan.plans.filter((entry) => !entry.superseded),
  };
}

export function Today({ date, scenario, onScenario }: { date: string; scenario: ScenarioId; onScenario: (value: ScenarioId) => void }) {
  const { data, error, loading } = useLoad(() => loadToday(date, scenario), [date, scenario]);
  const weekday = dateLabel(date).split(",")[0];

  const head = (
    <div className="hero">
      <div>
        <h1>What should each store do on {weekday}?</h1>
        <p className="muted lead">Each store gets its own decision. Keeping the regular price is a valid one.</p>
      </div>
      <div className="hero-control">
        <span className="eyebrow">Scenario</span>
        <ScenarioToggle value={scenario} onChange={onScenario} />
      </div>
    </div>
  );

  if (error) return <>{head}<p className="error">{error}</p></>;
  if (!data) return <>{head}<p className="muted">Loading the chain…</p></>;

  const summaries = data.overview.locations;
  const outlooks = summaries.map((summary) => data.outlooks[summary.location.id]);
  const promotions = summaries.filter((summary) => summary.selectedKind === "discount");
  const constrained = summaries.filter((summary) => summary.classification === "constrained");
  const changes = outlooks.flatMap((outlook) =>
    outlook.contextSignals
      .filter((signal) => signal.type === "event" && outlook.outlook.appliedSignalIds.includes(signal.id))
      .slice(0, 1)
      .map((signal) => {
        const affected = outlook.outlook.hours.filter((entry) => entry.signalIds.includes(signal.id));
        return { id: signal.id, text: `${outlook.location.name} ${hour(affected[0].hour)}–${hour(affected[affected.length - 1].hour + 1)}: ${pct(signal.assumedOrderAdjustment)} assumed (${signal.source.replace(/^Fixture: /, "")})` };
      }),
  );
  const unchanged = outlooks.filter((outlook) => !outlook.contextSignals.some((signal) => signal.type === "event" && outlook.outlook.appliedSignalIds.includes(signal.id)));

  return (
    <section className={loading ? "loading" : ""}>
      {head}
      {scenario === "local-event" && (
        <div className="chips">
          {changes.length === 0 && <span className="chip neutral">No event records apply to {weekday}.</span>}
          {changes.map((change) => (
            <span key={change.id} className="chip info">What changed: {change.text}</span>
          ))}
          {changes.length > 0 && unchanged.length > 0 && (
            <span className="chip neutral">{unchanged.map((outlook) => outlook.location.name).join(" and ")} unchanged</span>
          )}
        </div>
      )}

      <div className="pills">
        <div className="pill-card">
          <span className="pill-num accent">{promotions.length}</span>
          <span>
            {promotions.length === 1 ? "promotion" : "promotions"} to review
            <br />
            <span className="muted small">{promotions.map((summary) => summary.location.name).join(", ") || "No quiet windows today"}</span>
          </span>
        </div>
        <div className="pill-card">
          <span className={`pill-num ${constrained.length ? "danger" : ""}`}>{constrained.length}</span>
          <span>
            {constrained.length === 1 ? "store" : "stores"} at capacity
            <br />
            <span className="muted small">{constrained.map((summary) => `${summary.location.name} ${windowLabel(summary.focusWindow)}`).join(", ") || "All stores below 90% of capacity"}</span>
          </span>
        </div>
        <div className="pill-card">
          <span className="pill-num">
            {data.plans.length}
            <span className="muted pill-of">/{summaries.length}</span>
          </span>
          <span>
            plans saved for {weekday}
            <br />
            <a className="small" href={hrefFor("/plan", { date, scenario })}>Open the action plan →</a>
          </span>
        </div>
      </div>

      <div className="cards">
        {summaries.map((summary, index) => {
          const outlook = data.outlooks[summary.location.id];
          const selected = selectedCandidate(outlook);
          const saved = data.plans.some((plan) => plan.locationId === summary.location.id);
          const chip = saved
            ? { label: "Saved", cls: "ok" }
            : selected.kind === "discount"
              ? { label: "Needs review", cls: "ok" }
              : summary.classification === "constrained"
                ? { label: "At capacity", cls: "danger" }
                : { label: "Steady", cls: "" };
          return (
            <article key={summary.location.id} className="card store-card">
              <div className="card-head">
                <span className="rank">{index + 1}</span>
                <h2>{summary.location.name}</h2>
                <span className={`badge ${chip.cls}`}>{chip.label}</span>
              </div>
              <p className="sentence">{storeSentence(outlook)}</p>
              <MiniChart
                hours={outlook.outlook.hours}
                highlight={selected.kind === "discount" ? selected.terms.window : null}
                label={`${summary.location.name} hourly orders`}
              />
              <div className="stats">
                <div>
                  <span className="stat">{Math.round(summary.totals.scenarioOrders)}</span>
                  <span className="muted small">orders expected</span>
                </div>
                <div>
                  <span className={`stat ${summary.changeVsUsual > 0.05 ? "up" : summary.changeVsUsual < -0.05 ? "down" : ""}`}>{pct(summary.changeVsUsual)}</span>
                  <span className="muted small">vs. a usual {weekday}</span>
                </div>
              </div>
              <div className={`action ${selected.kind === "discount" ? "promo" : summary.classification === "constrained" ? "hold" : ""}`}>
                <span className="muted small">Proposed action</span>
                <strong>{actionLabel(selected, outlook.outlook)}</strong>
              </div>
              <a className="button primary" href={hrefFor(`/location/${summary.location.id}`, { date, scenario })}>
                Review {summary.location.name}
              </a>
              <span className="muted small">
                {units(outlook.outlook.observationCount)} past {weekday}s of history
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
