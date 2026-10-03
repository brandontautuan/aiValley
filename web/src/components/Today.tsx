import type { LocationOutlookResponse, OverviewResponse, SavedPlan, ScenarioId } from "../../../contracts/index.ts";
import { api } from "../api.ts";
import { dateLabel, pct, scenarioLabel } from "../format.ts";
import { actionLabel, selectedCandidate, storeSentence } from "../insights.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";
import { MiniChart } from "./MiniChart.tsx";
import { UiIcon } from "./UiIcon.tsx";

interface TodayData {
  overview: OverviewResponse;
  outlooks: Record<string, LocationOutlookResponse>;
  plans: SavedPlan[];
}

async function loadToday(date: string, scenario: ScenarioId): Promise<TodayData> {
  const [overview, plan] = await Promise.all([api.overview(date, scenario), api.actionPlan(date)]);
  const outlooks = await Promise.all(overview.locations.map((summary) => api.outlook(summary.location.id, date, scenario)));
  return { overview, outlooks: Object.fromEntries(outlooks.map((outlook) => [outlook.location.id, outlook])), plans: plan.plans.filter((entry) => !entry.superseded) };
}

export function Today({ date, scenario }: { date: string; scenario: ScenarioId }) {
  const { data, error, reload } = useLoad(() => loadToday(date, scenario), [date, scenario]);
  const weekday = dateLabel(date).split(",")[0];
  const head = (
    <div className="hero daily-hero">
      <div>
        <h1>A clear plan for each store.</h1>
        <p className="muted lead">{dateLabel(date)} · Choose a store, review its suggestion, then approve your plan.</p>
      </div>
    </div>
  );
  if (error) return <>{head}<div className="error" role="alert"><p>We couldn’t load the stores. {error}</p><button onClick={reload}>Try again</button></div></>;
  if (!data) return <>{head}<p role="status" className="muted">Finding suggestions for your stores…</p></>;
  const summaries = data.overview.locations;
  const savedLocations = new Set(data.plans.map((plan) => plan.locationId));
  const savedCount = summaries.filter((summary) => savedLocations.has(summary.location.id)).length;

  return (
    <section>
      {head}
      <div className="planning-progress">
        <span><strong>{savedCount} of {summaries.length} stores</strong> have a saved plan for this date</span>
        <a href={hrefFor("/plan", { date, scenario })}>View saved plans →</a>
      </div>
      <div className="cards store-cards">
        {summaries.map((summary) => {
          const outlook = data.outlooks[summary.location.id];
          const savedPlan = data.plans.find((plan) => plan.locationId === summary.location.id);
          const selected = savedPlan?.finalTerms ?? selectedCandidate(outlook);
          const saved = Boolean(savedPlan);
          // What the data asks of the manager: a price change, protecting a busy peak, or nothing.
          const attention = saved ? null : selected.kind === "discount" ? "change" : summary.classification === "constrained" ? "hold" : null;
          return (
            <article key={summary.location.id} className={`card store-card ${attention ? `attention-${attention}` : ""}`}>
              <div className="card-head">
                <h2>{summary.location.name}</h2>
                <span className={`badge ${saved || attention === "change" ? "ok" : attention === "hold" ? "danger" : ""}`}>
                  {attention && <span className="pulse-dot" aria-hidden />}
                  {saved ? "Plan saved" : attention === "change" ? "Change suggested" : attention === "hold" ? "Busy peak · hold price" : "No change needed"}
                </span>
              </div>
              <div className={`action ${selected.kind === "discount" ? "promo" : attention === "hold" ? "hold" : ""}`}>
                <span className="muted small">{saved ? "Saved action" : "Suggested action"}</span>
                <strong>{saved && selected.kind === "no-change" ? "Keep regular price" : actionLabel(selected, outlook.outlook)}</strong>
              </div>
              <div className="store-reason">
                <h3>{saved ? "Your team’s decision" : "Why this helps"}</h3>
                <p>{saved ? "These are the terms your team approved. Open the decision to review or change them." : storeSentence(outlook)}</p>
                {savedPlan && savedPlan.scenario !== scenario && <p className="small muted">Saved for {scenarioLabel(savedPlan.scenario)}.</p>}
              </div>
              <details className="store-forecast">
                <summary>See expected demand</summary>
                <p className="small muted">Forecast for {scenarioLabel(scenario)}. Helps you spot busy and quiet hours. These are customer orders, not individual items sold.</p>
                {scenario !== "typical" && <ul className="small muted">{outlook.contextSignals.filter((signal) => outlook.outlook.appliedSignalIds.includes(signal.id)).slice(0, 2).map((signal) => <li key={signal.id}>{signal.title}: {pct(signal.assumedOrderAdjustment)} assumed change in orders.</li>)}</ul>}
                <MiniChart hours={outlook.outlook.hours} highlight={selected.kind === "discount" ? selected.terms.window : null} label={`${summary.location.name} hourly orders`} />
                <p className="small"><strong>{Math.round(summary.totals.scenarioOrders)} orders expected</strong> · {pct(summary.changeVsUsual)} vs. a usual {weekday}.</p>
                <p className="small muted">Based on {outlook.outlook.observationCount} past {weekday}s. {outlook.outlook.evidenceQuality !== "good" && "Limited history: treat this estimate with extra care."}</p>
              </details>
              <a className="button primary" href={hrefFor(`/location/${summary.location.id}`, { date, scenario: savedPlan?.scenario ?? scenario })}>
                {saved ? "Review saved decision" : "Review suggestion"}<UiIcon name="arrowRight" /><span className="sr-only"> for {summary.location.name}</span>
              </a>
            </article>
          );
        })}
      </div>
      <p className="planning-footnote">You stay in control. Approving saves a plan for your team; it does not change menu prices or publish a post.</p>
    </section>
  );
}
