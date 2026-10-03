import { useState } from "react";
import type { CompetitorResearchResult, CompetitorResearchStatus } from "../../../contracts/index.ts";
import { api, ApiRequestError } from "../api.ts";
import { timestamp } from "../format.ts";

const STATUS_LABEL: Record<CompetitorResearchStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  unavailable: "Unavailable",
  failed: "Failed",
};

const STATUS_CLASS: Record<CompetitorResearchStatus, string> = {
  queued: "",
  running: "",
  completed: "on",
  unavailable: "warn",
  failed: "warn",
};

/**
 * Manager-triggered public-web competitor research (Tavily). Results are unverified
 * sources for review; they never become a comparable offer or change the recommendation.
 */
export function CompetitorResearch({ locationId, date }: { locationId: string; date: string }) {
  const [results, setResults] = useState<CompetitorResearchResult[] | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setResults((await api.competitorResearch(locationId, date)).results);
      setRanAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const evidenceCount = results?.reduce((sum, result) => sum + result.evidence.length, 0) ?? 0;

  return (
    <details className="panel research-panel">
      <summary>
        Competitor research <span className="tag info">public web · manager review</span>
        {results && <span className="muted small"> · {evidenceCount} source{evidenceCount === 1 ? "" : "s"} found</span>}
      </summary>
      <p className="muted small">
        On-demand public-web search. Results are unverified sources for manager review — they never become a comparable offer
        or change the recommendation on their own. The curated fixture offers in the evidence panel are the pricing inputs.
      </p>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={refresh}>
          {busy ? "Searching…" : results ? "Refresh again" : "Refresh competitor research"}
        </button>
        {ranAt && <span className="muted small">Last run {timestamp(ranAt)}</span>}
      </div>
      {error && <p className="error">{error}</p>}
      {results && results.length === 0 && <p className="muted small">No competitor profiles are configured for this location.</p>}
      {results?.map((result) => (
        <div key={result.run.id} className="research-run">
          <div className="evidence-head">
            <strong>Run {result.run.providerRunId ?? result.run.id}</strong>
            <span className={`tag ${STATUS_CLASS[result.run.status]}`}>{STATUS_LABEL[result.run.status]}</span>
          </div>
          {result.run.errorCode && (
            <p className="muted small">
              {result.run.errorCode === "TAVILY_UNAVAILABLE"
                ? "Research provider is not configured (no API key), so no new web sources were fetched. Curated fixture competitor offers remain available."
                : "The research provider failed this run. Try again later; curated fixture competitor offers remain available."}
            </p>
          )}
          {result.evidence.length > 0 && (
            <ul className="evidence">
              {result.evidence.map((item) => (
                <li key={item.evidenceId}>
                  <div className="evidence-head">
                    <strong>{item.claimText}</strong>
                    <span className="tag warn">needs review</span>
                  </div>
                  {item.comparabilityNotes && <p className="small">{item.comparabilityNotes}</p>}
                  {item.limitations.length > 0 && (
                    <ul className="small">
                      {item.limitations.map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                    </ul>
                  )}
                  <p className="muted small">
                    <a className="link" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceTitle}</a>
                    {" · retrieved "}{timestamp(item.retrievedAt)}
                    {item.publishedAt ? ` · published ${timestamp(item.publishedAt)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </details>
  );
}
