"use client";

/**
 * Konva sahnesi: zemin + kesim, surukle/olcekle/dondur.
 *
 * TASARIM KARARI 1 — sahne her zaman KARE ve mantiksal olcusu sabit.
 *
 * Sahne ekranda kapsayicisina sigacak kadar kucuk cizilir, ama icindeki tum
 * koordinatlar `STAGE_SIZE` (1000) uzerinden tutulur ve Konva'nin kendi
 * `scale`'i ile kucultulur. Bunun iki faydasi var:
 *
 *  - Kullanicinin yaptigi yerlesim ekran boyutundan BAGIMSIZ. Telefonda
 *    konumlandirilan bir urun, masaustunde ayni yerde duruyor; pencere yeniden
 *    boyutlandiginda kompozisyon kaymiyor.
 *  - Disa aktarma orani tam sayi tutuyor (bkz. composition-editor.tsx).
 *
 * TASARIM KARARI 2 — donusum (konum/olcek/aci) PARENT'ta tutuluyor.
 *
 * Sahne kendi ic durumunu saklamiyor; `transform` prop'unu ciziyor ve kullanici
 * surukleyip olcekledikce `onTransformChange` ile haber veriyor. Boylece yandaki
 * kontroller (boyut kaydiraci, ortala/sigdir, aci) ile tuvalin kendisi AYNI
 * veriyi paylasiyor — iki ayri dogruluk kaynagi olusmuyor. Konva ornegini disari
 * acip imperative cagrilar yapmak da mumkundu ama o zaman kaydiracin gosterdigi
 * deger ile tuvaldeki gercek olcek sessizce ayrisabilirdi.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import Konva from "konva";

import type { Background } from "@/lib/backgrounds";
// Saf geometri `@/lib/composition` icinde: Konva/React'ten bagimsiz oldugu icin
// Node ortaminda canvas yuklemeden test edilebiliyor.
import {
  OUTPUT_SIZE,
  type Appearance,
  STAGE_SIZE,
  FIT_MARGIN,
  type Transform,
  fitToStage,
  fitTransform,
  snapToCenter,
} from "@/lib/composition";

export { OUTPUT_SIZE, STAGE_SIZE, FIT_MARGIN, fitTransform };
export type { Transform };

export type EditorStageProps = {
  cutoutUrl: string;
  background: Background;
  /** Sahnenin ekrandaki GENISLIGI; yukseklik mantiksal orandan turetiliyor. */
  displayWidth: number;
  stageWidth: number;
  stageHeight: number;
  /** `null` iken sahne kesim yuklenince kendi baslangic yerlesimini hesaplar. */
  transform: Transform | null;
  appearance: Appearance;
  onTransformChange: (transform: Transform) => void;
  /** Kesimin dogal olculeri — "sigdir" hesabi icin parent'a da lazim. */
  onCutoutSize: (size: { width: number; height: number }) => void;
  onStageReady: (stage: Konva.Stage | null) => void;
};

/**
 * Bir URL'den `HTMLImageElement` yukler.
 *
 * `useImage` benzeri bir paket eklemek yerine elle yaziliyor: tek ihtiyacimiz
 * olan sey bu ve `crossOrigin` ayarini kendimiz kontrol etmemiz gerekiyor —
 * R2'den gelen imzali URL'ler farkli bir kaynaktan geliyor ve `crossOrigin`
 * ayarlanmazsa canvas "tainted" hale gelir; Konva bu durumda SecurityError'i
 * kendisi yakalayip BOS bir veri URL'i dondurur (bkz. composition-editor.tsx).
 *
 * `crossOrigin` ayarliyken bucket'in CORS kurali o origin'i icermiyorsa ise
 * tarayici gorseli HIC yuklemiyor: `onerror` calisiyor ve sahne gradyana
 * dusuyor. Kucuk onizleme CSS arka plani oldugu icin (CORS gerektirmiyor)
 * yine gorunuyor — yani eksik kural gozle fark edilmiyor, cikti zeminsiz
 * iniyor. Tarayicida sahte bir CORS'suz origin'le birebir olculdu. Kuralin
 * gercek bucket'ta dogrulanmasi: `backend/scripts/check_r2_cors.py`.
 */
