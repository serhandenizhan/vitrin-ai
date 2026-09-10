"use client";

/**
 * Katalog editoru.
 *
 * AKIS: once sablon galerisi, sonra calisma alani. Kullanici hangi duzeni
 * istedigini once seciyor; galeri mini onizlemelerle gosteriyor, boylece
 * secim koru koru degil. Secim yapilinca ayni sayfada calisma alani aciliyor
 * ve "Şablonu değiştir" ile galeriye donuluyor — o donuste yerlestirilen
 * gorseller KORUNUYOR, sablon denemenin bedeli olmamali.
 *
 * KAPSAM: tamamen istemci tarafinda. Backend'e, veritabanina ya da yol
 * haritasindaki hicbir faza dokunmuyor; girdisini var olan calisma
 * gecmisinden (IndexedDB) ya da dosya seciminden aliyor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import {
  CatalogPageView,
  type YuvaIcerigi,
} from "@/components/catalog/catalog-page-view";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import {
  CIKTI_GENISLIK,
  CIKTI_YUKSEKLIK,
  katalogCiz,
} from "@/lib/catalog-export";
import {
  EN_BUYUK_OLCEK,
  EN_KUCUK_OLCEK,
  SABLONLAR,
  type SablonAdi,
  VARSAYILAN_DONUSUM,
} from "@/lib/catalog-templates";
import { validateFile } from "@/lib/upload-constraints";

/**
 * "Ornek ile basla" icin hazir icerik.
 *
 * Gorseller sitenin kendi tanitim karelerinden — yani aracin gercek ciktisi
 * (bkz. scripts/prepare-showcase.mjs). Kullanici bos bir sayfayla degil,
 * calisan bir ornekle karsilasiyor; fikri anlatmanin en kisa yolu bu.
 */
const ORNEK = {
  sablon: "ikili" as SablonAdi,
  metinler: {
    ustEtiket: "Sonbahar 2026",
    baslik: "Pırlanta Koleksiyonu",
    altBilgi: "Vitrin AI ile hazırlandı",
  },
  gorseller: ["/showcase/vitrin-kadife.webp", "/showcase/vitrin-altin.webp"],
};

const VARSAYILAN_METINLER = {
  ustEtiket: "Sonbahar 2026",
  baslik: "Yeni Koleksiyon",
  altBilgi: "Vitrin AI ile hazırlandı",
};

