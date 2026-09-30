/**
 * Tasin ustunde bir an parlayan dort kollu yildiz (`.hero-glint`,
 * globals.css). Konum, kapsayicinin kesri olarak verilir. "Hareketi azalt"
 * acikken CSS onu tamamen gizler.
 */
export function Glint({
  left,
  top,
  size,
  delay,
  idle = false,
}: {
  left: number;
  top: number;
  size: number;
  delay: number;
  /** Tek sefer yerine aralikli, surekli parilti (duragan sahne). */
  idle?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="-10 -10 20 20"
      className={`hero-glint pointer-events-none absolute text-white${idle ? " hero-glint-idle" : ""}`}
      style={{
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: `${size}rem`,
        height: `${size}rem`,
        animationDelay: `${delay}ms`,
      }}
    >
      <path
        d="M0-10 C0.8-1.2 1.2-0.8 10 0 C1.2 0.8 0.8 1.2 0 10 C-0.8 1.2 -1.2 0.8 -10 0 C-1.2-0.8 -0.8-1.2 0-10Z"
        fill="currentColor"
      />
    </svg>
  );
}
