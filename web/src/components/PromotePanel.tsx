import { useState } from "react";
import type { Explanation, Location, Recommendation, SocialDraft } from "../../../contracts/index.ts";
import { brand } from "../brand.ts";
import { localTime, money, timestamp, windowLabel } from "../format.ts";
import { BrandMark } from "./BrandMark.tsx";

const isDraft = (content: Explanation | SocialDraft): content is SocialDraft => "caption" in content;

const SourceTag = ({ source }: { source: "model" | "template" }) =>
  source === "model" ? <span className="tag on">AI draft · checked</span> : <span className="tag">Template (AI unavailable)</span>;

/** Explanation plus a phone-style post preview whose terms are checked against the current offer. */
export function PromotePanel({
  recommendation,
  location,
  busy,
  onExplain,
  onDraft,
}: {
  recommendation: Recommendation;
  location: Location;
  busy: string | null;
  onExplain: () => void;
  onDraft: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const selected = recommendation.candidates.find((candidate) => candidate.id === recommendation.selectedCandidateId)!;
  const { explanation, socialDraft } = recommendation;
  const staleDrafts = recommendation.staleContent.filter(isDraft);
  const stale = !socialDraft ? staleDrafts[staleDrafts.length - 1] ?? null : null;
  const shown = socialDraft ?? stale;
  const handle = `${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.${location.id}`;
  const currentPrice = selected.kind === "discount" ? selected.proposedPriceCents : selected.regularPriceCents;

  const checks = shown
    ? [
        { label: "Item", ok: shown.terms.itemName === selected.itemName, value: shown.terms.itemName, expected: selected.itemName },
        { label: "Price", ok: shown.terms.priceCents === currentPrice, value: money(shown.terms.priceCents), expected: money(currentPrice) },
        { label: "Store", ok: shown.terms.locationName === location.name, value: shown.terms.locationName, expected: location.name },
        {
          label: "Window",
          ok: shown.terms.window.startHour === selected.terms.window.startHour && shown.terms.window.endHour === selected.terms.window.endHour,
          value: windowLabel(shown.terms.window),
          expected: windowLabel(selected.terms.window),
        },
      ]
    : [];

  async function copy(text: string) {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError("Copying was blocked. Select the caption in the preview and copy it manually.");
      setCopied(false);
    }
  }

  return (
    <div className="promote">
      {shown && <div className="phone" aria-label="Instagram post preview">
        <div className="screen">
          <div className="post-head">
            <span className="avatar" aria-hidden>{brand.name.charAt(0)}</span>
            <strong>{handle}</strong>
            <span className="muted small">{shown ? localTime(shown.postAt, location.timezone) : ""}</span>
          </div>
          <div className="post-img">
            <BrandMark className="post-glyph" />
            <span className="small">[Photo: {selected.itemName}, natural light]</span>
            {shown && shown.terms.priceCents !== shown.terms.regularPriceCents && (
              <span className="post-overlay">
                {money(shown.terms.priceCents)} · {windowLabel(shown.terms.window)} · {shown.terms.locationName} only
              </span>
            )}
          </div>
          <div className="post-body">
            {shown ? (
              <span>
                <strong>{handle}</strong> {shown.caption}
              </span>
            ) : (
              <span className="muted">Choose your offer first, then create a caption.</span>
            )}
          </div>
          {stale && (
            <div className="stale-overlay">
              <strong>This copy is out of date</strong>
              <span className="small">
                The plan has changed since this caption was written. Create a new caption to match the current item, price, and hours.
              </span>
              <button className="primary" disabled={busy !== null || recommendation.status === "dismissed"} onClick={onDraft}>
                {busy === "draft" ? "Writing…" : "Update caption"}
              </button>
            </div>
          )}
        </div>
      </div>

      }
      <div className="promote-side">
        <div className="panel">
          <div className="panel-head">
            <h3>Checked against the offer</h3>
            {socialDraft && <SourceTag source={socialDraft.source} />}
          </div>
          {checks.length === 0 && <p className="muted small">Create a caption using the current item, price, store, and hours. We’ll check that those details match.</p>}
          {checks.map((check) => (
            <div key={check.label} className="check-row">
              <span className={`check ${check.ok ? "ok" : "bad"}`} aria-label={check.ok ? "matches" : "does not match"}>
                {check.ok ? "✓" : "✕"}
              </span>
              <span>{check.label}</span>
              <span className="num small">{check.ok ? check.value : `${check.value} ≠ ${check.expected}`}</span>
            </div>
          ))}
          <div className="actions">
            <button className="primary" disabled={busy !== null || recommendation.status === "dismissed"} onClick={onDraft}>
              {busy === "draft" ? "Writing…" : socialDraft ? "Rewrite caption" : "Create caption"}
            </button>
            {socialDraft && <button onClick={() => copy(socialDraft.caption)}>{copied ? "Copied" : "Copy caption"}</button>}
            {copyError && <p className="error" role="alert">{copyError}</p>}
          </div>
        </div>

        {socialDraft && (
          <div className="panel">
            <h3>Suggested post time</h3>
            <p className="num big-line">{timestamp(socialDraft.postAt)}</p>
            <p className="muted small">{socialDraft.postingRationale}</p>
            <h3>Photo idea</h3>
            <p className="small">{socialDraft.creativeBrief}</p>
          </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <h3>Why this action, in words</h3>
            <button disabled={busy !== null} onClick={onExplain}>
              {busy === "explain" ? "Writing…" : explanation ? "Regenerate" : "Explain"}
            </button>
          </div>
          {explanation ? (
            <>
              <SourceTag source={explanation.source} />
              <p>{explanation.summary}</p>
              <details>
                <summary className="small">Assumptions and risks</summary>
                <ul className="small">
                  {[...explanation.assumptions, ...explanation.risks].map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <p className="muted small">Get an optional explanation of the plan and its assumptions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