export function CatalogEditor() {
  const { works, isHistoryLoaded } = useWorkspace();

  const [sablonAdi, setSablonAdi] = useState<SablonAdi | null>(null);
  const [yuvalar, setYuvalar] = useState<YuvaIcerigi[]>([]);
  const [metinler, setMetinler] = useState(VARSAYILAN_METINLER);
  const [seciliYuva, setSeciliYuva] = useState<number | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [disaAktariliyor, setDisaAktariliyor] = useState(false);

  const dosyaGirdisiRef = useRef<HTMLInputElement | null>(null);

  // Olusturulan object URL'ler bilesen kaldirilirken serbest birakiliyor.
  const objectUrlRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = objectUrlRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const sablon = sablonAdi ? SABLONLAR[sablonAdi] : null;

  // Gorunen yuva listesi RENDER SIRASINDA turetiliyor. Boylece iki yuvali
  // sablondan tek yuvaliya gecip geri donuldugunde ikinci gorsel KAYBOLMUYOR.
  const gorunenYuvalar = useMemo(
    () =>
      sablon
        ? Array.from({ length: sablon.yuvalar.length }, (_, i) => yuvalar[i] ?? null)
        : [],
    [sablon, yuvalar],
  );

  const doluSayisi = gorunenYuvalar.filter(Boolean).length;

  /** Bir URL'den yuva icerigi kurar; dogal olculeri okumak icin gorseli yukler. */
  const icerikKur = useCallback(
    (url: string, ad: string): Promise<NonNullable<YuvaIcerigi>> =>
      new Promise((coz, reddet) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () =>
          coz({
            url,
            ad,
            genislik: img.width,
            yukseklik: img.height,
            donusum: { ...VARSAYILAN_DONUSUM },
          });
        img.onerror = () => reddet(new Error("Görsel yüklenemedi"));
        img.src = url;
      }),
    [],
  );

  const yuvayaKoy = useCallback(
    async (sira: number, url: string, ad: string) => {
      try {
        const icerik = await icerikKur(url, ad);
        setYuvalar((onceki) => {
          const yeni = [...onceki];
          yeni[sira] = icerik;
          return yeni;
        });
        setHata(null);
      } catch {
        setHata("Görsel yüklenemedi.");
      }
    },
    [icerikKur],
  );

  const ornekleBasla = useCallback(async () => {
    setSablonAdi(ORNEK.sablon);
    setMetinler(ORNEK.metinler);
    const icerikler = await Promise.all(
      ORNEK.gorseller.map((url, i) => icerikKur(url, `örnek-${i + 1}`)),
    );
    setYuvalar(icerikler);
    setSeciliYuva(null);
  }, [icerikKur]);

  const donusumuGuncelle = useCallback(
    (sira: number, yama: Partial<{ olcek: number; x: number; y: number }>) => {
      setYuvalar((onceki) => {
        const yeni = [...onceki];
        const mevcut = yeni[sira];
        if (!mevcut) return onceki;
        yeni[sira] = { ...mevcut, donusum: { ...mevcut.donusum, ...yama } };
        return yeni;
      });
    },
    [],
  );

  const disaAktar = useCallback(async () => {
    if (!sablon) return;
    setDisaAktariliyor(true);
    try {
      const veriUrl = await katalogCiz({
        sablon,
        yuvalar: gorunenYuvalar,
        metinler,
      });
      const bag = document.createElement("a");
      bag.href = veriUrl;
      bag.download = `katalog-${sablon.ad}.png`;
      bag.click();
    } catch {
      setHata("Sayfa dışa aktarılamadı.");
    } finally {
      setDisaAktariliyor(false);
    }
  }, [sablon, gorunenYuvalar, metinler]);

  /* --- Galeri ----------------------------------------------------------- */

  if (!sablon) {
    return (
      <div>
        <div className="grid gap-5 sm:grid-cols-3">
          {Object.values(SABLONLAR).map((s) => (
            <button
              key={s.ad}
              type="button"
              onClick={() => {
                setSablonAdi(s.ad);
                setSeciliYuva(null);
              }}
              className="press group text-left"
            >
              <div className="overflow-hidden rounded-[1.25rem] ring-1 ring-black/10 transition-shadow group-hover:ring-black/25">
                <div
                  className="catalog-kap"
                  style={{ aspectRatio: `${CIKTI_GENISLIK} / ${CIKTI_YUKSEKLIK}` }}
                >
                  {/* Mini onizleme, gercek sablonun kendisi — ayri bir
                      "kapak resmi" tutulsaydi sablon degistiginde sessizce
                      eskirdi. */}
                  <CatalogPageView
                    sablon={s}
                    yuvalar={s.yuvalar.map(() => null)}
                    metinler={VARSAYILAN_METINLER}
                  />
                </div>
              </div>
              <h3 className="mt-3 text-[1.0625rem] font-semibold tracking-[-0.01em]">
                {s.baslik}
              </h3>
              <p className="on-light-muted fine-print mt-0.5">{s.ozet}</p>
            </button>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={ornekleBasla}
            className="press min-h-11 rounded-full bg-white"
          >
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
            Örnek ile başlayın
          </Button>
        </div>
      </div>
    );
  }

  /* --- Calisma alani ---------------------------------------------------- */

  const secili = seciliYuva !== null ? gorunenYuvalar[seciliYuva] : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="mx-auto w-full max-w-[32rem] min-w-0">
        <div
          className="catalog-kap overflow-hidden rounded-[1.25rem] shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_44px_-18px_rgba(0,0,0,0.28)] ring-1 ring-black/10"
          style={{ aspectRatio: `${CIKTI_GENISLIK} / ${CIKTI_YUKSEKLIK}` }}
        >
          <CatalogPageView
            sablon={sablon}
            yuvalar={gorunenYuvalar}
            metinler={metinler}
            duzenlenebilir
            seciliYuva={seciliYuva}
            onYuvaSecildi={setSeciliYuva}
            onYuvaBosaltildi={(sira) => {
              setYuvalar((onceki) => {
                const yeni = [...onceki];
                yeni[sira] = null;
                return yeni;
              });
              setSeciliYuva(null);
            }}
          />
        </div>
        <p className="fine-print mt-3 text-center opacity-55">
          A4 oranında · {CIKTI_GENISLIK}×{CIKTI_YUKSEKLIK} piksel
        </p>
      </div>

      <div className="divide-black/8 divide-y rounded-2xl bg-[#efece6]">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <span className="text-[0.9375rem] font-medium">{sablon.baslik}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSablonAdi(null);
              setSeciliYuva(null);
            }}
            className="press -mr-2 rounded-full"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
            Şablonu değiştir
          </Button>
        </div>

        <Baslik>Metinler</Baslik>
        <div className="space-y-3 px-5 pb-5">
          <Alan
            etiket="Üst etiket"
            deger={metinler.ustEtiket}
            onDegisti={(d) => setMetinler((m) => ({ ...m, ustEtiket: d }))}
          />
          <Alan
            etiket="Başlık"
            deger={metinler.baslik}
            onDegisti={(d) => setMetinler((m) => ({ ...m, baslik: d }))}
          />
          {sablon.metinler.some((m) => m.alan === "altBilgi") ? (
            <Alan
              etiket="Alt bilgi"
              deger={metinler.altBilgi}
              onDegisti={(d) => setMetinler((m) => ({ ...m, altBilgi: d }))}
            />
          ) : null}
        </div>

        <Baslik>
          Görseller
          <span className="ml-2 font-normal normal-case opacity-50">
            {doluSayisi}/{sablon.yuvalar.length}
          </span>
        </Baslik>
        <div className="space-y-3 px-5 pb-5">
          {seciliYuva === null ? (
            <p className="fine-print opacity-60">
              Sayfadaki bir alana dokunun; görsel ekleyip boyutunu ve yerini
              buradan ayarlayın.
            </p>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dosyaGirdisiRef.current?.click()}
                className="press w-full justify-start rounded-full bg-white"
              >
                <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden />
                {secili ? "Görseli değiştir" : "Bilgisayardan seçin"}
              </Button>

              {/* Boyut ve konum — kullanicinin acikca istedigi kontrol.
                  Degerler yuvanin KENDI kutusuna gore oran; sablon degisse de
                  ayni yerlesim korunuyor. */}
              {secili ? (
                <div className="space-y-2.5 pt-1">
                  <Kaydirac
                    etiket="Boyut"
                    deger={secili.donusum.olcek}
                    enAz={EN_KUCUK_OLCEK}
                    enCok={EN_BUYUK_OLCEK}
                    adim={0.02}
                    bicimle={(d) => `${Math.round(d * 100)}%`}
                    onDegisti={(d) => donusumuGuncelle(seciliYuva, { olcek: d })}
                  />
                  <Kaydirac
                    etiket="Yatay"
                    deger={secili.donusum.x}
                    enAz={-0.5}
                    enCok={0.5}
                    adim={0.01}
                    bicimle={(d) => `${d > 0 ? "+" : ""}${Math.round(d * 100)}`}
                    onDegisti={(d) => donusumuGuncelle(seciliYuva, { x: d })}
                  />
                  <Kaydirac
                    etiket="Dikey"
                    deger={secili.donusum.y}
                    enAz={-0.5}
                    enCok={0.5}
                    adim={0.01}
                    bicimle={(d) => `${d > 0 ? "+" : ""}${Math.round(d * 100)}`}
                    onDegisti={(d) => donusumuGuncelle(seciliYuva, { y: d })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      donusumuGuncelle(seciliYuva, { ...VARSAYILAN_DONUSUM })
                    }
                    className="fine-print flex items-center gap-1.5 pt-0.5 underline underline-offset-2 opacity-60 hover:opacity-100"
                  >
                    <RotateCcw className="size-3" strokeWidth={1.75} aria-hidden />
                    Yerleşimi sıfırla
                  </button>
                </div>
              ) : null}

              {/* Gecmisten secme: kullanicinin bu araci kullanarak hazirladigi
                  gorseller zaten burada; tekrar indirip yuklemesi anlamsiz. */}
              {isHistoryLoaded && works.length > 0 ? (
                <div className="max-h-44 space-y-1 overflow-y-auto pt-1">
                  <p className="fine-print px-1 opacity-55">Çalışmalarımdan</p>
                  {works.map((kayit) => (
                    <button
                      key={kayit.id}
                      type="button"
                      onClick={() => {
                        const url = URL.createObjectURL(kayit.result);
                        objectUrlRef.current.push(url);
                        void yuvayaKoy(seciliYuva, url, kayit.fileName);
                      }}
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
              ) : null}
            </>
          )}

          {hata ? <p className="fine-print text-red-700">{hata}</p> : null}

          <input
            ref={dosyaGirdisiRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(olay) => {
              const dosya = olay.target.files?.[0];
              olay.target.value = "";
              if (!dosya || seciliYuva === null) return;

              const dogrulamaHatasi = validateFile(dosya);
              if (dogrulamaHatasi) {
                setHata(dogrulamaHatasi.message);
                return;
              }
              const url = URL.createObjectURL(dosya);
              objectUrlRef.current.push(url);
              void yuvayaKoy(seciliYuva, url, dosya.name);
            }}
          />
        </div>

        <Baslik>Dışa aktar</Baslik>
        <div className="px-5 pb-5">
          <Button
            type="button"
            onClick={disaAktar}
            disabled={disaAktariliyor || doluSayisi === 0}
            className="press min-h-10 w-full rounded-full"
          >
            {disaAktariliyor ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            PNG indir
          </Button>
          {doluSayisi === 0 ? (
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

function Kaydirac({
  etiket,
  deger,
  enAz,
  enCok,
  adim,
  bicimle,
  onDegisti,
}: {
  etiket: string;
  deger: number;
  enAz: number;
  enCok: number;
  adim: number;
  bicimle: (deger: number) => string;
  onDegisti: (deger: number) => void;
}) {
  return (
    <div>
      <div className="fine-print mb-1 flex items-center justify-between opacity-60">
        <span>{etiket}</span>
        <span className="tabular-nums">{bicimle(deger)}</span>
      </div>
      <input
        type="range"
        min={enAz}
        max={enCok}
        step={adim}
        value={deger}
        aria-label={etiket}
        onChange={(olay) => onDegisti(Number(olay.target.value))}
        className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15"
      />
    </div>
  );
}
