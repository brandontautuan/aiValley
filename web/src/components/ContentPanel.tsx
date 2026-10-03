import { useState } from "react";
import type { Explanation, Recommendation, SocialDraft } from "../../../contracts/index.ts";
import { timestamp } from "../format.ts";

const isDraft = (content: Explanation | SocialDraft): content is SocialDraft => "caption" in content;

const SourceTag = ({ source }: { source: "model" | "template" }) =>
  source === "model" ? <span className="tag on">AI draft</span> : <span className="tag">Template (AI unavailable)</span>;

export function ContentPanel({ recommendation, busy, onExplain, onDraft }: { recommendation: Recommendation; busy: string | null; onExplain: () => void; onDraft: () => void }) {
  const { explanation, socialDraft } = recommendation;
  const staleDrafts = recommendation.staleContent.filter(isDraft);
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Explanation & promotion</h2>
        <span className="muted small">Drafts match revision {recommendation.revision}</span>
      </div>

      <section className="content-block">
        <div className="content-head">
          <h3>Why this action</h3>
          <button className="small-btn" disabled={busy !== null} onClick={onExplain}>
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
          <p className="muted small">No explanation yet for this revision.</p>
        )}
      </section>

      <section className="content-block">
        <div className="content-head">
          <h3>Instagram draft</h3>
          <button className="small-btn" disabled={busy !== null || recommendation.status === "dismissed"} onClick={onDraft}>
            {busy === "draft" ? "Drafting…" : socialDraft ? "Regenerate" : "Generate copy"}
          </button>
        </div>
        {socialDraft ? (
          <>
            <SourceTag source={socialDraft.source} />
            <blockquote className="caption">{socialDraft.caption}</blockquote>
            <button className="small-btn" onClick={() => copy(socialDraft.caption)}>
              {copied ? "Copied" : "Copy caption"}
            </button>
            <p className="small">
              <strong>Suggested post time:</strong> {timestamp(socialDraft.postAt)}
              <br />
              <span className="muted">{socialDraft.postingRationale}</span>
            </p>
            <p className="small">
              <strong>Creative brief:</strong> {socialDraft.creativeBrief}
            </p>
          </>
        ) : (
          <p className="muted small">No copy for the current terms. Generate it after you settle the offer.</p>
        )}
        {staleDrafts.length > 0 && (
          <details className="stale">
            <summary className="small">{staleDrafts.length} outdated draft(s) from earlier terms</summary>
            {staleDrafts.map((draft) => (
              <p key={draft.generatedAt + draft.revision} className="small muted">
                <span className="tag warn">stale · rev {draft.revision}</span> <s>{draft.caption}</s>
              </p>
            ))}
          </details>
        )}
      </section>
    </div>
  );
}
