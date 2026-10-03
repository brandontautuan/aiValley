import type { ScenarioId } from "../../../contracts/index.ts";

const OPTIONS: Array<{ id: ScenarioId; label: string; icon: string }> = [
  { id: "typical", label: "Typical day", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" },
  { id: "local-event", label: "Local event day", icon: "M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
];

/** Segmented scenario switch; the large variant is the demo's hero control. */
export function ScenarioToggle({ value, onChange, compact = false }: { value: ScenarioId; onChange: (value: ScenarioId) => void; compact?: boolean }) {
  return (
    <div className={`seg ${compact ? "compact" : ""}`} role="group" aria-label="Scenario">
      {OPTIONS.map((option) => (
        <button key={option.id} className={option.id === value ? "on" : ""} aria-pressed={option.id === value} onClick={() => onChange(option.id)}>
          <svg width={compact ? 16 : 20} height={compact ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d={option.icon} />
          </svg>
          {option.label}
        </button>
      ))}
    </div>
  );
}
