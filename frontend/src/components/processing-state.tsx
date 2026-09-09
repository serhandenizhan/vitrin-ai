"use client";

/**
 * Isleme sirasindaki bekleme ekrani.
 *
 * Neden gecen sureyi sayiyoruz: CPU inference gercek fotograflarda ~15sn,
 * modelin ilk yuklendigi istekte ~30-35sn suruyor (bkz. kok CLAUDE.md
 * "Bilinen kisit"). Donmus gibi gorunen bir ekranda kullanici sekmeyi
 * kapatiyor; gecen sureyi ve ne beklendigini gostermek bunu onluyor.
 *
 * TASARIM: yuzde gostermiyoruz. Backend ara ilerleme bildirmiyor, dolayisiyla
 * bir yuzde cubugu UYDURMA olurdu — %80'de donan bir cubuk, hicbir sey
 * gostermemekten daha kotu. Onun yerine kullanicinin fotografi bulanik bir
 * onizleme olarak duruyor ve uzerinden bir tarama isigi geciyor: "su anda su
 * goruntu isleniyor" bilgisi dogru, hiçbir sey uydurulmuyor.
 */

import { useEffect, useState } from "react";

/** Bu surenin uzerinde "ilk istek olabilir" aciklamasi gosteriliyor. */
const YAVAS_ESIGI_SANIYE = 20;

/**
 * Asamalar SIRAYLA degil, gecen sureye gore gosteriliyor ve hepsi gercek:
 * backend gercekten once dosyayi dogruluyor, sonra modeli calistiriyor,
 * sonra maskeyi uyguluyor. Sureler kaba tahmin ama sira dogru — kullaniciya
 * yanlis bir ilerleme vaadi verilmiyor, ne yapildigi anlatiliyor.
 */
const ASAMALAR = [
  { saniye: 0, metin: "Fotoğraf doğrulanıyor" },
  { saniye: 3, metin: "Ürünün sınırı bulunuyor" },
  { saniye: 9, metin: "İnce zincir ve taş kenarları ayrıştırılıyor" },
  { saniye: 18, metin: "Kesim temizleniyor" },
];

export type ProcessingStateProps = {
  /** Kullanicinin yukledigi fotograf — bulanik onizleme olarak gosteriliyor. */
  onizlemeUrl?: string | null;
};

export function ProcessingState({ onizlemeUrl }: ProcessingStateProps) {
  const [gecenSaniye, setGecenSaniye] = useState(0);

  useEffect(() => {
    const baslangic = Date.now();
    const sayac = window.setInterval(() => {
      setGecenSaniye(Math.floor((Date.now() - baslangic) / 1000));
    }, 1000);
    return () => window.clearInterval(sayac);
  }, []);

  const asama =
    [...ASAMALAR].reverse().find((a) => gecenSaniye >= a.saniye) ?? ASAMALAR[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-10 text-center"
    >
      <div className="relative aspect-square w-full max-w-[18rem] overflow-hidden rounded-[1.25rem] bg-[#e8e8ed] ring-1 ring-black/10">
        {onizlemeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={onizlemeUrl}
            alt=""
            aria-hidden
            className="h-full w-full scale-105 object-cover opacity-60 blur-[6px]"
          />
        ) : null}

        {/* Tarama isigi — sabit hizda, sonucu tahmin etmiyor. */}
        <div className="tarama-isigi pointer-events-none absolute inset-0" />

        {/* Kose kilavuzlari: "olculuyor" hissi veren ince nisangah. */}
        <div className="pointer-events-none absolute inset-4">
          {[
            "top-0 left-0 border-t border-l",
            "top-0 right-0 border-t border-r",
            "bottom-0 left-0 border-b border-l",
            "bottom-0 right-0 border-b border-r",
          ].map((konum) => (
            <span
              key={konum}
              className={`absolute size-5 border-white/70 ${konum}`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[1.0625rem] font-medium">{asama.metin}</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {gecenSaniye} saniye
        </span>
      </div>

      <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">
        {gecenSaniye >= YAVAS_ESIGI_SANIYE
          ? "Bu ilk istek olabilir — model belleğe yükleniyor ve bu bir kereye mahsus daha uzun sürer. Sonraki fotoğraflar belirgin şekilde daha hızlı işlenir."
          : "Sayfayı kapatmayın; sonuç hazır olduğunda burada açılacak."}
      </p>
    </div>
  );
}
