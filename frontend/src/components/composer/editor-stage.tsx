"use client";

/**
 * Konva sahnesi: zemin + kesim, surukle/olcekle/dondur.
 *
 * TASARIM KARARI 1 — sahne her zaman KARE ve mantiksal olcusu sabit.
 *
 * Sahne ekranda kapsayicisina sigacak kadar kucuk cizilir, ama icindeki tum
 * koordinatlar `SAHNE_OLCUSU` (1000) uzerinden tutulur ve Konva'nin kendi
 * `scale`'i ile kucultulur. Bunun iki faydasi var:
 *
 *  - Kullanicinin yaptigi yerlesim ekran boyutundan BAGIMSIZ. Telefonda
 *    konumlandirilan bir urun, masaustunde ayni yerde duruyor; pencere yeniden
 *    boyutlandiginda kompozisyon kaymiyor.
 *  - Disa aktarma orani tam sayi tutuyor (bkz. composition-editor.tsx).
 *
 * TASARIM KARARI 2 — donusum (konum/olcek/aci) PARENT'ta tutuluyor.
 *
 * Sahne kendi ic durumunu saklamiyor; `donusum` prop'unu ciziyor ve kullanici
 * surukleyip olcekledikce `onDonusumDegisti` ile haber veriyor. Boylece yandaki
 * kontroller (boyut kaydiraci, ortala/sigdir, aci) ile tuvalin kendisi AYNI
 * veriyi paylasiyor — iki ayri dogruluk kaynagi olusmuyor. Konva ornegini disari
 * acip imperative cagrilar yapmak da mumkundu ama o zaman kaydiracin gosterdigi
 * deger ile tuvaldeki gercek olcek sessizce ayrisabilirdi.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import Konva from "konva";

import type { Zemin } from "@/lib/backgrounds";
// Saf geometri `@/lib/composition` icinde: Konva/React'ten bagimsiz oldugu icin
// Node ortaminda canvas yuklemeden test edilebiliyor.
import {
  CIKTI_OLCUSU,
  type Donusum,
  type Gorunum,
  SAHNE_OLCUSU,
  SIGDIRMA_PAYI,
  merkezeYakala,
  sahneyeSigdir,
  sigdirmaDonusumu,
} from "@/lib/composition";

export { CIKTI_OLCUSU, SAHNE_OLCUSU, SIGDIRMA_PAYI, sigdirmaDonusumu };
export type { Donusum };

export type EditorStageProps = {
  kesimUrl: string;
  zemin: Zemin;
  /** Sahnenin ekrandaki GENISLIGI; yukseklik mantiksal orandan turetiliyor. */
  ekranOlcusu: number;
  sahneGenislik: number;
  sahneYukseklik: number;
  /** `null` iken sahne kesim yuklenince kendi baslangic yerlesimini hesaplar. */
  donusum: Donusum | null;
  gorunum: Gorunum;
  onDonusumDegisti: (donusum: Donusum) => void;
  /** Kesimin dogal olculeri — "sigdir" hesabi icin parent'a da lazim. */
  onKesimOlculeri: (olculer: { genislik: number; yukseklik: number }) => void;
  onStageHazir: (stage: Konva.Stage | null) => void;
};

/**
 * Bir URL'den `HTMLImageElement` yukler.
 *
 * `useImage` benzeri bir paket eklemek yerine elle yaziliyor: tek ihtiyacimiz
 * olan sey bu ve `crossOrigin` ayarini kendimiz kontrol etmemiz gerekiyor —
 * R2'den gelen imzali URL'ler farkli bir kaynaktan geliyor ve `crossOrigin`
 * ayarlanmazsa canvas "tainted" hale gelir, `toDataURL` sessizce SecurityError
 * firlatir. Bu, tam olarak disa aktarma aninda ortaya cikan bir hata olurdu.
 */
