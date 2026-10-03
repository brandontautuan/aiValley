import { useState } from "react";
import type { LocationOutlookResponse, OfferCandidate, OfferTerms, Recommendation, ScenarioId } from "../../../contracts/index.ts";
import { api, ApiRequestError } from "../api.ts";
import { dateLabel, money, timestamp, windowLabel } from "../format.ts";
import { isCapacityHold } from "../insights.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";
import { DecisionBar } from "./DecisionBar.tsx";
import { CompetitorResearchPanel } from "./CompetitorResearchPanel.tsx";
import { ReviewMonitoringPanel } from "./ReviewMonitoringPanel.tsx";
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
  const [dirty, setDirty] = useState(false);
  const [actionError, setActionError] = useState<ActionError>(null);

  async function run(label: string, action: (rec: Recommendation) => Promise<Recommendation>) {
    if (!recommendation.data || recommendation.loading || busy) return;
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

  if (outlook.error) return <div className="error" role="alert"><p>We couldn’t load this store. {outlook.error}</p><button onClick={outlook.reload}>Try again</button></div>;
  if (!outlook.data) return <p className="muted" role="status">Preparing your store’s suggestion…</p>;
  const { location, outlook: forecast } = outlook.data;
  const rec = recommendation.data;
  const selected = rec?.candidates.find((candidate) => candidate.id === rec.selectedCandidateId) ?? null;
  const weekday = dateLabel(forecast.date).split(",")[0];
  const pending = busy ?? (recommendation.loading ? "loading" : null);

  return (
    <section className="location review-page">
      <div className="hero">
        <div>
          <a className="back" href={hrefFor("/", { date, scenario })}>← All stores</a>
          <h1>{location.name}</h1>
          <p className="muted lead">{dateLabel(forecast.date)} · Review the suggestion, then save your decision.</p>
        </div>
        {rec && <span className={`badge ${rec.status === "approved" ? "ok" : ""}`}>{rec.status === "approved" ? "Plan saved" : rec.status === "dismissed" ? "Suggestion dismissed" : "Ready for your review"}</span>}
      </div>
      {recommendation.error && <div className="error" role="alert"><p>We couldn’t load your decision. {recommendation.error}</p><button onClick={recommendation.reload}>Try again</button></div>}
      {!rec && !recommendation.error && <p role="status">Loading the suggested plan…</p>}
      {rec && selected && (
        <>
          <RecommendationCard response={outlook.data} rec={rec} selected={selected} />
          <div className="review-details">
            <details className="panel disclosure">
              <summary><strong>Understand the forecast</strong><span>See when this store is busy and what may affect demand.</span></summary>
              <div className="disclosure-body">
                <p className="muted">The chart compares usual customer orders with the estimate for this date. The capacity line shows how many orders the store can serve per hour.</p>
                <div className="legend">
                  <span><i className="sw baseline" />Usual {weekday}</span><span><i className="sw estimate" />Estimate</span>
                  <span><i className="sw win" />Selected hours</span><span><i className="sw over" />At capacity</span>
                </div>
                <div className="chart-scroll"><DemandChart response={outlook.data} window={selected.terms.window} promo={selected.kind === "discount"} /></div>
                <p className="small muted">{location.profile} Open {location.openingHours.open}:00–{location.openingHours.close}:00 · Can serve {location.hourlyCapacityOrders} orders per hour.</p>
                <details><summary>How this estimate was made</summary><p className="small">Based on {forecast.observationCount} past {weekday}s.</p><ul className="notes">{forecast.notes.map((note) => <li key={note}>{note}</li>)}</ul></details>
                <EvidencePanel data={outlook.data} />
              </div>
            </details>

            <details className="panel disclosure">
              <summary><strong>Compare prices or adjust this plan</strong><span>Optional · Choose another price, item, or time.</span></summary>
              <div className="disclosure-body">
                <p className="muted">Select a price option to update your plan. Extra sales are assumptions, not guaranteed results. Saving an edited plan replaces the earlier saved decision.</p>
                <OptionCards recommendation={rec} disabled={pending !== null || dirty} onUse={edit} />
                <details className="adjust">
                  <summary>Change item, hours, or discount</summary>
                  <p className="small muted disclosure-intro">After changing the terms, select “Update plan & check numbers” before approving.</p>
                  <TermsEditor key={rec.revision} terms={selected.terms} menu={outlook.data.menu} location={location} disabled={pending !== null || rec.status === "dismissed"} onSubmit={edit} onDirty={setDirty} />
                </details>
              </div>
            </details>

            <details className="panel disclosure" id="promote">
              <summary><strong>Prepare a social post</strong><span>Optional · Create a caption to copy and post yourself.</span></summary>
              <div className="disclosure-body">
                <p className="muted">A post is optional. Create it before approving if you want the caption included in the saved plan. Captions created after approval can be copied here, but are not added to the already saved plan.</p>
                <PromotePanel recommendation={rec} location={location} busy={dirty ? "unsaved" : pending} onExplain={explain} onDraft={draft} contextSignals={outlook.data.contextSignals} appliedSignalIds={forecast.appliedSignalIds} />
              </div>
            </details>

            <details className="panel disclosure">
              <summary><strong>Research nearby competitors</strong><span>Optional · Look up public sources for your own review.</span></summary>
              <div className="disclosure-body"><CompetitorResearchPanel locationId={locationId} date={date} /></div>
            </details>

            <details className="panel disclosure">
              <summary><strong>Check competitor reviews</strong><span>Optional · See what customers say about nearby competitors.</span></summary>
              <div className="disclosure-body"><ReviewMonitoringPanel locationId={locationId} date={date} /></div>
            </details>
          </div>
          <DecisionBar recommendation={rec} selected={selected} location={location} busy={pending} error={actionError} dirty={dirty} onDecide={decide} planHref={hrefFor("/plan", { date, scenario })} />
        </>
      )}
    </section>
  );
}

