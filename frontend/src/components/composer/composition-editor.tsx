"use client";

/**
 * Kompozisyon editoru (Faz 3): kesilmis urunu bir zemin uzerine yerlestir,
 * surukle/olcekle/dondur ve 2000x2000 olarak disa aktar.
 *
 * Konva sahnesi `next/dynamic` ile ve `ssr: false` ile yukleniyor: Konva
 * kurulurken `window` ve `canvas`'a dokunuyor, sunucuda calistirilirsa
 * derleme aninda patlar. Bu, kutuphanenin bilinen bir kisiti; gecici bir
 * cozum degil.
 *
 * Donusum durumu (konum/olcek/aci) BURADA tutuluyor, sahnede degil — yandaki
 * kontroller ile tuvalin ayni veriyi paylasmasi icin (bkz. editor-stage.tsx).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Download, Loader2, RotateCw } from "lucide-react";
import type Konva from "konva";

import { Button } from "@/components/ui/button";
import { useZeminler } from "@/components/composer/use-zeminler";
import {
  CIKTI_OLCUSU,
  type Donusum,
  SAHNE_OLCUSU,
  aciyiNormalize,
  sigdirmaDonusumu,
} from "@/lib/composition";
import type { Zemin } from "@/lib/backgrounds";

const EditorStage = dynamic(
  () => import("@/components/composer/editor-stage").then((m) => m.EditorStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-square w-full items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="size-5 animate-spin opacity-40" />
      </div>
    ),
  },
);

export type CompositionEditorProps = {
  /** Arka plani kaldirilmis urunun object URL'i. */
  kesimUrl: string;
  /** Indirilen dosyanin adinda kullanilir. */
  dosyaAdi: string;
};

/** Sahnenin ekrandaki ust siniri — daha buyugu masaustunde sayfayi tasiyor. */
const EN_BUYUK_EKRAN_OLCUSU = 560;

/**
 * Baslangic olcusu bilincli olarak KUCUK.
 *
 * Ust sinirdan baslamak, ilk olcum yapilana kadar gecen tek karede sahnenin
 * kapsayicisindan tasmasina yol aciyor. Kucukten baslayip buyumek, ters
 * yondeki tasmadan gorsel olarak daha az rahatsiz edici.
 */
const BASLANGIC_EKRAN_OLCUSU = 240;

/** Boyut kaydiracinin sinirlari — sigdirma olceginin katlari olarak. */
const EN_KUCUK_OLCEK_ORANI = 0.25;
const EN_BUYUK_OLCEK_ORANI = 2.5;

