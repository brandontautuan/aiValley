import type { ScenarioId } from "../../../contracts/index.ts";
import { mockSeedOf } from "../format.ts";

const OPTIONS: Array<{ id: ScenarioId; label: string; icon: string }> = [
  { id: "typical", label: "Typical day", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" },
  { id: "local-event", label: "Local event day", icon: "M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
];

const MOCK_ICON = "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5";

/** Segmented scenario switch; the large variant is the demo's hero control. */
export function ScenarioToggle({ value, onChange, compact = false }: { value: ScenarioId; onChange: (value: ScenarioId) => void; compact?: boolean }) {
  const seed = mockSeedOf(value);
  // Each press draws a new seed, so the button doubles as "shuffle".
  const shuffle = () => {
    let next = seed;
    while (next === seed) next = 1 + Math.floor(Math.random() * 9999);
    onChange(`mock-${next!}`);
  };
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
      <button className={seed !== null ? "on" : ""} aria-pressed={seed !== null} onClick={shuffle} title="Generate a new random, fictional dataset">
        <svg width={compact ? 16 : 20} height={compact ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d={MOCK_ICON} />
        </svg>
        {seed !== null ? `Mock data #${seed} · shuffle` : "Random mock data"}
      </button>
    </div>
  );
}
