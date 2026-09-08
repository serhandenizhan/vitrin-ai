/**
 * Acilis gorseli: aynı urun, once ve sonra.
 *
 * Ilk halinde burada yalniz kesim duruyordu — guzeldi ama urunun NE YAPTIGINI
 * anlatmiyordu; seffaf arka planli bir yuzuk, siyah zeminde sadece bir yuzuk
 * gibi gorunuyor. Iki kareyi tek cercevede, ince bir altin cizgiyle ayirmak
 * vaadi tek bakista okutuyor: solda kadifenin uzerindeki fotograf, sagda
 * ayni urun arka plansiz.
 *
 * Sag taraftaki dama deseni bilincli: seffafligin GORUNUR olmasi icin. Duz
 * bir zemin uzerinde "arka plan kalkti mi" ayirt edilemiyor.
 *
 * Bilincli olarak etkilesimsiz (surgu yok): acilis bolumu bir vitrin, bir
 * oyuncak degil. Kullanici birkac ekran asagida gercek araci zaten deneyecek.
 */

import Image from "next/image";

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      {/* Altin isik havuzu — seffaf bir gorselin siyah zeminde "yuzmesini"
          saglayan sey bu. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 opacity-80 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 55%, rgba(212,175,110,0.30), transparent 70%)",
        }}
      />

      <figure className="border-white/12 overflow-hidden rounded-2xl border shadow-2xl">
        <div className="grid grid-cols-2">
          {/* Once */}
          <div className="relative">
            <Image
              src="/mock/sample-photo.png"
              alt="Kadife zemin üzerinde çekilmiş yüzük fotoğrafı"
              width={1100}
              height={1100}
              priority
              className="h-auto w-full"
            />
            <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-white uppercase backdrop-blur-sm">
              Önce
            </span>
          </div>

          {/* Sonra */}
          <div className="checkerboard relative border-l border-white/20">
            <Image
              src="/mock/sample-cutout.png"
              alt="Aynı yüzüğün arka planı kaldırılmış hâli"
              width={1100}
              height={1100}
              priority
              className="h-auto w-full"
            />
            <span className="bg-gold absolute top-3 right-3 rounded-full px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-black uppercase">
              Sonra
            </span>
          </div>
        </div>
      </figure>

      <figcaption className="on-dark-muted fine-print mt-3 text-center">
        Örnek görsel — gerçek sonucu kendi fotoğrafınızla birkaç ekran aşağıda
        görebilirsiniz.
      </figcaption>
    </div>
  );
}
