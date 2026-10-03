import type { ContextSignal } from "../../../contracts/index.ts";

const PATHS: Record<ContextSignal["type"], string> = {
  event: "M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  weather: "M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 17 9a3 3 0 0 1 0 6zM8 19l-1 2M12 19l-1 2M16 19l-1 2",
  holiday: "M5 21V4h11l-2 4 2 4H5",
  pattern: "M3 17l6-6 4 4 8-8",
};

export function SignalIcon({ type, size = 16 }: { type: ContextSignal["type"]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d={PATHS[type]} />
    </svg>
  );
}
