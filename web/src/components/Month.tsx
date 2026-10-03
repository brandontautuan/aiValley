import type { ContextSignal, OverviewResponse, SavedPlan, ScenarioId } from "../../../contracts/index.ts";
import { api } from "../api.ts";
import { addDays, dateLabel, localDate, money, windowLabel } from "../format.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";
import { SignalIcon } from "./SignalIcon.tsx";

const FORECAST_DAYS = 7;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface MonthData {
  typical: OverviewResponse;
  event: OverviewResponse;
  signals: Array<{ signal: ContextSignal; date: string; location: string }>;
  plans: Record<string, SavedPlan[]>;
  days: string[];
}

function monthDays(date: string): string[] {
  const first = `${date.slice(0, 8)}01`;
  const days: string[] = [];
  for (let day = first; day.slice(0, 7) === first.slice(0, 7); day = addDays(day, 1)) days.push(day);
  return days;
}

async function loadMonth(date: string): Promise<MonthData> {
  const days = monthDays(date);
  const [typical, event] = await Promise.all([api.overview(date, "typical"), api.overview(date, "local-event")]);
  // The local-event scenario carries every dated context record for each store.
  const outlooks = await Promise.all(event.locations.map((summary) => api.outlook(summary.location.id, date, "local-event")));
  const seen = new Set<string>();
  const signals = outlooks.flatMap((outlook) =>
    outlook.contextSignals
      .filter((signal) => !seen.has(signal.dedupeKey) && seen.add(signal.dedupeKey))
      .map((signal) => ({ signal, date: localDate(signal.start, outlook.location.timezone), location: outlook.location.name })),
  );
  const planResponses = await Promise.all(days.map((day) => api.actionPlan(day)));
  const plans = Object.fromEntries(planResponses.map((response) => [response.date, response.plans.filter((plan) => !plan.superseded)]));
  return { typical, event, signals, plans, days };
}

export function Month({ date, scenario }: { date: string; scenario: ScenarioId }) {
  const { data, error } = useLoad(() => loadMonth(date), [date.slice(0, 7), date]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading the month…</p>;

  const monthName = new Date(`${data.days[0]}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const lastForecast = addDays(date, FORECAST_DAYS - 1);
  const firstWeekday = (new Date(`${data.days[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const leading = Array.from({ length: firstWeekday }, (_, index) => addDays(data.days[0], index - firstWeekday));
  const trailingCount = (7 - ((leading.length + data.days.length) % 7)) % 7;
  const trailing = Array.from({ length: trailingCount }, (_, index) => addDays(data.days[data.days.length - 1], index + 1));
  const cells = [...leading, ...data.days, ...trailing];
  const inMonth = new Set(data.days);
  const weekday = dateLabel(date).split(",")[0];
  const planCount = Object.values(data.plans).reduce((total, plans) => total + plans.length, 0);
  const monthSignals = data.signals.filter((entry) => inMonth.has(entry.date));

  return (
    <section>
      <div className="hero">
        <div>
          <h1>{monthName}</h1>
          <p className="muted lead">Known events, holidays and saved plans. Order estimates are shown only for the next 7 days (see Week).</p>
        </div>
      </div>
      <div className="notice info">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v.5M12 11v6" />
        </svg>
        <span>Beyond the next 7 days this is a planning calendar, not a forecast: the usual weekly pattern plus known events. Eight weeks of history cannot predict holiday effects.</span>
      </div>

      <div className="split">
        <div className="panel cal-wrap">
          <div className="cal">
            {WEEKDAYS.map((name) => (
              <div key={name} className="dow">{name}</div>
            ))}
            {cells.map((day) => {
              const events = data.signals.filter((entry) => entry.date === day);
              const plans = data.plans[day] ?? [];
              const cls = !inMonth.has(day) ? "out" : day < date ? "past" : day <= lastForecast ? "forecast" : "";
              return (
                <a key={day} className={`day ${cls}`} href={hrefFor("/", { date: day, scenario })} aria-label={`${dateLabel(day)}: ${events.length} events, ${plans.length} saved plans`}>
                  <span className="num">{Number(day.slice(8))}</span>
                  {events.map(({ signal, location }) => (
                    <span key={signal.id} className={`ev ${signal.type}`} title={signal.title}>
                      <SignalIcon type={signal.type} size={12} />
                      {signal.type === "holiday" ? signal.title.replace(/\s*\(.*\)$/, "") : `${signal.type === "weather" ? "Weather" : "Event"} · ${location}`}
                    </span>
                  ))}
                  {plans.map((plan) => (
                    <span key={plan.id} className="ev plan">
                      {plan.locationName}: {plan.finalTerms.kind === "discount" ? `${plan.finalTerms.terms.discountPct}% ${windowLabel(plan.finalTerms.terms.window)}` : "hold price"}
                    </span>
                  ))}
                </a>
              );
            })}
          </div>
          <div className="legend footnote">
            <span><i className="sw ev-event" />Event (fixture)</span>
            <span><i className="sw ev-weather" />Weather</span>
            <span><i className="sw ev-holiday" />Holiday, dated by year and region</span>
            <span><i className="sw ev-plan" />Saved plan</span>
            <span><i className="sw outline" />Next 7 days</span>
          </div>
        </div>

        <aside className="detail-stack">
          <div className="panel">
            <h2>Usual weekly pattern</h2>
            <p className="muted small">From the 8 weeks of history before {dateLabel(date)}</p>
            {data.typical.locations.map((summary) => {
              const event = data.event.locations.find((entry) => entry.location.id === summary.location.id)!;
              return (
                <div key={summary.location.id} className="kv">
                  <strong>{summary.location.name}</strong>
                  <span>
                    {summary.selectedKind === "discount"
                      ? `Quiet ${windowLabel(summary.focusWindow)} on a usual ${weekday}: the most reliable promotion window.`
                      : `No unusually quiet window on a usual ${weekday}.`}
                    {event.classification === "constrained" && ` On event days it reaches capacity ${windowLabel(event.focusWindow)}.`}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="panel">
            <h2>This month at a glance</h2>
            <div className="kv">
              <span className="num big">{monthSignals.filter((entry) => entry.signal.type === "event").length}</span>
              <span>events in the fixtures</span>
            </div>
            <div className="kv">
              <span className="num big">{monthSignals.filter((entry) => entry.signal.type === "holiday").length}</span>
              <span>holidays (any effect is an editable assumption)</span>
            </div>
            <div className="kv">
              <span className="num big">{planCount}</span>
              <span>saved plans</span>
            </div>
            {planCount > 0 && (
              <p className="muted small">
                Promotions saved:{" "}
                {Object.values(data.plans)
                  .flat()
                  .filter((plan) => plan.finalTerms.kind === "discount")
                  .map((plan) => `${plan.locationName} ${money(plan.finalTerms.proposedPriceCents)}`)
                  .join(", ") || "none"}
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
