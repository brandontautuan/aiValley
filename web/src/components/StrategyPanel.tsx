import { useState } from "react";
import type { RankedAction, ScenarioId, StrategyRun, TrendEvidence } from "../../../contracts/index.ts";
import { api, ApiRequestError } from "../api.ts";
import { dateLabel, scenarioLabel, timestamp } from "../format.ts";
import { useLoad } from "../useLoad.ts";

const STATUS_LABEL: Record<StrategyRun["status"], string> = {
  researching: "Researching",
  drafting: "Drafting",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  failed: "Failed",
};

const STATUS_CLASS: Record<StrategyRun["status"], string> = {
  researching: "",
  drafting: "",
  awaiting_approval: "",
  approved: "approved",
  failed: "dismissed",
};

const KIND_LABEL: Record<RankedAction["kind"], string> = {
  "organic-campaign": "Organic campaign",
  promotion: "Promotion",
  "hold-monitor": "Hold & monitor",
};

const EVIDENCE_LABEL: Record<TrendEvidence["status"], string> = {
  verified: "verified",
  needs_review: "needs review",
  rejected: "rejected",
};

const EVIDENCE_CLASS: Record<TrendEvidence["status"], string> = {
  verified: "on",
  needs_review: "warn",
  rejected: "warn",
};

const inProgress = (status: StrategyRun["status"]) => status === "researching" || status === "drafting";

