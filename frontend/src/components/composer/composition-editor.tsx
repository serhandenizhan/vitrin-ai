"use client";

/**
 * Kompozisyon editoru (Faz 3): kesilmis urunu bir zemin uzerine yerlestir,
 * surukle/olcekle/dondur ve 2000x2000 olarak disa aktar.
 *
 * Konva sahnesi `next/dynamic` ile ve `ssr: false` ile yukleniyor: Konva
 * kurulurken `window` ve `canvas`'a dokunuyor, sunucuda calistirilirsa
 * derleme aninda patlar. Bu, kutuphanenin bilinen bir kisiti; gecici bir
 * cozum degil.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2 } from "lucide-react";
import type Konva from "konva";

import { Button } from "@/components/ui/button";
import { useZeminler } from "@/components/composer/use-zeminler";
import { CIKTI_OLCUSU, SAHNE_OLCUSU } from "@/components/composer/editor-stage";
import type { Zemin } from "@/lib/backgrounds";

const EditorStage = dynamic(
  () => import("@/components/composer/editor-stage").then((m) => m.EditorStage),
  {
    ssr: false,
    loading: () => (
      <div className="checkerboard flex aspect-square w-full items-center justify-center rounded-2xl">
        <Loader2 className="size-5 animate-spin opacity-60" />
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
 * Ust sinirdan baslamak, `ResizeObserver` ilk olcumu yapana kadar gecen tek
 * karede sahnenin kapsayicisindan tasmasina yol aciyor. Kucukten baslayip
 * buyumek, ters yondeki tasmadan gorsel olarak daha az rahatsiz edici.
 */
const BASLANGIC_EKRAN_OLCUSU = 240;

export function CompositionEditor({ kesimUrl, dosyaAdi }: CompositionEditorProps) {
  const { zeminler, sunucuZeminiVar, yukleniyor } = useZeminler();
  const [seciliZeminId, setSeciliZeminId] = useState<string | null>(null);
  const [ekranOlcusu, setEkranOlcusu] = useState(BASLANGIC_EKRAN_OLCUSU);
  const [disaAktariliyor, setDisaAktariliyor] = useState(false);

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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      {/*
        `min-w-0` sart: grid ogelerinin varsayilan `min-width: auto` degeri,
        ogenin ICERIGINDEN daha dar olmasini engelliyor. Konva sahnesi kendine
        acik bir piksel genisligi verdigi icin bu bir geri besleme dongusu
        yaratiyordu: sahne 560 px -> kapsayici 560 px'e itiliyor ->
        `ResizeObserver` 560 okuyor -> sahne 560'ta kaliyor. Sonuc, dar
        ekranlarda kapsayicisindan tasan bir tuval (529 px'lik bir panelde
        560 px'lik sahne olcüldü). `min-w-0`, kapsayicinin gercek kullanilabilir
        genisligi bildirmesini sagliyor.
      */}
      <div ref={kapsayiciRef} className="mx-auto w-full max-w-[35rem] min-w-0">
        <div className="overflow-hidden rounded-2xl border border-black/10 shadow-sm">
          <EditorStage
            kesimUrl={kesimUrl}
            zemin={seciliZemin}
            ekranOlcusu={ekranOlcusu}
            onStageHazir={stageHazir}
          />
        </div>
        <p className="fine-print mt-3 text-center opacity-70">
          Ürünü sürükleyin; köşelerden boyutlandırın, üstteki tutamaçtan
          döndürün.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-[0.8125rem] font-medium tracking-[0.06em] uppercase opacity-60">
            Zemin
          </h3>
          <div className="mt-3 grid grid-cols-4 gap-2 lg:grid-cols-3">
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
                  className={
                    aktif
                      ? "ring-gold aspect-square overflow-hidden rounded-lg ring-2 ring-offset-2"
                      : "aspect-square overflow-hidden rounded-lg ring-1 ring-black/10"
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
            <p className="fine-print mt-3 opacity-70">
              Zemin kütüphanesi henüz hazırlanıyor. Şimdilik sade zeminlerle
              çalışabilirsiniz.
            </p>
          ) : null}
        </div>

        <div>
          <h3 className="text-[0.8125rem] font-medium tracking-[0.06em] uppercase opacity-60">
            Dışa aktar
          </h3>
          <p className="fine-print mt-1 opacity-70">
            {CIKTI_OLCUSU}×{CIKTI_OLCUSU} piksel
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => disaAktar("png")}
              disabled={disaAktariliyor}
              className="press"
            >
              <Download className="size-4" />
              PNG
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => disaAktar("jpeg")}
              disabled={disaAktariliyor}
              className="press"
            >
              <ImageIcon className="size-4" />
              JPEG
            </Button>
          </div>
        </div>
      </div>
    </div>
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
