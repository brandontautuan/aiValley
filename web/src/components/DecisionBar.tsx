import type { Location, OfferCandidate, Recommendation } from "../../../contracts/index.ts";
import { money, windowLabel } from "../format.ts";
import type { ActionError } from "./LocationDetail.tsx";

/** Sticky bar holding the current terms and the approval controls. */
export function DecisionBar({
  recommendation,
  selected,
  location,
  busy,
  error,
  onDecide,
  planHref,
}: {
  recommendation: Recommendation;
  selected: OfferCandidate;
  location: Location;
  busy: string | null;
  error: ActionError;
  onDecide: (action: "approve" | "dismiss") => void;
  planHref: string;
}) {
  const blocking = selected.issues.filter((issue) => issue.severity === "error");
  const terms =
    selected.kind === "discount"
      ? `${selected.itemName} ${money(selected.proposedPriceCents)} · ${selected.terms.discountPct}% off · ${location.name} ${windowLabel(selected.terms.window)}`
      : `${selected.itemName} ${money(selected.regularPriceCents)} · regular price · ${location.name}`;
  const status = recommendation.status === "approved" ? "Saved" : recommendation.status === "dismissed" ? "Dismissed" : "Your decision";

  return (
    <div className="decision-bar" role="region" aria-label="Decision">
      <div className="decision-terms">
        <span className="kicker">
          {status} · revision {recommendation.revision}
        </span>
        <strong>{terms}</strong>
        {error && (
          <span className="bar-error">
            {error.message}
            {error.issues && ` ${error.issues.join(" ")}`}
          </span>
        )}
        {!error && blocking.length > 0 && <span className="bar-error">Fix the failed checks before approving: {blocking.map((issue) => issue.message).join(" ")}</span>}
      </div>
      {recommendation.status === "approved" ? (
        <>
          <span className="saved">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
              <path d="M5 12l5 5 9-10" />
            </svg>
            Saved to the plan
          </span>
          <a className="bar-link" href={planHref}>View plan →</a>
        </>
      ) : (
        <>
          <a
            className="bar-link"
            href="#promote"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("promote")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Preview post →
          </a>
          <button className="bar-ghost" disabled={busy !== null || recommendation.status === "dismissed"} onClick={() => onDecide("dismiss")}>
            Dismiss
          </button>
          <button className="bar-primary" disabled={busy !== null || blocking.length > 0} onClick={() => onDecide("approve")}>
            {busy === "approve" ? "Saving…" : "Approve plan"}
          </button>
        </>
      )}
    </div>
  );
}
