/**
 * Vitrin AI logosu.
 *
 * Fikir: "vitrin" bir cerceve, icindeki de urun. Isaret, yuvarlatilmis bir
 * kare cerceve (vitrin camı) ve icinde briyan kesim bir tas. Ikisi birlikte
 * hem sektoru (kuyum) hem urunu (bir seyi cerceveleyip one cikarmak)
 * anlatiyor.
 *
 * Neden SVG ve tek renk: 20 pikselde de 200 pikselde de ayni netlikte
 * duruyor, tema degisiminde `currentColor` ile geliyor, ve ayri bir dosya
 * indirmiyor. Fasetalar sabit genislikte cizgi degil DOLGU — kucultuldugunde
 * ince cizgiler once kayboluyordu.
 */

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      focusable="false"
    >
      {/* Vitrin cercevesi */}
      <rect
        x="2.6"
        y="2.6"
        width="18.8"
        height="18.8"
        rx="5.2"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />

      {/* Tas — govde */}
      <path
        d="M9.1 9.6h5.8l1.5 2.5L12 17.6 7.6 12.1z"
        fill="currentColor"
      />

      {/* Masa (table) fasetasi — govdeden biraz daha koyu bir kesit yerine
          bosluk birakiliyor; kucuk olculerde bu, tasin duz bir ucgen degil
          kesilmis bir tas oldugunu okutan tek ipucu. */}
      <path
        d="M9.1 9.6h5.8l-1.1 2.5h-3.6z"
        fill="#000"
        opacity="0.28"
      />
    </svg>
  );
}

/** Isaret + yazi. Ust cubukta ve kenar cubugunda birlikte kullaniliyor. */
export function BrandLockup({ className }: BrandMarkProps) {
  return (
    <span className={className}>
      <BrandMark className="text-gold size-[1.35em] shrink-0" />
      <span className="font-semibold tracking-[-0.01em] whitespace-nowrap">
        Vitrin <span className="text-gold">AI</span>
      </span>
    </span>
  );
}
