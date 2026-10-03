import type { OfferCandidate, OfferTerms, Recommendation } from "../../../contracts/index.ts";
import { brand } from "../brand.ts";
import { money, units } from "../format.ts";
import { isCapacityHold } from "../insights.ts";

/** Candidate economics as comparable cards. Every number is the server's. */
export function OptionCards({ recommendation, disabled, onUse }: { recommendation: Recommendation; disabled: boolean; onUse: (terms: OfferTerms) => void }) {
  const editable = recommendation.status !== "dismissed";
  const scaleMax =
    Math.max(
      ...recommendation.candidates.flatMap((candidate) => [candidate.referenceUnits, candidate.breakEvenUnits ?? 0, ...candidate.responseScenarios.map((scenario) => scenario.units)]),
    ) * 1.15 || 1;
  const x = (value: number) => `${Math.min(100, (value / scaleMax) * 100)}%`;
  const noun = brand.itemNoun.plural;

  return (
    <div className="options">
      {recommendation.candidates.map((candidate) => {
        const selected = candidate.id === recommendation.selectedCandidateId;
        const low = candidate.responseScenarios.find((scenario) => scenario.label === "low");
        const base = candidate.responseScenarios.find((scenario) => scenario.label === "base");
        const high = candidate.responseScenarios.find((scenario) => scenario.label === "high");
        const errors = candidate.issues.filter((issue) => issue.severity === "error");
        const warnings = candidate.issues.filter((issue) => issue.severity === "warning");
        return (
          <button
            key={candidate.id}
            className={`option ${selected ? "sel" : ""} ${errors.length ? "blocked" : ""}`}
            disabled={disabled || selected || !editable}
            aria-pressed={selected}
            onClick={() => onUse(candidate.terms)}
          >
            <div className="option-head">
              <strong>{candidate.kind === "no-change" ? "Keep regular price" : `${candidate.terms.discountPct}% off`}</strong>
              {selected && <span className="badge ok">Selected</span>}
            </div>
            <div className="price-row">
              <span className="price">{money(candidate.proposedPriceCents)}</span>
              {candidate.kind === "discount" && <span className="muted strike">{money(candidate.regularPriceCents)}</span>}
            </div>
            <span className="small">
              <span className="num">{money(candidate.contributionPerUnitCents)}</span> profit per item, before fixed costs
            </span>

            <div className="meter" aria-label={`Usually about ${units(candidate.referenceUnits)} ${noun}${candidate.breakEvenUnits !== null ? `; worth it at ${candidate.breakEvenUnits} or more` : ""}`}>
              {low && high && <div className="band" style={{ left: x(low.units), width: `calc(${x(high.units)} - ${x(low.units)})` }} />}
              {base && <div className="dot" style={{ left: x(base.units) }} />}
              <div className="tick ref" style={{ left: x(candidate.referenceUnits) }} />
              {candidate.breakEvenUnits !== null && <div className="tick be" style={{ left: x(candidate.breakEvenUnits) }} />}
            </div>
            <div className="meter-legend small">
              <span><i className="mk ref" /> usually ~{units(Math.round(candidate.referenceUnits))} {noun}</span>
              {candidate.breakEvenUnits !== null && <span><i className="mk be" /> worth it at {candidate.breakEvenUnits}+</span>}
              {low && high && <span><i className="mk band" /> might sell {Math.round(low.units)}–{Math.round(high.units)} (assumed)</span>}
            </div>

            <p className="verdict">{verdict(candidate, base?.units ?? null, base?.contributionCents ?? null)}</p>

            {errors.map((issue) => (
              <span key={issue.code} className="issue error-text">✕ {issue.message}</span>
            ))}
            {warnings.map((issue) => (
              <span key={issue.code} className="issue warn-text">⚠ {issue.message}</span>
            ))}
            {!selected && editable && !errors.length && <span className="use">Use this option →</span>}
          </button>
        );
      })}
    </div>
  );
}

function verdict(candidate: OfferCandidate, baseUnits: number | null, baseContribution: number | null): string {
  if (candidate.kind === "no-change") {
    const value = candidate.referenceContributionCents !== null ? ` About ${money(candidate.referenceContributionCents)} contribution from this window.` : "";
    return isCapacityHold(candidate) ? `Serves the rush at full price.${value}` : `No risk and no extra volume.${value}`;
  }
  if (baseUnits === null || candidate.breakEvenUnits === null) return "Economics unavailable for these terms.";
  const diff = Math.round(baseUnits) - candidate.breakEvenUnits;
  const result = baseContribution !== null ? ` (${money(baseContribution)} contribution)` : "";
  if (diff > 0) return `Middle case ~${Math.round(baseUnits)} clears break-even by ${diff}${result}. A trial, not a guarantee.`;
  if (diff === 0) return `Middle case lands right on break-even (${candidate.breakEvenUnits})${result}. Little upside.`;
  return `Middle case ~${Math.round(baseUnits)} falls short of break-even (${candidate.breakEvenUnits})${result}.`;
}
