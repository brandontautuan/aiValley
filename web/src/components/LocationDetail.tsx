import { useState } from "react";
import type { LocationOutlookResponse, OfferTerms, Recommendation, ScenarioId } from "../../../contracts/index.ts";
import { api, ApiRequestError } from "../api.ts";
import { CLASSIFICATION_LABEL, dateLabel, money, pct, timestamp, units, windowLabel } from "../format.ts";
import { useLoad } from "../useLoad.ts";
import { ContentPanel } from "./ContentPanel.tsx";
import { HourlyChart } from "./HourlyChart.tsx";
import { OfferTable } from "./OfferTable.tsx";
import { ReviewPanel } from "./ReviewPanel.tsx";

export function LocationDetail({ locationId, date, scenario }: { locationId: string; date: string; scenario: ScenarioId }) {
  const outlook = useLoad(() => api.outlook(locationId, date, scenario), [locationId, date, scenario]);
  const recommendation = useLoad(() => api.openRecommendation(locationId, date, scenario), [locationId, date, scenario]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ message: string; issues?: string[] } | null>(null);

  /** Runs a recommendation write; on a stale revision, reloads the latest state. */
  async function run(label: string, action: (rec: Recommendation) => Promise<Recommendation>) {
    if (!recommendation.data) return;
    setBusy(label);
    setActionError(null);
    try {
      recommendation.setData(await action(recommendation.data));
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setActionError({ message: error.message, issues: error.body.issues?.map((issue) => issue.message) });
        if (error.body.code === "STALE_REVISION") recommendation.reload();
      } else setActionError({ message: String(error) });
    } finally {
      setBusy(null);
    }
  }

  const edit = (terms: OfferTerms) => run("edit", (rec) => api.editRecommendation(rec.id, rec.revision, terms));
  const decide = (action: "approve" | "dismiss") => run(action, async (rec) => (await api.decide(rec.id, rec.revision, action)).recommendation);
  const explain = () => run("explain", (rec) => api.explain(rec.id, rec.revision));
  const draft = () => run("draft", (rec) => api.socialDraft(rec.id, rec.revision));

  if (outlook.error) return <p className="error">{outlook.error}</p>;
  if (!outlook.data) return <p className="muted">Loading location outlook…</p>;
  const { location, outlook: forecast } = outlook.data;

  return (
    <section className={outlook.loading ? "loading" : ""}>
      <a className="back" href="#/">← All locations</a>
      <div className="page-head">
        <h1>
          {location.name} <span className={`badge ${forecast.classification}`}>{CLASSIFICATION_LABEL[forecast.classification]}</span>
        </h1>
        <p className="muted">
          {location.profile} {dateLabel(forecast.date)} · open {location.openingHours.open}:00–{location.openingHours.close}:00 · {location.timezone}
        </p>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Hourly outlook</h2>
            <span className="muted small">
              {units(forecast.totals.scenarioOrders)} orders expected ({pct(forecast.changeVsUsual)} vs. usual)
            </span>
          </div>
          <HourlyChart outlook={forecast} />
          <ul className="notes">
            <li>
              Evidence quality: <strong>{forecast.evidenceQuality === "good" ? "good" : "sparse"}</strong>, based on {forecast.observationCount} comparable past {dateLabel(forecast.date).split(",")[0]}s per hour.
            </li>
            {forecast.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <EvidencePanel data={outlook.data} />
      </div>

      {recommendation.error && <p className="error">{recommendation.error}</p>}
      {recommendation.data && (
        <>
          <OfferTable recommendation={recommendation.data} disabled={busy !== null} onUse={edit} />
          <div className="grid-2">
            <ReviewPanel
              recommendation={recommendation.data}
              menu={outlook.data.menu}
              location={location}
              busy={busy}
              error={actionError}
              onEdit={edit}
              onDecide={decide}
            />
            <ContentPanel recommendation={recommendation.data} busy={busy} onExplain={explain} onDraft={draft} />
          </div>
        </>
      )}
    </section>
  );
}

function EvidencePanel({ data }: { data: LocationOutlookResponse }) {
  const applied = new Set(data.outlook.appliedSignalIds);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Local context</h2>
        <span className="muted small">{data.fixtureLabel}</span>
      </div>
      {data.contextSignals.length === 0 && <p className="muted">No context records for this location in this scenario.</p>}
      <ul className="evidence">
        {data.contextSignals.map((signal) => (
          <li key={signal.id} className={applied.has(signal.id) ? "" : "inactive"}>
            <div className="evidence-head">
              <strong>{signal.title}</strong>
              <span className={`tag ${applied.has(signal.id) ? "on" : ""}`}>
                {applied.has(signal.id) ? `applied · ${pct(signal.assumedOrderAdjustment)} assumed` : "not applied"}
              </span>
            </div>
            <p className="small">{signal.whyItMatters}</p>
            <p className="muted small">
              {signal.source} · {timestamp(signal.start)} – {timestamp(signal.end)}
              {signal.distanceKm !== null ? ` · ${signal.distanceKm} km away` : ""}
            </p>
          </li>
        ))}
      </ul>
      <h3>Comparable competitor offers</h3>
      {data.competitorOffers.length === 0 && <p className="muted">No competitor records for this location.</p>}
      <ul className="evidence">
        {data.competitorOffers.map((offer) => (
          <li key={offer.id}>
            <div className="evidence-head">
              <strong>
                {offer.competitorName}: {offer.itemDescription} {offer.priceCents !== null && <>· {money(offer.priceCents)}</>}
              </strong>
              <span className={`tag ${offer.comparability === "comparable" ? "on" : "warn"}`}>{offer.comparability}</span>
            </div>
            <p className="small">{offer.comparabilityNotes}</p>
            <p className="muted small">
              {[offer.portion, offer.inclusions, offer.channel, offer.availability].filter(Boolean).join(" · ")}
              <br />
              {offer.source} · collected {timestamp(offer.collectedAt)}
            </p>
          </li>
        ))}
      </ul>
      <p className="muted small">Window under review: {windowLabel(data.outlook.focusWindow)}</p>
    </div>
  );
}
