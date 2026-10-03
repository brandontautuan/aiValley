import { useState } from "react";
import type { Location, MenuItem, OfferTerms, Recommendation } from "../../../contracts/index.ts";
import { money, windowLabel } from "../format.ts";

interface Props {
  recommendation: Recommendation;
  menu: MenuItem[];
  location: Location;
  busy: string | null;
  error: { message: string; issues?: string[] } | null;
  onEdit: (terms: OfferTerms) => void;
  onDecide: (action: "approve" | "dismiss") => void;
}

const STATUS_LABEL = { draft: "Draft", approved: "Saved", dismissed: "Dismissed" } as const;

export function ReviewPanel({ recommendation, menu, location, busy, error, onEdit, onDecide }: Props) {
  const selected = recommendation.candidates.find((candidate) => candidate.id === recommendation.selectedCandidateId)!;
  const blocking = selected.issues.filter((issue) => issue.severity === "error");

  return (
    <div className="panel review">
      <div className="panel-head">
        <h2>Recommendation review</h2>
        <span className={`status ${recommendation.status}`}>
          {STATUS_LABEL[recommendation.status]} · revision {recommendation.revision}
        </span>
      </div>
      <div className={`proposal ${selected.kind}`}>
        <span className="small muted">{selected.kind === "discount" ? "Proposed offer" : "Proposed action"}</span>
        <strong>
          {selected.kind === "discount"
            ? `${selected.itemName} ${money(selected.proposedPriceCents)} (${selected.terms.discountPct}% off ${money(selected.regularPriceCents)})`
            : `Keep ${selected.itemName} at ${money(selected.regularPriceCents)}`}
        </strong>
        <span className="small">
          {location.name} · {windowLabel(selected.terms.window)}
        </span>
      </div>
      <p>{recommendation.deterministicReason}</p>

      <TermsEditor key={recommendation.revision} terms={selected.terms} menu={menu} location={location} disabled={busy !== null || recommendation.status === "dismissed"} onSubmit={onEdit} />

      {error && (
        <div className="error">
          {error.message}
          {error.issues && (
            <ul>
              {error.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {blocking.length > 0 && <p className="error-text small">Fix the failed checks before approving.</p>}

      <div className="actions">
        <button className="primary" disabled={busy !== null || blocking.length > 0 || recommendation.status === "approved"} onClick={() => onDecide("approve")}>
          {busy === "approve" ? "Saving…" : recommendation.status === "approved" ? "Saved ✓" : "Approve plan"}
        </button>
        <button className="ghost" disabled={busy !== null || recommendation.status === "dismissed"} onClick={() => onDecide("dismiss")}>
          Dismiss
        </button>
      </div>
      <p className="muted small">Approving saves this plan for the team. It does not change a live menu or publish a post.</p>
    </div>
  );
}

function TermsEditor({ terms, menu, location, disabled, onSubmit }: { terms: OfferTerms; menu: MenuItem[]; location: Location; disabled: boolean; onSubmit: (terms: OfferTerms) => void }) {
  const [draft, setDraft] = useState(terms);
  const hours = Array.from({ length: location.openingHours.close - location.openingHours.open + 1 }, (_, index) => location.openingHours.open + index);
  const changed = JSON.stringify(draft) !== JSON.stringify(terms);
  const set = (patch: Partial<OfferTerms>) => setDraft((current) => ({ ...current, ...patch }));
  const setWindow = (patch: Partial<OfferTerms["window"]>) => setDraft((current) => ({ ...current, window: { ...current.window, ...patch } }));

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <label>
        <span>Item</span>
        <select value={draft.itemId} disabled={disabled} onChange={(event) => set({ itemId: event.target.value })}>
          {menu.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({money(item.regularPriceCents)})
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>From</span>
        <select value={draft.window.startHour} disabled={disabled} onChange={(event) => setWindow({ startHour: Number(event.target.value) })}>
          {hours.slice(0, -1).map((hour) => (
            <option key={hour} value={hour}>{hour}:00</option>
          ))}
        </select>
      </label>
      <label>
        <span>To</span>
        <select value={draft.window.endHour} disabled={disabled} onChange={(event) => setWindow({ endHour: Number(event.target.value) })}>
          {hours.slice(1).map((hour) => (
            <option key={hour} value={hour}>{hour}:00</option>
          ))}
        </select>
      </label>
      <label>
        <span>Discount %</span>
        <input type="number" min={0} max={99} step={1} value={draft.discountPct} disabled={disabled} onChange={(event) => set({ discountPct: Number(event.target.value) })} />
      </label>
      <button type="submit" disabled={disabled || !changed}>
        Recalculate
      </button>
    </form>
  );
}
