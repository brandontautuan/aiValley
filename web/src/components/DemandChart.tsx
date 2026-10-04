import type { LocationOutlookResponse, OfferWindow } from "../../../contracts/index.ts";
import { hour as hourLabel, money, units } from "../format.ts";
import { inWindow, isNearCapacity } from "../insights.ts";
import { SignalIcon } from "./SignalIcon.tsx";

/** Hourly orders: usual baseline behind the scenario estimate, with context annotated on the hours it affects. */
export function DemandChart({ response, window, promo }: { response: LocationOutlookResponse; window: OfferWindow; promo: boolean }) {
  const { outlook } = response;
  const hours = outlook.hours;
  const capacity = hours[0]?.capacityOrders ?? 0;
  const max = Math.max(capacity, ...hours.map((entry) => Math.max(entry.scenarioOrders, entry.baselineOrders))) * 1.15;
  const indexOf = (hour: number) => Math.max(0, hours.findIndex((entry) => entry.hour === hour));
  // Columns are separated by --gap, so positions include it to stay aligned with the bars.
  const leftOf = (index: number) => `calc((100% + var(--gap)) * ${index / hours.length})`;
  const widthOf = (count: number) => `calc((100% + var(--gap)) * ${count / hours.length} - var(--gap))`;
  const peak = hours.reduce((best, entry) => (entry.scenarioOrders > best.scenarioOrders ? entry : best), hours[0]);
  const kindOf = (entry: (typeof hours)[number]) =>
    isNearCapacity(entry) ? "over" : promo && inWindow(entry.hour, window) ? "win" : entry.scenarioOrders > entry.baselineOrders + 0.5 ? "up" : "";
  const kinds = hours.map(kindOf);
  // The band marks offer hours, or busy hours being protected; a no-change day has no window to show.
  const showBand = promo || outlook.focusReason === "capacity-peak";
  const bandStart = indexOf(window.startHour);
  const bandCount = hours.filter((entry) => inWindow(entry.hour, window)).length;
  const weekday = new Date(`${outlook.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });

  const applied = response.contextSignals.filter((signal) => outlook.appliedSignalIds.includes(signal.id));
  const notes = [
    ...applied.map((signal) => {
      const affected = hours.filter((entry) => entry.signalIds.includes(signal.id));
      const start = affected.length ? indexOf(affected[0].hour) : 0;
      return {
        key: signal.id,
        start,
        end: affected.length ? indexOf(affected[affected.length - 1].hour) + 1 : start + 1,
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
        start: bandStart,
        end: bandStart + Math.max(1, bandCount),
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
          </svg>
        ),
        text: `${offer.competitorName.replace(/\s*\(.*\)$/, "")}: ${offer.itemDescription.toLowerCase()}${offer.priceCents !== null ? ` ${money(offer.priceCents)}` : ""}${offer.availability ? `, ${offer.availability}` : ""}`,
        tone: "warn",
      })),
  ];
  // Each note lines up with its hours: from the first hour when they sit in the left half,
  // otherwise ending at the last hour, so the card never runs past the chart and wraps instead.
  const noteStyle = (start: number, end: number) =>
    start / hours.length <= 0.5
      ? { marginLeft: leftOf(start), maxWidth: `calc(100% - ${leftOf(start)})` }
      : { marginLeft: "auto", marginRight: `calc(100% - ${widthOf(end)})`, maxWidth: widthOf(end) };

  return (
    <>
    <div className="legend">
      <span><i className="sw baseline" />Usual {weekday}</span>
      {kinds.includes("") && <span><i className="sw estimate" />Estimate</span>}
      {kinds.includes("up") && <span><i className="sw up" />Above usual</span>}
      {kinds.includes("win") && <span><i className="sw win" />Offer hours</span>}
      {kinds.includes("over") && <span><i className="sw over" />At capacity</span>}
    </div>
    <div className="demand">
      <div className="demand-area">
      {showBand && bandCount > 0 && <div className="window-band" style={{ left: leftOf(bandStart), width: widthOf(bandCount) }} />}
      {notes.length > 0 && (
        <div className="demand-notes">
          {notes.map((note) => (
            <div key={note.key} className={`note ${note.tone}`} style={noteStyle(note.start, note.end)}>
              {note.icon}
              <span>{note.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="demand-plot" role="img" aria-label={`Hourly orders at ${response.location.name}. Peak ${units(peak.scenarioOrders)} at ${hourLabel(peak.hour)}; capacity ${capacity} per hour.`}>
        <div className="cap-line" style={{ bottom: `${(capacity / max) * 100}%` }}>
          <span>capacity {capacity}/hr</span>
        </div>
        <div className="peak-label" style={{ left: leftOf(indexOf(peak.hour)), bottom: `calc(${(peak.scenarioOrders / max) * 100}% + 6px)`, width: widthOf(1) }}>
          {units(Math.round(peak.scenarioOrders))}
        </div>
        {hours.map((entry, index) => (
          <div key={entry.hour} className="col">
            <div className="ghost" style={{ height: `${(entry.baselineOrders / max) * 100}%` }} />
            <div
              className={`est ${kinds[index]}`}
              style={{ height: `${(entry.scenarioOrders / max) * 100}%` }}
              title={`${hourLabel(entry.hour)}: ${units(entry.scenarioOrders)} expected (usual ${units(entry.baselineOrders)})`}
            />
          </div>
        ))}
      </div>
      </div>
      <div className="demand-hours">
        {hours.map((entry) => (
          <span key={entry.hour}>{hourLabel(entry.hour)}</span>
        ))}
      </div>
    </div>
    </>
  );
}
