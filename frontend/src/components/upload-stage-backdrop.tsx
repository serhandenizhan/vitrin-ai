/**
 * Yukleme kartinin sahne arka plani (ana sayfa "Kendi fotografinizla deneyin").
 *
 * Apple dili (Kaan, 30.09.2026): dekor yok. Tek bir yumusak "spot isigi"
 * ustten iner, kart zemine dogru hafifce kararir. Onceki denemeler (yuzuk
 * fotografi; izgara + elmas; buyuk silik logo + kose isaretleri) kalabalik ya
 * da "Android temali" bulundu. Saf CSS, sunucu bileseni.
 */

export function UploadStageBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#1d1b18_0%,#100f0d_55%,#0c0b0a_100%)]" />
      <div className="absolute -top-28 left-1/2 h-80 w-[46rem] max-w-[140%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(240,199,121,0.2),rgba(214,167,86,0.06)_55%,transparent)] blur-2xl" />
    </div>
  );
}
