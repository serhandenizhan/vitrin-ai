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
import { Crosshair, Download, Loader2, Printer, RotateCw } from "lucide-react";
import type Konva from "konva";

import { Button } from "@/components/ui/button";
import { useBackgrounds } from "@/components/composer/use-zeminler";
import {
  CIKTI_BICIMLERI,
  type CiktiBicimAdi,
  type Donusum,
  type Gorunum,
  VARSAYILAN_GORUNUM,
  aciyiNormalize,
  gorunumVarsayilanMi,
  mantiksalOlcu,
  sahneyeSigdir,
} from "@/lib/composition";
import type { Background } from "@/lib/backgrounds";

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
  cutoutUrl: string;
  /** Indirilen dosyanin adinda kullanilir. */
  fileName: string;
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

export function CompositionEditor({ cutoutUrl, fileName }: CompositionEditorProps) {
  const { backgrounds, hasServerBackground, isLoading } = useBackgrounds();
  const [seciliZeminId, setSeciliZeminId] = useState<string | null>(null);
  const [ekranOlcusu, setEkranOlcusu] = useState(BASLANGIC_EKRAN_OLCUSU);
  const [disaAktariliyor, setDisaAktariliyor] = useState(false);
  const [baskiAcik, setBaskiAcik] = useState(false);
  const [bicimAdi, setBicimAdi] = useState<CiktiBicimAdi>("kare");
  const [baskiDurumu, setBaskiDurumu] = useState<
    "bos" | "hazirlaniyor" | "hazir" | string
  >("bos");
  const [donusum, setDonusum] = useState<Donusum | null>(null);
  const [gorunum, setGorunum] = useState<Gorunum>(VARSAYILAN_GORUNUM);

  /**
   * Geri alma yigini.
   *
   * Yalnizca "kullanicinin bir sey degistirdigi" anlar kaydediliyor; surukleme
   * SIRASINDA degil, birakildiginda. Aksi halde tek bir surukleme yuzlerce adim
   * uretir ve Ctrl+Z pratikte ise yaramazdi.
   *
   * State degil REF: yigin arayuzu etkilemiyor, yalnizca Ctrl+Z aninda
   * okunuyor. State olsaydi her adimda gereksiz bir render olurdu.
   */
  const gecmisRef = useRef<{ donusum: Donusum | null; gorunum: Gorunum }[]>([]);

  const adimKaydet = useCallback(() => {
    gecmisRef.current.push({ donusum, gorunum });
    // Yigin sinirli: 50 adim, bir oturumda geri alinmak istenecek her seyi
    // fazlasiyla kapsiyor ve bellegi buyutmuyor.
    if (gecmisRef.current.length > 50) gecmisRef.current.shift();
  }, [donusum, gorunum]);

  const geriAl = useCallback(() => {
    const onceki = gecmisRef.current.pop();
    if (!onceki) return;
    setDonusum(onceki.donusum);
    setGorunum(onceki.gorunum);
  }, []);
  const [kesimOlculeri, setKesimOlculeri] = useState<{
    genislik: number;
    yukseklik: number;
  } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const kapsayiciRef = useRef<HTMLDivElement | null>(null);

  const bicim = CIKTI_BICIMLERI[bicimAdi];
  const sahne = useMemo(() => mantiksalOlcu(bicim), [bicim]);

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

  /**
   * Klavye kisayollari.
   *
   * Ok tuslari urunu kaydiriyor (Shift ile 10 kat), Ctrl/Cmd+Z geri aliyor.
   * Fareyle bir pikseli tutturmak zor; ok tuslari kesin ayar icin tek yol.
   *
   * Bir metin alanina yaziliyorsa hicbir sey yapilmiyor — aksi halde baslik
   * yazarken urun kayardi.
   */
  useEffect(() => {
    function tusaBasildi(olay: KeyboardEvent) {
      const hedef = olay.target as HTMLElement | null;
      if (
        hedef &&
        (hedef.tagName === "INPUT" ||
          hedef.tagName === "TEXTAREA" ||
          hedef.isContentEditable)
      ) {
        return;
      }

      if ((olay.ctrlKey || olay.metaKey) && olay.key.toLowerCase() === "z") {
        olay.preventDefault();
        geriAl();
        return;
      }

      const yonler: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const yon = yonler[olay.key];
      if (!yon) return;

      olay.preventDefault();
      const adim = (olay.shiftKey ? 10 : 1) * (sahne.genislik / 500);
      adimKaydet();
      setDonusum((onceki) => ({
        x: (onceki?.x ?? sahne.genislik / 2) + yon[0] * adim,
        y: (onceki?.y ?? sahne.yukseklik / 2) + yon[1] * adim,
        olcek: onceki?.olcek ?? 1,
        aci: onceki?.aci ?? 0,
      }));
    }

    document.addEventListener("keydown", tusaBasildi);
    return () => document.removeEventListener("keydown", tusaBasildi);
  }, [geriAl, adimKaydet, sahne]);

  // Secili zemin id ile tutuluyor, nesneyle degil: liste yenilendiginde
  // (imzali URL'ler tazelendiginde) nesne kimligi degisiyor ama id ayni
  // kaliyor, dolayisiyla kullanicinin secimi yenilemeden SAG CIKIYOR.
  // Nesneyi saklasaydik her yenilemede secim ilk zemine donerdi.
  const seciliZemin: Background =
    backgrounds.find((zemin) => zemin.id === seciliZeminId) ?? backgrounds[0];

  const stageHazir = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);

  /** Kesimin sahneye tam oturdugu olcek — kaydiracin referans noktasi. */
  const sigdirmaOlcegi = useMemo(
    () =>
      kesimOlculeri
        ? sahneyeSigdir(
            sahne.genislik,
            sahne.yukseklik,
            kesimOlculeri.genislik,
            kesimOlculeri.yukseklik,
          ).olcek
        : null,
    [kesimOlculeri, sahne],
  );

  const ortalaVeSigdir = useCallback(() => {
    if (!kesimOlculeri) return;
    adimKaydet();
    setDonusum(
      sahneyeSigdir(
        sahne.genislik,
        sahne.yukseklik,
        kesimOlculeri.genislik,
        kesimOlculeri.yukseklik,
      ),
    );
  }, [kesimOlculeri, sahne, adimKaydet]);

  /**
   * Bicim degistirir ve yerlesimi sifirlar.
   *
   * Sifirlama bir EFEKTTE degil burada: bicim degisimi bir OLAY. Efekte
   * konsaydi hem fazladan bir render turu olusurdu hem de React Compiler
   * bunu hakli olarak reddediyor (`react-hooks/set-state-in-effect`).
   *
   * Neden sifirlaniyor: donusum koordinatlari eski sahnenin olculerine gore
   * tutuluyor; yeni sahnede anlamsiz bir yerde kalirlardi. `null`, sahneye
   * "kendi baslangic yerlesimini hesapla" demek.
   */
  const bicimiDegistir = useCallback((ad: CiktiBicimAdi) => {
    setBicimAdi(ad);
    setDonusum(null);
  }, []);

  const olcekAyarla = useCallback(
    (oran: number) => {
      if (!sigdirmaOlcegi) return;
      setDonusum((onceki) => ({
        x: onceki?.x ?? sahne.genislik / 2,
        y: onceki?.y ?? sahne.yukseklik / 2,
        aci: onceki?.aci ?? 0,
        olcek: sigdirmaOlcegi * oran,
      }));
    },
    [sigdirmaOlcegi, sahne],
  );

  const dondur = useCallback(
    (derece: number) => {
      setDonusum((onceki) => ({
        x: onceki?.x ?? sahne.genislik / 2,
        y: onceki?.y ?? sahne.yukseklik / 2,
        olcek: onceki?.olcek ?? 1,
        aci: aciyiNormalize((onceki?.aci ?? 0) + derece),
      }));
    },
    [sahne],
  );

  const mevcutOran =
    donusum && sigdirmaOlcegi ? donusum.olcek / sigdirmaOlcegi : 1;

  /** Sahneyi cizip veri URL'i dondurur; indirmeyi cagirana birakiyor. */
  const sahneyiCiz = useCallback(
    (tur: "png" | "jpeg"): string | null => {
      const stage = stageRef.current;
      if (!stage) return null;

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

        stage.width(sahne.genislik);
        stage.height(sahne.yukseklik);
        stage.scale({ x: 1, y: 1 });

        const veriUrl = stage.toDataURL({
          mimeType: tur === "png" ? "image/png" : "image/jpeg",
          quality: 0.92,
          // Mantiksal olcu her zaman ciktinin yarisi oldugu icin oran tam 2.
          pixelRatio: bicim.ciktiGenislik / sahne.genislik,
        });

        stage.width(oncekiGenislik);
        stage.height(oncekiYukseklik);
        stage.scale(oncekiOlcek);
        transformerlar.forEach((node) => node.show());
        stage.draw();

        return veriUrl;
      } finally {
        setDisaAktariliyor(false);
      }
    },
    [sahne, bicim],
  );

  /** Sahneyi indirilebilir bir dosyaya cevirir. */
  const indir = useCallback(
    (tur: "png" | "jpeg") => {
      const veriUrl = sahneyiCiz(tur);
      if (!veriUrl) return;
      const bag = document.createElement("a");
      bag.href = veriUrl;
      bag.download = `${fileName.replace(/\.[^.]+$/, "")}-${bicimAdi}.${tur === "jpeg" ? "jpg" : "png"}`;
      bag.click();
    },
    [sahneyiCiz, fileName, bicimAdi],
  );

  /**
   * Baskiya uygun (CMYK) indirme.
   *
   * Sahne once PNG olarak ciziliyor, sonra sunucuya gonderilip hedef baski
   * kosulunun ICC profiliyle CMYK'ya cevriliyor (bkz. app/api/cmyk/route.ts).
   * Tarayicida yapilamaz: canvas yalnizca RGB uretir, PNG CMYK'yi desteklemez.
   */
  const baskiyaIndir = useCallback(
    async (bicimTuru: "jpeg" | "tiff") => {
      const veriUrl = sahneyiCiz("png");
      if (!veriUrl) return;

      setBaskiDurumu("hazirlaniyor");
      try {
        const govde = new FormData();
        govde.append("file", await (await fetch(veriUrl)).blob(), "sahne.png");
        govde.append("format", bicimTuru);

        const yanit = await fetch("/api/cmyk", { method: "POST", body: govde });
        if (!yanit.ok) {
          const hata = await yanit.json().catch(() => null);
          setBaskiDurumu(hata?.error ?? "Dönüşüm başarısız oldu.");
          return;
        }

        const blob = await yanit.blob();
        const url = URL.createObjectURL(blob);
        const bag = document.createElement("a");
        bag.href = url;
        bag.download = `${fileName.replace(/\.[^.]+$/, "")}-cmyk.${bicimTuru === "tiff" ? "tif" : "jpg"}`;
        bag.click();
        // Iptal GECIKTIRILIYOR. `click()`'ten hemen sonra iptal etmek, tarayici
        // blob'u okumaya baslamadan URL'i gecersiz kilabiliyor ve indirme
        // sessizce basarisiz oluyor. Bir dakika, en yavas cihazda bile fazlasiyla
        // yeterli; sonra bellek serbest kaliyor.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setBaskiDurumu("hazir");
      } catch {
        setBaskiDurumu("Sunucuya ulaşılamadı.");
      }
    },
    [sahneyiCiz, fileName],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
      {/*
        `min-w-0` sart: grid ogelerinin varsayilan `min-width: auto` degeri,
        ogenin ICERIGINDEN daha dar olmasini engelliyor. Konva sahnesi kendine
        acik bir piksel genisligi verdigi icin bu bir geri besleme dongusu
        yaratiyordu: sahne 560 px -> kapsayici 560 px'e itiliyor ->
        olcum 560 okuyor -> sahne 560'ta kaliyor. Sonuc, dar ekranlarda
        kapsayicisindan tasan bir tuval. `min-w-0`, kapsayicinin gercek
        kullanilabilir genisligi bildirmesini sagliyor.
      */}
      {/*
        Telefonda tuval YAPISKAN: kullanici asagidaki ayarlari degistirirken
        sonucu gorebilmeli. Onceden panel tuvalin altina duyuyor ve ayar
        yapilirken tuval ekran disinda kaliyordu.
        `top-14` ust cubugun yuksekligi kadar.
      */}
      <div
        ref={kapsayiciRef}
        className="mx-auto w-full max-w-[22rem] min-w-0 sm:max-w-[26rem] lg:sticky lg:top-20 lg:max-w-[35rem]"
      >
        <div
          className="ring-black/8 overflow-hidden rounded-[1.25rem] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.25)] ring-1"
          style={{ aspectRatio: `${bicim.ciktiGenislik} / ${bicim.ciktiYukseklik}` }}
        >
          <EditorStage
            kesimUrl={cutoutUrl}
            zemin={seciliZemin}
            ekranOlcusu={ekranOlcusu}
            sahneGenislik={sahne.genislik}
            sahneYukseklik={sahne.yukseklik}
            donusum={donusum}
            gorunum={gorunum}
            onDonusumDegisti={(yeni) => {
              adimKaydet();
              setDonusum(yeni);
            }}
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
            {backgrounds.map((zemin) => {
              const aktif = zemin.id === seciliZemin.id;
              return (
                <button
                  key={zemin.id}
                  type="button"
                  onClick={() => setSeciliZeminId(zemin.id)}
                  title={zemin.name}
                  aria-label={zemin.name}
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
                    zemin.type === "yer-tutucu"
                      ? { background: gradyanCss(zemin.gradient) }
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
          {!isLoading && !hasServerBackground ? (
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
          Görünüm
          {!gorunumVarsayilanMi(gorunum) ? (
            <button
              type="button"
              onClick={() => setGorunum(VARSAYILAN_GORUNUM)}
              className="ml-2 font-normal normal-case underline underline-offset-2 opacity-70 hover:opacity-100"
            >
              sıfırla
            </button>
          ) : null}
        </BolumBasligi>
        <div className="space-y-3 px-5 pb-5">
          <Kaydirac
            etiket="Parlaklık"
            deger={gorunum.parlaklik}
            enAz={-0.3}
            enCok={0.3}
            adim={0.01}
            bicimle={(d) => `${d > 0 ? "+" : ""}${Math.round(d * 100)}`}
            onBasladi={adimKaydet}
            onDegisti={(d) => setGorunum((o) => ({ ...o, parlaklik: d }))}
          />
          <Kaydirac
            etiket="Kontrast"
            deger={gorunum.kontrast}
            enAz={-40}
            enCok={40}
            adim={1}
            bicimle={(d) => `${d > 0 ? "+" : ""}${Math.round(d)}`}
            onBasladi={adimKaydet}
            onDegisti={(d) => setGorunum((o) => ({ ...o, kontrast: d }))}
          />
          <Kaydirac
            etiket="Doygunluk"
            deger={gorunum.doygunluk}
            enAz={-1}
            enCok={1}
            adim={0.02}
            bicimle={(d) => `${d > 0 ? "+" : ""}${Math.round(d * 100)}`}
            onBasladi={adimKaydet}
            onDegisti={(d) => setGorunum((o) => ({ ...o, doygunluk: d }))}
          />

          <div className="flex gap-2 pt-1">
            <Anahtar
              etiket="Gölge"
              acik={gorunum.golge}
              onDegisti={(a) => setGorunum((o) => ({ ...o, golge: a }))}
            />
            <Anahtar
              etiket="Işık havuzu"
              acik={gorunum.isikHavuzu}
              onDegisti={(a) => setGorunum((o) => ({ ...o, isikHavuzu: a }))}
            />
          </div>
        </div>

        {/*
          Cikti bicimleri. Mantiksal sahne olcusu her bicimde ciktinin YARISI
          oldugu icin disa aktarma orani tam 2 kaliyor — kesirli bir oran
          Konva'nin ic hesabinda bir piksel kaybina yol aciyor (2000 yerine
          1999 px uretildigi birebir olculdu).
        */}
        <BolumBasligi>Çıktı boyutu</BolumBasligi>
        <div className="grid grid-cols-2 gap-2 px-5 pb-5">
          {(
            Object.entries(CIKTI_BICIMLERI) as [
              CiktiBicimAdi,
              (typeof CIKTI_BICIMLERI)[CiktiBicimAdi],
            ][]
          ).map(([ad, b]) => (
            <button
              key={ad}
              type="button"
              onClick={() => bicimiDegistir(ad)}
              aria-pressed={bicimAdi === ad}
              className={
                "press rounded-xl px-3 py-2 text-left transition-shadow " +
                (bicimAdi === ad
                  ? "ring-gold bg-white ring-2"
                  : "bg-white/70 ring-1 ring-black/10 hover:ring-black/25")
              }
            >
              <span className="block text-[0.8125rem] font-medium">{b.ad}</span>
              <span className="fine-print block opacity-55">{b.ozet}</span>
            </button>
          ))}
        </div>

        <BolumBasligi>
          Dışa aktar
          <span className="ml-2 font-normal normal-case opacity-50">
            {bicim.ciktiGenislik}×{bicim.ciktiYukseklik}
          </span>
        </BolumBasligi>
        <div className="flex gap-2 px-5 pb-5">
          <Button
            type="button"
            onClick={() => indir("png")}
            disabled={disaAktariliyor}
            className="press min-h-10 flex-1 rounded-full"
          >
            <Download className="size-4" strokeWidth={1.75} aria-hidden />
            PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => indir("jpeg")}
            disabled={disaAktariliyor}
            className="press min-h-10 flex-1 rounded-full bg-white"
          >
            JPEG
          </Button>
        </div>

        {/*
          BASKIYA UYGUN CIKTI — artik gercek.

          Donusum `sharp` (libvips + littleCMS) ile Next'in kendi sunucusunda
          yapiliyor (bkz. app/api/cmyk/route.ts); Python backend'ine ve yol
          haritasindaki hicbir faza dokunmuyor.

          Tarayicida yapilamaz: canvas yalnizca RGB uretir, PNG formati
          CMYK'yi hic desteklemez. Dort kanalli bir goruntu ve icine gomulu
          bir cikti profili yalnizca sunucuda mumkun.
        */}
        <BolumBasligi>
          Baskıya uygun
          <span className="ml-2 font-normal normal-case opacity-50">CMYK</span>
        </BolumBasligi>
        <div className="px-5 pb-5">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => baskiyaIndir("tiff")}
              disabled={baskiDurumu === "hazirlaniyor"}
              className="press min-h-10 flex-1 rounded-full bg-white"
            >
              {baskiDurumu === "hazirlaniyor" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Printer className="size-3.5" strokeWidth={1.75} aria-hidden />
              )}
              TIFF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => baskiyaIndir("jpeg")}
              disabled={baskiDurumu === "hazirlaniyor"}
              className="press min-h-10 flex-1 rounded-full bg-white"
            >
              JPEG
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setBaskiAcik((a) => !a)}
            aria-expanded={baskiAcik}
            className="fine-print mt-2 underline underline-offset-2 opacity-60 hover:opacity-100"
          >
            Bu ne demek?
          </button>

          {baskiAcik ? (
            <p className="fine-print mt-1.5 leading-relaxed opacity-70">
              Matbaa, ekran için üretilen RGB dosyayı doğrudan basamaz. Bu
              seçenek görseli, hedef baskı koşulunun ICC profiliyle CMYK renk
              uzayına çevirip profili dosyaya gömer. Saydam alanlar beyaza
              düzleştirilir — CMYK&apos;nin alfa kanalı yoktur. TIFF matbaanın
              tercih ettiği biçim; JPEG daha küçük.
            </p>
          ) : null}

          {baskiDurumu !== "bos" && baskiDurumu !== "hazirlaniyor" ? (
            <p
              className={
                "fine-print mt-2 " +
                (baskiDurumu === "hazir" ? "opacity-60" : "text-red-700")
              }
            >
              {baskiDurumu === "hazir" ? "İndirildi." : baskiDurumu}
            </p>
          ) : null}

          <p className="fine-print mt-3 opacity-55">
            PNG çıktısı zaten kayıpsızdır; JPEG sıkıştırma uygular.
          </p>
        </div>
      </div>
    </div>
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
  onBasladi,
}: {
  etiket: string;
  deger: number;
  enAz: number;
  enCok: number;
  adim: number;
  bicimle: (deger: number) => string;
  onDegisti: (deger: number) => void;
  /** Kaydiraca BASILDIGINDA cagriliyor — geri alma adimi burada kaydediliyor,
      her deger degisiminde degil; aksi halde tek surukleme yuzlerce adim
      uretirdi. */
  onBasladi?: () => void;
}) {
  return (
    <div>
      <div className="fine-print mb-1.5 flex items-center justify-between opacity-60">
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
        onPointerDown={onBasladi}
        onChange={(olay) => onDegisti(Number(olay.target.value))}
        className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15"
      />
    </div>
  );
}

function Anahtar({
  etiket,
  acik,
  onDegisti,
}: {
  etiket: string;
  acik: boolean;
  onDegisti: (acik: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acik}
      onClick={() => onDegisti(!acik)}
      className={
        "press min-h-9 flex-1 rounded-full px-3 text-[0.8125rem] transition-colors " +
        (acik
          ? "bg-black text-white"
          : "bg-white text-black/70 ring-1 ring-black/10 hover:text-black")
      }
    >
      {etiket}
    </button>
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
