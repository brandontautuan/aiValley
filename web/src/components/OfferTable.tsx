import type { OfferTerms, Recommendation } from "../../../contracts/index.ts";
import { money, units, windowLabel } from "../format.ts";

/** Side-by-side candidate economics, exactly as computed by the server. */
export function OfferTable({ recommendation, disabled, onUse }: { recommendation: Recommendation; disabled: boolean; onUse: (terms: OfferTerms) => void }) {
  const editable = recommendation.status !== "dismissed";
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Offer comparison</h2>
        <span className="muted small">Contribution is before fixed costs. Unit responses are assumptions, not forecasts.</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th>Price</th>
              <th>Contribution / unit</th>
              <th>Expected at regular price</th>
              <th>Break-even units</th>
              <th>Assumed response (low / base / high)</th>
              <th>Checks</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recommendation.candidates.map((candidate) => {
              const selected = candidate.id === recommendation.selectedCandidateId;
              return (
                <tr key={candidate.id} className={selected ? "selected" : ""}>
                  <td>
                    <strong>{candidate.kind === "no-change" ? "Keep regular price" : `${candidate.terms.discountPct}% off`}</strong>
                    <div className="muted small">
                      {candidate.itemName} · {windowLabel(candidate.terms.window)}
                    </div>
                  </td>
                  <td>
                    {money(candidate.proposedPriceCents)}
                    {candidate.kind === "discount" && <div className="muted small strike">{money(candidate.regularPriceCents)}</div>}
                  </td>
                  <td>{money(candidate.contributionPerUnitCents)}</td>
                  <td>
                    {units(candidate.referenceUnits)} units
                    <div className="muted small">{money(candidate.referenceContributionCents)} contribution</div>
                  </td>
                  <td>{candidate.breakEvenUnits ?? "—"}</td>
                  <td>
                    {candidate.responseScenarios.length
                      ? candidate.responseScenarios.map((scenario) => (
                          <div key={scenario.label} className={`small ${scenario.label === "base" ? "" : "muted"}`}>
                            {scenario.label}: {units(scenario.units)} u → {money(scenario.contributionCents)}
                          </div>
                        ))
                      : "—"}
                  </td>
                  <td>
                    {candidate.issues.length === 0 ? (
                      <span className="tag on">passes</span>
                    ) : (
                      candidate.issues.map((issue) => (
                        <div key={issue.code} className={`small ${issue.severity === "error" ? "error-text" : "warn-text"}`} title={issue.message}>
                          {issue.severity === "error" ? "✕" : "!"} {issue.message}
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    {selected ? (
                      <span className="tag on">selected</span>
                    ) : (
                      editable && (
                        <button className="small-btn" disabled={disabled} onClick={() => onUse(candidate.terms)}>
                          Use this
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
