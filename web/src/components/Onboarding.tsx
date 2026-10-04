import { useEffect, useState } from "react";
import type { LocationOutlookResponse, MenuItem, OverviewResponse, ScenarioId } from "../../../contracts/index.ts";
import { api } from "../api.ts";
import { dateLabel, hour, money, windowLabel } from "../format.ts";
import { hrefFor } from "../nav.ts";
import { useLoad } from "../useLoad.ts";
import { MiniChart } from "./MiniChart.tsx";
import { UiIcon } from "./UiIcon.tsx";

/**
 * Demo-only setup walk-through. Every step is prefilled from the same API data the
 * planner uses, nothing is saved, and the last step returns to Daily planning.
 */

// The API does not expose chain policy yet; these mirror the demo chain's policy in data/fixtures.ts.
const DEMO_POLICY = { maxDiscountPct: 10, minContributionPerUnitCents: 300, costFreshnessDays: 45 };
const SALES_SYSTEMS = ["Square", "Toast", "Clover"];
// Demo: the business name the sales system "returns" once connected.
const DEMO_BUSINESS = "Disney Cafe";
const STEPS = ["Connect sales", "Confirm stores", "Promotable items", "Item costs", "Discount limits", "Capacity", "Ready"];

interface SetupData {
  overview: OverviewResponse;
  outlooks: LocationOutlookResponse[];
  menu: MenuItem[];
}

