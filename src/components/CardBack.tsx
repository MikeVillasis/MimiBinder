/**
 * Original, generic trading-card back for MimiBinder (no official card-back artwork or logos).
 * Deep blue, symmetric, with soft swirls and a centred emblem built from the app icon
 * (rounded card + lightning bolt). Theme-independent: a card back is the same in every theme.
 * Fills its parent; the parent supplies the 63/88 aspect and rounded corners.
 */

const SWIRL_ARMS = 12;
const C = { x: 315, y: 440 };

export function CardBack({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 630 880"
      className={`block h-full w-full ${className}`}
      role="img"
      aria-label="Card back"
      preserveAspectRatio="none"
    >
      <defs>
        <radialGradient id="mb-back-panel" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#2f6fe0" />
          <stop offset="45%" stopColor="#1a4bb0" />
          <stop offset="100%" stopColor="#0c2669" />
        </radialGradient>
        <radialGradient id="mb-back-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9cc4ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#9cc4ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mb-back-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#facc15" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
        <clipPath id="mb-back-clip">
          <rect x="30" y="30" width="570" height="820" rx="26" />
        </clipPath>
      </defs>

      {/* Darker outer border */}
      <rect width="630" height="880" fill="#0a1a4a" />
      <rect x="14" y="14" width="602" height="852" rx="30" fill="none" stroke="#163a8c" strokeWidth="4" />

      {/* Inner panel */}
      <rect x="30" y="30" width="570" height="820" rx="26" fill="url(#mb-back-panel)" />

      <g clipPath="url(#mb-back-clip)">
        {/* Soft glows, mirrored top/bottom and left/right */}
        <ellipse cx="160" cy="190" rx="230" ry="200" fill="url(#mb-back-glow)" opacity="0.5" />
        <ellipse cx="470" cy="690" rx="230" ry="200" fill="url(#mb-back-glow)" opacity="0.5" />
        <ellipse cx="470" cy="190" rx="170" ry="150" fill="url(#mb-back-glow)" opacity="0.25" />
        <ellipse cx="160" cy="690" rx="170" ry="150" fill="url(#mb-back-glow)" opacity="0.25" />

        {/* Swirl rosette: curved arms rotated around the centre */}
        <g fill="none" stroke="#bcd6ff" strokeLinecap="round">
          {Array.from({ length: SWIRL_ARMS }, (_, i) => (
            <path
              key={i}
              transform={`rotate(${(360 / SWIRL_ARMS) * i} ${C.x} ${C.y})`}
              d={`M ${C.x} ${C.y - 70} C ${C.x + 120} ${C.y - 150}, ${C.x + 60} ${C.y - 330}, ${C.x + 230} ${C.y - 420}`}
              strokeWidth="10"
              opacity="0.12"
            />
          ))}
          {Array.from({ length: SWIRL_ARMS }, (_, i) => (
            <path
              key={`t${i}`}
              transform={`rotate(${(360 / SWIRL_ARMS) * i + 15} ${C.x} ${C.y})`}
              d={`M ${C.x} ${C.y - 90} C ${C.x + 90} ${C.y - 160}, ${C.x + 40} ${C.y - 280}, ${C.x + 170} ${C.y - 360}`}
              strokeWidth="3"
              opacity="0.18"
            />
          ))}
        </g>

        {/* Concentric rings */}
        <g fill="none" stroke="#d6e6ff">
          <circle cx={C.x} cy={C.y} r="150" strokeWidth="2" opacity="0.25" />
          <circle cx={C.x} cy={C.y} r="182" strokeWidth="1" opacity="0.18" />
          <circle cx={C.x} cy={C.y} r="250" strokeWidth="1" opacity="0.1" />
        </g>

        {/* Corner sparkles (four-point stars) */}
        {[
          [90, 100],
          [540, 100],
          [90, 780],
          [540, 780],
        ].map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M ${x} ${y - 22} Q ${x + 3} ${y - 3} ${x + 22} ${y} Q ${x + 3} ${y + 3} ${x} ${y + 22} Q ${x - 3} ${y + 3} ${x - 22} ${y} Q ${x - 3} ${y - 3} ${x} ${y - 22} Z`}
            fill="#e0ecff"
            opacity="0.55"
          />
        ))}
      </g>

      {/* Centre emblem, after the app icon: a rounded card with a lightning bolt */}
      <circle cx={C.x} cy={C.y} r="140" fill="url(#mb-back-halo)" />
      <circle cx={C.x} cy={C.y} r="118" fill="#0a1a4a" stroke="#facc15" strokeWidth="6" />
      <circle cx={C.x} cy={C.y} r="104" fill="none" stroke="#facc15" strokeWidth="1.5" opacity="0.5" />
      <g transform={`translate(${C.x} ${C.y}) scale(0.5) translate(-256 -256)`}>
        <rect x="156" y="96" width="200" height="320" rx="28" fill="#161b26" stroke="#facc15" strokeWidth="14" />
        <rect x="176" y="120" width="160" height="10" rx="5" fill="#facc15" opacity="0.35" />
        <polygon points="268,160 186,276 244,276 226,352 326,228 266,228 284,160" fill="#facc15" />
      </g>
    </svg>
  );
}
