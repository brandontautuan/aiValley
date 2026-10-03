import type { CompetitorOffer, ContextSignal, Explanation, Location, LocationOutlook, OfferCandidate, SocialDraft } from "../contracts/index.ts";
import { CHAIN } from "../data/fixtures.ts";
import { localIso } from "../data/mock.ts";

export * from "./competitorResearch.ts";
export * from "./reviewMonitoring.ts";
export * from "./tavilySearchTransport.ts";

/**
 * Compact, structured input for explanations and social drafts. Everything the
 * content may cite or state must be in here; nothing else is allowed.
 */
export interface ContentPacket {
  recommendationId: string;
  revision: number;
  location: Location;
  outlook: Pick<LocationOutlook, "date" | "scenario" | "classification" | "changeVsUsual" | "focusWindow" | "evidenceQuality" | "observationCount">;
  selected: OfferCandidate;
  deterministicReason: string;
  contextSignals: ContextSignal[];
  competitorOffers: CompetitorOffer[];
  assumptions: string[];
  brandTone: string;
}

/**
 * Optional model adapter. When absent or failing, template content is used so the
 * workflow never depends on the model. Implementations must stay server-side.
 */
export interface ContentModel {
  explain(packet: ContentPacket): Promise<Omit<Explanation, "recommendationId" | "revision" | "source" | "generatedAt">>;
  draftSocial(packet: ContentPacket): Promise<Pick<SocialDraft, "caption" | "creativeBrief">>;
}

export const BRAND_TONE = "Project Northstar: warm, clear, and lightly storybook-inspired. No hype words, character references, or invented claims.";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatHour = (hour: number) => {
  const suffix = hour >= 12 ? "p.m." : "a.m.";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
};
const windowText = (packet: ContentPacket) => `${formatHour(packet.selected.terms.window.startHour)}–${formatHour(packet.selected.terms.window.endHour)}`;

function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function allowedEvidenceIds(packet: ContentPacket): Set<string> {
  return new Set([...packet.contextSignals.map((signal) => signal.id), ...packet.competitorOffers.map((offer) => offer.id)]);
}

const PRICE = /\$\d+(?:\.\d{1,2})?/g;
const PERCENT = /\d+(?:\.\d+)?\s?%/g;
const priceCents = (match: string) => Math.round(Number(match.slice(1)) * 100);

/**
 * Rejects content citing unknown evidence or stating a figure the packet does not contain.
 * Social copy may state only the offer's own prices and discount. An explanation may also
 * quote the packet's other figures: competitor prices, the change vs. usual, the assumed
 * response scenarios, and any figure written in the reason, assumptions, or signal notes.
 */
export function validateGeneratedContent(packet: ContentPacket, content: { text: string; evidenceIds?: string[]; explanation?: boolean }): string[] {
  const problems: string[] = [];
  const allowed = allowedEvidenceIds(packet);
  for (const id of content.evidenceIds ?? []) if (!allowed.has(id)) problems.push(`Unknown evidence reference: ${id}`);

  const { selected } = packet;
  const prices = new Set([selected.proposedPriceCents, selected.regularPriceCents]);
  const percentages = [selected.terms.discountPct];
  if (content.explanation) {
    const packetText = [packet.deterministicReason, ...packet.assumptions, ...packet.contextSignals.map((signal) => signal.whyItMatters), ...packet.competitorOffers.map((offer) => offer.comparabilityNotes)].join(" ");
    for (const offer of packet.competitorOffers) if (offer.priceCents !== null) prices.add(offer.priceCents);
    for (const match of packetText.match(PRICE) ?? []) prices.add(priceCents(match));
    percentages.push(Math.abs(packet.outlook.changeVsUsual) * 100, ...selected.responseScenarios.map((scenario) => scenario.assumedUnitChange * 100), ...(packetText.match(PERCENT) ?? []).map(Number.parseFloat));
  }
  for (const match of content.text.match(PRICE) ?? []) {
    if (!prices.has(priceCents(match))) problems.push(`Unsupported price in copy: ${match}`);
  }
  for (const match of content.text.match(PERCENT) ?? []) {
    const value = Number.parseFloat(match);
    // A packet figure may be quoted exactly or rounded to a whole percent.
    if (!percentages.some((figure) => Math.abs(figure - value) < 0.051 || Math.round(figure) === value)) problems.push(`Unsupported percentage in copy: ${match}`);
  }
  return problems;
}

/** Wording that would tell a customer a discounted item costs nothing. */
const IMPLIES_FREE = /\bon us\b|\bon the house\b|\bfor free\b|\bcomplimentary\b/i;

/** Social copy must also carry the exact offer price and must not read as a giveaway. */
function socialProblems(packet: ContentPacket, output: Pick<SocialDraft, "caption" | "creativeBrief">): string[] {
  const problems = validateGeneratedContent(packet, { text: `${output.caption} ${output.creativeBrief}` });
  if (IMPLIES_FREE.test(output.caption)) problems.push("Caption implies the item is free");
  if (packet.selected.kind === "discount" && !output.caption.includes(dollars(packet.selected.proposedPriceCents))) problems.push("Caption omits the offer price");
  return problems;
}

