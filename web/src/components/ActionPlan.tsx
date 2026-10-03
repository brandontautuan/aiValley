import { useState } from "react";
import type { Location, SavedPlan, ScenarioId } from "../../../contracts/index.ts";
import { api } from "../api.ts";
import { brand } from "../brand.ts";
import { addDays, dateLabel, hour, localTime, money, scenarioLabel, shortDate, timestamp, windowLabel } from "../format.ts";
import { isCapacityHold } from "../insights.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";

const DAYS = 7;

async function loadPlans(date: string, scenario: ScenarioId) {
  const dates = Array.from({ length: DAYS }, (_, index) => addDays(date, index));
  const [overview, ...plans] = await Promise.all([api.overview(date, scenario), ...dates.map((day) => api.actionPlan(day))]);
  return {
    locations: overview.locations.map((summary) => summary.location).sort((a, b) => a.name.localeCompare(b.name)),
    dates,
    plans: Object.fromEntries(plans.map((response) => [response.date, response.plans])) as Record<string, SavedPlan[]>,
  };
}

function planText(plan: SavedPlan): string {
  const terms = plan.finalTerms;
  if (terms.kind === "discount") return `${terms.itemName} ${money(terms.proposedPriceCents)} (${terms.terms.discountPct}% off ${money(terms.regularPriceCents)}), ${windowLabel(terms.terms.window)}`;
  return isCapacityHold(terms) ? `Keep regular prices; protect capacity ${windowLabel(terms.terms.window)}` : "Keep regular prices";
}

