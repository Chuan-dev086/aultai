// Product illustrations drawn in SVG, so the store needs no image files.
export default function Art({ type, color }) {
  const light = "rgba(255,255,255,.9)";
  const shapes = {
    bag: (
      <svg viewBox="0 0 100 120" aria-hidden="true">
        <path d="M22 18 L78 18 L86 112 L14 112 Z" fill={color} />
        <path d="M22 18 L30 8 L70 8 L78 18 Z" fill={color} opacity=".75" />
        <rect x="32" y="48" width="36" height="28" rx="3" fill={light} />
        <circle cx="50" cy="62" r="7" fill={color} />
      </svg>
    ),
    dripper: (
      <svg viewBox="0 0 100 120" aria-hidden="true">
        <path d="M14 22 L86 22 L62 70 L38 70 Z" fill={color} />
        <rect x="30" y="70" width="40" height="8" rx="2" fill={color} opacity=".7" />
        <path d="M28 82 L72 82 L68 112 L32 112 Z" fill={light} stroke={color} strokeWidth="3" />
        <path d="M36 98 L64 98 L66 112 L34 112 Z" fill={color} opacity=".55" />
      </svg>
    ),
    grinder: (
      <svg viewBox="0 0 100 120" aria-hidden="true">
        <rect x="32" y="34" width="36" height="78" rx="8" fill={color} />
        <rect x="32" y="60" width="36" height="6" fill={light} opacity=".5" />
        <line x1="50" y1="34" x2="50" y2="18" stroke={color} strokeWidth="5" />
        <line x1="50" y1="18" x2="82" y2="12" stroke={color} strokeWidth="5" strokeLinecap="round" />
        <circle cx="84" cy="12" r="7" fill={color} opacity=".8" />
      </svg>
    ),
    kettle: (
      <svg viewBox="0 0 100 120" aria-hidden="true">
        <path d="M24 46 Q24 36 34 36 L66 36 Q76 36 76 46 L78 104 L22 104 Z" fill={color} />
        <path d="M24 60 Q8 60 6 34" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
        <path d="M76 50 Q94 50 92 80 Q90 94 76 92" fill="none" stroke={color} strokeWidth="6" />
        <rect x="42" y="28" width="16" height="8" rx="3" fill={color} opacity=".7" />
        <rect x="18" y="104" width="64" height="8" rx="3" fill={color} opacity=".55" />
      </svg>
    ),
    cup: (
      <svg viewBox="0 0 100 120" aria-hidden="true">
        <path d="M18 44 L74 44 L68 104 Q66 110 60 110 L32 110 Q26 110 24 104 Z" fill={color} />
        <path d="M73 56 Q92 56 90 74 Q88 90 70 88" fill="none" stroke={color} strokeWidth="6" />
        <ellipse cx="46" cy="44" rx="28" ry="6" fill={light} opacity=".55" />
        <path d="M38 18 Q34 26 40 32 M52 14 Q48 24 54 32" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" opacity=".6" />
      </svg>
    ),
  };
  return shapes[type] || shapes.bag;
}