function useGorsel(url: string | null): HTMLImageElement | null {
  // Yuklenen gorsel, GELDIGI URL ile birlikte saklaniyor. Yalnizca gorseli
  // saklasaydik, URL degistigi anda (zemin degistirildiginde) yenisi yuklenene
  // kadar EKSIGININ yerine bir onceki zemin gorunurdu. URL'i yaninda tutmak,
  // "bu gorsel su anki url'e mi ait" sorusunu render sirasinda cevaplatiyor;
  // boylece efekt icinde senkron `setState` cagirmaya da gerek kalmiyor
  // (React Compiler bunu hakli olarak uyariyor: kaskad render uretir).
  const [yuklenen, setYuklenen] = useState<{
    url: string;
    gorsel: HTMLImageElement;
  } | null>(null);

  useEffect(() => {
    if (!url) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";

    let iptal = false;
    img.onload = () => {
      if (!iptal) setYuklenen({ url, gorsel: img });
    };
    // `onerror` bilincli olarak state'e dokunmuyor: zemin yuklenemezse
    // `yuklenen.url` bu url'e hic esitlenmiyor ve asagidaki karsilastirma
    // `null` donuyor — cagiran taraf gradyana dusuyor. Kirik bir gorsel
    // gostermektense zemini yok saymak daha az yaniltici.
    img.src = url;

    return () => {
      iptal = true;
    };
  }, [url]);

  return yuklenen !== null && yuklenen.url === url ? yuklenen.gorsel : null;
}

