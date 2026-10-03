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

/** Rejects content citing unknown evidence or stating a price the packet does not contain. */
export function validateGeneratedContent(packet: ContentPacket, content: { text: string; evidenceIds?: string[] }): string[] {
  const problems: string[] = [];
  const allowed = allowedEvidenceIds(packet);
  for (const id of content.evidenceIds ?? []) if (!allowed.has(id)) problems.push(`Unknown evidence reference: ${id}`);
  const allowedPrices = new Set([packet.selected.proposedPriceCents, packet.selected.regularPriceCents].map(dollars));
  for (const match of content.text.match(/\$\d+(?:\.\d{2})?/g) ?? []) {
    const normalized = dollars(Math.round(Number(match.slice(1)) * 100));
    if (!allowedPrices.has(normalized)) problems.push(`Unsupported price in copy: ${match}`);
  }
  for (const match of content.text.match(/\d+\s?%/g) ?? []) {
    if (Number.parseInt(match, 10) !== packet.selected.terms.discountPct) problems.push(`Unsupported percentage in copy: ${match}`);
  }
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
      const problems = validateGeneratedContent(packet, { text: output.summary, evidenceIds: output.evidenceIds });
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
      const problems = validateGeneratedContent(packet, { text: `${output.caption} ${output.creativeBrief}` });
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
