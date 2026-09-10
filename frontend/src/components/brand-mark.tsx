/**
 * Vitrin AI isareti.
 *
 * Kullanicinin verdigi logonun YAZISIZ hali. Dalga rastgele bir sus degil,
 * markanin adini yaziyor:
 *  - Bastaki inis ve cikis  -> V
 *  - Ortadaki yuksek tepe   -> A
 *  - Sondaki kisa yukselis  -> ı
 *  - Soldaki ayri nokta     -> İ'nin noktasi
 *
 * Bu yuzden oranlar keyfi degil: ortadaki tepe belirgin sekilde daha YUKSEK
 * (harf olarak okunmasi buna bagli), soldaki vadi derin ve dar (V), sagdaki
 * vadi daha kisa (ı). Bunlari esitlemek isareti anlamsiz bir dalgaya cevirir.
 *
 * Noktanin cizgiye DEGMEMESI gerekiyor: degdigi anda ayri bir harf isareti
 * olmaktan cikip cizginin bir parcasi gibi okunuyor. Aradaki bosluk kucuk ama
 * bilincli.
 *
 * Neden yeniden cizilmis SVG, ekran goruntusu degil:
 *  - Her olcude net; 20 pikselde de 200 pikselde de ayni.
 *  - `currentColor` ile geliyor, yani bulundugu yerin rengini aliyor: ust
 *    cubukta altin, koyu panelde kirik beyaz. Ayri bir renk sabiti tutulmuyor.
 *  - Ayri bir dosya indirilmiyor.
 *
 * Olcu: isaret GENIS (yaklasik 1.5:1). Kare bir kutuya sokulmamali; kullanim
 * yerlerinde yukseklik veriliyor, genislik `w-auto` ile geliyor.
 */

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 70.5 46"
      fill="none"
      aria-hidden
      className={className}
      focusable="false"
    >
      {/* İ'nin noktasi — cizgiden ayri duruyor. */}
      <circle cx="2.8" cy="21.5" r="2.7" fill="currentColor" />

      <path
        d="M9.5 13
           C9 26 16.5 42 24 42
           C30.5 42 32.5 15 44 3.5
           C51 -1.5 53.5 26 59 31.5
           C63 35.5 66 28 67 12"
        stroke="currentColor"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
