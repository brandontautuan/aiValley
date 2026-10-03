import { useState } from "react";
import type { Location, MenuItem, OfferTerms } from "../../../contracts/index.ts";
import { money } from "../format.ts";

/** Edits offer terms; the server re-evaluates them into a new revision. */
export function TermsEditor({ terms, menu, location, disabled, onSubmit }: { terms: OfferTerms; menu: MenuItem[]; location: Location; disabled: boolean; onSubmit: (terms: OfferTerms) => void }) {
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
      <button type="submit" className="primary" disabled={disabled || !changed}>
        Recalculate offer
      </button>
    </form>
  );
}
