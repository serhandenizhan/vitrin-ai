/**
 * "Uygulama nasil calisiyor" — yatay kayan ekran turu.
 *
 * TASARIM KARARI — kartlar EKRAN GORUNTUSU (bitmap) DEGIL, uygulamanin kendi
 * arayuzunun DOM ile yeniden kurulmus hali.
 *
 * Uc sebep:
 *  1. Durustluk. Elimizde uydurma bir "sonuc gorseli" yok; kartlar gercekten
 *     var olan ekranlari ve gercek urun fotograflarimizi gosteriyor. Uretilmis
 *     bir cikti fotografini "iste sonuc" diye koymak, aracin yapmadigi bir seyi
 *     vaat etmek olurdu.
 *  2. Keskinlik. Her ekran cozunurlugunde net; 3 ekran goruntusu icin
 *     yuzlerce KB bitmap indirmek de gerekmiyor.
 *  3. Bakim. Arayuz degistiginde ekran goruntuleri sessizce eskiyor ve kimse
 *     fark etmiyor; DOM kopyasi ayni token'lari ve ayni siniflari kullaniyor.
 *
 * Bu bir sunucu bileseni: hicbir parcasi istemciye inmiyor.
 */

import Image from "next/image";

import { Reveal } from "@/components/reveal";

const ADIMLAR = [
  {
    no: "01",
    baslik: "Yükleyin",
    metin:
      "Telefonla çektiğiniz kare yeterli. HEIC dahil, 20 MB'a kadar.",
  },
  {
    no: "02",
    baslik: "Arka plan kalksın",
    metin:
      "Model ürünün sınırını en ince zincir halkasına kadar bulur.",
  },
  {
    no: "03",
    baslik: "Karşılaştırın",
    metin:
      "Çizgiyi sürükleyin, büyüteçle kenarları yakından inceleyin.",
  },
  {
    no: "04",
    baslik: "Vitrine koyun",
    metin:
      "Zemini seçin, ürünü yerleştirin, 2000×2000 indirin.",
  },
];

export function AppTour() {
  return (
    <section id="uygulama" className="surface-white section-rhythm">
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="fine-print on-light-muted tracking-[0.08em] uppercase">
              Uygulama
            </p>
            <h2 className="display-section mt-3 text-balance">
              Dört adım. Hepsi bu.
            </h2>
            <p className="lede on-light-muted mx-auto mt-4 max-w-xl text-pretty">
              Kayıt yok, kurulum yok, öğrenilecek arayüz yok. Fotoğrafı verin,
              satışa hazır görseli alın.
            </p>
          </div>
        </Reveal>

        {/*
          Yatay kaydirma + snap: Apple'in urun sayfalarindaki galeri deseni.
          Native `overflow-x` kullaniliyor, JS'li bir karusel degil — dokunmatik
          hareketi, klavye ve ekran okuyucu sirasi kendiliginden dogru calisiyor
          ve istemciye tek satir kod inmiyor.
        */}
        <div className="tur-serit mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-6">
          {/* Kenar boslugu: ilk/son kart ekranin kenarina yapismasin. */}
          <span aria-hidden className="shrink-0 basis-px" />

          <TurKarti adim={ADIMLAR[0]}>
            <YuklemeEkrani />
          </TurKarti>
          <TurKarti adim={ADIMLAR[1]}>
            <IslemEkrani />
          </TurKarti>
          <TurKarti adim={ADIMLAR[2]}>
            <KarsilastirmaEkrani />
          </TurKarti>
          <TurKarti adim={ADIMLAR[3]}>
            <StudyoEkrani />
          </TurKarti>

          <span aria-hidden className="shrink-0 basis-px" />
        </div>

        <p className="fine-print on-light-muted mt-1 text-center">
          Yana kaydırın
        </p>
      </div>
    </section>
  );
}

function TurKarti({
  adim,
  children,
}: {
  adim: (typeof ADIMLAR)[number];
  children: React.ReactNode;
}) {
  return (
    /* `tur-kart`: kaydirma ilerledikce olcek ve opaklik degisiyor (bkz.
       globals.css). Destekleyen tarayicilarda kartlar Apple galerilerindeki
       gibi merkeze geldiginde one cikiyor; desteklemeyende hicbir sey
       kaybolmuyor, kartlar duz duruyor. */
    <article className="tur-kart w-[17rem] shrink-0 snap-center sm:w-[19rem]">
      <div className="ring-black/8 aspect-[3/4] overflow-hidden rounded-[1.5rem] bg-[#f5f5f7] ring-1">
        {children}
      </div>
      <div className="mt-4 px-1">
        <span className="fine-print text-gold font-semibold tracking-[0.12em]">
          {adim.no}
        </span>
        <h3 className="mt-1 text-[1.0625rem] font-semibold tracking-[-0.01em]">
          {adim.baslik}
        </h3>
        <p className="on-light-muted mt-1 text-[0.8125rem] leading-relaxed text-pretty">
          {adim.metin}
        </p>
      </div>
    </article>
  );
}

