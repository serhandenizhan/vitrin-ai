"use client";

/**
 * Katalog sablonlari.
 *
 * Her sablonun IKI yuzu var ve ikisi de AYNI olcu tablosundan besleniyor:
 *  - `Onizleme`: ekranda gordugumuz React yerlesimi (yuzde tabanli).
 *  - `ciz`: disa aktarma sirasinda canvas'a cizen fonksiyon (ayni yuzdeler,
 *    piksel karsiligiyla).
 *
 * Neden tek bir olcu tablosu: onizleme ile cikti ayri ayri kodlansaydi ikisi
 * kacinilmaz olarak ayrisirdi ve kullanici "ekranda boyle gorunmuyordu"
 * derdi — bu, tasarim araclarinda en sik goze batan hata sinifi. Yuzdeler
 * tek yerde durdugu icin bir olcuyu degistirmek her iki yuzu birden
 * degistiriyor.
 *
 * Renkler ve tipografi projenin tasarim dilinden: sicak notrler, altin vurgu,
 * negatif harf araligi, 600 agirlikli basliklar (bkz. kok CLAUDE.md).
 */

import type { YuvaGorseli } from "@/components/catalog/catalog-editor";
import { YuvaSilDugmesi } from "@/components/catalog/catalog-editor";

/** Tasarim dilinin katalogda kullanilan renkleri. */
const KAGIT = "#fdfcfb";
const MUREKKEP = "#1a1917";
const SOLGUN = "#6b6862";
const ALTIN = "#b08d4f";

export type SablonAdi = "ikili" | "kapak";

type CizimVerisi = {
  genislik: number;
  yukseklik: number;
  gorseller: (YuvaGorseli | null)[];
  baslik: string;
  altBaslik: string;
};

type OnizlemeProps = {
  gorseller: (YuvaGorseli | null)[];
  baslik: string;
  altBaslik: string;
  onYuvaSecildi: (yuva: number) => void;
  onYuvaBosaltildi: (yuva: number) => void;
};

/* --- Ortak yardimcilar --------------------------------------------------- */

function gorselYukle(url: string): Promise<HTMLImageElement> {
  return new Promise((coz, reddet) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => coz(img);
    img.onerror = () => reddet(new Error("Görsel yüklenemedi"));
    img.src = url;
  });
}

/**
 * Gorseli verilen kutuya SIGDIRARAK cizer (kirpmadan).
 *
 * `cover` degil `contain`: bir mucevher fotografinin kenarindan kirpmak,
 * urunun bir parcasini kesmek demek. Katalogda urunun tamami gorunmeli.
 */
async function kutuyaCiz(
  ctx: CanvasRenderingContext2D,
  url: string,
  kutu: { x: number; y: number; g: number; y2: number },
) {
  const img = await gorselYukle(url);
  const olcek = Math.min(kutu.g / img.width, kutu.y2 / img.height);
  const g = img.width * olcek;
  const y = img.height * olcek;
  ctx.drawImage(img, kutu.x + (kutu.g - g) / 2, kutu.y + (kutu.y2 - y) / 2, g, y);
}

function BosYuva({
  sira,
  onSec,
}: {
  sira: number;
  onSec: (yuva: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSec(sira)}
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/25 bg-black/[0.02] transition-colors hover:border-black/40 hover:bg-black/[0.04]"
    >
      <svg viewBox="0 0 24 24" className="size-6 opacity-30" fill="none">
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[0.6875rem] opacity-45">Görsel ekleyin</span>
    </button>
  );
}

function DoluYuva({
  gorsel,
  sira,
  onSec,
  onSil,
}: {
  gorsel: YuvaGorseli;
  sira: number;
  onSec: (yuva: number) => void;
  onSil: (yuva: number) => void;
}) {
  return (
    <div className="group relative h-full w-full">
      <button
        type="button"
        onClick={() => onSec(sira)}
        aria-label={`${sira + 1}. görseli değiştir`}
        className="h-full w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gorsel.url}
          alt=""
          className="h-full w-full object-contain"
        />
      </button>
      <YuvaSilDugmesi onSil={() => onSil(sira)} />
    </div>
  );
}

