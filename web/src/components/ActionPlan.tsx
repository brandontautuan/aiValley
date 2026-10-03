import { api } from "../api.ts";
import { dateLabel, money, timestamp, windowLabel } from "../format.ts";
import { useLoad } from "../useLoad.ts";

export function ActionPlan({ date }: { date: string }) {
  const { data, error } = useLoad(() => api.actionPlan(date), [date]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading action plan…</p>;
  const current = data.plans.filter((plan) => !plan.superseded);
  const history = data.plans.filter((plan) => plan.superseded);

  return (
    <section>
      <div className="page-head">
        <h1>Action plan for {dateLabel(data.date)}</h1>
        <p className="muted">These are the approved terms, saved for the team. Nothing here was published or sent to a register.</p>
      </div>
      {current.length === 0 && (
        <div className="panel empty">
          <p>No approved plans for this date yet.</p>
          <a href="#/">Review locations →</a>
        </div>
      )}
      <div className="cards">
        {current.map((plan) => {
          const terms = plan.finalTerms;
          return (
            <article key={plan.id} className="card">
              <div className="card-head">
                <h2>{plan.locationName}</h2>
                <span className="status approved">Saved · rev {plan.revision}</span>
              </div>
              <p>
                <strong>
                  {terms.kind === "discount"
                    ? `${terms.itemName} ${money(terms.proposedPriceCents)} (${terms.terms.discountPct}% off ${money(terms.regularPriceCents)})`
                    : `Keep ${terms.itemName} at ${money(terms.regularPriceCents)}`}
                </strong>
                <br />
                <span className="muted small">
                  {windowLabel(terms.terms.window)} · {plan.scenario === "local-event" ? "Local event day" : "Typical day"}
                  {terms.breakEvenUnits !== null && ` · break-even ${terms.breakEvenUnits} units`}
                </span>
              </p>
              {plan.socialDraft ? <blockquote className="caption small">{plan.socialDraft.caption}</blockquote> : <p className="muted small">No social copy saved with this plan.</p>}
              <p className="muted small">Approved {timestamp(plan.decidedAt)}</p>
              <a className="link" href={`#/location/${plan.locationId}`}>Open location →</a>
            </article>
          );
        })}
      </div>
      {history.length > 0 && (
        <details className="panel">
          <summary>{history.length} earlier approval(s) replaced by newer revisions or dismissed</summary>
          <ul className="small">
            {history.map((plan) => (
              <li key={plan.id}>
                {plan.locationName} rev {plan.revision}: {plan.finalTerms.itemName} {money(plan.finalTerms.proposedPriceCents)} {windowLabel(plan.finalTerms.terms.window)} (approved {timestamp(plan.decidedAt)})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
