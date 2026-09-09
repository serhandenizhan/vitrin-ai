"use client";

/**
 * Katalog editoru — hazirlanan gorselleri dergi/katalog sayfasina yerlestirir.
 *
 * KAPSAM KARARI: bu ozellik tamamen ISTEMCI TARAFINDA. Backend'e, veritabanina
 * ya da yol haritasindaki hicbir faza dokunmuyor; kendi rotasinda duruyor ve
 * girdisini zaten var olan calisma gecmisinden (IndexedDB) ya da dogrudan
 * dosya seciminden aliyor. Bu yuzden projenin seyrini degistirmiyor —
 * kullanicinin sarti buydu.
 *
 * CIKTI OLCUSU: A4 oraninda (1:1.414), 150 nokta/inc karsiligi 1240x1754 px.
 * 300 dpi (2480x3508) tarayicida uretilebiliyor ama tek bir sayfa icin ~25 MB
 * PNG cikariyor ve dusuk bellekli cihazlarda sekme cokebiliyor; 150 dpi,
 * dergi provasi ve dijital katalog icin yeterli. GERCEK MATBAA CIKTISI ayri
 * bir is: CMYK donusumu tarayicida yapilamiyor (canvas yalnizca RGB uretir,
 * PNG ise CMYK'yi hic desteklemez), o yuzden sunucu tarafina birakildi ve
 * ucretli planda acilacak.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { SABLONLAR, type SablonAdi } from "@/lib/catalog-templates";
import { validateFile } from "@/lib/upload-constraints";

/** A4 orani, 150 dpi. Bkz. dosya basindaki gerekce. */
const CIKTI_GENISLIK = 1240;
const CIKTI_YUKSEKLIK = 1754;

export type YuvaGorseli = {
  url: string;
  ad: string;
};