/* --- Sablon 1: Ikili vitrin ---------------------------------------------- */
/* Iki urun yan yana, ustte baslik bandi. Katalog ic sayfasi.                */

const IKILI = {
  kenar: 0.075,
  baslikUst: 0.085,
  gorselUst: 0.24,
  gorselYukseklik: 0.52,
  ara: 0.035,
};

/* --- Sablon 2: Kapak ------------------------------------------------------ */
/* Tek buyuk urun, altta marka blogu. Dergi kapagi / one cikan urun.         */

const KAPAK = {
  kenar: 0.075,
  gorselUst: 0.12,
  gorselYukseklik: 0.6,
  metinUst: 0.78,
};

export const SABLONLAR: Record<
  SablonAdi,
  {
    baslik: string;
    ozet: string;
    yuvalar: number[];
    Onizleme: (props: OnizlemeProps) => React.ReactElement;
    ciz: (ctx: CanvasRenderingContext2D, veri: CizimVerisi) => Promise<void>;
  }
> = {
  ikili: {
    baslik: "İkili vitrin",
    ozet: "İki ürün, üstte başlık",
    yuvalar: [0, 1],
    Onizleme: ({ gorseller, baslik, altBaslik, onYuvaSecildi, onYuvaBosaltildi }) => (
      <div
        className="flex h-full w-full flex-col"
        style={{ backgroundColor: KAGIT, padding: `${IKILI.kenar * 100}%` }}
      >
        <div style={{ paddingTop: `${(IKILI.baslikUst - IKILI.kenar) * 100}%` }}>
          <p
            className="text-[clamp(0.5rem,1.1vw,0.7rem)] font-semibold tracking-[0.16em] uppercase"
            style={{ color: ALTIN }}
          >
            {altBaslik}
          </p>
          <h3
            className="mt-1 text-[clamp(1rem,2.6vw,1.75rem)] leading-tight font-semibold tracking-[-0.015em]"
            style={{ color: MUREKKEP }}
          >
            {baslik}
          </h3>
          <span
            className="mt-3 block h-px w-full"
            style={{ backgroundColor: `${MUREKKEP}1f` }}
          />
        </div>

        <div
          className="mt-[4%] grid flex-1 grid-cols-2"
          style={{ gap: `${IKILI.ara * 100}%` }}
        >
          {[0, 1].map((sira) =>
            gorseller[sira] ? (
              <DoluYuva
                key={sira}
                gorsel={gorseller[sira]}
                sira={sira}
                onSec={onYuvaSecildi}
                onSil={onYuvaBosaltildi}
              />
            ) : (
              <BosYuva key={sira} sira={sira} onSec={onYuvaSecildi} />
            ),
          )}
        </div>

        <p
          className="pt-[4%] text-center text-[clamp(0.4rem,0.85vw,0.6rem)] tracking-[0.1em] uppercase"
          style={{ color: SOLGUN }}
        >
          Vitrin AI ile hazırlandı
        </p>
      </div>
    ),
    ciz: async (ctx, { genislik, yukseklik, gorseller, baslik, altBaslik }) => {
      ctx.fillStyle = KAGIT;
      ctx.fillRect(0, 0, genislik, yukseklik);

      const kenar = genislik * IKILI.kenar;

      ctx.fillStyle = ALTIN;
      ctx.font = `600 ${Math.round(genislik * 0.019)}px Inter, system-ui, sans-serif`;
      ctx.fillText(altBaslik.toUpperCase(), kenar, yukseklik * IKILI.baslikUst);

      ctx.fillStyle = MUREKKEP;
      ctx.font = `600 ${Math.round(genislik * 0.052)}px Inter, system-ui, sans-serif`;
      ctx.fillText(baslik, kenar, yukseklik * (IKILI.baslikUst + 0.05));

      ctx.fillStyle = `${MUREKKEP}1f`;
      ctx.fillRect(kenar, yukseklik * 0.185, genislik - kenar * 2, 1);

      const ara = genislik * IKILI.ara;
      const kutuGenislik = (genislik - kenar * 2 - ara) / 2;
      const kutuYukseklik = yukseklik * IKILI.gorselYukseklik;

      for (const sira of [0, 1]) {
        const gorsel = gorseller[sira];
        if (!gorsel) continue;
        await kutuyaCiz(ctx, gorsel.url, {
          x: kenar + sira * (kutuGenislik + ara),
          y: yukseklik * IKILI.gorselUst,
          g: kutuGenislik,
          y2: kutuYukseklik,
        });
      }

      ctx.fillStyle = SOLGUN;
      ctx.font = `${Math.round(genislik * 0.014)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("VİTRİN AI İLE HAZIRLANDI", genislik / 2, yukseklik * 0.94);
      ctx.textAlign = "left";
    },
  },

  kapak: {
    baslik: "Kapak",
    ozet: "Tek ürün, altta marka",
    yuvalar: [0],
    Onizleme: ({ gorseller, baslik, altBaslik, onYuvaSecildi, onYuvaBosaltildi }) => (
      <div
        className="flex h-full w-full flex-col"
        style={{ backgroundColor: MUREKKEP, padding: `${KAPAK.kenar * 100}%` }}
      >
        <div className="flex-1 pt-[6%] pb-[8%]">
          {gorseller[0] ? (
            <DoluYuva
              gorsel={gorseller[0]}
              sira={0}
              onSec={onYuvaSecildi}
              onSil={onYuvaBosaltildi}
            />
          ) : (
            <button
              type="button"
              onClick={() => onYuvaSecildi(0)}
              className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/25 transition-colors hover:border-white/45 hover:bg-white/5"
            >
              <svg viewBox="0 0 24 24" className="size-7 text-white/35" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="text-[0.6875rem] text-white/40">
                Görsel ekleyin
              </span>
            </button>
          )}
        </div>

        <div className="border-t border-white/15 pt-[5%]">
          <p
            className="text-[clamp(0.5rem,1.1vw,0.7rem)] font-semibold tracking-[0.16em] uppercase"
            style={{ color: ALTIN }}
          >
            {altBaslik}
          </p>
          <h3 className="mt-1.5 text-[clamp(1.1rem,3vw,2rem)] leading-tight font-semibold tracking-[-0.015em] text-[#f3f0eb]">
            {baslik}
          </h3>
        </div>
      </div>
    ),
    ciz: async (ctx, { genislik, yukseklik, gorseller, baslik, altBaslik }) => {
      ctx.fillStyle = MUREKKEP;
      ctx.fillRect(0, 0, genislik, yukseklik);

      const kenar = genislik * KAPAK.kenar;

      if (gorseller[0]) {
        await kutuyaCiz(ctx, gorseller[0].url, {
          x: kenar,
          y: yukseklik * KAPAK.gorselUst,
          g: genislik - kenar * 2,
          y2: yukseklik * KAPAK.gorselYukseklik,
        });
      }

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(kenar, yukseklik * KAPAK.metinUst, genislik - kenar * 2, 1);

      ctx.fillStyle = ALTIN;
      ctx.font = `600 ${Math.round(genislik * 0.019)}px Inter, system-ui, sans-serif`;
      ctx.fillText(
        altBaslik.toUpperCase(),
        kenar,
        yukseklik * (KAPAK.metinUst + 0.045),
      );

      ctx.fillStyle = "#f3f0eb";
      ctx.font = `600 ${Math.round(genislik * 0.06)}px Inter, system-ui, sans-serif`;
      ctx.fillText(baslik, kenar, yukseklik * (KAPAK.metinUst + 0.105));
    },
  },
};
