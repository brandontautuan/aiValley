import type { ScenarioId } from "../../../contracts/index.ts";
import { api } from "../api.ts";
import { CLASSIFICATION_LABEL, dateLabel, pct, units } from "../format.ts";
import { useLoad } from "../useLoad.ts";

export function Overview({ date, scenario }: { date: string; scenario: ScenarioId }) {
  const { data, error, loading } = useLoad(() => api.overview(date, scenario), [date, scenario]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading chain overview…</p>;

  return (
    <section className={loading ? "loading" : ""}>
      <div className="page-head">
        <h1>What should each location do on {dateLabel(data.date)}?</h1>
        <p className="muted">Sorted by priority. Each store gets its own decision, and keeping the regular price is a valid one.</p>
      </div>
      <div className="cards">
        {data.locations.map((summary, index) => (
          <a key={summary.location.id} className={`card location-card priority-${summary.priority}`} href={`#/location/${summary.location.id}`}>
            <div className="card-head">
              <span className="rank">{index + 1}</span>
              <h2>{summary.location.name}</h2>
              <span className={`badge ${summary.classification}`}>{CLASSIFICATION_LABEL[summary.classification]}</span>
            </div>
            <p className="muted small">{summary.location.profile}</p>
            <div className="stats">
              <div>
                <span className="stat">{units(summary.totals.scenarioOrders)}</span>
                <span className="muted small">expected orders</span>
              </div>
              <div>
                <span className={`stat ${summary.changeVsUsual > 0.05 ? "up" : summary.changeVsUsual < -0.05 ? "down" : ""}`}>{pct(summary.changeVsUsual)}</span>
                <span className="muted small">vs. usual {dateLabel(data.date).split(",")[0]}</span>
              </div>
            </div>
            <div className={`action ${summary.selectedKind}`}>
              <span className="small muted">Proposed action</span>
              <strong>{summary.proposedAction}</strong>
            </div>
            <span className="link">Review evidence →</span>
          </a>
        ))}
      </div>
    </section>
  );
}
