/**
 * Turkiye'nin 81 ili (alfabetik).
 *
 * Kaynak: tr.wikipedia.org "Türkiye'nin illeri" (13.09.2026'da dogrulandi).
 * Ilk surum hafizadan yazilmisti ve iki hata tasiyordu ("Ilgaz" bir il degil
 * ilce; "Iğdır" eksikti) — bu yuzden liste kaynaktan alindi ve adet/tekrar
 * testle korunuyor (bkz. turkey-cities.test.ts).
 *
 * Kayit formundaki "Sehir" secimi icin. Serbest metin yerine sabit liste:
 * "Istanbul", "İST" gibi yazim farklari olmasin ve deger dogrulanabilsin.
 */
export const TURKEY_CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara",
  "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman",
  "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa",
  "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne",
  "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun",
  "Gümüşhane", "Hakkâri", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir",
  "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri",
  "Kırıkkale", "Kırklareli", "Kırşehir", "Kilis", "Kocaeli", "Konya", "Kütahya",
  "Malatya", "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde",
  "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas",
  "Şanlıurfa", "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak",
  "Van", "Yalova", "Yozgat", "Zonguldak",
] as const;

export type TurkeyCity = (typeof TURKEY_CITIES)[number];

/** Secim listesinde Turkce alfabe sirasiyla gosterim icin. */
export const TURKEY_CITIES_SORTED: readonly TurkeyCity[] = [...TURKEY_CITIES].sort((a, b) =>
  a.localeCompare(b, "tr"),
);
