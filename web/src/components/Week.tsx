import { useState } from "react";
import type { ContextSignal, LocationOutlookResponse, ScenarioId } from "../../../contracts/index.ts";
import { api } from "../api.ts";
import { addDays, dateLabel, pct, shortDate } from "../format.ts";
import { actionLabel, dayparts, selectedCandidate, STATE_LABEL, type DaypartState } from "../insights.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";
import { SignalIcon } from "./SignalIcon.tsx";

const DAYS = 7;

interface WeekData {
  dates: string[];
  locations: Array<{ id: string; name: string; capacity: number }>;
  /** cells[locationId][date] */
  cells: Record<string, Record<string, LocationOutlookResponse>>;
}

async function loadWeek(start: string, scenario: ScenarioId): Promise<WeekData> {
  const dates = Array.from({ length: DAYS }, (_, index) => addDays(start, index));
  const overview = await api.overview(start, scenario);
  const locations = overview.locations
    .map((summary) => summary.location)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((location) => ({ id: location.id, name: location.name, capacity: location.hourlyCapacityOrders }));
  const responses = await Promise.all(locations.flatMap((location) => dates.map((date) => api.outlook(location.id, date, scenario))));
  const cells: WeekData["cells"] = {};
  for (const response of responses) (cells[response.location.id] ??= {})[response.outlook.date] = response;
  return { dates, locations, cells };
}

/** Context records that change demand on a date, one per dedupe key. */
function dayEvents(data: WeekData, date: string): Array<{ signal: ContextSignal; location: string }> {
  const seen = new Set<string>();
  return data.locations.flatMap((location) => {
    const response = data.cells[location.id][date];
    return response.contextSignals
      .filter((signal) => response.outlook.appliedSignalIds.includes(signal.id) && !seen.has(signal.dedupeKey) && seen.add(signal.dedupeKey))
      .map((signal) => ({ signal, location: location.name }));
  });
}

const SWATCHES: DaypartState[] = ["low", "usual", "high", "cap"];

