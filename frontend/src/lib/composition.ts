/**
 * Kompozisyon sahnesinin saf geometrisi.
 *
 * Konva'dan ve React'ten BAGIMSIZ tutuluyor: `editor-stage.tsx` icine yazilsaydi
 * bu fonksiyonlari test etmek, Node ortaminda `konva` + `react-konva` yuklemeyi
 * (ve canvas bagimliligini) gerektirirdi. Saf sayilarla calisan bir modul olarak
 * ayrildiginda hem test ucuz hem de kurallar tek yerde okunabilir kaliyor.
 */

/** Sahnenin mantiksal olcusu. Disa aktarma bunun katlari olarak yapiliyor. */
export const SAHNE_OLCUSU = 1000;

/** Yol haritasindaki cikti olcusu (ROADMAP.md Faz 3). */
export const CIKTI_OLCUSU = 2000;

/** Urunun sahneye ilk yerlesirken kaplayacagi oran (kenarlarda pay kalsin). */
export const SIGDIRMA_PAYI = 0.72;

export type Donusum = {
  x: number;
  y: number;
  olcek: number;
  aci: number;
};

/**
 * Bir gorseli sahneye ortalayip sigdiran donusumu hesaplar.
 *
 * `Math.min` ile olcekleniyor ki hem cok genis hem cok uzun gorseller sahneye
 * TAMAMEN sigsin — `Math.max` kullanilsaydi gorselin uzun kenari tasar ve
 * kullanici urunun kirpildigini sanirdi.
 */
export function sigdirmaDonusumu(
  kesimGenislik: number,
  kesimYukseklik: number,
): Donusum {
  const olcek = Math.min(
    (SAHNE_OLCUSU * SIGDIRMA_PAYI) / kesimGenislik,
    (SAHNE_OLCUSU * SIGDIRMA_PAYI) / kesimYukseklik,
  );
  return { x: SAHNE_OLCUSU / 2, y: SAHNE_OLCUSU / 2, olcek, aci: 0 };
}

/**
 * Aciyi 0-359 araligina normalize eder.
 *
 * Kullanici "15° dondur"e defalarca basinca aci 1080 gibi anlamsiz bir sayiya
 * cikardi; gosterilen deger de sahnedeki gorsel aci ile ayrisirdi. JavaScript'in
 * `%` operatoru negatif sayilarda negatif dondugu icin (`-15 % 360 === -15`)
 * ikinci bir toplama+mod gerekiyor.
 */
export function aciyiNormalize(derece: number): number {
  return ((derece % 360) + 360) % 360;
}

/**
 * Disa aktarma icin kullanilacak piksel orani.
 *
 * Bilincli olarak EKRAN olcusune degil MANTIKSAL olcuye dayaniyor. Once
 * `CIKTI_OLCUSU / ekranGenisligi` kullaniliyordu; ekran genisligi kapsayiciya
 * gore degisken ve genellikle yuvarlak degil (434 px olculdu), oran 4.6082...
 * cikiyor ve Konva 2000 yerine 1999 px'lik bir tuval uretiyordu. Yol haritasi
 * cikti olcusunu sayiyla belirtiyor; 1999 sessizce yanlis bir cikti demek.
 */
export const DISA_AKTARMA_ORANI = CIKTI_OLCUSU / SAHNE_OLCUSU;
