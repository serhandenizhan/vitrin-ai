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
export type PlaceholderBackground = {
  type: "yer-tutucu";
  id: string;
  name: string;
  /** Konva `fillLinearGradientColorStops` formatinda: [oran, renk, ...]. */
  gradient: (number | string)[];
};

export type ServerBackground = {
  type: "sunucu";
  id: string;
  name: string;
  url: string;
  /** Bu URL'in uretildigi andan itibaren gecerli kalacagi sure (saniye). */
  expiresInSeconds: number;
  /** URL'in alindigi an (ms, `Date.now()`). Yenileme hesabi buna dayaniyor. */
  fetchedAt: number;
};

export type Background = PlaceholderBackground | ServerBackground;

export const PLACEHOLDER_BACKGROUNDS: PlaceholderBackground[] = [
  {
    type: "yer-tutucu",
    id: "yer-tutucu-kadife",
    name: "Kadife siyah",
    gradient: [0, "#1d1d1f", 1, "#000000"],
  },
  {
    type: "yer-tutucu",
    id: "yer-tutucu-sis",
    name: "Sis beyazı",
    gradient: [0, "#ffffff", 1, "#f5f5f7"],
  },
  {
    type: "yer-tutucu",
    id: "yer-tutucu-altin",
    name: "Altın hale",
    gradient: [0, "#3a2f1c", 0.55, "#7a6231", 1, "#241d12"],
  },
  {
    type: "yer-tutucu",
    id: "yer-tutucu-sicak-gri",
    name: "Sıcak gri",
    gradient: [0, "#d8d4cf", 1, "#a8a29b"],
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
export const REFRESH_RATIO = 0.75;

/**
 * Bir zemin listesinin ne kadar sonra yenilenmesi gerektigi (ms).
 *
 * En erken olen URL belirleyici: liste tek seferde yenilendigi icin, en kisa
 * omurlu kayit hepsini birden tetikler. `null` -> yenileme gerekmiyor
 * (sunucudan gelen zemin yok, yalnizca yer tutucular var; onlarin suresi
 * dolmaz).
 */
export function calculateRefreshDelay(
  zeminler: Background[],
  simdi: number = Date.now(),
): number | null {
  const sunucuZeminleri = zeminler.filter(
    (zemin): zemin is ServerBackground => zemin.type === "sunucu",
  );
  if (sunucuZeminleri.length === 0) return null;

  const gecikmeler = sunucuZeminleri.map((zemin) => {
    const gecen = simdi - zemin.fetchedAt;
    const omurMs = zemin.expiresInSeconds * 1000;
    return omurMs * REFRESH_RATIO - gecen;
  });

  // Gecikme negatif cikabilir (sekme uzun sure arka planda kalip zamanlayici
  // gec calistiginda). Bu durumda hemen yenilemek gerekir; sabit bir alt sinir
  // cok kisa omurlu URL'leri sureleri dolduktan sonra yenilerdi.
  return Math.max(Math.min(...gecikmeler), 0);
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
export async function fetchBackgrounds(
  fetchFn: typeof fetch = fetch,
): Promise<ServerBackground[]> {
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
        type: "sunucu" as const,
        id: kayit.id,
        name: `Zemin ${sira + 1}`,
        url: kayit.url,
        expiresInSeconds:
          typeof kayit.expiresIn === "number" && kayit.expiresIn > 0
            ? kayit.expiresIn
            : 600,
        fetchedAt: alinmaZamani,
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
export function createBackgroundList(sunucuZeminleri: ServerBackground[]): Background[] {
  return [...sunucuZeminleri, ...PLACEHOLDER_BACKGROUNDS];
}
