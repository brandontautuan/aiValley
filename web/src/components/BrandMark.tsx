/** Brand logo mark: a crisp, scalable SVG echoing the half-filled ◐ motif.
 *  Sizes to the container's font-size (1em) and inherits color via currentColor. */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2 A10 10 0 0 0 12 22 Z" fill="currentColor" />
    </svg>
  );
}
