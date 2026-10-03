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
  // 2 * pi * 104, the circumference the dash lengths below are slices of.
  const ring = 653.45;

  return (
    <svg className="art art-hero" viewBox="0 0 360 340" fill="none" aria-hidden="true">
      <circle cx="180" cy="168" r="132" fill="var(--art-wash)" />

      <g transform="rotate(-90 180 168)" strokeWidth="24">
        <circle cx="180" cy="168" r="104" stroke="var(--art-ink)" strokeDasharray={`178 ${ring}`} />
        <circle
          cx="180"
          cy="168"
          r="104"
          stroke="var(--art-coral)"
          strokeDasharray={`120 ${ring}`}
          strokeDashoffset="-190"
        />
        <circle
          cx="180"
          cy="168"
          r="104"
          stroke="var(--art-green)"
          strokeDasharray={`146 ${ring}`}
          strokeDashoffset="-322"
        />
        {/* The part of the day still unspoken for. */}
        <circle
          cx="180"
          cy="168"
          r="104"
          stroke="var(--art-fill)"
          strokeDasharray={`167 ${ring}`}
          strokeDashoffset="-480"
        />
      </g>

      {/* Seated, settled: the mat gives the figure something to sit on so it
          does not read as floating in the middle of the ring. */}
      <ellipse cx="180" cy="216" rx="56" ry="12" fill="var(--art-mat)" />
      <circle cx="180" cy="144" r="17" fill="var(--art-figure)" />
      <path d="M164 168q16-9 32 0l6 30q-22 7-44 0z" fill="var(--art-figure)" />
      <path
        d="M146 200q34-11 68 0 7 17-34 19t-34-19z"
        fill="var(--art-figure)"
        opacity="0.78"
      />
      <path
        d="M166 172q-14 17-8 32M194 172q14 17 8 32"
        stroke="var(--art-figure)"
        strokeWidth="8"
        strokeLinecap="round"
      />

      <circle cx="54" cy="86" r="7" fill="var(--art-coral)" />
      <circle cx="312" cy="236" r="9" fill="var(--art-green)" />
      <circle cx="76" cy="258" r="5" fill="var(--art-coral)" opacity="0.6" />
    </svg>
  );
}

/** Two unlike activities, and the swap between them. */
export function SwitchingArt() {
  return (
    <svg className="art art-spot" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <path d="M34 34q26-22 52 0" stroke="var(--art-ink)" strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M41 31 34 34l3 7M79 31l7 3-3 7"
        stroke="var(--art-ink)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <rect x="14" y="42" width="38" height="38" rx="12" fill="var(--art-fill)" />
      <path d="M25 61h16" stroke="var(--art-coral)" strokeWidth="4" strokeLinecap="round" />
      <rect x="20" y="55" width="6" height="12" rx="2" fill="var(--art-coral)" />
      <rect x="40" y="55" width="6" height="12" rx="2" fill="var(--art-coral)" />

      <rect x="68" y="42" width="38" height="38" rx="12" fill="var(--art-fill)" />
      <rect x="76" y="52" width="22" height="15" rx="3" fill="var(--art-ink)" />
      <rect x="72" y="69" width="30" height="4" rx="2" fill="var(--art-ink)" />
    </svg>
  );
}

/** A spoken nudge rather than a siren. */
export function SpeechArt() {
  return (
    <svg className="art art-spot" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <path
        d="M20 26h58a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10H46l-16 13V70h-10a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z"
        fill="var(--art-fill)"
      />
      {/* Three bars of unequal length: no two repeats say the same thing,
          which is the point of the card beside this. */}
      <path
        d="M28 40h40M28 50h28M28 60h34"
        stroke="var(--art-coral)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M98 34a16 16 0 0 1 0 28M106 26a26 26 0 0 1 0 44"
        stroke="var(--art-coral-deep)"
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
      <rect x="14" y="12" width="40" height="34" rx="11" fill="var(--art-fill)" />
      <path
        d="M26 32 36 23l10 9"
        stroke="var(--art-green)"
        strokeWidth="3.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M29 32v8h14v-8" stroke="var(--art-green)" strokeWidth="3.4" strokeLinejoin="round" />

      <rect x="66" y="12" width="40" height="34" rx="11" fill="var(--art-fill)" />
      <rect x="76" y="21" width="20" height="16" rx="3" stroke="var(--art-green)" strokeWidth="3.4" />
      <path d="M86 21v16" stroke="var(--art-green)" strokeWidth="3.4" />

      <rect x="14" y="54" width="40" height="34" rx="11" fill="var(--art-fill)" />
      <path
        d="M25 67q11 16 22 0"
        stroke="var(--art-green)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M23 67h26" stroke="var(--art-green)" strokeWidth="3.4" strokeLinecap="round" />

      <rect x="66" y="54" width="40" height="34" rx="11" fill="var(--art-fill)" />
      <rect x="76" y="63" width="15" height="17" rx="4" stroke="var(--art-green)" strokeWidth="3.4" />
      <path d="M92 68q6 3.5 0 7" stroke="var(--art-green)" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
