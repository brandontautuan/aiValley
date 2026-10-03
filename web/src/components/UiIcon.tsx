type IconName = "calendar" | "bookmark" | "grid" | "chart" | "compass" | "sliders" | "chevronDown" | "arrowRight" | "arrowDown" | "check" | "warning" | "close" | "search" | "spark" | "shield" | "layers";

const paths: Record<IconName, string> = {
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  bookmark: "M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z",
  grid: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  chart: "M4 4v16h16M7 16l4-5 3 2 5-6",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
  sliders: "M4 7h9m4 0h3M4 17h3m4 0h9M13 5v4m-2 6v4",
  chevronDown: "m6 9 6 6 6-6",
  arrowRight: "M4 12h16m-6-6 6 6-6 6",
  arrowDown: "M12 4v16m-6-6 6 6 6-6",
  check: "m5 12 4 4L19 6",
  warning: "M12 3 2.5 20h19L12 3Zm0 6v5m0 3h.01",
  close: "M5 5l14 14M19 5 5 19",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6 12 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Zm-3 9 2 2 4-4",
  layers: "M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5",
};

export function UiIcon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
