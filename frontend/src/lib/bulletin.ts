/**
 * Vitrin AI bulteni — icerik (one alinan is, 17.09.2026).
 *
 * Icerik KODDA duruyor (Kaan karari): veritabanina ve backend'e dokunmuyor.
 * Yeni bir paylasim eklemek icin `POSTS` dizisinin BASINA bir kayit eklemek
 * yeterli; sayfa tarihe gore siraliyor. Admin paneli (Faz 6) geldiginde bu
 * dizi oraya tasinabilir.
 *
 * Kural: yazilan her ozellik sitede GERCEKTEN var olmali; "yakinda" olanlar
 * `kind: "yakinda"` ile ayriliyor. Olculmemis bir yuzde/sure yazilmiyor.
 */

export type PostKind = "guncelleme" | "duyuru" | "yakinda" | "ipucu";

export const POST_KIND_LABEL: Record<PostKind, string> = {
  guncelleme: "Güncelleme",
  duyuru: "Duyuru",
  yakinda: "Yakında",
  ipucu: "İpucu",
};

export type BulletinPost = {
  id: string;
  kind: PostKind;
  /** YYYY-AA-GG */
  date: string;
  title: string;
  body: string;
  /** Kisa madde listesi (guncelleme notlari). */
  notes?: string[];
  image?: { src: string; alt: string };
};

export const POSTS: BulletinPost[] = [
  {
    id: "katalog-yenilendi",
    kind: "guncelleme",
    date: "2026-09-17",
    title: "Katalog baştan yenilendi",
    body: "Ürünlerinizi kataloğa koymak artık çok daha kolay. Stüdyoda A4 boyutunda hazırladığınız görsel tek dokunuşla katalog sayfasına geçiyor.",
    notes: [
      "Altı şablon: İkili vitrin, Kapak, Üçlü ve Dörtlü ızgara, Öne çıkan, Tam sayfa",
      "Sekiz sayfa rengi, siyah ya da beyaz metin",
      "Logo ekleme; sürükleyerek taşıma, köşelerden boyutlandırma",
      "JPEG ve baskıya uygun CMYK (TIFF/JPEG) indirme",
    ],
    image: { src: "/showcase/vitrin-altin.webp", alt: "Altın zemin üzerinde kolye" },
  },
  {
    id: "studyo-uc-adim",
    kind: "guncelleme",
    date: "2026-09-17",
    title: "Stüdyo üç adımda: zemin, ürün, bitir",
    body: "Düzenleme ekranı sadeleşti. Önce boyutu ve zemini seçin, sonra ürünü yerleştirin, son adımda logo, etiket ve indirme.",
    notes: [
      "Yeni yansıma efekti: ürün zemine aynadaki gibi yansıyor",
      "Gölge güçlendirildi ve isteğe bağlı hale geldi",
      "Zeminler artık esnemiyor; biçime göre ortadan kırpılıyor",
      "İndirme sonrası kataloğa aktarma ya da ana menüye dönüş",
    ],
    image: { src: "/showcase/vitrin-kadife.webp", alt: "Kadife zemin üzerinde kolye" },
  },
  {
    id: "zemin-kutuphanesi",
    kind: "duyuru",
    date: "2026-09-17",
    title: "93 yeni zemin eklendi",
    body: "Zemin kütüphanesi büyüdü ve dört kategoriye ayrıldı: Sade, Doku & desen, Doğal & çiçekli, Lüks & koyu. Seçtiğiniz boyut dikeyse dikey, yataysa yatay zeminler listeleniyor; düz renkler her boyutta.",
    image: { src: "/showcase/vitrin-sicak-gri.webp", alt: "Sıcak gri zemin üzerinde kolye" },
  },
  {
    id: "cmyk",
    kind: "duyuru",
    date: "2026-09-16",
    title: "Matbaaya hazır dosya: CMYK",
    body: "Ekran için üretilen görseller matbaada renk kaydırabilir. Stüdyo ve katalogdaki \"Baskıya uygun\" düğmesi görseli baskı standardı profille CMYK'ya çevirip TIFF ya da JPEG olarak indiriyor.",
  },
  {
    id: "paketler-yakinda",
    kind: "yakinda",
    date: "2026-09-15",
    title: "Atölye ve Mağaza paketleri",
    body: "Aylık fotoğraf hakkı olan ücretli paketlerin altyapısı hazır; ödeme sağlayıcısı testleri tamamlanınca satışa açılacak.",
  },
  {
    id: "mobil-yakinda",
    kind: "yakinda",
    date: "2026-09-15",
    title: "Mobil uygulama",
    body: "Fotoğrafı çektiğiniz telefondan doğrudan vitrin görseline: Vitrin AI'ın iOS ve Android uygulaması yol haritasında.",
  },
];

/** Gozden kacabilecek ozellikler ve ne ise yaradiklari. */
export const HIDDEN_FEATURES: { title: string; what: string; benefit: string }[] = [
  {
    title: "Pazaryeri boyutu",
    what: "Tek seçimle 2000×2000 piksel, düz beyaz zemin.",
    benefit: "Pazaryerlerinin sık istediği kare, beyaz zeminli ürün görselini ayrıca düzenleme yapmadan hazırlarsınız.",
  },
  {
    title: "Ürün etiketi",
    what: "Ayar, gram ve ürün kodunu görselin köşesine ekler.",
    benefit: "Müşterinin WhatsApp'tan sorduğu ilk üç soru görselin üzerinde cevaplanmış olur.",
  },
  {
    title: "WhatsApp'ta paylaş",
    what: "Telefonda görsel doğrudan paylaşım menüsüyle açılır.",
    benefit: "İndir, galeride bul, gönder adımları tek dokunuşa iner.",
  },
  {
    title: "Geri al (Ctrl+Z)",
    what: "Stüdyoda son 50 değişiklik geri alınabilir.",
    benefit: "Farklı yerleşimleri korkmadan deneyebilirsiniz.",
  },
  {
    title: "İki parmakla büyütme",
    what: "Telefonda ürünü iki parmakla büyütüp küçültün; ortaya yaklaşınca kendiliğinden ortalanır.",
    benefit: "Küçük ekranda köşe tutamaçlarıyla uğraşmadan hızlı yerleşim.",
  },
  {
    title: "Logo her yerde hazır",
    what: "Bir kez yüklediğiniz logo stüdyoda ve katalogda hatırlanır; renkleri tek düğmeyle çevrilir.",
    benefit: "Beyaz logo koyu zeminde, siyah logo açık zeminde; her görselde yeniden yüklemeye gerek yok.",
  },
  {
    title: "Çalışmalarım",
    what: "Arka planı kaldırılan her görsel hesabınızda saklanır; sol panelden yeniden açılır.",
    benefit: "Aynı ürünü farklı zeminlerle tekrar hazırlarken fotoğrafı yeniden işletmezsiniz.",
  },
  {
    title: "iPhone fotoğrafları (HEIC)",
    what: "Telefonun kendi HEIC dosyası doğrudan yüklenebilir.",
    benefit: "Dönüştürme uygulaması aramadan, kameranın özgün kalitesiyle çalışırsınız.",
  },
];

export function sortedPosts(posts: BulletinPost[] = POSTS): BulletinPost[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

export function formatPostDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
