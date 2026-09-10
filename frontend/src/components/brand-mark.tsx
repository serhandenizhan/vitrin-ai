/**
 * Vitrin AI isareti.
 *
 * Kullanicinin verdigi logonun YAZISIZ hali: yumusak bir dalga ve altinda tek
 * bir nokta. Dalga hem vitrin tentesini/kemerini hem de urunun one ciktigi
 * tepe noktasini okutuyor; nokta, o tepenin altina yerlesmis tasi.
 *
 * Neden yeniden cizilmis SVG, ekran goruntusu degil:
 *  - Her olcude net; 20 pikselde de 200 pikselde de ayni.
 *  - `currentColor` ile geliyor, yani bulundugu yerin rengini aliyor: ust
 *    cubukta altin, koyu panelde kirik beyaz. Ayri bir renk sabiti tutulmuyor.
 *  - Ayri bir dosya indirilmiyor.
 *
 * Cizgi SABIT GENISLIKTE degil, `vector-effect` de kullanilmiyor: `stroke`
 * viewBox ile birlikte olcekleniyor, dolayisiyla kucuk boyutta oran korunuyor.
 *
 * Olcu: isaret GENIS (yaklasik 4:1). Kare bir kutuya sokulmamali; kullanim
 * yerlerinde yukseklik veriliyor, genislik `w-auto` ile geliyor.
 */

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 116 34"
      fill="none"
      aria-hidden
      className={className}
      focusable="false"
    >
      {/*
        Dalga: sol uctan asagi, ortada tepe, sagda tekrar asagi ve saga
        yukselerek biten tek bir cizgi. Uclar yuvarlak (`round`) — logonun
        kendisinde de uclar kesik degil yuvarlak.

        Ortadaki tepenin denetim noktalari (50 ve 66) bilincli olarak birbirine
        YAKIN. Ilk cizimde 45.5 ve 70.5 idi; aradaki 25 birimlik acikligi
        tarayici genis ve yuvarlak bir kubbe olarak ciziyordu — isaret dalga
        degil sisman bir tumsek gibi duruyordu. Daha da yaklastirmak (52/64) ise
        tepede gorunur bir kose birakiyor. 16 birim, tepeyi belirgin ama yumusak
        tutan aralik.
      */}
      <path
        d="M4 6.5
           C5.2 20.5 12.5 27.5 23 27.5
           C40 27.5 50 8 58 8
           C66 8 76 27.5 93 27.5
           C103.5 27.5 110.8 20.5 112 6.5"
        stroke="currentColor"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tepenin altindaki nokta — dalganin tam ortasinda hizali. */}
      <circle cx="58" cy="20.4" r="3.1" fill="currentColor" />
    </svg>
  );
}
