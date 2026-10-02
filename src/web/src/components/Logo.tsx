/**
 * The mark: a bell with two arcs leaving it.
 *
 * Inline SVG rather than a file — it is a few hundred bytes, needs no second
 * request, and inherits `currentColor`, so it follows the theme without a
 * second asset for dark mode.
 */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      // Decorative: the wordmark beside it already carries the name, so a
      // screen reader announcing both would just say it twice.
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 34V22a9 9 0 0 1 18 0v12l3 4H15l3-4Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M23 40a4 4 0 0 0 8 0"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* The nudge itself: sound leaving the bell. */}
      <path
        d="M11 20a9 9 0 0 1 2.6-5.6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M6 17a15 15 0 0 1 4.2-9.2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}
