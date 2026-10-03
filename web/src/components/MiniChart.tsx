import type { HourOutlook, OfferWindow } from "../../../contracts/index.ts";
import { hour as hourLabel } from "../format.ts";
import { inWindow, isNearCapacity } from "../insights.ts";

/** Compact hourly bars with the capacity line; a highlighted window when a promotion is proposed. */
export function MiniChart({ hours, highlight, label }: { hours: HourOutlook[]; highlight: OfferWindow | null; label: string }) {
  const capacity = hours[0]?.capacityOrders ?? 0;
  const max = Math.max(capacity, ...hours.map((hour) => hour.scenarioOrders)) * 1.15;
  const step = Math.max(1, Math.ceil(hours.length / 6));
  return (
    <div className="mini" role="img" aria-label={label}>
      <div className="mini-bars">
        <div className="mini-cap" style={{ bottom: `${(capacity / max) * 100}%` }}>
          <span>capacity {capacity}/hr</span>
        </div>
        {hours.map((hour) => (
          <div
            key={hour.hour}
            className={`mini-bar ${isNearCapacity(hour) ? "over" : highlight && inWindow(hour.hour, highlight) ? "win" : ""}`}
            style={{ height: `${(hour.scenarioOrders / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="mini-hours">
        {hours.map((hour, index) => (
          <span key={hour.hour}>{index % step === 0 ? hourLabel(hour.hour) : ""}</span>
        ))}
      </div>
    </div>
  );
}
