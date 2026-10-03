import { useState } from "react";
import type { LocationOutlookResponse, OfferTerms, Recommendation, ScenarioId } from "../../../contracts/index.ts";
import { api, ApiRequestError } from "../api.ts";
import { dateLabel, money, timestamp, windowLabel } from "../format.ts";
import { isCapacityHold } from "../insights.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";
import { DecisionBar } from "./DecisionBar.tsx";
import { DemandChart } from "./DemandChart.tsx";
import { OptionCards } from "./OptionCards.tsx";
import { PromotePanel } from "./PromotePanel.tsx";
import { SignalIcon } from "./SignalIcon.tsx";
import { TermsEditor } from "./TermsEditor.tsx";

export type ActionError = { message: string; issues?: string[] } | null;

export function LocationDetail({ locationId, date, scenario }: { locationId: string; date: string; scenario: ScenarioId }) {
  const outlook = useLoad(() => api.outlook(locationId, date, scenario), [locationId, date, scenario]);
  const recommendation = useLoad(() => api.openRecommendation(locationId, date, scenario), [locationId, date, scenario]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError>(null);

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
  const rec = recommendation.data;
  const selected = rec?.candidates.find((candidate) => candidate.id === rec.selectedCandidateId) ?? null;
  const weekday = dateLabel(forecast.date).split(",")[0];
  const steps = [
    { id: "why", label: "Why", done: true },
    { id: "decide", label: "Decide", done: Boolean(selected?.valid) },
    { id: "promote", label: "Promote", done: Boolean(rec?.socialDraft) },
    { id: "approve", label: "Approve", done: rec?.status === "approved" },
  ];

  return (
    <section className={`location ${outlook.loading ? "loading" : ""}`}>
      <div className="hero">
        <div>
          <a className="back" href={hrefFor("/", { date, scenario })}>← All stores</a>
          <h1>
            {location.name} · {dateLabel(forecast.date)}
          </h1>
          <p className="muted">
            {location.profile} Open {location.openingHours.open}:00–{location.openingHours.close}:00 · capacity {location.hourlyCapacityOrders} orders/hr · based on{" "}
            {forecast.observationCount} past {weekday}s ({forecast.evidenceQuality === "good" ? "good evidence" : "sparse evidence"})
          </p>
        </div>
        <nav className="steps" aria-label="Review steps">
          {steps.map((step, index) => (
            <a key={step.id} href={`#${step.id}`} onClick={(event) => { event.preventDefault(); document.getElementById(step.id)?.scrollIntoView({ behavior: "smooth" }); }} className={`step ${step.done ? "done" : ""}`}>
              {step.done ? "✓" : index + 1} {step.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="split" id="why">
        <div className="panel chart-panel">
          <div className="panel-head">
            <h2>Why: hour by hour</h2>
            <div className="legend">
              <span><i className="sw baseline" />Usual {weekday}</span>
              <span><i className="sw estimate" />Estimate</span>
              <span><i className="sw win" />Offer window</span>
              <span><i className="sw over" />At capacity</span>
            </div>
          </div>
          <DemandChart response={outlook.data} window={selected?.terms.window ?? forecast.focusWindow} promo={selected?.kind === "discount"} />
          <ul className="notes">
            {forecast.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <RecommendationCard response={outlook.data} rec={rec} />
      </div>

      <EvidencePanel data={outlook.data} />

      {recommendation.error && <p className="error">{recommendation.error}</p>}
      {rec && selected && (
        <>
          <div className="section-head" id="decide">
            <div>
              <h2>Decide: options for {selected.itemName}, {windowLabel(selected.terms.window)}</h2>
              <p className="muted">
                Profit per item is before rent and staff. Extra sales are <abbr title="Low / base / high responses are explicit assumptions, not learned from traffic.">an assumption</abbr>, shown as a range.
              </p>
            </div>
          </div>
          <OptionCards recommendation={rec} disabled={busy !== null} onUse={edit} />
          <details className="panel adjust">
            <summary>Adjust item, time window or discount</summary>
            <TermsEditor key={rec.revision} terms={selected.terms} menu={outlook.data.menu} location={location} disabled={busy !== null || rec.status === "dismissed"} onSubmit={edit} />
          </details>

          <div className="section-head" id="promote">
            <div>
              <h2>Promote: the post, written from the exact terms</h2>
              <p className="muted">Nothing is published from here. Copy goes stale as soon as the terms change.</p>
            </div>
          </div>
          <PromotePanel recommendation={rec} location={location} busy={busy} onExplain={explain} onDraft={draft} />

          <div id="approve" />
          <DecisionBar recommendation={rec} selected={selected} location={location} busy={busy} error={actionError} onDecide={decide} planHref={hrefFor("/plan", { date, scenario })} />
        </>
      )}
    </section>
  );
}

function RecommendationCard({ response, rec }: { response: LocationOutlookResponse; rec: Recommendation | null }) {
  const selected = rec?.candidates.find((candidate) => candidate.id === rec.selectedCandidateId);
  const hold = selected ? isCapacityHold(selected) : response.outlook.focusReason === "capacity-peak";
  const competitor = response.competitorOffers.find((offer) => offer.comparability === "comparable") ?? response.competitorOffers[0];
  const headline = !selected
    ? "Loading…"
    : selected.kind === "discount"
      ? `Trial ${selected.terms.discountPct}% off ${selected.itemName}, ${windowLabel(selected.terms.window)}.`
      : hold
        ? "Hold the price. No promotion."
        : "Keep the regular price.";
  return (
    <aside className={`panel rec-card ${hold ? "dark" : ""}`}>
      <span className="eyebrow">Recommendation</span>
      <h2 className="rec-headline">{headline}</h2>
      <p>{rec?.deterministicReason ?? response.selection.reason}</p>
      {competitor && (
        <div className="rec-note">
          <strong>Nearby:</strong> {competitor.competitorName}, {competitor.itemDescription}
          {competitor.priceCents !== null && ` at ${money(competitor.priceCents)}`}. <span className="muted">{competitor.comparabilityNotes}</span>
        </div>
      )}
    </aside>
  );
}

function EvidencePanel({ data }: { data: LocationOutlookResponse }) {
  const applied = new Set(data.outlook.appliedSignalIds);
  return (
    <details className="panel evidence-panel">
      <summary>
        Evidence: {data.contextSignals.length} context record{data.contextSignals.length === 1 ? "" : "s"}, {data.competitorOffers.length} competitor offer
        {data.competitorOffers.length === 1 ? "" : "s"} <span className="muted small">· {data.fixtureLabel}</span>
      </summary>
      <div className="evidence-grid">
        <ul className="evidence">
          {data.contextSignals.map((signal) => (
            <li key={signal.id} className={applied.has(signal.id) ? "" : "inactive"}>
              <div className="evidence-head">
                <strong>
                  <SignalIcon type={signal.type} size={14} /> {signal.title}
                </strong>
                <span className={`tag ${applied.has(signal.id) ? "on" : ""}`}>
                  {applied.has(signal.id) ? `applied · ${Math.round(signal.assumedOrderAdjustment * 100)}% assumed` : "not applied"}
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
        <ul className="evidence">
          {data.competitorOffers.map((offer) => (
            <li key={offer.id}>
              <div className="evidence-head">
                <strong>
                  {offer.competitorName}: {offer.itemDescription}
                  {offer.priceCents !== null && ` · ${money(offer.priceCents)}`}
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
      </div>
    </details>
  );
}
