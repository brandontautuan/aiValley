import type { LocationOutlookResponse, OfferWindow } from "../../../contracts/index.ts";
import { hour as hourLabel, money, units } from "../format.ts";
import { inWindow, isNearCapacity } from "../insights.ts";
import { SignalIcon } from "./SignalIcon.tsx";

const NOTE_HEIGHT = 40;

/** Hourly orders: usual baseline behind the scenario estimate, with context annotated on the hours it affects. */
export function DemandChart({ response, window, promo }: { response: LocationOutlookResponse; window: OfferWindow; promo: boolean }) {
  const { outlook } = response;
  const hours = outlook.hours;
  const capacity = hours[0]?.capacityOrders ?? 0;
  const max = Math.max(capacity, ...hours.map((entry) => Math.max(entry.scenarioOrders, entry.baselineOrders))) * 1.15;
  const slot = 100 / hours.length;
  const indexOf = (hour: number) => Math.max(0, hours.findIndex((entry) => entry.hour === hour));
  const peak = hours.reduce((best, entry) => (entry.scenarioOrders > best.scenarioOrders ? entry : best), hours[0]);

  const applied = response.contextSignals.filter((signal) => outlook.appliedSignalIds.includes(signal.id));
  const notes = [
    ...applied.map((signal) => {
      const first = hours.find((entry) => entry.signalIds.includes(signal.id));
      return {
        key: signal.id,
        left: first ? indexOf(first.hour) * slot : 0,
        icon: <SignalIcon type={signal.type} size={14} />,
        text: `${signal.title.replace(/\s*\(.*\)$/, "")}: ${signal.assumedOrderAdjustment > 0 ? "+" : ""}${Math.round(signal.assumedOrderAdjustment * 100)}% assumed`,
        tone: "info",
      };
    }),
    ...response.competitorOffers
      .filter((offer) => offer.comparability === "comparable")
      .slice(0, 1)
      .map((offer) => ({
        key: offer.id,
        left: indexOf(window.startHour) * slot,
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
          </svg>
        ),
        text: `${offer.competitorName.replace(/\s*\(.*\)$/, "")}: ${offer.itemDescription.toLowerCase()}${offer.priceCents !== null ? ` ${money(offer.priceCents)}` : ""}${offer.availability ? `, ${offer.availability}` : ""}`,
        tone: "warn",
      })),
  ];

  return (
    <div className="demand" style={{ paddingTop: notes.length * NOTE_HEIGHT + 12 }}>
      <div className="demand-plot" role="img" aria-label={`Hourly orders at ${response.location.name}. Peak ${units(peak.scenarioOrders)} at ${hourLabel(peak.hour)}; capacity ${capacity} per hour.`}>
        <div className="window-band" style={{ left: `${indexOf(window.startHour) * slot}%`, width: `${(window.endHour - window.startHour) * slot}%`, top: -(notes.length * NOTE_HEIGHT + 8) }} />
        {notes.map((note, index) => (
          <div key={note.key} className={`note ${note.tone}`} style={{ left: `min(${note.left}%, calc(100% - 320px))`, top: -(notes.length - index) * NOTE_HEIGHT }}>
            {note.icon}
            <span>{note.text}</span>
          </div>
        ))}
        <div className="cap-line" style={{ bottom: `${(capacity / max) * 100}%` }}>
          <span>capacity {capacity}/hr</span>
        </div>
        <div className="peak-label" style={{ left: `${indexOf(peak.hour) * slot}%`, bottom: `calc(${(peak.scenarioOrders / max) * 100}% + 6px)`, width: `${slot}%` }}>
          {units(Math.round(peak.scenarioOrders))}
        </div>
        {hours.map((entry) => (
          <div key={entry.hour} className="col">
            <div className="ghost" style={{ height: `${(entry.baselineOrders / max) * 100}%` }} />
            <div
              className={`est ${isNearCapacity(entry) ? "over" : promo && inWindow(entry.hour, window) ? "win" : entry.scenarioOrders > entry.baselineOrders + 0.5 ? "up" : ""}`}
              style={{ height: `${(entry.scenarioOrders / max) * 100}%` }}
              title={`${hourLabel(entry.hour)}: ${units(entry.scenarioOrders)} expected (usual ${units(entry.baselineOrders)})`}
            />
          </div>
        ))}
      </div>
      <div className="demand-hours">
        {hours.map((entry) => (
          <span key={entry.hour}>{hourLabel(entry.hour)}</span>
        ))}
      </div>
    </div>
  );
}
