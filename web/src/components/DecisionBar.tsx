import type { Location, OfferCandidate, Recommendation } from "../../../contracts/index.ts";
import { money, windowLabel } from "../format.ts";
import type { ActionError } from "./LocationDetail.tsx";

export function DecisionBar({ recommendation, selected, location, busy, error, dirty, onDecide, planHref }: {
  recommendation: Recommendation; selected: OfferCandidate; location: Location; busy: string | null;
  error: ActionError; dirty: boolean; onDecide: (action: "approve" | "dismiss") => void; planHref: string;
}) {
  const blocking = selected.issues.filter((issue) => issue.severity === "error");
  const saved = recommendation.status === "approved";
  const dismissed = recommendation.status === "dismissed";
  return (
    <div className="decision-bar" role="region" aria-label="Save your decision">
      <div className="decision-terms">
        <span className="kicker">{saved ? "Saved for your team" : dismissed ? "Suggestion dismissed" : "Ready to save?"}</span>
        <strong>{location.name} · {selected.itemName} {money(selected.proposedPriceCents)} · {windowLabel(selected.terms.window)}</strong>
        <span className="kicker">Approval saves this plan. Menu prices and social accounts stay unchanged.</span>
        {dirty && <span className="bar-error" role="status">You have unapplied edits. Update the plan or discard your edits before approving.</span>}
        {error && <span className="bar-error" role="alert">{error.message} {error.issues?.join(" ")}</span>}
        {!error && blocking.length > 0 && <span className="bar-error">Fix these before approving: {blocking.map((issue) => issue.message).join(" ")}</span>}
      </div>
      {saved ? (
        <><span className="saved" role="status">✓ Plan saved</span><a className="bar-link" href={planHref}>View saved plans →</a></>
      ) : (
        <div className="decision-actions">
          {!dismissed && <button className="bar-ghost" disabled={busy !== null || dirty} onClick={() => onDecide("dismiss")}>Dismiss suggestion</button>}
          <button className="bar-primary" disabled={busy !== null || dirty || !selected.valid || blocking.length > 0} onClick={() => onDecide("approve")}>
            {busy === "approve" ? "Saving…" : dismissed ? "Approve this plan instead" : "Approve plan"}
          </button>
        </div>
      )}
    </div>
  );
}
