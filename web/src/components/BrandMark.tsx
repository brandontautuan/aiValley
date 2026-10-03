/** Quiet, scalable star mark for the fictional cafe demo.
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
      <path d="M12 2.5 13.8 10.2 21.5 12l-7.7 1.8L12 21.5l-1.8-7.7L2.5 12l7.7-1.8L12 2.5Z" fill="currentColor" />
    </svg>
  );
}
