import type { LocationOutlook } from "../../../contracts/index.ts";
import { hour, units } from "../format.ts";

/** Hourly orders: usual baseline vs. scenario estimate, with capacity and the focus window. */
export function HourlyChart({ outlook }: { outlook: LocationOutlook }) {
  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const capacity = outlook.hours[0]?.capacityOrders ?? 0;
  const max = Math.max(capacity, ...outlook.hours.map((entry) => entry.scenarioOrders)) * 1.1;
  const slot = (width - pad.left - pad.right) / outlook.hours.length;
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
  const x = (index: number) => pad.left + index * slot;
  const focusStart = outlook.hours.findIndex((entry) => entry.hour === outlook.focusWindow.startHour);
  const focusLength = outlook.focusWindow.endHour - outlook.focusWindow.startHour;
  const step = max > 60 ? 20 : 10;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, index) => index * step);

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hourly orders: usual baseline and scenario estimate">
        {focusStart >= 0 && (
          <rect className="focus" x={x(focusStart)} y={pad.top} width={slot * focusLength} height={height - pad.top - pad.bottom} rx={4} />
        )}
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
            <text className="axis" x={pad.left - 6} y={y(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        {outlook.hours.map((entry, index) => {
          const over = entry.scenarioOrders >= entry.capacityOrders * 0.9;
          return (
            <g key={entry.hour}>
              <rect className="bar-baseline" x={x(index) + slot * 0.12} y={y(entry.baselineOrders)} width={slot * 0.76} height={y(0) - y(entry.baselineOrders)} rx={3} />
              <rect className={`bar-scenario ${over ? "over" : ""}`} x={x(index) + slot * 0.28} y={y(entry.scenarioOrders)} width={slot * 0.44} height={y(0) - y(entry.scenarioOrders)} rx={3}>
                <title>{`${hour(entry.hour)}: ${units(entry.scenarioOrders)} expected (usual ${units(entry.baselineOrders)})${entry.adjustment ? `, ${Math.round(entry.adjustment * 100)}% assumed adjustment` : ""}`}</title>
              </rect>
              <text className="axis" x={x(index) + slot / 2} y={height - 10} textAnchor="middle">{hour(entry.hour)}</text>
            </g>
          );
        })}
        <line className="capacity" x1={pad.left} x2={width - pad.right} y1={y(capacity)} y2={y(capacity)} />
        <text className="axis capacity-label" x={width - pad.right} y={y(capacity) - 4} textAnchor="end">capacity {capacity}/hr</text>
      </svg>
      <figcaption className="legend">
        <span><i className="swatch baseline" /> Usual (same weekday, past {outlook.observationCount}+ weeks)</span>
        <span><i className="swatch scenario" /> Estimate for this scenario</span>
        <span><i className="swatch focus" /> Window under review</span>
      </figcaption>
    </figure>
  );
}