async function loadSetup(date: string): Promise<SetupData> {
  // The usual pattern, so the preview shows a normal week rather than an event day.
  const overview = await api.overview(date, "typical");
  const outlooks = await Promise.all(overview.locations.map((summary) => api.outlook(summary.location.id, date, "typical")));
  // Each outlook carries only that store's items, so merge them into the chain menu.
  const menu = [...new Map(outlooks.flatMap((outlook) => outlook.menu).map((item) => [item.id, item])).values()];
  return { overview, outlooks, menu };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function Onboarding({ date, scenario }: { date: string; scenario: ScenarioId }) {
  const { data, error, reload } = useLoad(() => loadSetup(date), [date]);
  const [step, setStep] = useState(0);
  const [salesSystem, setSalesSystem] = useState(SALES_SYSTEMS[0]);
  const [eligible, setEligible] = useState<Record<string, boolean> | null>(null);
  const [maxDiscount, setMaxDiscount] = useState(DEMO_POLICY.maxDiscountPct);
  const [connected, setConnected] = useState(false);

  // Simulated connection: a short pause, then the business is recognised. Switching systems reconnects.
  useEffect(() => {
    setConnected(false);
    const timer = setTimeout(() => setConnected(true), 1200);
    return () => clearTimeout(timer);
  }, [salesSystem]);

  const head = (
    <div className="hero daily-hero">
      <div>
        <span className="eyebrow">Store setup · step {step + 1} of {STEPS.length}</span>
        <h1>{step === 0 && connected ? `Welcome, ${DEMO_BUSINESS}.` : TITLES[step]}</h1>
        <p className="muted lead">{step === 0 && connected ? `We found your business in ${salesSystem} and imported what we need. Here’s a first look.` : LEADS[step]}</p>
      </div>
    </div>
  );
  if (error) return <section>{head}<div className="error" role="alert"><p>We couldn’t load your stores. {error}</p><button onClick={reload}>Try again</button></div></section>;
  if (!data) return <section>{head}<p role="status" className="muted">Reading your sales system…</p></section>;

  const { outlooks, menu } = data;
  const picked = eligible ?? Object.fromEntries(menu.map((item) => [item.id, item.offerEligible]));
  const promotable = menu.filter((item) => picked[item.id]);
  const weekday = dateLabel(date).split(",")[0];
  const weeks = outlooks[0]?.outlook.observationCount ?? 0;
  const go = (next: number) => {
    setStep(next);
    window.scrollTo(0, 0);
  };

  const views = [
    // 1. Connect sales
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Sales system</h2>
          {connected ? <span className="badge ok"><UiIcon name="check" size={14} />Connected · read-only</span> : <span className="badge">Connecting to {salesSystem}…</span>}
        </div>
        <div className="seg compact" role="group" aria-label="Sales system">
          {SALES_SYSTEMS.map((name) => (
            <button key={name} className={name === salesSystem ? "on" : ""} aria-pressed={name === salesSystem} onClick={() => setSalesSystem(name)}>{name}</button>
          ))}
        </div>
        {connected ? <ul className="onboard-checks">
          <li><span className="check ok"><UiIcon name="check" size={14} /></span>{DEMO_BUSINESS} · {outlooks.length} stores: {outlooks.map((outlook) => outlook.location.name).join(", ")}</li>
          <li><span className="check ok"><UiIcon name="check" size={14} /></span>{menu.length} menu items with prices</li>
          <li><span className="check ok"><UiIcon name="check" size={14} /></span>{weeks} weeks of hourly sales for each store</li>
        </ul> : <p role="status" className="muted onboard-note">Signing in to {salesSystem} and reading your menu, hours and sales…</p>}
      </div>
      {connected && <>
      <h2 className="onboard-subhead">An early look: a usual {weekday}</h2>
      <div className="cards store-cards">
        {outlooks.map((outlook) => {
          const soft = outlook.outlook.focusReason === "soft-window";
          return (
            <article key={outlook.location.id} className="card">
              <div className="card-head"><h2>{outlook.location.name}</h2></div>
              <MiniChart hours={outlook.outlook.hours} highlight={soft ? outlook.outlook.focusWindow : null} label={`${outlook.location.name} usual hourly orders`} />
              <p className="small">{soft ? <>Quietest stretch: <strong>{windowLabel(outlook.outlook.focusWindow)}</strong>. That’s where an offer can help most.</> : "No clearly quiet stretch on a usual day."}</p>
            </article>
          );
        })}
      </div>
      </>}
    </>,

    // 2. Confirm stores
    <div className="cards store-cards">
      {outlooks.map(({ location }) => (
        <article key={location.id} className="card">
          <div className="card-head"><h2>{location.name}</h2><span className="badge">{location.timezone.split("/")[1].replace("_", " ")} time</span></div>
          <p className="small">{location.profile}</p>
          <div className="editor onboard-editor">
            <label>Opens<select defaultValue={location.openingHours.open}>{HOUR_OPTIONS.map((value) => <option key={value} value={value}>{hour(value)}</option>)}</select></label>
            <label>Closes<select defaultValue={location.openingHours.close}>{HOUR_OPTIONS.map((value) => <option key={value} value={value}>{hour(value)}</option>)}</select></label>
          </div>
        </article>
      ))}
    </div>,

    // 3. Promotable items
    <div className="panel">
      <ul className="onboard-list">
        {menu.map((item) => (
          <li key={item.id}>
            <label className="onboard-item">
              <input type="checkbox" checked={picked[item.id]} onChange={(event) => setEligible({ ...picked, [item.id]: event.target.checked })} />
              <span><strong>{item.name}</strong><span className="muted small"> · {CATEGORY[item.category]} · {storeNames(item, outlooks)}</span></span>
              <span className="num">{money(item.regularPriceCents)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="small muted onboard-note">{promotable.length} of {menu.length} items can be promoted. The rest stay at their regular price.</p>
    </div>,

    // 4. Item costs
    <div className="panel">
      <div className="chart-scroll onboard-table-wrap">
        <table className="onboard-table">
          <thead><tr><th>Item</th><th className="r">Price</th><th className="r">Cost to make</th><th>Last updated</th></tr></thead>
          <tbody>
            {promotable.map((item) => {
              const age = item.costUpdatedAt ? daysBetween(item.costUpdatedAt.slice(0, 10), date) : null;
              const stale = age === null || age > DEMO_POLICY.costFreshnessDays;
              return (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td className="r num">{money(item.regularPriceCents)}</td>
                  <td className="r"><input className="num" aria-label={`Cost to make ${item.name}`} defaultValue={item.variableCostCents === null ? "" : (item.variableCostCents / 100).toFixed(2)} /></td>
                  <td>{item.costUpdatedAt ? <span className={`badge ${stale ? "danger" : "ok"}`}>{stale ? `Recheck · ${shortDay(item.costUpdatedAt)}` : shortDay(item.costUpdatedAt)}</span> : <span className="badge danger">Missing</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted onboard-note">Cost covers ingredients, cup or packaging and card fees. Costs older than {DEMO_POLICY.costFreshnessDays} days are flagged, and plans won’t use them until they’re rechecked.</p>
    </div>,

    // 5. Discount limits
    <div className="panel onboard-questions">
      <div>
        <h3>Biggest discount you’d ever run</h3>
        <div className="seg compact" role="group" aria-label="Biggest discount">
          {[5, 10, 15, 20].map((value) => (
            <button key={value} className={value === maxDiscount ? "on" : ""} aria-pressed={value === maxDiscount} onClick={() => setMaxDiscount(value)}>{value}% off</button>
          ))}
        </div>
      </div>
      <div>
        <h3>Least you want to make on each item during an offer</h3>
        <div className="editor onboard-editor"><label>Per item, after costs<input className="num" defaultValue={(DEMO_POLICY.minContributionPerUnitCents / 100).toFixed(2)} aria-label="Minimum made per item" /></label></div>
      </div>
      <div>
        <h3>Never discounted</h3>
        <p className="small muted">{menu.filter((item) => !picked[item.id]).map((item) => item.name).join(", ") || "Nothing excluded"}. Change this in Promotable items.</p>
      </div>
    </div>,

    // 6. Capacity
    <div className="cards store-cards">
      {outlooks.map(({ location, outlook }) => {
        const peak = outlook.hours.reduce((best, entry) => (entry.baselineOrders > best.baselineOrders ? entry : best), outlook.hours[0]);
        return (
          <article key={location.id} className="card">
            <div className="card-head"><h2>{location.name}</h2></div>
            <div className="stats">
              <div><span className="stat">{Math.round(peak.baselineOrders)}</span><span className="muted small">usual busiest hour ({hour(peak.hour)})</span></div>
              <div><span className="stat">{location.hourlyCapacityOrders}</span><span className="muted small">most orders per hour</span></div>
            </div>
            <div className="editor onboard-editor"><label>Orders you can serve in an hour<input className="num" type="number" min={1} defaultValue={location.hourlyCapacityOrders} /></label></div>
          </article>
        );
      })}
    </div>,

    // 7. Ready
    <div className="panel">
      <ul className="onboard-checks">
        <li><span className="check ok"><UiIcon name="check" size={14} /></span>Sales connected through {salesSystem}: {weeks} weeks of history, refreshed nightly</li>
        <li><span className="check ok"><UiIcon name="check" size={14} /></span>{outlooks.length} stores confirmed with hours and capacity</li>
        <li><span className="check ok"><UiIcon name="check" size={14} /></span>{promotable.length} promotable items with costs</li>
        <li><span className="check ok"><UiIcon name="check" size={14} /></span>Up to {maxDiscount}% off, keeping at least {money(DEMO_POLICY.minContributionPerUnitCents)} per item</li>
      </ul>
      <p className="small muted onboard-note">Demo only: these answers aren’t saved. Daily planning uses the existing demo data.</p>
    </div>,
  ];

  return (
    <section className="onboarding">
      {head}
      <ol className="steps onboard-steps" aria-label="Setup steps">
        {STEPS.map((label, index) => (
          <li key={label} className={`step ${index < step ? "done" : ""} ${index === step ? "current" : ""}`} aria-current={index === step ? "step" : undefined}>
            {index < step && <UiIcon name="check" size={14} />}
            {label}
          </li>
        ))}
      </ol>
      {views[step]}
      <div className="actions onboard-nav">
        {step > 0 ? <button onClick={() => go(step - 1)}>Back</button> : <a className="button" href={hrefFor("/", { date, scenario })}>Skip setup</a>}
        {step < STEPS.length - 1 ? (
          <button className="primary" onClick={() => go(step + 1)}>Continue<UiIcon name="arrowRight" /></button>
        ) : (
          <a className="button primary" href={hrefFor("/", { date, scenario })}>Go to daily planning<UiIcon name="arrowRight" /></a>
        )}
      </div>
    </section>
  );
}

const TITLES = [
  "Connect your sales system.",
  "Are these your stores?",
  "Which items can go on offer?",
  "What does each item cost to make?",
  "Set your discount limits.",
  "How busy can each store get?",
  "You’re set up.",
];

const LEADS = [
  "We read your menu, hours and past sales. Nothing is changed in your account.",
  "We filled these in from your sales system. Fix anything that’s off.",
  "We picked these from your sales. Only these need a cost in the next step.",
  "We need this to know whether a discount still makes money.",
  "Plans never go past these. You can change them anytime.",
  "We won’t suggest offers for hours that are already near this limit.",
  "Your first suggestions are ready in Daily planning.",
];

const HOUR_OPTIONS = Array.from({ length: 19 }, (_, index) => index + 5);
const CATEGORY: Record<MenuItem["category"], string> = { coffee: "Coffee", food: "Food", bundle: "Bundle" };

function storeNames(item: MenuItem, outlooks: LocationOutlookResponse[]): string {
  const names = outlooks.filter((outlook) => item.eligibleLocationIds.includes(outlook.location.id)).map((outlook) => outlook.location.name);
  return names.length === outlooks.length ? "All stores" : names.join(", ");
}
