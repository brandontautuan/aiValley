import { useState } from "react";
import type { CompetitorResearchEvidence, CompetitorResearchResponse, CompetitorResearchResult } from "../../../contracts/index.ts";
import { api, ApiRequestError } from "../api.ts";
import { timestamp } from "../format.ts";

const STATUS_COPY = {
  completed: "Ready for review",
  unavailable: "Research unavailable",
  failed: "Research failed",
  queued: "Queued",
  running: "Researching",
} as const;

function excerpt(value: string, maxLength = 360) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trimEnd()}…` : compact;
}

function profileName(id: string) {
  return id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function EvidenceSource({ evidence }: { evidence: CompetitorResearchEvidence }) {
  return (
    <details className="research-source">
      <summary>
        <span>{evidence.sourceTitle}</span>
        <span className="muted small">retrieved {timestamp(evidence.retrievedAt)}</span>
      </summary>
      <div className="research-source-body">
        <p className="small research-claim">{excerpt(evidence.claimText)}</p>
        <p className="muted small">
          <a className="link" href={evidence.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a>
          {evidence.publishedAt ? ` · published ${timestamp(evidence.publishedAt)}` : ""}
        </p>
        {evidence.limitations.length > 0 && <p className="muted small">{evidence.limitations.join(" ")}</p>}
      </div>
    </details>
  );
}

function CompetitorProfile({ result }: { result: CompetitorResearchResult }) {
  const profile = result.evidence[0]?.competitorId ?? "configured-competitor";
  const ready = result.run.status === "completed";
  return (
    <article className="research-profile">
      <div className="research-profile-head">
        <div>
          <h3>{profileName(profile)}</h3>
          <p className="muted small">
            {ready ? `${result.evidence.length} public-web source${result.evidence.length === 1 ? "" : "s"} found` : "No research evidence returned"}
          </p>
        </div>
        <span className={`tag ${ready ? "warn" : ""}`}>{STATUS_COPY[result.run.status]}</span>
      </div>
      {ready ? (
        <>
          <p className="research-summary">No verified comparable offer was found automatically. Review a source before recording price, availability, or terms.</p>
          <div className="research-sources">
            {result.evidence.map((evidence) => <EvidenceSource key={evidence.evidenceId} evidence={evidence} />)}
          </div>
        </>
      ) : (
        <p className="muted small">Fixture-based planning is unchanged for this profile.</p>
      )}
    </article>
  );
}

/**
 * A bounded, on-demand view of Tavily results. It intentionally has no pricing
 * controls: public-web results remain manager-review evidence until a future
 * audited promotion flow exists.
 */
export function CompetitorResearchPanel({ locationId, date }: { locationId: string; date: string }) {
  const [data, setData] = useState<CompetitorResearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setData(await api.competitorResearch(locationId, date));
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const completed = data?.results.filter((result) => result.run.status === "completed") ?? [];
  const sourceCount = completed.reduce((count, result) => count + result.evidence.length, 0);
  const unavailable = data?.results.every((result) => result.run.status === "unavailable");

  return (
    <section className="panel research-panel" aria-labelledby="public-web-research">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Optional context</span>
          <h2 id="public-web-research">Public-web competitor research</h2>
        </div>
        <button className="ghost" onClick={refresh} disabled={busy}>
          {busy ? "Researching…" : data ? "Refresh research" : "Research competitors"}
        </button>
      </div>
      <p className="muted">
        Searches configured nearby competitors for this planning date. Sources are unverified context — they do not change pricing, recommendations, or social copy.
      </p>
      <p className="research-notice"><strong>Manager review required.</strong> Confirm a source, its local applicability, price and terms before treating it as a comparable offer.</p>
      {error && <p className="error">{error}</p>}
      {unavailable && <p className="muted small">Tavily is not configured or is temporarily unavailable. Fixture-based planning continues normally.</p>}
      {data && !unavailable && (
        <div className="research-results">
          <div className="research-overview">
            <strong>{sourceCount}</strong>
            <span>attributed source{sourceCount === 1 ? "" : "s"}</span>
            <span className="muted">· {completed.length} configured competitor{completed.length === 1 ? "" : "s"}</span>
          </div>
          <div className="research-profiles">{data.results.map((result) => <CompetitorProfile key={result.run.id} result={result} />)}</div>
        </div>
      )}
    </section>
  );
}
