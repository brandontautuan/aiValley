import type { ContextSignal, Location, Recommendation, SocialDraft } from "../../../contracts/index.ts";
import { windowLabel } from "../format.ts";
import { isCapacityHold } from "../insights.ts";

type PlanStep = {
  timing: string;
  format: string;
  title: string;
  detail: string;
  state: "ready" | "draft" | "hold";
};

const STATE_LABEL: Record<PlanStep["state"], string> = {
  ready: "ready",
  draft: "draft needed",
  hold: "do not promote",
};

/**
 * A presentation-only cadence. It uses the selected server recommendation and
 * fixture context; it neither generates additional copy nor claims a trend is viral.
 */
export function SocialMediaPlan({
  recommendation,
  location,
  socialDraft,
  contextSignals,
  appliedSignalIds,
}: {
  recommendation: Recommendation;
  location: Location;
  socialDraft: SocialDraft | null;
  contextSignals: ContextSignal[];
  appliedSignalIds: string[];
}) {
  const selected = recommendation.candidates.find((candidate) => candidate.id === recommendation.selectedCandidateId)!;
  const capacityHold = isCapacityHold(selected);
  const window = windowLabel(selected.terms.window);
  const applied = contextSignals.filter((signal) => appliedSignalIds.includes(signal.id));
  const primaryState: PlanStep["state"] = socialDraft ? "ready" : "draft";
  const steps: PlanStep[] = capacityHold
    ? [
        { timing: "Before the peak", format: "Story / location update", title: "Set expectations", detail: `Share practical location details only. Do not drive extra traffic into the ${window} capacity window.`, state: "hold" },
        { timing: "During the peak", format: "Community management", title: "Protect service", detail: "Monitor replies and use accurate availability updates if a manager supplies them; do not promise wait times.", state: "hold" },
        { timing: "Next planning review", format: "Manager note", title: "Assess before repeating", detail: "Review observed orders and service conditions before scheduling a new campaign.", state: "ready" },
      ]
    : selected.kind === "discount"
      ? [
          { timing: socialDraft ? "At the suggested post time" : "Before the offer window", format: "Instagram feed / Reel", title: "Primary offer post", detail: socialDraft ? "Use the checked caption and creative brief for the current revision." : "Generate copy first so the item, price, location, and window are checked.", state: primaryState },
          { timing: `1–2 hours before ${window}`, format: "Instagram Story", title: "Window reminder", detail: "Reuse only the approved offer terms. Keep the reminder location-specific and do not add urgency or competitor claims.", state: primaryState },
          { timing: "After the window", format: "Manager review", title: "Decide whether to repeat", detail: "Review observed performance before extending the offer. This planner does not infer revenue lift from engagement.", state: "ready" },
        ]
      : [
          { timing: socialDraft ? "At the suggested post time" : "Before the focus window", format: "Instagram feed / Reel", title: "Product and neighborhood moment", detail: socialDraft ? "Use the checked regular-price caption and creative brief." : "Generate copy first; regular-price messaging should not imply an offer.", state: primaryState },
          { timing: `Ahead of ${window}`, format: "Instagram Story", title: "Light location reminder", detail: `Feature ${selected.itemName} or the café setting. Keep the message informational—there is no promotion to repeat.`, state: primaryState },
          { timing: "Next planning review", format: "Manager review", title: "Refresh the angle", detail: "Use a new approved local signal or product asset before changing the message.", state: "ready" },
        ];

  return (
    <section className="panel social-plan" aria-labelledby="social-media-plan">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Proposed cadence</span>
          <h3 id="social-media-plan">Social media plan</h3>
        </div>
        <span className="tag">Instagram · not scheduled</span>
      </div>
      <p className="muted small">A three-step plan for {location.name}. It suggests format and timing; a manager still reviews and posts manually.</p>
      {applied.length > 0 ? (
        <p className="social-signals"><strong>Local inputs:</strong> {applied.map((signal) => signal.title).join(" · ")} <span className="muted">(fixtures and assumptions)</span></p>
      ) : (
        <p className="social-signals"><strong>Local inputs:</strong> usual demand pattern only <span className="muted">(fixture baseline)</span></p>
      )}
      <ol className="social-plan-steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="social-step-num">{index + 1}</span>
            <div>
              <div className="social-step-head"><strong>{step.title}</strong><span className={`tag ${step.state === "hold" ? "warn" : step.state === "ready" ? "on" : ""}`}>{STATE_LABEL[step.state]}</span></div>
              <p className="small">{step.format} · {step.timing}</p>
              <p className="muted small">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="social-plan-note">Public-web research may provide source links for manager review, but this plan makes no claim that a topic is viral or that social activity will lift revenue.</p>
    </section>
  );
}
