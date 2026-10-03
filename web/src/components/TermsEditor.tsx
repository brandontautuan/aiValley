import { useEffect, useState } from "react";
import type { Location, MenuItem, OfferTerms } from "../../../contracts/index.ts";
import { hour as hourLabel, money } from "../format.ts";

/** Edits offer terms; the server re-evaluates them into a new revision. */
export function TermsEditor({ terms, menu, location, disabled, onSubmit, onDirty }: { terms: OfferTerms; menu: MenuItem[]; location: Location; disabled: boolean; onSubmit: (terms: OfferTerms) => void; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(terms);
  const hours = Array.from({ length: location.openingHours.close - location.openingHours.open + 1 }, (_, index) => location.openingHours.open + index);
  const changed = JSON.stringify(draft) !== JSON.stringify(terms);
  useEffect(() => { onDirty(changed); }, [changed, onDirty]);
  const invalidWindow = draft.window.endHour <= draft.window.startHour;
  const set = (patch: Partial<OfferTerms>) => setDraft((current) => ({ ...current, ...patch }));
  const setWindow = (patch: Partial<OfferTerms["window"]>) => setDraft((current) => ({ ...current, window: { ...current.window, ...patch } }));

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalidWindow) onSubmit(draft);
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
            <option key={hour} value={hour}>{hourLabel(hour)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>To</span>
        <select value={draft.window.endHour} disabled={disabled} onChange={(event) => setWindow({ endHour: Number(event.target.value) })}>
          {hours.slice(1).map((hour) => (
            <option key={hour} value={hour}>{hourLabel(hour)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Discount %</span>
        <input type="number" min={0} max={10} step={1} value={draft.discountPct} disabled={disabled} onChange={(event) => set({ discountPct: Number(event.target.value) })} />
      </label>
      <button type="submit" className="primary" disabled={disabled || !changed || invalidWindow}>
        Update plan & check numbers
      </button>
      {changed && <button type="button" disabled={disabled} onClick={() => setDraft(terms)}>Discard edits</button>}
      {invalidWindow && <p className="error" role="alert">The end time must be later than the start time.</p>}
    </form>
  );
}