export function Week({ date, scenario }: { date: string; scenario: ScenarioId }) {
  const { data, error, loading } = useLoad(() => loadWeek(date, scenario), [date, scenario]);
  const [picked, setPicked] = useState<{ locationId: string; date: string } | null>(null);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading the week… (one outlook per store and day)</p>;

  const all = data.locations.flatMap((location) => data.dates.map((day) => ({ location, date: day, response: data.cells[location.id][day] })));
  const promos = all.filter((cell) => selectedCandidate(cell.response).kind === "discount");
  const crunches = all.filter((cell) => cell.response.outlook.classification === "constrained");
  // Promotion fatigue: the same store discounted three or more days in a row.
  const fatigued = data.locations.filter((location) => {
    let run = 0;
    return data.dates.some((day) => {
      run = selectedCandidate(data.cells[location.id][day]).kind === "discount" ? run + 1 : 0;
      return run >= 3;
    });
  });
  const first = promos[0] ?? crunches[0] ?? all[0];
  const current = picked && data.cells[picked.locationId]?.[picked.date] ? picked : { locationId: first.location.id, date: first.date };
  const selResponse = data.cells[current.locationId][current.date];
  const selSelected = selectedCandidate(selResponse);
  const selParts = dayparts(selResponse);

  return (
    <section className={loading ? "loading" : ""}>
      <div className="hero">
        <div>
          <h1>
            This week: {shortDate(data.dates[0])} – {shortDate(data.dates[DAYS - 1])}
          </h1>
          <p className="muted lead">Each cell is lunch, afternoon and evening, compared with that store's usual weekday. Pick a cell to see why.</p>
        </div>
        <div className="legend">
          {SWATCHES.map((state) => (
            <span key={state}>
              <i className={`sw p-${state}`} />
              {STATE_LABEL[state]}
            </span>
          ))}
        </div>
      </div>

      <div className="pills">
        <div className="pill-card">
          <span className="pill-num warn">{promos.length}</span>
          <span>
            quiet windows worth a promotion
            <br />
            <span className="muted small">{[...new Set(promos.map((cell) => cell.location.name))].join(", ") || "None this week"}</span>
          </span>
        </div>
        <div className="pill-card">
          <span className={`pill-num ${crunches.length ? "danger" : ""}`}>{crunches.length}</span>
          <span>
            capacity crunches
            <br />
            <span className="muted small">{crunches.map((cell) => `${cell.location.name} ${dateLabel(cell.date).slice(0, 3)}`).join(", ") || "None in this scenario"}</span>
          </span>
        </div>
        {fatigued.length > 0 && (
          <div className="pill-card wide">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="warn-icon" aria-hidden>
              <path d="M12 3l9 16H3z M12 10v4 M12 17v.5" />
            </svg>
            <span>
              <strong>Promotion fatigue:</strong> {fatigued.map((location) => location.name).join(", ")} would be discounted three or more days running, which trains
              customers to wait. Consider alternating days.
            </span>
          </div>
        )}
      </div>

      <div className="split">
        <div className="panel heat-wrap">
          <div className="heat" style={{ gridTemplateColumns: `150px repeat(${DAYS}, minmax(96px, 1fr))` }}>
            <div />
            {data.dates.map((day) => (
              <div key={day} className="dayhead">
                <strong>{dateLabel(day).split(",")[0].slice(0, 3)} {Number(day.slice(8))}</strong>
                {dayEvents(data, day).map(({ signal, location }) => (
                  <span key={signal.id} className="tag info" title={signal.title}>
                    <SignalIcon type={signal.type} size={12} />
                    {signal.type === "weather" ? "Weather" : signal.type === "holiday" ? "Holiday" : "Event"} · {location}
                  </span>
                ))}
              </div>
            ))}
            {data.locations.map((location) => (
              <div key={location.id} className="heat-row">
                <div className="rowhead">
                  <strong>{location.name}</strong>
                  <span className="muted small">capacity {location.capacity}/hr</span>
                </div>
                {data.dates.map((day) => {
                  const response = data.cells[location.id][day];
                  const isSel = current.date === day && current.locationId === location.id;
                  return (
                    <button
                      key={day}
                      className={`cell ${isSel ? "sel" : ""}`}
                      onClick={() => setPicked({ locationId: location.id, date: day })}
                      aria-pressed={isSel}
                      aria-label={`${location.name}, ${dateLabel(day)}: ${Math.round(response.outlook.totals.scenarioOrders)} orders`}
                    >
                      <span className="cell-num">
                        {Math.round(response.outlook.totals.scenarioOrders)} <span className="muted">{pct(response.outlook.changeVsUsual)}</span>
                      </span>
                      {dayparts(response).map((part) => (
                        <span key={part.name} className={`part p-${part.state}`}>
                          <span>{part.short}</span>
                          <span>{part.state === "low" ? "promo" : part.state === "cap" ? "full" : ""}</span>
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="muted small footnote">
            Next 7 days only: the same-weekday baseline plus context records in the fixtures. Days without records show the usual pattern. For later dates, see Month.
          </p>
        </div>

        <aside className="panel detail">
          <span className="eyebrow">Selected</span>
          <h2>
            {selResponse.location.name} · {dateLabel(selResponse.outlook.date)}
          </h2>
          <div className="stats">
            <div>
              <span className="stat">{Math.round(selResponse.outlook.totals.scenarioOrders)}</span>
              <span className="muted small">orders expected</span>
            </div>
            <div>
              <span className="stat">{pct(selResponse.outlook.changeVsUsual)}</span>
              <span className="muted small">vs. usual</span>
            </div>
          </div>
          {selParts.map((part) => (
            <div key={part.name} className="part-row">
              <span className={`part p-${part.state}`}>{part.name}</span>
              <span className="num small">{part.orders} orders</span>
            </div>
          ))}
          <p>{selResponse.selection.reason}</p>
          <div className={`action ${selSelected.kind === "discount" ? "promo" : selResponse.outlook.focusReason === "capacity-peak" ? "hold" : ""}`}>
            <span className="muted small">Suggested</span>
            <strong>{actionLabel(selSelected, selResponse.outlook)}</strong>
          </div>
          <a className="button primary" href={hrefFor(`/location/${selResponse.location.id}`, { date: selResponse.outlook.date, scenario })}>
            Open day review
          </a>
        </aside>
      </div>
    </section>
  );
}
