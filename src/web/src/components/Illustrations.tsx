/**
 * Spot illustrations for the landing page.
 *
 * Inline SVG for the same reasons as the logo: nothing to host, no second
 * request, and the drawings take their colours from CSS custom properties, so
 * the page owns the palette instead of each drawing hard-coding one.
 *
 * Faceless on purpose. A cartoon face turns a tool into a mascot with a
 * personality to keep consistent, and a face drawn once at one angle is the
 * first thing that looks wrong when the page changes around it.
 *
 * All of them are aria-hidden. They repeat what the words beside them already
 * say, so announcing them would only add noise for a screen reader.
 */

/**
 * The day as a ring of blocks, with someone sitting in the middle of it.
 *
 * The ring is four stroked circles rather than four arc paths: dasharray does
 * the arithmetic, so changing a segment is changing one number instead of
 * recomputing two sets of endpoint coordinates by hand.
 */
export function HeroArt() {
  // 2 * pi * 98, the circumference the dash lengths below are slices of.
  const ring = 615.75;

  return (
    <svg className="art art-hero" viewBox="0 0 400 340" fill="none" aria-hidden="true">
      <circle cx="200" cy="170" r="132" fill="var(--art-wash)" />

      <g transform="rotate(-90 200 170)" strokeWidth="22" strokeLinecap="butt">
        <circle cx="200" cy="170" r="98" stroke="var(--art-blue)" strokeDasharray={`170 ${ring}`} />
        <circle
          cx="200"
          cy="170"
          r="98"
          stroke="var(--art-amber)"
          strokeDasharray={`115 ${ring}`}
          strokeDashoffset="-182"
        />
        <circle
          cx="200"
          cy="170"
          r="98"
          stroke="var(--art-green)"
          strokeDasharray={`140 ${ring}`}
          strokeDashoffset="-309"
        />
        <circle
          cx="200"
          cy="170"
          r="98"
          stroke="var(--art-blue-soft)"
          strokeDasharray={`143 ${ring}`}
          strokeDashoffset="-461"
        />
      </g>

      {/* Seated, settled: the mat gives the figure something to sit on so it
          does not read as floating in the middle of the ring. */}
      <ellipse cx="200" cy="214" rx="54" ry="11" fill="var(--art-blue-soft)" />
      <circle cx="200" cy="146" r="15" fill="var(--art-figure)" />
      <path d="M186 168q14-8 28 0l5 28q-19 6-38 0z" fill="var(--art-figure)" />
      <path
        d="M168 198q32-10 64 0 6 16-32 18t-32-18z"
        fill="var(--art-figure)"
        opacity="0.78"
      />
      <path
        d="M187 172q-13 16-7 30M213 172q13 16 7 30"
        stroke="var(--art-figure)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* A small bell off to one side, so the mark on the page and the drawing
          are recognisably the same object. */}
      <g transform="translate(296 54) scale(0.9)" stroke="var(--art-blue)" strokeWidth="5">
        <path d="M10 26V17a9 9 0 0 1 18 0v9l3 4H7z" strokeLinejoin="round" />
        <path d="M14 32a5 5 0 0 0 10 0" strokeLinecap="round" />
        <path d="M2 14a13 13 0 0 1 3-8" strokeLinecap="round" opacity="0.45" />
      </g>

      <g fill="var(--art-amber)">
        <circle cx="74" cy="92" r="5" />
        <circle cx="330" cy="236" r="7" />
        <circle cx="96" cy="262" r="4" opacity="0.6" />
      </g>
    </svg>
  );
}

/** Two unlike activities, and the swap between them. */
export function SwitchingArt() {
  return (
    <svg className="art art-spot" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <path
        d="M34 34q26-22 52 0"
        stroke="var(--art-blue)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M41 31 34 34l3 7M79 31l7 3-3 7"
        stroke="var(--art-blue)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <rect x="14" y="42" width="38" height="38" rx="11" fill="var(--art-amber-soft)" />
      <path d="M25 61h16" stroke="var(--art-amber)" strokeWidth="4" strokeLinecap="round" />
      <rect x="20" y="55" width="6" height="12" rx="2" fill="var(--art-amber)" />
      <rect x="40" y="55" width="6" height="12" rx="2" fill="var(--art-amber)" />

      <rect x="68" y="42" width="38" height="38" rx="11" fill="var(--art-blue-soft)" />
      <rect x="76" y="52" width="22" height="15" rx="3" fill="var(--art-blue)" />
      <rect x="72" y="69" width="30" height="4" rx="2" fill="var(--art-blue)" />
    </svg>
  );
}

/** A spoken nudge rather than a siren. */
export function SpeechArt() {
  return (
    <svg className="art art-spot" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <path
        d="M20 26h58a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10H46l-16 13V70h-10a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z"
        fill="var(--art-blue-soft)"
      />
      {/* Three bars of unequal length: the same message is never repeated
          twice, which is the point of the card beside this. */}
      <path
        d="M28 40h40M28 50h28M28 60h34"
        stroke="var(--art-blue)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M98 34a16 16 0 0 1 0 28M106 26a26 26 0 0 1 0 44"
        stroke="var(--art-amber)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The parts of a day that are not work. */
export function EverywhereArt() {
  return (
    <svg className="art art-spot" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <rect x="14" y="12" width="40" height="34" rx="10" fill="var(--art-blue-soft)" />
      <path
        d="M26 32 36 23l10 9"
        stroke="var(--art-blue)"
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M29 32v8h14v-8" stroke="var(--art-blue)" strokeWidth="3.5" strokeLinejoin="round" />

      <rect x="66" y="12" width="40" height="34" rx="10" fill="var(--art-amber-soft)" />
      <rect x="76" y="21" width="20" height="16" rx="3" stroke="var(--art-amber)" strokeWidth="3.5" />
      <path d="M86 21v16" stroke="var(--art-amber)" strokeWidth="3.5" />

      <rect x="14" y="54" width="40" height="34" rx="10" fill="var(--art-green-soft)" />
      <path
        d="M25 67q11 16 22 0"
        stroke="var(--art-green)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M23 67h26" stroke="var(--art-green)" strokeWidth="3.5" strokeLinecap="round" />

      <rect x="66" y="54" width="40" height="34" rx="10" fill="var(--art-blue-soft)" />
      <rect x="76" y="63" width="15" height="17" rx="4" stroke="var(--art-blue)" strokeWidth="3.5" />
      <path
        d="M92 68q6 3.5 0 7"
        stroke="var(--art-blue)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
