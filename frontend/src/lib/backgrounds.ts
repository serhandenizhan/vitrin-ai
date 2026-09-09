/**
 * Zemin (arka plan) kaynagi: yer tutucular, sunucudan gelenler ve imzali
 * URL'lerin yenilenmesi.
 *
 * Yol haritasi (ROADMAP.md Faz 3) bu dosyanin cozmesi gereken iki tuzagi
 * acikca isaretlemisti:
 *
 *  1. "Backend bos liste donerse editor yer tutucu zeminlere SESSIZCE dusmeli,
 *     hic kirilmamali."
 *  2. "Zemin gorsellerinin R2'den gelen imzali URL'leri sureli — editor uzun
 *     sure acik kalirsa yeniden fetch/refresh mekanizmasi gerekir (onceki
 *     iterasyonda bu atlanip sessiz bir hata haline gelmisti, bu sefer bastan
 *     tasarlanmali)."
 *
 * Ikisi de burada, tek yerde cozuluyor; editor bilesenleri "zeminim var mi,
 * URL'im hala gecerli mi" sorularini hic sormuyor.
 */

/**
 * Yer tutucu zeminler bilincli olarak DOSYA DEGIL, kod icinde gradyan tanimi.
 *
 * Iki sebep:
 *  - `CLAUDE.md`: kaynagi olmayan ikili dosyalar commit edilmiyor. Bir gradyan
 *    icin PNG uretip depoya koymak, ileride "bu nereden geldi, nasil
 *    degistirilir" sorusunu cevapsiz birakirdi.
 *  - Sayfa agirligi: dort zemin = dort istek + birkac yuz KB yerine sifir bayt.
 *
 * Renkler `globals.css`'teki yuzey paletiyle ayni ailede (kuyumcu vitrinini
 * andiran koyu/notr tonlar + altin vurgu). Gercek zeminler geldiginde bunlar
 * kaybolmuyor: kullanici yine de sade bir zemin isteyebilir.
 */
export type YerTutucuZemin = {
  tur: "yer-tutucu";
  id: string;
  ad: string;
  /** Konva `fillLinearGradientColorStops` formatinda: [oran, renk, ...]. */
  gradyan: (number | string)[];
};

export type SunucuZemini = {
  tur: "sunucu";
  id: string;
  ad: string;
  url: string;
  /** Bu URL'in uretildigi andan itibaren gecerli kalacagi sure (saniye). */
  gecerlilikSaniye: number;
  /** URL'in alindigi an (ms, `Date.now()`). Yenileme hesabi buna dayaniyor. */
  alinmaZamani: number;
};

export type Zemin = YerTutucuZemin | SunucuZemini;

export const YER_TUTUCU_ZEMINLER: YerTutucuZemin[] = [
  {
    tur: "yer-tutucu",
    id: "yer-tutucu-kadife",
    ad: "Kadife siyah",
    gradyan: [0, "#1d1d1f", 1, "#000000"],
  },
  {
    tur: "yer-tutucu",
    id: "yer-tutucu-sis",
    ad: "Sis beyazı",
    gradyan: [0, "#ffffff", 1, "#f5f5f7"],
  },
  {
    tur: "yer-tutucu",
    id: "yer-tutucu-altin",
    ad: "Altın hale",
    gradyan: [0, "#3a2f1c", 0.55, "#7a6231", 1, "#241d12"],
  },
  {
    tur: "yer-tutucu",
    id: "yer-tutucu-sicak-gri",
    ad: "Sıcak gri",
    gradyan: [0, "#d8d4cf", 1, "#a8a29b"],
  },
];

/**
 * Imzali URL'i, suresi dolmadan ONCE yenilemek icin kullanilan pay.
 *
 * %75'te yenilemek, bir saatlik bir URL icin 45 dakikada bir tek kucuk JSON
 * istegi demek — ihmal edilebilir bir maliyet. Buna karsilik suresi dolmus bir
 * URL, kullanicinin ekraninda sessizce kirik bir zemin olarak gorunurdu ve
 * kullanici bunu kendi hatasi sanirdi. Ucuz olan tarafta hata yapiyoruz.
 */