/* --- Ekran kopyalari --------------------------------------------------- */
/* Hepsi uygulamanin gercek arayuzunun kucultulmus, sadelestirilmis hali.     */

function YuklemeEkrani() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/20 bg-white/60">
        <svg viewBox="0 0 24 24" className="size-7 opacity-35" fill="none">
          <path
            d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[0.6875rem] opacity-50">
          Fotoğrafı buraya bırakın
        </span>
      </div>
      <span className="text-[0.625rem] opacity-40">
        JPEG · PNG · WebP · HEIC
      </span>
    </div>
  );
}

function IslemEkrani() {
  return (
    <div className="relative h-full">
      <Image
        src="/photos/atolye.webp"
        alt="Kuyumcu tezgâhında duran pırlanta kolye"
        width={900}
        height={982}
        sizes="19rem"
        className="h-full w-full scale-105 object-cover opacity-55 blur-[5px]"
      />
      <div className="tarama-isigi pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-5">
        {[
          "top-0 left-0 border-t border-l",
          "top-0 right-0 border-t border-r",
          "bottom-0 left-0 border-b border-l",
          "bottom-0 right-0 border-b border-r",
        ].map((konum) => (
          <span
            key={konum}
            className={`absolute size-5 border-white/80 ${konum}`}
          />
        ))}
      </div>
      <span className="absolute inset-x-0 bottom-4 text-center text-[0.6875rem] font-medium text-white drop-shadow">
        Ürünün sınırı bulunuyor
      </span>
    </div>
  );
}

function KarsilastirmaEkrani() {
  return (
    <div className="checkerboard relative h-full">
      <Image
        src="/photos/atolye.webp"
        alt="Özgün fotoğraf"
        width={900}
        height={982}
        sizes="19rem"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Sag yari: "kesilmis" taraf. Dama deseni uzerinde duruyor, tipki
          aracin kendisindeki gibi. */}
      <div
        className="absolute inset-0"
        style={{ clipPath: "inset(0 0 0 52%)" }}
      >
        <Image
          src="/photos/vitrin.webp"
          alt="Arka planı kaldırılmış ürün"
          width={900}
          height={982}
          sizes="19rem"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]">
        <span className="absolute top-1/2 left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none">
            <path
              d="M9 7 4.5 12 9 17M15 7l4.5 5-4.5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-[0.625rem] text-white backdrop-blur-sm">
        Özgün
      </span>
      <span className="absolute top-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-[0.625rem] text-white backdrop-blur-sm">
        Kesim
      </span>
    </div>
  );
}

function StudyoEkrani() {
  return (
    <div className="flex h-full gap-2 bg-white p-3">
      <div className="flex-1 rounded-xl bg-gradient-to-br from-[#3a2f1c] via-[#7a6231] to-[#241d12] p-3">
        <div className="relative h-full">
          <Image
            src="/photos/vitrin.webp"
            alt="Zemin üzerine yerleştirilmiş ürün"
            width={900}
            height={982}
            sizes="12rem"
            className="absolute inset-0 m-auto h-3/4 w-3/4 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
          />
          {/* Ince secim cercevesi — araçtaki gerçek hâliyle aynı dil. */}
          <span className="border-gold/80 absolute inset-[12%] rounded-[2px] border border-dashed" />
        </div>
      </div>

      <div className="w-[38%] shrink-0 space-y-2 rounded-xl bg-[#f5f5f7] p-2">
        <span className="block text-[0.5rem] font-semibold tracking-[0.08em] uppercase opacity-45">
          Zemin
        </span>
        <div className="grid grid-cols-3 gap-1">
          {[
            "linear-gradient(135deg,#1d1d1f,#000)",
            "linear-gradient(135deg,#fff,#f5f5f7)",
            "linear-gradient(135deg,#3a2f1c,#7a6231)",
          ].map((zemin, i) => (
            <span
              key={zemin}
              style={{ background: zemin }}
              className={
                "aspect-square rounded-full " +
                (i === 2 ? "ring-gold ring-2 ring-offset-1" : "ring-1 ring-black/10")
              }
            />
          ))}
        </div>

        <span className="block pt-1 text-[0.5rem] font-semibold tracking-[0.08em] uppercase opacity-45">
          Yerleşim
        </span>
        <span className="block h-1 rounded-full bg-black/10">
          <span className="bg-gold block h-1 w-3/5 rounded-full" />
        </span>

        <span className="mt-2 block rounded-full bg-black py-1 text-center text-[0.5625rem] font-medium text-white">
          PNG · 2000×2000
        </span>
      </div>
    </div>
  );
}
