"use client";

/**
 * Konva sahnesi: zemin + kesim, surukle/olcekle/dondur.
 *
 * TASARIM KARARI — sahne her zaman KARE ve mantiksal olcusu sabit.
 *
 * Sahne ekranda kapsayicisina sigacak kadar kucuk cizilir, ama icindeki tum
 * koordinatlar `SAHNE_OLCUSU` (1000) uzerinden tutulur ve Konva'nin kendi
 * `scale`'i ile kucultulur. Bunun iki faydasi var:
 *
 *  - Kullanicinin yaptigi yerlesim ekran boyutundan BAGIMSIZ. Telefonda
 *    konumlandirilan bir urun, masaustunde ayni yerde duruyor; pencere yeniden
 *    boyutlandiginda kompozisyon kaymiyor.
 *  - Disa aktarma tek satir: `pixelRatio = 2000 / SAHNE_OLCUSU`. Ayri bir
 *    offscreen sahne kurup her nesneyi yeniden olceklemeye gerek yok — bu,
 *    "ekranda gordugun ile disa aktarilan ayni degil" sinifindaki hatalarin
 *    en yaygin kaynagi.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";

import type { Zemin } from "@/lib/backgrounds";

/** Sahnenin mantiksal olcusu. Disa aktarma bunun katlari olarak yapiliyor. */
export const SAHNE_OLCUSU = 1000;

/** Yol haritasindaki cikti olcusu (ROADMAP.md Faz 3). */
export const CIKTI_OLCUSU = 2000;

export type EditorStageProps = {
  kesimUrl: string;
  zemin: Zemin;
  ekranOlcusu: number;
  /** Sahne referansini disari verir — disa aktarma butonu bunu kullaniyor. */
  onStageHazir: (stage: Konva.Stage | null) => void;
  /** Kullanici sahneye dokundugunda (secim degistiginde) haber verir. */
  onSecimDegisti?: (secili: boolean) => void;
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
  onStageHazir,
  onSecimDegisti,
}: EditorStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const kesimRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const [secili, setSecili] = useState(true);

  const kesim = useGorsel(kesimUrl);
  const zeminGorseli = useGorsel(zemin.tur === "sunucu" ? zemin.url : null);

  useEffect(() => {
    onStageHazir(stageRef.current);
    return () => onStageHazir(null);
  }, [onStageHazir]);

  // Transformer'i secili nesneye bagla. Konva'da bu elle yapilmali:
  // transformer, node listesini kendisi kesfetmiyor.
  useEffect(() => {
    const transformer = transformerRef.current;
    const kesimNode = kesimRef.current;
    if (!transformer) return;

    transformer.nodes(secili && kesimNode ? [kesimNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [secili, kesim]);

  useEffect(() => {
    onSecimDegisti?.(secili);
  }, [secili, onSecimDegisti]);

  /**
   * Kesimin baslangic yerlesimi: sahnenin ortasinda, kenarlarda pay birakacak
   * sekilde olceklenmis.
   *
   * `Math.min` ile olcekleniyor ki hem cok genis hem cok uzun gorseller
   * sahneye TAMAMEN sigsin — `Math.max` kullanilsaydi gorselin bir kismi
   * disarda kalirdi ve kullanici urunun kirpildigini sanirdi.
   */
  const baslangic = useMemo(() => {
    if (!kesim) return null;
    const pay = 0.72;
    const olcek = Math.min(
      (SAHNE_OLCUSU * pay) / kesim.width,
      (SAHNE_OLCUSU * pay) / kesim.height,
    );
    return {
      x: SAHNE_OLCUSU / 2,
      y: SAHNE_OLCUSU / 2,
      olcek,
    };
  }, [kesim]);

  const ekranOlcegi = ekranOlcusu / SAHNE_OLCUSU;

  return (
    <Stage
      ref={stageRef}
      width={ekranOlcusu}
      height={ekranOlcusu}
      scaleX={ekranOlcegi}
      scaleY={ekranOlcegi}
      onMouseDown={(olay) => {
        // Bos alana tiklamak secimi kaldirir — tutamaklarin surekli ekranda
        // durmasi, kullanicinin sonucu degerlendirmesini zorlastiriyor.
        if (olay.target === olay.target.getStage()) setSecili(false);
      }}
      onTouchStart={(olay) => {
        if (olay.target === olay.target.getStage()) setSecili(false);
      }}
    >
      <Layer listening={false}>
        {zeminGorseli ? (
          <KonvaImage
            image={zeminGorseli}
            width={SAHNE_OLCUSU}
            height={SAHNE_OLCUSU}
          />
        ) : (
          <Rect
            width={SAHNE_OLCUSU}
            height={SAHNE_OLCUSU}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: SAHNE_OLCUSU, y: SAHNE_OLCUSU }}
            fillLinearGradientColorStops={
              zemin.tur === "yer-tutucu"
                ? zemin.gradyan
                : [0, "#1d1d1f", 1, "#000000"]
            }
          />
        )}
      </Layer>

      <Layer>
        {kesim && baslangic ? (
          <KonvaImage
            ref={kesimRef}
            image={kesim}
            x={baslangic.x}
            y={baslangic.y}
            // `offset` gorselin merkezine kuruluyor: dondurme ve olcekleme
            // kosede degil MERKEZDE olsun. Varsayilan sol-ust cikis noktasiyla
            // dondurmek, kullaniciya nesnenin "kacmasi" gibi gorunur.
            offsetX={kesim.width / 2}
            offsetY={kesim.height / 2}
            scaleX={baslangic.olcek}
            scaleY={baslangic.olcek}
            draggable
            onMouseDown={() => setSecili(true)}
            onTouchStart={() => setSecili(true)}
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
          // Cok kucultup nesneyi kaybetmeyi engelle.
          boundBoxFunc={(eski, yeni) =>
            yeni.width < 20 || yeni.height < 20 ? eski : yeni
          }
          anchorSize={12 / ekranOlcegi}
          borderStrokeWidth={1 / ekranOlcegi}
          anchorStrokeWidth={1 / ekranOlcegi}
        />
      </Layer>
    </Stage>
  );
}
