type IconName = "calendar" | "bookmark" | "grid" | "sliders" | "chevronDown" | "arrowRight" | "check" | "warning" | "close";

const paths: Record<IconName, string> = {
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  bookmark: "M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z",
  grid: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  sliders: "M4 7h9m4 0h3M4 17h3m4 0h9M13 5v4m-2 6v4",
  chevronDown: "m6 9 6 6 6-6",
  arrowRight: "M4 12h16m-6-6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  warning: "M12 3 2.5 20h19L12 3Zm0 6v5m0 3h.01",
  close: "M5 5l14 14M19 5 5 19",
};

export function UiIcon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