export function CompositionEditor({ kesimUrl, dosyaAdi }: CompositionEditorProps) {
  const { zeminler, sunucuZeminiVar, yukleniyor } = useZeminler();
  const [seciliZeminId, setSeciliZeminId] = useState<string | null>(null);
  const [ekranOlcusu, setEkranOlcusu] = useState(BASLANGIC_EKRAN_OLCUSU);
  const [disaAktariliyor, setDisaAktariliyor] = useState(false);
  const [donusum, setDonusum] = useState<Donusum | null>(null);
  const [kesimOlculeri, setKesimOlculeri] = useState<{
    genislik: number;
    yukseklik: number;
  } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const kapsayiciRef = useRef<HTMLDivElement | null>(null);

  // Sahne kare ve kapsayicisina sigmali. `ResizeObserver`, `window.resize`
  // yerine kullaniliyor: kapsayici, pencere degismeden de (panel acilip
  // kapandiginda) genislik degistiriyor.
  //
  // AMA ilk olcum observer'a BIRAKILMIYOR, `getBoundingClientRect()` ile elle
  // yapiliyor. Sebep: `ResizeObserver` geri cagrilari, HTML spesifikasyonunda
  // "update the rendering" adiminin parcasi olarak teslim ediliyor — kare
  // uretmeyen bir baglamda (gizli sekme, gorunmez gomulu panel) HIC
  // calismayabiliyorlar. Bu dogrulama sirasinda birebir gozlendi: 434 px
  // genisliginde gercek bir ogeye takilan taze bir observer sifir olcum verdi.
  // Ilk olcum tek basina dogru boyutu belirledigi icin, observer artik yalnizca
  // SONRAKI degisiklikleri (panel acilip kapanmasi, pencere boyutu) izliyor.
  useEffect(() => {
    const kapsayici = kapsayiciRef.current;
    if (!kapsayici) return;

    function olcuveUygula(genislik: number) {
      if (genislik <= 0) return;
      setEkranOlcusu(
        Math.max(BASLANGIC_EKRAN_OLCUSU, Math.min(genislik, EN_BUYUK_EKRAN_OLCUSU)),
      );
    }

    olcuveUygula(kapsayici.getBoundingClientRect().width);

    const gozlemci = new ResizeObserver(([girdi]) =>
      olcuveUygula(girdi.contentRect.width),
    );
    gozlemci.observe(kapsayici);
    return () => gozlemci.disconnect();
  }, []);

  // Secili zemin id ile tutuluyor, nesneyle degil: liste yenilendiginde
  // (imzali URL'ler tazelendiginde) nesne kimligi degisiyor ama id ayni
  // kaliyor, dolayisiyla kullanicinin secimi yenilemeden SAG CIKIYOR.
  // Nesneyi saklasaydik her yenilemede secim ilk zemine donerdi.
  const seciliZemin: Zemin =
    zeminler.find((zemin) => zemin.id === seciliZeminId) ?? zeminler[0];

  const stageHazir = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);

  /** Kesimin sahneye tam oturdugu olcek — kaydiracin referans noktasi. */
  const sigdirmaOlcegi = useMemo(
    () =>
      kesimOlculeri
        ? sigdirmaDonusumu(kesimOlculeri.genislik, kesimOlculeri.yukseklik).olcek
        : null,
    [kesimOlculeri],
  );

  const ortalaVeSigdir = useCallback(() => {
    if (!kesimOlculeri) return;
    setDonusum(
      sigdirmaDonusumu(kesimOlculeri.genislik, kesimOlculeri.yukseklik),
    );
  }, [kesimOlculeri]);

  const olcekAyarla = useCallback(
    (oran: number) => {
      if (!sigdirmaOlcegi) return;
      setDonusum((onceki) => ({
        x: onceki?.x ?? SAHNE_OLCUSU / 2,
        y: onceki?.y ?? SAHNE_OLCUSU / 2,
        aci: onceki?.aci ?? 0,
        olcek: sigdirmaOlcegi * oran,
      }));
    },
    [sigdirmaOlcegi],
  );

  const dondur = useCallback((derece: number) => {
    setDonusum((onceki) => ({
      x: onceki?.x ?? SAHNE_OLCUSU / 2,
      y: onceki?.y ?? SAHNE_OLCUSU / 2,
      olcek: onceki?.olcek ?? 1,
      aci: aciyiNormalize((onceki?.aci ?? 0) + derece),
    }));
  }, []);

  const mevcutOran =
    donusum && sigdirmaOlcegi ? donusum.olcek / sigdirmaOlcegi : 1;

  const disaAktar = useCallback(
    (bicim: "png" | "jpeg") => {
      const stage = stageRef.current;
      if (!stage) return;

      setDisaAktariliyor(true);
      try {
        // Transformer tutamaklari sahnenin bir parcasi; gizlenmezse secim
        // cercevesi ve koseleri CIKTIYA da girer. Disa aktarmadan once
        // gecici olarak gizleniyor, sonra geri aliniyor.
        const transformerlar = stage.find("Transformer");
        transformerlar.forEach((node) => node.hide());
        stage.draw();

        // Sahne, disa aktarma suresince EKRAN olcusunden MANTIKSAL olcusune
        // aliniyor (olcek 1). Sebebi bir off-by-one hatasi:
        //
        // Once dogrudan `pixelRatio: CIKTI_OLCUSU / ekranOlcusu` kullaniliyordu.
        // Ekran olcusu kapsayiciya gore degisken ve genellikle yuvarlak degil;
        // 434 px genisliginde olculdugunde oran 4.6082... cikiyor ve Konva'nin
        // ic hesabi 2000 yerine 1999 px'lik bir tuval uretiyordu. Yol haritasi
        // cikti olcusunu 2000x2000 olarak SAYIYLA belirtiyor; 1999 sessizce
        // yanlis bir cikti demek.
        //
        // Mantiksal olcuye alindiginda oran CIKTI_OLCUSU / SAHNE_OLCUSU = 2,
        // yani tam sayi; sonuc her ekran genisliginde birebir 2000x2000.
        const oncekiGenislik = stage.width();
        const oncekiYukseklik = stage.height();
        const oncekiOlcek = { x: stage.scaleX(), y: stage.scaleY() };

        stage.width(SAHNE_OLCUSU);
        stage.height(SAHNE_OLCUSU);
        stage.scale({ x: 1, y: 1 });

        const veriUrl = stage.toDataURL({
          mimeType: bicim === "png" ? "image/png" : "image/jpeg",
          quality: 0.92,
          pixelRatio: CIKTI_OLCUSU / SAHNE_OLCUSU,
        });

        stage.width(oncekiGenislik);
        stage.height(oncekiYukseklik);
        stage.scale(oncekiOlcek);
        transformerlar.forEach((node) => node.show());
        stage.draw();

        const bag = document.createElement("a");
        bag.href = veriUrl;
        bag.download = `${dosyaAdi.replace(/\.[^.]+$/, "")}-vitrin.${bicim === "jpeg" ? "jpg" : "png"}`;
        bag.click();
      } finally {
        setDisaAktariliyor(false);
      }
    },
    [dosyaAdi],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      {/*
        `min-w-0` sart: grid ogelerinin varsayilan `min-width: auto` degeri,
        ogenin ICERIGINDEN daha dar olmasini engelliyor. Konva sahnesi kendine
        acik bir piksel genisligi verdigi icin bu bir geri besleme dongusu
        yaratiyordu: sahne 560 px -> kapsayici 560 px'e itiliyor ->
        olcum 560 okuyor -> sahne 560'ta kaliyor. Sonuc, dar ekranlarda
        kapsayicisindan tasan bir tuval. `min-w-0`, kapsayicinin gercek
        kullanilabilir genisligi bildirmesini sagliyor.
      */}
      <div ref={kapsayiciRef} className="mx-auto w-full max-w-[35rem] min-w-0">
        <div className="ring-black/8 overflow-hidden rounded-[1.25rem] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.25)] ring-1">
          <EditorStage
            kesimUrl={kesimUrl}
            zemin={seciliZemin}
            ekranOlcusu={ekranOlcusu}
            donusum={donusum}
            onDonusumDegisti={setDonusum}
            onKesimOlculeri={setKesimOlculeri}
            onStageHazir={stageHazir}
          />
        </div>
        <p className="fine-print mt-3 text-center opacity-60">
          Sürükleyerek taşıyın · köşelerden boyutlandırın · üstteki tutamaçtan
          döndürün
        </p>
      </div>

      <div className="divide-black/8 rounded-2xl bg-[#f5f5f7] divide-y">
        <BolumBasligi>Zemin</BolumBasligi>
        <div className="px-5 pb-5">
          <div className="grid grid-cols-6 gap-2 lg:grid-cols-4">
            {zeminler.map((zemin) => {
              const aktif = zemin.id === seciliZemin.id;
              return (
                <button
                  key={zemin.id}
                  type="button"
                  onClick={() => setSeciliZeminId(zemin.id)}
                  title={zemin.ad}
                  aria-label={zemin.ad}
                  aria-pressed={aktif}
                  // Secili halka `ring` yardimcilariyla veriliyor, keyfi bir
                  // `shadow-[...]` ile degil: keyfi coklu golge denendiginde
                  // Tailwind iki golge katmani uretti ama ikisi de SEFFAF
                  // kaldi, yani secili zemin hic belli olmuyordu (tarayicida
                  // olculerek yakalandi). `ring` bu isi tek bir ongorulebilir
                  // ozellikle yapiyor.
                  className={
                    "aspect-square rounded-full ring-offset-[#f5f5f7] transition-transform duration-200 " +
                    (aktif
                      ? "ring-gold scale-105 ring-2 ring-offset-2"
                      : "ring-1 ring-black/15 hover:scale-105")
                  }
                  style={
                    zemin.tur === "yer-tutucu"
                      ? { background: gradyanCss(zemin.gradyan) }
                      : {
                          backgroundImage: `url(${zemin.url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                  }
                />
              );
            })}
          </div>

          {/*
            Yer tutucu zeminler kullaniciya ACIKCA soyleniyor. Yol haritasi
            "sessizce dusmeli" derken kirilma olmamasini kastediyor, kullanicinin
            yanlis bilgilendirilmesini degil: gercek zemin kutuphanesi henuz
            yokken "iste zeminleriniz" demek yanlis olurdu.
          */}
          {!yukleniyor && !sunucuZeminiVar ? (
            <p className="fine-print mt-3 opacity-60">
              Zemin kütüphanesi hazırlanıyor. Şimdilik sade zeminler.
            </p>
          ) : null}
        </div>

        <BolumBasligi>Yerleşim</BolumBasligi>
        <div className="space-y-4 px-5 pb-5">
          <div>
            <div className="fine-print mb-2 flex items-center justify-between opacity-60">
              <span>Boyut</span>
              <span className="tabular-nums">
                {Math.round(mevcutOran * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={EN_KUCUK_OLCEK_ORANI * 100}
              max={EN_BUYUK_OLCEK_ORANI * 100}
              step={1}
              value={Math.round(mevcutOran * 100)}
              disabled={!sigdirmaOlcegi}
              aria-label="Ürün boyutu"
              onChange={(olay) => olcekAyarla(Number(olay.target.value) / 100)}
              className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => dondur(15)}
              disabled={!kesimOlculeri}
              className="press flex-1 rounded-full bg-white"
            >
              <RotateCw className="size-3.5" strokeWidth={1.75} aria-hidden />
              15°
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={ortalaVeSigdir}
              disabled={!kesimOlculeri}
              className="press flex-1 rounded-full bg-white"
            >
              <Crosshair className="size-3.5" strokeWidth={1.75} aria-hidden />
              Ortala
            </Button>
          </div>
        </div>

        <BolumBasligi>
          Dışa aktar
          <span className="ml-2 font-normal normal-case opacity-50">
            {CIKTI_OLCUSU}×{CIKTI_OLCUSU}
          </span>
        </BolumBasligi>
        <div className="flex gap-2 px-5 pb-5">
          <Button
            type="button"
            onClick={() => disaAktar("png")}
            disabled={disaAktariliyor}
            className="press min-h-10 flex-1 rounded-full"
          >
            <Download className="size-4" strokeWidth={1.75} aria-hidden />
            PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => disaAktar("jpeg")}
            disabled={disaAktariliyor}
            className="press min-h-10 flex-1 rounded-full bg-white"
          >
            JPEG
          </Button>
        </div>
      </div>
    </div>
  );
}

function BolumBasligi({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-5 pt-5 pb-3 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase opacity-50">
      {children}
    </h3>
  );
}

/** Konva'nin `[oran, renk, ...]` dizisini CSS gradyanina cevirir (onizleme). */
function gradyanCss(duraklar: (number | string)[]): string {
  const parcalar: string[] = [];
  for (let i = 0; i < duraklar.length; i += 2) {
    parcalar.push(`${duraklar[i + 1]} ${Number(duraklar[i]) * 100}%`);
  }
  return `linear-gradient(135deg, ${parcalar.join(", ")})`;
}