function templateExplanation(packet: ContentPacket): Omit<Explanation, "recommendationId" | "revision" | "source" | "generatedAt"> {
  const { selected, outlook } = packet;
  const evidenceIds = [...packet.contextSignals.map((signal) => signal.id), ...packet.competitorOffers.map((offer) => offer.id)];
  const context = packet.contextSignals.map((signal) => `${signal.title} (${signal.source})`).join("; ");
  const competitor = packet.competitorOffers.find((offer) => offer.comparability === "comparable");
  const summary = [
    packet.deterministicReason,
    context ? `Context considered: ${context}.` : "No local context records apply to this window.",
    competitor
      ? `Nearby comparable offer: ${competitor.competitorName} — ${competitor.itemDescription}${competitor.priceCents !== null ? ` at ${dollars(competitor.priceCents)}` : ""} (${competitor.comparabilityNotes})`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const risks =
    selected.kind === "discount"
      ? [
          `If fewer than ${selected.breakEvenUnits} units sell in the window, contribution falls below the regular-price expectation.`,
          "Some discounted sales may replace purchases that would have happened at full price.",
        ]
      : ["Keeping the price forgoes any extra volume a promotion might attract."];
  if (outlook.evidenceQuality === "sparse") risks.push(`Baseline is based on only ${outlook.observationCount} comparable observations.`);
  return { summary, evidenceIds, assumptions: packet.assumptions, risks };
}

/** Debug helper: includes ZooWork's status, code and response snippet when the error carries them. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const { status, code, bodySnippet, requestId } = error as Error & { status?: number; code?: string; bodySnippet?: string; requestId?: string };
  return [error.message, status && `status=${status}`, code && `code=${code}`, requestId && `requestId=${requestId}`, bodySnippet && `body=${bodySnippet}`].filter(Boolean).join(" | ");
}

export async function generateExplanation(packet: ContentPacket, model?: ContentModel, now = new Date()): Promise<Explanation> {
  const stamp = { recommendationId: packet.recommendationId, revision: packet.revision, generatedAt: now.toISOString() };
  if (model) {
    try {
      const output = await model.explain(packet);
      const problems = validateGeneratedContent(packet, { text: output.summary, evidenceIds: output.evidenceIds, explanation: true });
      if (problems.length === 0) return { ...output, ...stamp, source: "model" };
      console.warn("[content] explanation rejected by validation; using template:", problems);
    } catch (error) {
      console.warn("[content] explanation model call failed; using template:", describeError(error));
    }
  } else {
    console.warn("[content] no content model configured; using template explanation");
  }
  return { ...templateExplanation(packet), ...stamp, source: "template" };
}

/** Posting time is a proposed lead time before the offer, not a measured optimum. */
const POSTING_LEAD_HOURS = 3;

function postAt(packet: ContentPacket): string {
  const { window } = packet.selected.terms;
  const hour = Math.max(window.startHour - POSTING_LEAD_HOURS, 7);
  return localIso(window.date, hour, packet.location.timezone);
}

function templateSocial(packet: ContentPacket): Pick<SocialDraft, "caption" | "creativeBrief"> {
  const { selected, location } = packet;
  const day = weekdayName(selected.terms.window.date);
  if (selected.kind === "no-change") {
    return {
      caption: `${selected.itemName} at ${CHAIN.name} ${location.name}, ${day}. Open ${formatHour(location.openingHours.open)}–${formatHour(location.openingHours.close)} — stop in when you’re nearby. ☕`,
      creativeBrief: `Regular-price awareness post (no offer). Show the ${selected.itemName} at the bar in ${location.name}. Mention opening hours; do not mention a discount.`,
    };
  }
  return {
    caption: `${day} special: ${selected.itemName} for ${dollars(selected.proposedPriceCents)} (regularly ${dollars(selected.regularPriceCents)}) at ${CHAIN.name} ${location.name}, ${windowText(packet)} only. In-store. ☕`,
    creativeBrief: `Warm café photo of the ${selected.itemName} in natural light. Overlay: "${selected.terms.discountPct}% off ${windowText(packet)}" and "${location.name} only". Avoid competitor names, scarcity claims or any figure not in the caption.`,
  };
}

export async function generateSocialDraft(packet: ContentPacket, model?: ContentModel, now = new Date()): Promise<SocialDraft> {
  const { selected, location } = packet;
  let content = templateSocial(packet);
  let source: SocialDraft["source"] = "template";
  if (model) {
    try {
      const output = await model.draftSocial(packet);
      const problems = socialProblems(packet, output);
      if (problems.length === 0) {
        content = output;
        source = "model";
      } else {
        console.warn("[content] social draft rejected by validation; using template:", problems, "caption:", output.caption);
      }
    } catch (error) {
      console.warn("[content] social draft model call failed; using template:", describeError(error));
    }
  } else {
    console.warn("[content] no content model configured; using template social draft");
  }
  return {
    recommendationId: packet.recommendationId,
    revision: packet.revision,
    platform: "instagram",
    terms: { itemName: selected.itemName, priceCents: selected.proposedPriceCents, regularPriceCents: selected.regularPriceCents, locationName: location.name, window: selected.terms.window },
    ...content,
    postAt: postAt(packet),
    postingRationale: `Proposed ${POSTING_LEAD_HOURS}-hour lead time before the offer starts. This is a default, not an optimum measured from account analytics.`,
    source,
    generatedAt: now.toISOString(),
  };
}
