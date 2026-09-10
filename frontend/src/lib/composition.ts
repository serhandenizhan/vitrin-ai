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

/**
 * Urun uzerindeki gorunum ayarlari.
 *
 * Bunlar Konva'nin kendi filtrelerine besleniyor; deger araliklari Konva'nin
 * bekledigi araliklar (kendi normalize etmiyoruz ki filtre degistiginde iki
 * yerde birden duzeltme gerekmesin).
 */
export type Gorunum = {
  /** Konva `Brighten`: -1 (siyah) .. 1 (beyaz). */
  parlaklik: number;
  /** Konva `Contrast`: -100 .. 100. */
  kontrast: number;
  /** Konva `HSL` doygunluk: -2 .. 4 araliginda anlamli, 0 = degisiklik yok. */
  doygunluk: number;
  /** Urunun altina dusen golge — kompozisyonu zemine "oturtuyor". */
  golge: boolean;
  /** Zemine dusen isik havuzu — urunu one cikaran yumusak vinyet. */
  isikHavuzu: boolean;
};

export const VARSAYILAN_GORUNUM: Gorunum = {
  parlaklik: 0,
  kontrast: 0,
  doygunluk: 0,
  golge: true,
  isikHavuzu: false,
};

/** Kullanici hicbir ayara dokunmamis mi — "sifirla" dugmesini pasif tutmak icin. */
export function gorunumVarsayilanMi(gorunum: Gorunum): boolean {
  return (
    gorunum.parlaklik === VARSAYILAN_GORUNUM.parlaklik &&
    gorunum.kontrast === VARSAYILAN_GORUNUM.kontrast &&
    gorunum.doygunluk === VARSAYILAN_GORUNUM.doygunluk &&
    gorunum.golge === VARSAYILAN_GORUNUM.golge &&
    gorunum.isikHavuzu === VARSAYILAN_GORUNUM.isikHavuzu
  );
}

/**
 * Surukleme sirasinda merkeze YAKALAMA.
 *
 * Kuyumcu kompozisyonlarinin buyuk cogunlugu ortalanmis; ama fareyle tam
 * ortayi tutturmak neredeyse imkansiz ve 1-2 piksellik kayma buyutulmus
 * ciktida goze batiyor. Merkeze `TOLERANS` kadar yaklasildiginda deger tam
 * merkeze cekiliyor. Tolerans disinda serbest surukleme aynen calisiyor.
 */
export const MERKEZ_YAKALAMA_TOLERANSI = 12;

export function merkezeYakala(deger: number, merkez: number): number {
  return Math.abs(deger - merkez) <= MERKEZ_YAKALAMA_TOLERANSI ? merkez : deger;
}

/**
 * Cikti bicimleri.
 *
 * MANTIKSAL olcu her zaman ciktinin YARISI. Bu bilincli: disa aktarma orani
 * boylece her bicimde tam olarak 2 kaliyor. Kesirli bir oran, Konva'nin ic
 * hesabinda bir piksel kaybina yol aciyor — 2000 yerine 1999 px'lik tuval
 * uretildigi birebir olculdu (bkz. DISA_AKTARMA_ORANI gerekcesi).
 *
 * "Katalog" bicimi, `/katalog` sayfasindaki sablon yuvalarina birebir oturmasi
 * icin A4 orani (1:1.414). Instagram olculeri platformun kendi onerdikleri:
 * gonderi 1080x1080, hikaye 1080x1920.
 */
export type CiktiBicimi = {
  ad: string;
  ozet: string;
  ciktiGenislik: number;
  ciktiYukseklik: number;
};

export const CIKTI_BICIMLERI = {
  kare: {
    ad: "Kare",
    ozet: "2000×2000",
    ciktiGenislik: 2000,
    ciktiYukseklik: 2000,
  },
  katalog: {
    ad: "Katalog",
    ozet: "A4 oranı",
    ciktiGenislik: 1240,
    ciktiYukseklik: 1754,
  },
  gonderi: {
    ad: "Instagram gönderi",
    ozet: "1080×1080",
    ciktiGenislik: 1080,
    ciktiYukseklik: 1080,
  },
  hikaye: {
    ad: "Instagram hikâye",
    ozet: "1080×1920",
    ciktiGenislik: 1080,
    ciktiYukseklik: 1920,
  },
} as const satisfies Record<string, CiktiBicimi>;

export type CiktiBicimAdi = keyof typeof CIKTI_BICIMLERI;

/** Bir bicimin sahnedeki mantiksal olcusu — cikti olcusunun yarisi. */
export function mantiksalOlcu(bicim: CiktiBicimi): {
  genislik: number;
  yukseklik: number;
} {
  return {
    genislik: bicim.ciktiGenislik / 2,
    yukseklik: bicim.ciktiYukseklik / 2,
  };
}

/**
 * Bir gorseli verilen mantiksal sahneye ortalayip sigdiran donusum.
 *
 * `sigdirmaDonusumu`nun kare olmayan sahneler icin genellestirilmis hali;
 * kare sahnede ikisi ayni sonucu veriyor.
 */
export function sahneyeSigdir(
  sahneGenislik: number,
  sahneYukseklik: number,
  kesimGenislik: number,
  kesimYukseklik: number,
): Donusum {
  const olcek = Math.min(
    (sahneGenislik * SIGDIRMA_PAYI) / kesimGenislik,
    (sahneYukseklik * SIGDIRMA_PAYI) / kesimYukseklik,
  );
  return {
    x: sahneGenislik / 2,
    y: sahneYukseklik / 2,
    olcek,
    aci: 0,
  };
}