export function CatalogEditor() {
  const { works, isHistoryLoaded } = useWorkspace();
  const [sablonAdi, setSablonAdi] = useState<SablonAdi>("ikili");
  const [gorseller, setGorseller] = useState<(YuvaGorseli | null)[]>([]);
  const [baslik, setBaslik] = useState("Yeni Koleksiyon");
  const [altBaslik, setAltBaslik] = useState("Sonbahar 2026");
  const [hata, setHata] = useState<string | null>(null);
  const [disaAktariliyor, setDisaAktariliyor] = useState(false);
  const [aktifYuva, setAktifYuva] = useState<number | null>(null);

  const dosyaGirdisiRef = useRef<HTMLInputElement | null>(null);
  const sayfaRef = useRef<HTMLDivElement | null>(null);

  // Olusturulan object URL'ler bilesen kaldirilirken serbest birakiliyor;
  // aksi halde her secilen dosyanin blob'u bellekte kaliyor.
  const objectUrlRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = objectUrlRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const sablon = SABLONLAR[sablonAdi];

  // Sablonun yuva sayisi degisince gorunen liste RENDER SIRASINDA turetiliyor,
  // bir efektle state senkronlanarak degil. Efekt kullanilsaydi hem fazladan
  // bir render turu olusurdu hem de React Compiler bunu hakli olarak reddeder
  // (`react-hooks/set-state-in-effect`).
  //
  // Yan fayda: `gorseller` dizisi sablondan uzun kalabiliyor. Kullanici iki
  // yuvali sablondan tek yuvaliya gecip geri donduğunde ikinci gorseli
  // KAYBETMIYOR — sablon denemenin bedeli olmamali.
  const yuvalar = useMemo(
    () =>
      Array.from(
        { length: sablon.yuvalar.length },
        (_, i) => gorseller[i] ?? null,
      ),
    [gorseller, sablon.yuvalar.length],
  );

  const gecmistenSec = useCallback(
    (yuva: number, kayitId: string) => {
      const kayit = works.find((w) => w.id === kayitId);
      if (!kayit) return;
      const url = URL.createObjectURL(kayit.result);
      objectUrlRef.current.push(url);
      setGorseller((onceki) => {
        const yeni = [...onceki];
        yeni[yuva] = { url, ad: kayit.fileName };
        return yeni;
      });
      setAktifYuva(null);
      setHata(null);
    },
    [works],
  );

  const dosyaSecildi = useCallback(
    (dosya: File) => {
      const dogrulamaHatasi = validateFile(dosya);
      if (dogrulamaHatasi) {
        setHata(dogrulamaHatasi.message);
        return;
      }
      const url = URL.createObjectURL(dosya);
      objectUrlRef.current.push(url);
      setGorseller((onceki) => {
        const yeni = [...onceki];
        if (aktifYuva !== null) yeni[aktifYuva] = { url, ad: dosya.name };
        return yeni;
      });
      setAktifYuva(null);
      setHata(null);
    },
    [aktifYuva],
  );

  const yuvayiBosalt = useCallback((yuva: number) => {
    setGorseller((onceki) => {
      const yeni = [...onceki];
      yeni[yuva] = null;
      return yeni;
    });
  }, []);

  const doluYuvaSayisi = useMemo(
    () => yuvalar.filter(Boolean).length,
    [yuvalar],
  );

  /**
   * Sayfayi PNG olarak disa aktarir.
   *
   * Konva yerine dogrudan canvas: katalog sayfasi statik bir yerlesim, uzerinde
   * surukleme/dondurme yok. Konva sahnesi kurmak buraya yalnizca agirlik
   * katardi. Metin ve gorseller sablonun kendi olculerinden (0-1 arasi oranlar)
   * hesaplaniyor, yani ekrandaki onizleme ile cikti ayni yerlesimi paylasiyor.
   */
  const disaAktar = useCallback(async () => {
    setDisaAktariliyor(true);
    try {
      const tuval = document.createElement("canvas");
      tuval.width = CIKTI_GENISLIK;
      tuval.height = CIKTI_YUKSEKLIK;
      const ctx = tuval.getContext("2d");
      if (!ctx) return;

      await sablon.ciz(ctx, {
        genislik: CIKTI_GENISLIK,
        yukseklik: CIKTI_YUKSEKLIK,
        gorseller: yuvalar,
        baslik,
        altBaslik,
      });

      const veriUrl = tuval.toDataURL("image/png");
      const bag = document.createElement("a");
      bag.href = veriUrl;
      bag.download = `katalog-${sablonAdi}.png`;
      bag.click();
    } finally {
      setDisaAktariliyor(false);
    }
  }, [sablon, yuvalar, baslik, altBaslik, sablonAdi]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {/* --- Onizleme --------------------------------------------------- */}
      <div className="mx-auto w-full max-w-[34rem] min-w-0">
        <div
          ref={sayfaRef}
          className="overflow-hidden rounded-[1.25rem] shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_44px_-18px_rgba(0,0,0,0.3)] ring-1 ring-black/10"
          style={{ aspectRatio: `${CIKTI_GENISLIK} / ${CIKTI_YUKSEKLIK}` }}
        >
          <sablon.Onizleme
            gorseller={yuvalar}
            baslik={baslik}
            altBaslik={altBaslik}
            onYuvaSecildi={setAktifYuva}
            onYuvaBosaltildi={yuvayiBosalt}
          />
        </div>
        <p className="fine-print mt-3 text-center opacity-60">
          A4 oranında · {CIKTI_GENISLIK}×{CIKTI_YUKSEKLIK} piksel
        </p>
      </div>

      {/* --- Kontroller -------------------------------------------------- */}
      <div className="divide-black/8 divide-y rounded-2xl bg-[#f6f4f1]">
        <Baslik>Şablon</Baslik>
        <div className="grid grid-cols-2 gap-2 px-5 pb-5">
          {Object.entries(SABLONLAR).map(([ad, s]) => (
            <button
              key={ad}
              type="button"
              onClick={() => setSablonAdi(ad as SablonAdi)}
              aria-pressed={sablonAdi === ad}
              className={
                "rounded-xl p-3 text-left transition-shadow " +
                (sablonAdi === ad
                  ? "ring-gold bg-white ring-2"
                  : "bg-white/70 ring-1 ring-black/10 hover:ring-black/20")
              }
            >
              <span className="block text-[0.8125rem] font-medium">
                {s.baslik}
              </span>
              <span className="fine-print mt-0.5 block opacity-55">
                {s.ozet}
              </span>
            </button>
          ))}
        </div>

        <Baslik>Metinler</Baslik>
        <div className="space-y-3 px-5 pb-5">
          <Alan etiket="Başlık" deger={baslik} onDegisti={setBaslik} />
          <Alan
            etiket="Alt başlık"
            deger={altBaslik}
            onDegisti={setAltBaslik}
          />
        </div>

        <Baslik>
          Görseller
          <span className="ml-2 font-normal normal-case opacity-50">
            {doluYuvaSayisi}/{sablon.yuvalar.length}
          </span>
        </Baslik>
        <div className="space-y-2 px-5 pb-5">
          {aktifYuva === null ? (
            <p className="fine-print opacity-60">
              Sayfadaki boş bir alana dokunun, sonra buradan görsel seçin.
            </p>
          ) : (
            <>
              <p className="fine-print opacity-70">
                {aktifYuva + 1}. alan için görsel seçin
              </p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dosyaGirdisiRef.current?.click()}
                className="press w-full justify-start rounded-full bg-white"
              >
                <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden />
                Bilgisayardan seç
              </Button>

              {/* Gecmisten secme: kullanicinin bu araci kullanarak hazirladigi
                  gorseller zaten burada duruyor, tekrar indirip yuklemesi
                  anlamsiz olurdu. */}
              {isHistoryLoaded && works.length > 0 ? (
                <div className="max-h-52 space-y-1 overflow-y-auto pt-1">
                  {works.map((kayit) => (
                    <button
                      key={kayit.id}
                      type="button"
                      onClick={() => gecmistenSec(aktifYuva, kayit.id)}
                      className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-black/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={kayit.thumbnail}
                        alt=""
                        aria-hidden
                        className="checkerboard size-9 shrink-0 rounded-md object-contain"
                      />
                      <span className="fine-print truncate">
                        {kayit.fileName}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="fine-print opacity-55">
                  Çalışma geçmişiniz boş. Önce ana sayfadan bir fotoğrafın arka
                  planını kaldırın, sonra buraya dönün.
                </p>
              )}
            </>
          )}

          {hata ? (
            <p className="fine-print text-red-700">{hata}</p>
          ) : null}

          <input
            ref={dosyaGirdisiRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(olay) => {
              const dosya = olay.target.files?.[0];
              if (dosya) dosyaSecildi(dosya);
              // Ayni dosya tekrar secilebilsin diye girdiyi sifirla.
              olay.target.value = "";
            }}
          />
        </div>

        <Baslik>Dışa aktar</Baslik>
        <div className="px-5 pb-5">
          <Button
            type="button"
            onClick={disaAktar}
            disabled={disaAktariliyor || doluYuvaSayisi === 0}
            className="press min-h-10 w-full rounded-full"
          >
            {disaAktariliyor ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            PNG indir
          </Button>
          {doluYuvaSayisi === 0 ? (
            <p className="fine-print mt-2 opacity-55">
              En az bir görsel ekleyin.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Baslik({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-5 pt-5 pb-3 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase opacity-50">
      {children}
    </h2>
  );
}

function Alan({
  etiket,
  deger,
  onDegisti,
}: {
  etiket: string;
  deger: string;
  onDegisti: (deger: string) => void;
}) {
  return (
    <label className="block">
      <span className="fine-print block opacity-60">{etiket}</span>
      <input
        type="text"
        value={deger}
        onChange={(olay) => onDegisti(olay.target.value)}
        className="focus:ring-gold mt-1 w-full rounded-lg bg-white px-3 py-2 text-[0.875rem] ring-1 ring-black/10 outline-none focus:ring-2"
      />
    </label>
  );
}

/** Silme dugmesi sablon onizlemelerinde kullaniliyor. */
export function YuvaSilDugmesi({ onSil }: { onSil: () => void }) {
  return (
    <button
      type="button"
      onClick={(olay) => {
        olay.stopPropagation();
        onSil();
      }}
      aria-label="Görseli kaldır"
      className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
    >
      <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