function useLoadedImage(url: string | null): HTMLImageElement | null {
  // Yuklenen gorsel, GELDIGI URL ile birlikte saklaniyor. Yalnizca gorseli
  // saklasaydik, URL degistigi anda (zemin degistirildiginde) yenisi yuklenene
  // kadar EKSIGININ yerine bir onceki zemin gorunurdu. URL'i yaninda tutmak,
  // "bu gorsel su anki url'e mi ait" sorusunu render sirasinda cevaplatiyor;
  // boylece efekt icinde senkron `setState` cagirmaya da gerek kalmiyor
  // (React Compiler bunu hakli olarak uyariyor: kaskad render uretir).
  const [loaded, setLoaded] = useState<{
    url: string;
    image: HTMLImageElement;
  } | null>(null);

  useEffect(() => {
    if (!url) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";

    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setLoaded({ url, image: img });
    };
    // `onerror` bilincli olarak state'e dokunmuyor: zemin yuklenemezse
    // `loaded.url` bu url'e hic esitlenmiyor ve asagidaki karsilastirma
    // `null` donuyor — cagiran taraf gradyana dusuyor. Kirik bir gorsel
    // gostermektense zemini yok saymak daha az yaniltici.
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return loaded !== null && loaded.url === url ? loaded.image : null;
}

export function EditorStage({
  cutoutUrl,
  background,
  displayWidth,
  stageWidth,
  stageHeight,
  transform,
  appearance,
  onTransformChange,
  onCutoutSize,
  onStageReady,
}: EditorStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const cutoutRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const [isSelected, setIsSelected] = useState(true);

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
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const cutout = useLoadedImage(cutoutUrl);
  const backgroundImage = useLoadedImage(
    background.type === "server" ? background.url : null,
  );

  useEffect(() => {
    onStageReady(stageRef.current);
    return () => onStageReady(null);
  }, [onStageReady]);

  // Kesim yuklendiginde dogal olculeri ve baslangic yerlesimi parent'a bildir.
  // Efektten cagrilan bir callback; senkron `setState` degil, bu yuzden
  // React Compiler'in kaskad-render uyarisini tetiklemiyor.
  useEffect(() => {
    if (!cutout) return;
    onCutoutSize({ width: cutout.width, height: cutout.height });
  }, [cutout, onCutoutSize]);

  // Transformer'i secili nesneye bagla. Konva'da bu elle yapilmali:
  // transformer, node listesini kendisi kesfetmiyor.
  useEffect(() => {
    const transformer = transformerRef.current;
    const cutoutNode = cutoutRef.current;
    if (!transformer) return;

    transformer.nodes(isSelected && cutoutNode ? [cutoutNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [isSelected, cutout, transform]);

  const displayScale = displayWidth / stageWidth;
  const displayHeight = stageHeight * displayScale;

  // Sahne kucultulmus ciziliyor; cizgi ve tutamak olculeri bu olcege BOLUNUYOR
  // ki ekranda her zaman ayni kalinlikta gorunsunler. Bolunmezse tutamaklar
  // kucuk ekranlarda devasa, buyuk ekranlarda goze gorunmez olurdu.
  const screenPixels = useCallback(
    (pixels: number) => pixels / displayScale,
    [displayScale],
  );

  const reportTransform = useCallback(() => {
    const node = cutoutRef.current;
    if (!node) return;
    onTransformChange({
      x: node.x(),
      y: node.y(),
      scale: node.scaleX(),
      rotation: node.rotation(),
    });
  }, [onTransformChange]);

  // Konva'da filtreler YALNIZCA cache'lenmis bir node uzerinde calisir: filtre
  // zinciri, node'un onbellege alinmis tuvaline uygulaniyor. Cache bir kez
  // kuruluyor (gorsel degistiginde); filtre PARAMETRELERI degistiginde Konva
  // onbellegi kendisi yeniden isliyor, tekrar cache() cagirmak gerekmiyor —
  // her kaydirac hareketinde cache almak buyuk gorsellerde gozle gorulur bir
  // takilma yaratirdi.
  useEffect(() => {
    const node = cutoutRef.current;
    if (!node || !cutout) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [cutout]);

  const placement = useMemo(() => {
    if (transform) return transform;
    if (!cutout) return null;
    return fitToStage(stageWidth, stageHeight, cutout.width, cutout.height);
  }, [transform, cutout, stageWidth, stageHeight]);

  return (
    <Stage
      ref={stageRef}
      width={displayWidth}
      height={displayHeight}
      scaleX={displayScale}
      scaleY={displayScale}
      onMouseDown={(event) => {
        // Bos alana tiklamak secimi kaldirir — tutamaklarin surekli ekranda
        // durmasi, kullanicinin sonucu degerlendirmesini zorlastiriyor.
        if (event.target === event.target.getStage()) setIsSelected(false);
      }}
      onTouchStart={(event) => {
        const touches = event.evt.touches;
        if (touches.length === 2) {
          // Iki parmak: yakinlastirma basliyor, secim degismiyor.
          event.evt.preventDefault();
          const [a, b] = [touches[0], touches[1]];
          pinchRef.current = {
            distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            scale: placement?.scale ?? 1,
          };
          return;
        }
        if (event.target === event.target.getStage()) setIsSelected(false);
      }}
      onTouchMove={(event) => {
        const touches = event.evt.touches;
        const start = pinchRef.current;
        if (touches.length !== 2 || !start || !placement) return;

        event.evt.preventDefault();
        const [a, b] = [touches[0], touches[1]];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (start.distance === 0) return;

        onTransformChange({
          ...placement,
          scale: start.scale * (distance / start.distance),
        });
      }}
      onTouchEnd={() => {
        pinchRef.current = null;
      }}
    >
      <Layer listening={false}>
        {backgroundImage ? (
          <KonvaImage image={backgroundImage} width={stageWidth} height={stageHeight} />
        ) : (
          <Rect
            width={stageWidth}
            height={stageHeight}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: stageWidth, y: stageHeight }}
            fillLinearGradientColorStops={
              background.type === "placeholder"
                ? background.gradient
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
        {appearance.spotlight ? (
          <Rect
            width={stageWidth}
            height={stageHeight}
            fillRadialGradientStartPoint={{ x: stageWidth / 2, y: stageHeight / 2 }}
            fillRadialGradientEndPoint={{ x: stageWidth / 2, y: stageHeight / 2 }}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndRadius={Math.max(stageWidth, stageHeight) * 0.62}
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
        {cutout && placement ? (
          <KonvaImage
            ref={cutoutRef}
            image={cutout}
            x={placement.x}
            y={placement.y}
            // `offset` gorselin merkezine kuruluyor: dondurme ve olcekleme
            // kosede degil MERKEZDE olsun. Varsayilan sol-ust cikis noktasiyla
            // dondurmek, kullaniciya nesnenin "kacmasi" gibi gorunur.
            offsetX={cutout.width / 2}
            offsetY={cutout.height / 2}
            scaleX={placement.scale}
            scaleY={placement.scale}
            rotation={placement.rotation}
            draggable
            // Filtreler yukaridaki `cache()` ile birlikte calisiyor.
            filters={[
              Konva.Filters.Brighten,
              Konva.Filters.Contrast,
              Konva.Filters.HSL,
            ]}
            brightness={appearance.brightness}
            contrast={appearance.contrast}
            saturation={appearance.saturation}
            // Golge urunu zemine "oturtuyor". Olcuier sahne koordinatinda
            // (1000 birim) verildigi icin urun buyudukce golge de buyuyor;
            // sabit piksel verilseydi buyuk urunlerde golge kaybolurdu.
            shadowEnabled={appearance.shadow}
            shadowColor="#000000"
            shadowBlur={38 / (placement.scale || 1)}
            shadowOpacity={0.32}
            shadowOffsetY={26 / (placement.scale || 1)}
            dragBoundFunc={(position) => {
              // Merkeze yakalama sahne koordinatinda hesaplaniyor; Konva bu
              // fonksiyona MUTLAK (ekran) koordinat veriyor, o yuzden sahne
              // olcegiyle carpip boluyoruz.
              return {
                x: snapToCenter(position.x, (stageWidth / 2) * displayScale),
                y: snapToCenter(position.y, (stageHeight / 2) * displayScale),
              };
            }}
            onMouseDown={() => setIsSelected(true)}
            onTouchStart={() => setIsSelected(true)}
            onDragEnd={reportTransform}
            onTransformEnd={reportTransform}
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
          anchorSize={screenPixels(7)}
          anchorCornerRadius={screenPixels(3.5)}
          anchorStroke="#b08d4f"
          anchorFill="#ffffff"
          anchorStrokeWidth={screenPixels(1.25)}
          borderStroke="#b08d4f"
          borderStrokeWidth={screenPixels(1)}
          borderDash={[screenPixels(4), screenPixels(4)]}
          rotateAnchorOffset={screenPixels(22)}
          // 15 derecelik kademeler: kuyumcu vitrini kompozisyonlarinda aci
          // genellikle ya duz ya da belirgin bir egim. Serbest aci hala mumkun
          // (kademe yalnizca yakinina gelindiginde yakaliyor), ama duz durmasi
          // istenen bir urunu elle 0'a getirmek zor bir istekti.
          rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 180, 270]}
          rotationSnapTolerance={4}
          // Cok kucultup nesneyi kaybetmeyi engelle.
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 24 || newBox.height < 24 ? oldBox : newBox
          }
        />
      </Layer>
    </Stage>
  );
}