export function Strategy({ date, scenario }: { date: string; scenario: ScenarioId }) {
  const overview = useLoad(() => api.overview(date, scenario), [date, scenario]);
  const [locationId, setLocationId] = useState("");
  const [horizonDays, setHorizonDays] = useState(7);
  const [run, setRun] = useState<StrategyRun | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locations = overview.data?.locations ?? [];
  const selectedLocation = locationId || locations[0]?.location.id || "";
  const fail = (e: unknown) => setError(e instanceof ApiRequestError ? e.message : String(e));

  async function build() {
    if (!selectedLocation) return;
    setBusy("build");
    setError(null);
    try {
      setRun((await api.createStrategyRun(selectedLocation, date, scenario, horizonDays)).strategyRun);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    if (!run) return;
    setBusy("refresh");
    setError(null);
    try {
      setRun((await api.strategyRun(run.id)).strategyRun);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function approve(actionId: string) {
    if (!run) return;
    setBusy(`approve:${actionId}`);
    setError(null);
    try {
      setRun((await api.approveStrategyRun(run.id, run.revision, actionId)).strategyRun);
    } catch (e) {
      fail(e);
      // The run moved on under us (e.g. another approval); reload the authoritative state.
      if (e instanceof ApiRequestError && e.body.code === "STALE_REVISION") {
        try {
          setRun((await api.strategyRun(run.id)).strategyRun);
        } catch {
          /* keep the original error visible */
        }
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={overview.loading ? "loading" : ""}>
      <div className="page-head">
        <h1>Multi-day strategy</h1>
        <p className="muted">
          Plan a longer horizon for one location. A run ranks marketing actions around the deterministic daily
          recommendation; the manager approves exactly one. Approving still only saves a plan — nothing is published.
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Build a strategy run</h2>
          <span className="muted small">{dateLabel(date)} · {scenarioLabel(scenario)}</span>
        </div>
        {overview.error && <p className="error">{overview.error}</p>}
        <form
          className="editor"
          onSubmit={(event) => {
            event.preventDefault();
            build();
          }}
        >
          <label>
            <span>Location</span>
            <select value={selectedLocation} disabled={busy !== null || locations.length === 0} onChange={(event) => setLocationId(event.target.value)}>
              {locations.map((summary) => (
                <option key={summary.location.id} value={summary.location.id}>{summary.location.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Horizon (days)</span>
            <input type="number" min={1} max={365} step={1} value={horizonDays} disabled={busy !== null} onChange={(event) => setHorizonDays(Math.min(365, Math.max(1, Number(event.target.value) || 1)))} />
          </label>
          <button type="submit" className="primary" disabled={busy !== null || !selectedLocation}>
            {busy === "build" ? "Building…" : "Build strategy"}
          </button>
        </form>
        <p className="muted small">Resolution is chosen from the horizon (hourly, daily, then weekly). Creating the same location, date and horizon returns the existing run.</p>
        {error && !run && <p className="error">{error}</p>}
      </div>

      {run && <RunView run={run} busy={busy} error={error} onRefresh={refresh} onApprove={approve} />}
    </section>
  );
}

function RunView({ run, busy, error, onRefresh, onApprove }: { run: StrategyRun; busy: string | null; error: string | null; onRefresh: () => void; onApprove: (actionId: string) => void }) {
  const evidenceById = new Map(run.evidence.map((item) => [item.id, item]));
  const verifiedCount = run.evidence.filter((item) => item.status === "verified").length;

  return (
    <div className="panel strategy-run">
      <div className="panel-head">
        <h2>Strategy run · {dateLabel(run.planningDate)}</h2>
        <span className={`status ${STATUS_CLASS[run.status]}`}>{STATUS_LABEL[run.status]} · rev {run.revision}</span>
      </div>
      <p className="muted small">
        {run.horizonDays}-day horizon · {run.resolution} resolution
        {run.zooWorkRunId ? ` · ZooWork ${run.zooWorkRunId}` : ""}
        {run.bandRoomId ? ` · Band ${run.bandRoomId}` : ""}
      </p>

      {inProgress(run.status) && (
        <div className="actions">
          <button className="ghost" disabled={busy !== null} onClick={onRefresh}>
            {busy === "refresh" ? "Checking…" : "Refresh status"}
          </button>
        </div>
      )}
      {error && run && <p className="error">{error}</p>}

      <h3>Ranked actions</h3>
      {run.rankedActions.length === 0 && <p className="muted small">No ranked actions yet.</p>}
      <ol className="ranked">
        {run.rankedActions.map((action) => {
          const isApproved = run.approvedActionId === action.id;
          const decided = run.status === "approved";
          return (
            <li key={action.id} className={isApproved ? "approved" : decided ? "inactive" : ""}>
              <div className="ranked-head">
                <span className="rank">{action.rank}</span>
                <strong>{action.title}</strong>
                <span className="tag">{KIND_LABEL[action.kind]}</span>
                {isApproved && <span className="tag on">approved ✓</span>}
              </div>
              <p className="small">{action.rationale}</p>
              {action.recommendationId && (
                <p className="muted small">
                  Linked to pricing recommendation rev {action.recommendationRevision} ·{" "}
                  <a className="link" href={`#/location/${run.locationId}`}>open location →</a>
                </p>
              )}
              {action.evidenceIds.length > 0 && (
                <p className="muted small">
                  Evidence: {action.evidenceIds.map((id) => evidenceById.get(id)?.sourceTitle ?? id).join(", ")}
                </p>
              )}
              {run.status === "awaiting_approval" && (
                <button className="primary small-btn" disabled={busy !== null} onClick={() => onApprove(action.id)}>
                  {busy === `approve:${action.id}` ? "Saving…" : "Approve this action"}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {run.status === "awaiting_approval" && <p className="muted small">Approving one action saves it for the team and approves any linked daily pricing plan. It does not publish anything.</p>}

      <h3>Research evidence</h3>
      {run.evidence.length === 0 ? (
        <p className="muted small">No external research evidence for this run. Ranked actions use the deterministic recommendation only.</p>
      ) : (
        <>
          <p className="muted small">Only verified records inform ranked actions ({verifiedCount} of {run.evidence.length} verified). Public-web research — manager review required.</p>
          <ul className="evidence">
            {run.evidence.map((item) => (
              <li key={item.id} className={item.status === "rejected" ? "inactive" : ""}>
                <div className="evidence-head">
                  <strong>{item.claim}</strong>
                  <span className={`tag ${EVIDENCE_CLASS[item.status]}`}>{EVIDENCE_LABEL[item.status]}</span>
                </div>
                <p className="small">{item.locationRelevance}</p>
                {item.limitations.length > 0 && (
                  <ul className="small">
                    {item.limitations.map((note) => (
                      <li key={note}>{note}</li>
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
        </>
      )}

      <h3>Timeline</h3>
      <ul className="timeline small">
        {run.events.map((event) => (
          <li key={event.id}>
            <span className="muted">{timestamp(event.at)}</span> — {event.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