export const YENILEME_ORANI = 0.75;

/** Cok kisa sureler icin alt sinir — saniyede bir istek atmayalim. */
export const EN_KISA_YENILEME_MS = 30_000;

/**
 * Bir zemin listesinin ne kadar sonra yenilenmesi gerektigi (ms).
 *
 * En erken olen URL belirleyici: liste tek seferde yenilendigi icin, en kisa
 * omurlu kayit hepsini birden tetikler. `null` -> yenileme gerekmiyor
 * (sunucudan gelen zemin yok, yalnizca yer tutucular var; onlarin suresi
 * dolmaz).
 */
export function yenilemeGecikmesiHesapla(
  zeminler: Zemin[],
  simdi: number = Date.now(),
): number | null {
  const sunucuZeminleri = zeminler.filter(
    (zemin): zemin is SunucuZemini => zemin.tur === "sunucu",
  );
  if (sunucuZeminleri.length === 0) return null;

  const gecikmeler = sunucuZeminleri.map((zemin) => {
    const gecen = simdi - zemin.alinmaZamani;
    const omurMs = zemin.gecerlilikSaniye * 1000;
    return omurMs * YENILEME_ORANI - gecen;
  });

  // `Math.max(..., EN_KISA_YENILEME_MS)`: gecikme negatif cikabilir (sekme uzun
  // sure arka planda kalip zamanlayici gec calistiginda). Negatif bir gecikme
  // ile hemen yenilemek dogru, ama sifira yakin degerler bir yenileme
  // dongusune yol acabilir — alt sinir bunu engelliyor.
  return Math.max(Math.min(...gecikmeler), EN_KISA_YENILEME_MS);
}

type HamArkaPlan = {
  id: string;
  url: string;
  expiresIn: number;
};

/**
 * Zeminleri vekilden ceker.
 *
 * Hicbir kosulda FIRLATMAZ. Vekil zaten backend'e ulasamadiginda bos liste
 * donuyor; burada ag hatasi/bozuk govde de ayni sekilde bos listeye dusuyor.
 * Cagiran taraf icin tek bir durum var: "gelen sunucu zemini sayisi".
 */
export async function zeminleriGetir(
  fetchFn: typeof fetch = fetch,
): Promise<SunucuZemini[]> {
  try {
    const yanit = await fetchFn("/api/backgrounds", { cache: "no-store" });
    if (!yanit.ok) return [];

    const govde: unknown = await yanit.json();
    if (!Array.isArray(govde)) return [];

    const alinmaZamani = Date.now();
    return govde
      .filter(
        (kayit): kayit is HamArkaPlan =>
          typeof kayit === "object" &&
          kayit !== null &&
          typeof (kayit as HamArkaPlan).id === "string" &&
          typeof (kayit as HamArkaPlan).url === "string",
      )
      .map((kayit, sira) => ({
        tur: "sunucu" as const,
        id: kayit.id,
        ad: `Zemin ${sira + 1}`,
        url: kayit.url,
        gecerlilikSaniye:
          typeof kayit.expiresIn === "number" && kayit.expiresIn > 0
            ? kayit.expiresIn
            : 600,
        alinmaZamani,
      }));
  } catch {
    return [];
  }
}

/**
 * Editorun gorecegi tam liste: yer tutucular her zaman var, sunucu zeminleri
 * varsa onlerine ekleniyor.
 *
 * Yer tutucular listeden HIC cikmiyor — gercek zeminler geldiginde de duruyor.
 * Boylece "zemin listesi bos" diye bir durum olusmuyor ve editor bu ihtimali
 * hic ele almak zorunda kalmiyor.
 */
export function zeminListesiOlustur(sunucuZeminleri: SunucuZemini[]): Zemin[] {
  return [...sunucuZeminleri, ...YER_TUTUCU_ZEMINLER];
}