export function EditorStage({
  kesimUrl,
  zemin,
  ekranOlcusu,
  sahneGenislik,
  sahneYukseklik,
  donusum,
  gorunum,
  onDonusumDegisti,
  onKesimOlculeri,
  onStageHazir,
}: EditorStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const kesimRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const [secili, setSecili] = useState(true);

  /**
   * Cift parmakla yakinlastirma.
   *
   * Kuyumcunun asil cihazi telefon ve orada kose tutamaklarini tutturmak zor;
   * "pinch" bu yuzden gerekli. Konva'nin kendi cok-dokunma destegi yok, iki
   * parmagin ARASINDAKI MESAFE elle izleniyor: mesafe orani dogrudan olcek
   * carpani oluyor.
   *
   * Ref'te tutuluyor cunku hareket sirasinda okunuyor; state olsaydi kapanis
   * eski degeri gorurdu (Faz 2'de ayni tuzaga dusulmustu).
   */
  const dokunmaRef = useRef<{ mesafe: number; olcek: number } | null>(null);

  const kesim = useGorsel(kesimUrl);
  const zeminGorseli = useGorsel(zemin.tur === "sunucu" ? zemin.url : null);

  useEffect(() => {
    onStageHazir(stageRef.current);
    return () => onStageHazir(null);
  }, [onStageHazir]);

  // Kesim yuklendiginde dogal olculeri ve baslangic yerlesimi parent'a bildir.
  // Efektten cagrilan bir callback; senkron `setState` degil, bu yuzden
  // React Compiler'in kaskad-render uyarisini tetiklemiyor.
  useEffect(() => {
    if (!kesim) return;
    onKesimOlculeri({ genislik: kesim.width, yukseklik: kesim.height });
  }, [kesim, onKesimOlculeri]);

  // Transformer'i secili nesneye bagla. Konva'da bu elle yapilmali:
  // transformer, node listesini kendisi kesfetmiyor.
  useEffect(() => {
    const transformer = transformerRef.current;
    const kesimNode = kesimRef.current;
    if (!transformer) return;

    transformer.nodes(secili && kesimNode ? [kesimNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [secili, kesim, donusum]);

  const ekranOlcegi = ekranOlcusu / sahneGenislik;
  const ekranYuksekligi = sahneYukseklik * ekranOlcegi;

  // Sahne kucultulmus ciziliyor; cizgi ve tutamak olculeri bu olcege BOLUNUYOR
  // ki ekranda her zaman ayni kalinlikta gorunsunler. Bolunmezse tutamaklar
  // kucuk ekranlarda devasa, buyuk ekranlarda goze gorunmez olurdu.
  const ekranPikseli = useCallback(
    (piksel: number) => piksel / ekranOlcegi,
    [ekranOlcegi],
  );

  const donusumuBildir = useCallback(() => {
    const node = kesimRef.current;
    if (!node) return;
    onDonusumDegisti({
      x: node.x(),
      y: node.y(),
      olcek: node.scaleX(),
      aci: node.rotation(),
    });
  }, [onDonusumDegisti]);

  // Konva'da filtreler YALNIZCA cache'lenmis bir node uzerinde calisir: filtre
  // zinciri, node'un onbellege alinmis tuvaline uygulaniyor. Cache bir kez
  // kuruluyor (gorsel degistiginde); filtre PARAMETRELERI degistiginde Konva
  // onbellegi kendisi yeniden isliyor, tekrar cache() cagirmak gerekmiyor —
  // her kaydirac hareketinde cache almak buyuk gorsellerde gozle gorulur bir
  // takilma yaratirdi.
  useEffect(() => {
    const node = kesimRef.current;
    if (!node || !kesim) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [kesim]);

  const yerlesim = useMemo(() => {
    if (donusum) return donusum;
    if (!kesim) return null;
    return sahneyeSigdir(sahneGenislik, sahneYukseklik, kesim.width, kesim.height);
  }, [donusum, kesim, sahneGenislik, sahneYukseklik]);

  return (
    <Stage
      ref={stageRef}
      width={ekranOlcusu}
      height={ekranYuksekligi}
      scaleX={ekranOlcegi}
      scaleY={ekranOlcegi}
      onMouseDown={(olay) => {
        // Bos alana tiklamak secimi kaldirir — tutamaklarin surekli ekranda
        // durmasi, kullanicinin sonucu degerlendirmesini zorlastiriyor.
        if (olay.target === olay.target.getStage()) setSecili(false);
      }}
      onTouchStart={(olay) => {
        const dokunuslar = olay.evt.touches;
        if (dokunuslar.length === 2) {
          // Iki parmak: yakinlastirma basliyor, secim degismiyor.
          olay.evt.preventDefault();
          const [a, b] = [dokunuslar[0], dokunuslar[1]];
          dokunmaRef.current = {
            mesafe: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            olcek: yerlesim?.olcek ?? 1,
          };
          return;
        }
        if (olay.target === olay.target.getStage()) setSecili(false);
      }}
      onTouchMove={(olay) => {
        const dokunuslar = olay.evt.touches;
        const baslangic = dokunmaRef.current;
        if (dokunuslar.length !== 2 || !baslangic || !yerlesim) return;

        olay.evt.preventDefault();
        const [a, b] = [dokunuslar[0], dokunuslar[1]];
        const mesafe = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (baslangic.mesafe === 0) return;

        onDonusumDegisti({
          ...yerlesim,
          olcek: baslangic.olcek * (mesafe / baslangic.mesafe),
        });
      }}
      onTouchEnd={() => {
        dokunmaRef.current = null;
      }}
    >
      <Layer listening={false}>
        {zeminGorseli ? (
          <KonvaImage
            image={zeminGorseli}
            width={sahneGenislik}
            height={sahneYukseklik}
          />
        ) : (
          <Rect
            width={sahneGenislik}
            height={sahneYukseklik}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: sahneGenislik, y: sahneYukseklik }}
            fillLinearGradientColorStops={
              zemin.tur === "yer-tutucu"
                ? zemin.gradyan
                : [0, "#1d1d1f", 1, "#000000"]
            }
          />
        )}

        {/*
          Isik havuzu: zeminin ustune dusen yumusak radyal aydinlanma. Vitrin
          fotografciliginin en yaygin hilesi — goz once aydinlik bolgeye gidiyor,
          urun zeminden ayrisiyor. Zemin katmaninda duruyor ki urunun ONUNE
          gecmesin; urunun uzerine dusen bir vinyet urunu soluklastirirdi.
        */}
        {gorunum.isikHavuzu ? (
          <Rect
            width={sahneGenislik}
            height={sahneYukseklik}
            fillRadialGradientStartPoint={{ x: sahneGenislik / 2, y: sahneYukseklik / 2 }}
            fillRadialGradientEndPoint={{ x: sahneGenislik / 2, y: sahneYukseklik / 2 }}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndRadius={Math.max(sahneGenislik, sahneYukseklik) * 0.62}
            fillRadialGradientColorStops={[
              0,
              "rgba(255,255,255,0.30)",
              0.55,
              "rgba(255,255,255,0.06)",
              1,
              "rgba(0,0,0,0.34)",
            ]}
          />
        ) : null}
      </Layer>

      <Layer>
        {kesim && yerlesim ? (
          <KonvaImage
            ref={kesimRef}
            image={kesim}
            x={yerlesim.x}
            y={yerlesim.y}
            // `offset` gorselin merkezine kuruluyor: dondurme ve olcekleme
            // kosede degil MERKEZDE olsun. Varsayilan sol-ust cikis noktasiyla
            // dondurmek, kullaniciya nesnenin "kacmasi" gibi gorunur.
            offsetX={kesim.width / 2}
            offsetY={kesim.height / 2}
            scaleX={yerlesim.olcek}
            scaleY={yerlesim.olcek}
            rotation={yerlesim.aci}
            draggable
            // Filtreler yukaridaki `cache()` ile birlikte calisiyor.
            filters={[
              Konva.Filters.Brighten,
              Konva.Filters.Contrast,
              Konva.Filters.HSL,
            ]}
            brightness={gorunum.parlaklik}
            contrast={gorunum.kontrast}
            saturation={gorunum.doygunluk}
            // Golge urunu zemine "oturtuyor". Olcuier sahne koordinatinda
            // (1000 birim) verildigi icin urun buyudukce golge de buyuyor;
            // sabit piksel verilseydi buyuk urunlerde golge kaybolurdu.
            shadowEnabled={gorunum.golge}
            shadowColor="#000000"
            shadowBlur={38 / (yerlesim.olcek || 1)}
            shadowOpacity={0.32}
            shadowOffsetY={26 / (yerlesim.olcek || 1)}
            dragBoundFunc={(konum) => {
              // Merkeze yakalama sahne koordinatinda hesaplaniyor; Konva bu
              // fonksiyona MUTLAK (ekran) koordinat veriyor, o yuzden sahne
              // olcegiyle carpip boluyoruz.
              return {
                x: merkezeYakala(konum.x, (sahneGenislik / 2) * ekranOlcegi),
                y: merkezeYakala(konum.y, (sahneYukseklik / 2) * ekranOlcegi),
              };
            }}
            onMouseDown={() => setSecili(true)}
            onTouchStart={() => setSecili(true)}
            onDragEnd={donusumuBildir}
            onTransformEnd={donusumuBildir}
          />
        ) : null}

        <Transformer
          ref={transformerRef}
          rotateEnabled
          // Kose tutamaklari yeterli: kenar tutamaklari en-boy oranini bozar ve
          // bir urun fotografinin oranini bozmak neredeyse her zaman istenmeyen
          // bir sonuc.
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ]}
          keepRatio
          // Ince cerceve + kucuk dairesel tutamaklar. Onceki surumde varsayilan
          // kalin dikdortgen cerceve kullaniliyordu ve urunun onune geciyordu:
          // kullanici sonucu degerlendirmeye calisirken gozu once secim
          // kutusuna takiliyordu. Cerceve artik yalnizca bir ipucu.
          anchorSize={ekranPikseli(7)}
          anchorCornerRadius={ekranPikseli(3.5)}
          anchorStroke="#b08d4f"
          anchorFill="#ffffff"
          anchorStrokeWidth={ekranPikseli(1.25)}
          borderStroke="#b08d4f"
          borderStrokeWidth={ekranPikseli(1)}
          borderDash={[ekranPikseli(4), ekranPikseli(4)]}
          rotateAnchorOffset={ekranPikseli(22)}
          // 15 derecelik kademeler: kuyumcu vitrini kompozisyonlarinda aci
          // genellikle ya duz ya da belirgin bir egim. Serbest aci hala mumkun
          // (kademe yalnizca yakinina gelindiginde yakaliyor), ama duz durmasi
          // istenen bir urunu elle 0'a getirmek zor bir istekti.
          rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 180, 270]}
          rotationSnapTolerance={4}
          // Cok kucultup nesneyi kaybetmeyi engelle.
          boundBoxFunc={(eski, yeni) =>
            yeni.width < 24 || yeni.height < 24 ? eski : yeni
          }
        />
      </Layer>
    </Stage>
  );
}