function RecommendationCard({ response, rec, selected }: { response: LocationOutlookResponse; rec: Recommendation; selected: OfferCandidate }) {
  const hold = isCapacityHold(selected);
  return (
    <section className="panel recommendation-summary">
      <span className="eyebrow">{rec.status === "approved" ? "Your saved decision" : "Your selected plan"}</span>
      <h2 className="rec-headline">{selected.kind === "discount" ? `Try ${selected.terms.discountPct}% off ${selected.itemName}` : "Keep the regular price"}</h2>
      <p className="muted">{selected.itemName} · {windowLabel(selected.terms.window)} · {response.location.name} only</p>
      <div className="reason-block">
        <h3>{rec.deterministicReason.startsWith("Manager-edited terms:") ? "About your choice" : "Why this makes sense"}</h3>
        <p>{rec.deterministicReason.startsWith("Manager-edited terms:") ? "You chose these terms. Review the updated numbers below before saving your decision." : rec.deterministicReason.replace("no discount clears its break-even threshold under the assumed response.", "the assumed extra sales from a discount would not make up for the lower price.")}</p>
      </div>
      <div className="decision-facts">
        <div><span className="small muted">Customer pays</span><strong>{money(selected.proposedPriceCents)}</strong><span className="small muted">per item{selected.kind === "discount" ? `, usually ${money(selected.regularPriceCents)}` : " at the regular price"}</span></div>
        <div><span className="small muted">Left after item costs</span><strong>{money(selected.contributionPerUnitCents)}</strong><span className="small muted">per item, before rent, staff, and other fixed costs</span></div>
        {selected.kind === "discount" && <div><span className="small muted">Sales needed to match regular pricing</span><strong>{selected.breakEvenUnits === null ? "Unavailable" : `${selected.breakEvenUnits} items`}</strong><span className="small muted">during these hours, to match the usual amount left after item costs</span></div>}
      </div>
      <p className="expectation-note">{selected.kind === "discount" ? "Treat this as a trial. If the discount does not bring enough extra sales, you could earn less than at regular prices." : hold ? "The store is expected to be busy. Keeping prices steady avoids encouraging orders beyond what the team can serve." : "Keeping prices steady is a complete plan. You do not need to run a promotion."}</p>
      {response.outlook.evidenceQuality !== "good" && <p className="warn-text small">Limited sales history: review this estimate with extra care.</p>}
      {selected.issues.length > 0 && <ul className="review-warnings">{selected.issues.map((issue) => <li key={issue.code} className={issue.severity === "error" ? "error-text" : "warn-text"}>{issue.severity === "error" ? "Needs fixing: " : "Keep in mind: "}{issue.message}</li>)}</ul>}
    </section>
  );
}

function EvidencePanel({ data }: { data: LocationOutlookResponse }) {
  const applied = new Set(data.outlook.appliedSignalIds);
  return (
    <details className="panel evidence-panel">
      <summary>
        Local events and nearby offers
      </summary>
      <p className="muted small disclosure-intro">These sample records explain the local context behind the forecast. Only records marked “applied” affect expected demand.</p>
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
