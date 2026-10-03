import { useState } from "react";
import type { ReviewMention, ReviewMonitoringResponse, ReviewMonitoringResult, ReviewTheme } from "../../../contracts/index.ts";
import { api, ApiRequestError } from "../api.ts";
import { timestamp } from "../format.ts";

const STATUS_COPY = {
  completed: "Ready to read",
  unavailable: "Search unavailable",
  failed: "Search failed",
  queued: "Queued",
  running: "Searching",
} as const;

const THEME_COPY: Record<ReviewTheme, string> = {
  service: "Service",
  wait: "Wait time",
  price: "Price",
  taste: "Taste",
  atmosphere: "Atmosphere",
};

function excerpt(value: string, maxLength = 360) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trimEnd()}…` : compact;
}

function Mention({ mention }: { mention: ReviewMention }) {
  return (
    <details className="research-source">
      <summary>
        <span>{mention.sourceTitle}</span>
        <span className="muted small">{mention.sourceSite}</span>
      </summary>
      <div className="research-source-body">
        <p className="small research-claim">{excerpt(mention.excerpt)}</p>
        <p className="muted small">
          <a className="link" href={mention.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a>
          {` · retrieved ${timestamp(mention.retrievedAt)}`}
          {mention.publishedAt ? ` · published ${timestamp(mention.publishedAt)}` : ""}
        </p>
      </div>
    </details>
  );
}

function Subject({ result }: { result: ReviewMonitoringResult }) {
  const ready = result.run.status === "completed";
  const topics = (Object.keys(THEME_COPY) as ReviewTheme[])
    .map((theme) => ({ theme, count: result.mentions.filter((mention) => mention.themes.includes(theme)).length }))
    .filter((topic) => topic.count > 0)
    .sort((a, b) => b.count - a.count);
  return (
    <article className="research-profile">
      <div className="research-profile-head">
        <div>
          <h3>{result.subject.name}</h3>
          <p className="muted small">
            {ready ? `${result.mentions.length} review page${result.mentions.length === 1 ? "" : "s"} found` : "No review pages returned"}
          </p>
        </div>
        <span className={`tag ${ready ? "warn" : ""}`}>{STATUS_COPY[result.run.status]}</span>
      </div>
      {ready && result.mentions.length > 0 && (
        <>
          <p className="research-summary">
            {topics.length > 0 ? "Topics mentioned: " : "No tracked topics matched. "}
            {topics.map((topic) => <span className="tag info review-topic" key={topic.theme}>{THEME_COPY[topic.theme]} · {topic.count}</span>)}
          </p>
          <div className="research-sources">{result.mentions.map((mention) => <Mention key={mention.evidenceId} mention={mention} />)}</div>
        </>
      )}
    </article>
  );
}

/**
 * On-demand public review excerpts for the configured nearby competitors. Read-only
 * context: there are no ratings or sentiment scores, and nothing here feeds pricing.
 */
export function ReviewMonitoringPanel({ locationId, date }: { locationId: string; date: string }) {
  const [data, setData] = useState<ReviewMonitoringResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setData(await api.reviewMonitoring(locationId, date));
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const mentionCount = data?.results.reduce((count, result) => count + result.mentions.length, 0) ?? 0;
  const unavailable = data?.results.every((result) => result.run.status === "unavailable");

  return (
    <section className="panel research-panel" aria-labelledby="review-monitoring">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Optional context</span>
          <h2 id="review-monitoring">Competitor reviews</h2>
        </div>
        <button className="ghost" onClick={refresh} disabled={busy}>
          {busy ? "Searching…" : data ? "Refresh reviews" : "Check reviews"}
        </button>
      </div>
      <p className="muted">Searches public review sites for the configured nearby competitors and shows what customers talk about.</p>
      {error && <p className="error">{error}</p>}
      {unavailable && <p className="muted small">Tavily is not configured or is temporarily unavailable. Planning continues normally.</p>}
      {data && !unavailable && (
        <div className="research-results">
          <div className="research-overview">
            <strong>{mentionCount}</strong>
            <span>review page{mentionCount === 1 ? "" : "s"}</span>
            <span className="muted">· {data.results.length} competitor{data.results.length === 1 ? "" : "s"}</span>
          </div>
          <div className="research-profiles">{data.results.map((result) => <Subject key={result.run.id} result={result} />)}</div>
          <p className="muted small">{data.limitations.join(" ")}</p>
        </div>
      )}
    </section>
  );
}
