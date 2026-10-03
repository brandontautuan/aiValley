import { hrefFor, type ViewParams } from "../nav.ts";
import { SponsorLogo, SponsorTag, type Sponsor } from "./SponsorTag.tsx";
import { UiIcon } from "./UiIcon.tsx";

type StepKind = "data" | "rules" | "zoowork" | "checks" | "human";

const KIND_LABEL: Record<StepKind, string> = {
  data: "Our data",
  rules: "Fixed rules",
  zoowork: "ZooWork agent",
  checks: "Safety checks",
  human: "You decide",
};

const STEPS: Array<{ kind: StepKind; title: string; text: string }> = [
  { kind: "data", title: "Local data", text: "Past orders, weather, holidays and events for each store." },
  { kind: "rules", title: "Pricing engine", text: "Forecasts demand and works out the economics of each offer. Prices are never set by AI." },
  { kind: "zoowork", title: "ZooWork agents", text: "Explain the recommendation, write the Instagram draft, and rank multi-day marketing actions." },
  { kind: "checks", title: "Checks", text: "Prices, percentages, evidence and weekday in the text must match the offer, or a labeled template is used." },
  { kind: "human", title: "Manager review", text: "Edit, approve or dismiss. Approving saves a plan only. Nothing is published." },
];

type SponsorCard = {
  sponsor: Sponsor;
  headline: string;
  does: string[];
  where: Array<{ label: string; path: string }>;
  fallback: string;
};

const CARDS: SponsorCard[] = [
  {
    sponsor: "tavily",
    headline: "Live public-web research for each store",
    does: [
      "Searches the open web for nearby competitors' offers and for public review pages about them.",
      "Returns attributed sources with links, retrieval dates and limitations, so every claim can be checked.",
      "Stays context only. A search result is never treated as a verified offer and never changes a price.",
    ],
    where: [
      { label: "Open a store, then use “Check public sources” and “Competitor reviews”", path: "/" },
    ],
    fallback: "If Tavily is not configured or is unavailable, the panel says so and planning continues with the fixture data.",
  },
  {
    sponsor: "zoowork",
    headline: "AI agents that explain, write and plan",
    does: [
      "A content agent turns the numbers into a plain-language explanation and an Instagram caption with a creative brief.",
      "A strategy agent gathers research records and ranks marketing actions for a multi-day horizon.",
      "Every reply is checked against the offer before it is shown, and tagged so you can tell AI text from a template.",
    ],
    where: [
      { label: "Open a store, then generate the explanation and social draft", path: "/" },
      { label: "Build a strategy run on the Strategy tab", path: "/strategy" },
    ],
    fallback: "If the agent is unavailable or its reply fails the checks, a built-in template is used and labeled “Template (AI unavailable)”.",
  },
];

/** A plain-language map of where each sponsor service is used, and what protects the operator. */
export function HowItWorks({ params }: { params: ViewParams }) {
  return (
    <section className="how">
      <div className="page-head">
        <span className="eyebrow">Under the hood</span>
        <h1>How this planner uses ZooWork and Tavily</h1>
        <p className="muted">
          The planner mixes fixed pricing rules with two outside services. This page shows which part does what, where to see it in the app,
          and what stops a wrong answer from reaching a customer.
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>From data to saved plan</h2>
        </div>
        <ol className="flow" aria-label="Planning pipeline">
          {STEPS.map((step, index) => (
            <li key={step.title} className={`flow-step ${step.kind}`}>
              <span className="flow-kind">{KIND_LABEL[step.kind]}</span>
              <strong>{step.title}</strong>
              <p className="small muted">{step.text}</p>
              {index < STEPS.length - 1 && <UiIcon className="flow-arrow" name="arrowRight" size={18} />}
            </li>
          ))}
        </ol>
        <div className="flow-side">
          <SponsorTag sponsor="tavily" label="Tavily" />
          <p className="small">
            <strong>Side input to manager review.</strong> Public-web sources are shown next to the recommendation as evidence to read. They
            do not feed the pricing engine.
          </p>
        </div>
      </div>

      <div className="how-cards">
        {CARDS.map((card) => (
          <article key={card.sponsor} className={`panel how-card ${card.sponsor}`}>
            <SponsorLogo sponsor={card.sponsor} height={28} />
            <h2>{card.headline}</h2>
            <ul>
              {card.does.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="small"><strong>See it live</strong></p>
            <ul className="how-links">
              {card.where.map((link) => (
                <li key={link.path + link.label}>
                  <a className="link" href={hrefFor(link.path, params)}>{link.label} <UiIcon name="arrowRight" size={14} /></a>
                </li>
              ))}
            </ul>
            <p className="how-fallback small muted"><strong>If it is not available:</strong> {card.fallback}</p>
          </article>
        ))}
      </div>

      <div className="panel guardrails">
        <div className="panel-head">
          <h2><UiIcon name="shield" size={20} /> Guardrails</h2>
        </div>
        <ul>
          <li><strong>Pricing is deterministic.</strong> Money stays in cents and the economics are calculated by fixed rules, not generated text.</li>
          <li><strong>AI text is checked.</strong> A draft that quotes a price, percentage or evidence reference the offer does not support, or names the wrong day, is rejected.</li>
          <li><strong>Fallbacks are labeled.</strong> You always see whether text came from an agent or a template, and whether a strategy run used ZooWork.</li>
          <li><strong>You stay in control.</strong> Approval saves a plan. The app never changes a menu or posts to social media.</li>
        </ul>
      </div>
    </section>
  );
}