export function ActionPlan({ date, scenario }: { date: string; scenario: ScenarioId }) {
  const { data, error } = useLoad(() => loadPlans(date, scenario), [date, scenario]);
  const [day, setDay] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading the action plan…</p>;

  const current = day && data.dates.includes(day) ? day : data.dates[0];
  const dayPlans = data.plans[current] ?? [];
  const active = dayPlans.filter((plan) => !plan.superseded);
  const history = dayPlans.filter((plan) => plan.superseded);
  const first = Math.min(...data.locations.map((location) => location.openingHours.open));
  const last = Math.max(...data.locations.map((location) => location.openingHours.close));
  const span = last - first;
  const pos = (value: number) => `${((value - first) / span) * 100}%`;
  const width = (from: number, to: number) => `${((to - from) / span) * 100}%`;

  async function copyPlan() {
    const lines = [`${brand.name} plan for ${dateLabel(current)} (saved terms, not yet published):`, ...active.map((plan) => `- ${plan.locationName}: ${planText(plan)}`)];
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError("Copying was blocked by your browser. You can select and copy the plan details below.");
      setCopied(false);
    }
  }

  return (
    <section>
      <div className="hero">
        <div>
          <h1>
            Saved plans
          </h1>
          <p className="muted lead">{dateLabel(current)} · Decisions for your team. Prices and posts still need to be updated outside this app.</p>
        </div>
        <div className="actions">
          <button disabled={active.length === 0} onClick={copyPlan}>{copied ? "Copied" : "Copy plan as text"}</button>
        </div>
      </div>

      {copyError && <p className="error" role="alert">{copyError}</p>}
      <div className="day-tabs" role="tablist" aria-label="Day">
        {data.dates.map((entry) => {
          const count = (data.plans[entry] ?? []).filter((plan) => !plan.superseded).length;
          return (
            <button key={entry} role="tab" aria-selected={entry === current} className={entry === current ? "on" : ""} onClick={() => setDay(entry)}>
              <strong>{shortDate(entry).replace(",", "")}</strong>
              <span className="small">{count ? `${count} saved` : "—"}</span>
            </button>
          );
        })}
      </div>

      {active.length > 0 && <details className="panel disclosure">
        <summary><strong>See the day’s schedule</strong><span>View saved decisions and suggested posting times by store.</span></summary>
        <div className="timeline-wrap">
        <div className="tl">
          <div className="tl-row tl-scale">
            <span />
            <div className="tl-ticks">
              {Array.from({ length: span }, (_, index) => (
                <span key={index}>{hour(first + index)}</span>
              ))}
            </div>
          </div>
          {data.locations.map((location) => (
            <TimelineRow key={location.id} location={location} plan={active.find((plan) => plan.locationId === location.id)} pos={pos} width={width} />
          ))}
        </div>
      </div>

      </details>}

      {active.length === 0 ? (
        <div className="panel empty">
          <p>No approved plans for {dateLabel(current)} yet.</p>
          <a href={hrefFor("/", { date: current, scenario })}>Review the stores for that day →</a>
        </div>
      ) : (
        <div className="cards">
          {active.map((plan) => (
            <article key={plan.id} className="card">
              <div className="card-head">
                <h2>{plan.locationName}</h2>
                <span className="badge ok">Saved</span>
              </div>
              <p>
                <strong>{planText(plan)}</strong>
                {plan.finalTerms.breakEvenUnits !== null && (
                  <>
                    <br />
                    <span className="muted small">
                      Needs {plan.finalTerms.breakEvenUnits} item sales to match regular pricing · {scenarioLabel(plan.scenario)}
                    </span>
                  </>
                )}
              </p>
              {plan.socialDraft ? (
                <details><summary>View saved social caption</summary><blockquote className="caption small">{plan.socialDraft.caption}</blockquote></details>
              ) : (
                <p className="muted small">{plan.finalTerms.kind === "discount" ? "No post saved with this plan." : "No post: there is no offer to promote."}</p>
              )}
              <p className="muted small">Approved {timestamp(plan.decidedAt)}</p>
              <a className="link" href={hrefFor(`/location/${plan.locationId}`, { date: plan.planningDate, scenario: plan.scenario })}>
                Open {plan.locationName} →
              </a>
            </article>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <details className="panel">
          <summary>
            {history.length} earlier approval{history.length === 1 ? "" : "s"} replaced by newer revisions or dismissed
          </summary>
          <ul className="small">
            {history.map((plan) => (
              <li key={plan.id}>
                {plan.locationName} rev {plan.revision}: {planText(plan)} (approved {timestamp(plan.decidedAt)})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function TimelineRow({ location, plan, pos, width }: { location: Location; plan: SavedPlan | undefined; pos: (value: number) => string; width: (from: number, to: number) => string }) {
  const terms = plan?.finalTerms;
  const hold = terms ? isCapacityHold(terms) : false;
  const label = !plan ? "Not decided yet" : terms!.kind === "discount" ? "Promotion" : hold ? "Protect capacity" : "No change";
  return (
    <div className="tl-row">
      <div>
        <strong>{location.name}</strong>
        <br />
        <span className="muted small">{label}</span>
      </div>
      <div className="track">
        <div className="open" style={{ left: pos(location.openingHours.open), width: width(location.openingHours.open, location.openingHours.close) }}>
          {plan && terms!.kind === "no-change" && !hold && <span className="open-label">Regular prices all day</span>}
          {!plan && <span className="open-label">Open {location.openingHours.open}:00–{location.openingHours.close}:00</span>}
        </div>
        {plan && plan.socialDraft && (
          <div className="pin" style={{ left: pos(Number(new Date(plan.socialDraft.postAt).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: location.timezone }))) }}>
            <span>Post {localTime(plan.socialDraft.postAt, location.timezone)}</span>
          </div>
        )}
        {terms && (terms.kind === "discount" || hold) && (
          <div className={`blk ${terms.kind === "discount" ? "promo" : "hold"}`} style={{ left: pos(terms.terms.window.startHour), width: width(terms.terms.window.startHour, terms.terms.window.endHour) }}>
            <strong>{terms.kind === "discount" ? `${terms.itemName} ${money(terms.proposedPriceCents)}` : "Hold price, no promo"}</strong>
            <span>
              {terms.kind === "discount" ? `${terms.terms.discountPct}% off · ` : "At capacity · "}
              {windowLabel(terms.terms.window)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
