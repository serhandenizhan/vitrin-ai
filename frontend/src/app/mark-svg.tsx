/**
 * Marka isareti, `next/og` (satori) icin: brand-mark.tsx ile AYNI yol
 * verileri. Renk dogrudan verilir (currentColor satori'de calismaz).
 * Isaret degisirse iki dosya birlikte guncellenir.
 */
export const MARK_GOLD = "#d1a25b";

export function MarkSvg({ height, color = MARK_GOLD }: { height: number; color?: string }) {
  return (
    <svg width={(height * 70.5) / 46} height={height} viewBox="0 0 70.5 46" fill="none">
      <polygon
        points="1.75,13.5 3.85,13.5 4.85,14.7 2.8,17.3 0.75,14.7"
        fill={color}
        stroke={color}
        strokeWidth="0.45"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 13 C9 26 16.5 42 24 42 C30.5 42 32.5 15 44 3.5 C51 -1.5 53.5 26 59 31.5 C63 35.5 66 28 67 12"
        stroke={color}
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
