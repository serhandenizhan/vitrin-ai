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
import {
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import Konva from "konva";

import type { Background } from "@/lib/backgrounds";
import {
  type LogoSettings,
  type ProductLabel,
  labelMetrics,
  labelText,
  logoBox,
  logoSettingsFromBox,
  placeInCorner,
  stackLabelBox,
} from "@/lib/overlays";
// Saf geometri `@/lib/composition` icinde: Konva/React'ten bagimsiz oldugu icin
// Node ortaminda canvas yuklemeden test edilebiliyor.
import {
  OUTPUT_SIZE,
  type Appearance,
  REFLECTION,
  SHADOW,
  STAGE_SIZE,
  FIT_MARGIN,
  type Transform,
  coverCrop,
  fitToStage,
  fitTransform,
  reflectionPlacement,
  snapToCenter,
} from "@/lib/composition";
import { useLoadedImage } from "@/components/composer/use-loaded-image";
import {
  BACKGROUND_FADE_CURRENT,
  BACKGROUND_FADE_GHOST,
} from "@/components/composer/background-fade";

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
  /** Kuyumcunun logosu (veri URL'i, ayni kaynak — tuvali kirletmiyor); yoksa null. */
  logoUrl: string | null;
  logo: LogoSettings;
  label: ProductLabel;
  /** Logo sahnede surukleyip kose karelerinden boyutlandirilinca. */
  onLogoChange?: (patch: Pick<LogoSettings, "size" | "position">) => void;
  onTransformChange: (transform: Transform) => void;
  /**
   * Tuvalde bir surukleme/olcekleme BASLADI mi, BITTI mi.
   *
   * Alt dock tuvalin uzerinde duruyor; urune dokunuldugu anda silikleip geri
   * cekilmesi icin bu haber gerekiyor (17.09.2026, Serhan'in karari).
   */
  onInteractionChange?: (isInteracting: boolean) => void;
  /** Kesimin dogal olculeri — "sigdir" hesabi icin parent'a da lazim. */
  onCutoutSize: (size: { width: number; height: number }) => void;
  onStageReady: (stage: Konva.Stage | null) => void;
  /**
   * Temiz gorunum (goz simgesi basili tutulurken): tutamaclar ve secim
   * cercevesi gizlenir, gorsel indirilecek haliyle gorunur. Secim korunur.
   */
  cleanView?: boolean;
};

export function EditorStage({
  cutoutUrl,
  background,
  displayWidth,
  stageWidth,
  stageHeight,
  transform,
  appearance,
  logoUrl,
  logo,
  label,
  onLogoChange,
  onTransformChange,
  onInteractionChange,
  onCutoutSize,
  onStageReady,
  cleanView = false,
}: EditorStageProps) {
  const beginInteraction = useCallback(
    () => onInteractionChange?.(true),
    [onInteractionChange],
  );
  const endInteraction = useCallback(
    () => onInteractionChange?.(false),
    [onInteractionChange],
  );
  const stageRef = useRef<Konva.Stage | null>(null);
  const cutoutRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const logoRef = useRef<Konva.Image | null>(null);
  const logoTransformerRef = useRef<Konva.Transformer | null>(null);

  // Secim urun ile logo arasinda: ikisinin tutamaklari ayni anda gorunmuyor.
  const [selection, setSelection] = useState<"cutout" | "logo" | null>("cutout");
  const isSelected = selection === "cutout";
  const setIsSelected = useCallback(
    (selected: boolean) => setSelection(selected ? "cutout" : null),
    [],
  );

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
    { keepPrevious: true },
  );
  const logoImage = useLoadedImage(logoUrl);

  /**
   * Zeminler arasi CAPRAZ GECIS (Kaan, 18.09.2026: "zeminler arasi daha iyi
   * gecsin"). Yeni zemin eskisinin USTUNDE saydamliktan beliriyor; eski zemin
   * gecis suresince alta eklenen gecici bir Konva dugumu ve gecis bitince
   * siliniyor. React durumuna degil dogrudan Konva'ya yaziliyor: gecis bir
   * CIZIM ayrintisi, bilesenin durumu degil (efekt icinde setState de kaskad
   * render uretirdi).
   *
   * CIKTI GUVENLIGI: gecisin ortasinda indirme yapilirsa dosyaya iki zeminin
   * karisimi girerdi. `renderStage` disa aktarmadan once
   * `finishBackgroundFade` ile gecisi aninda bitiriyor (background-fade.ts).
   * Yuklenemeyen zemin (ders 23) `useLoadedImage`'den `null` dondugu icin
   * burada gecis hic baslamiyor; gradyana dogrudan dusuluyor.
   */
  const backgroundLayerRef = useRef<Konva.Layer | null>(null);
  const backgroundNodeRef = useRef<Konva.Image | null>(null);
  const shownBackgroundRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const previous = shownBackgroundRef.current;
    shownBackgroundRef.current = backgroundImage;
    const layer = backgroundLayerRef.current;
    const node = backgroundNodeRef.current;
    if (!previous || !backgroundImage || previous === backgroundImage || !layer || !node) return;
    const reduceMotion =
      document.documentElement.classList.contains("reduce-motion") ||
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    if (reduceMotion) return;

    const ghost = new Konva.Image({
      image: previous,
      width: stageWidth,
      height: stageHeight,
      crop: coverCrop(previous.width, previous.height, stageWidth, stageHeight),
      name: BACKGROUND_FADE_GHOST,
      listening: false,
    });
    layer.add(ghost);
    ghost.moveToBottom();
    node.opacity(0);
    const tween = new Konva.Tween({
      node,
      duration: 0.42,
      opacity: 1,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => ghost.destroy(),
    });
    tween.play();
    return () => {
      tween.destroy();
      node.opacity(1);
      ghost.destroy();
    };
  }, [backgroundImage, stageWidth, stageHeight]);

  /**
   * Etiketin yazi tipi sitenin kendisi (Inter). `next/font` aileye karma bir
   * ad veriyor; tuval CSS degiskeni okuyamadigi icin gercek ad govdenin
   * hesaplanmis stilinden aliniyor. Sahne yalnizca istemcide cizildigi icin
   * (`ssr: false`) `document` burada her zaman var.
   */
  const fontFamily = useMemo(
    () => getComputedStyle(document.body).fontFamily || "sans-serif",
    [],
  );

  /** Logo ve etiket kutulari (sahne koordinati); bkz. lib/overlays.ts. */
  const overlay = useMemo(() => {
    const logoRect = logoImage
      ? logoBox(logoImage.width, logoImage.height, logo, stageWidth, stageHeight)
      : null;

    const text = labelText(label);
    if (!text) return { logoRect, labelRect: null, text: null, metrics: null };

    const metrics = labelMetrics(stageWidth, stageHeight);
    // Metnin genisligi Konva'ya olcturuluyor: sabit bir karakter genisligi
    // tahmini "22K" ile "Kod A-102-XL" arasinda hep yanlis kalirdi.
    const measured = new Konva.Text({
      text,
      fontSize: metrics.fontSize,
      fontFamily,
      fontStyle: "600",
    });
    const width = measured.width() + metrics.paddingX * 2;
    const height = measured.height() + metrics.paddingY * 2;
    measured.destroy();

    const labelRect = stackLabelBox(
      placeInCorner(label.corner, width, height, stageWidth, stageHeight),
      label.corner,
      logoRect,
      // Serbest konumlu logo bir koseye ait degil; etiket yalnizca ayni
      // koseye yaslanmis logodan kaciyor.
      logoRect && !logo.position ? logo.corner : null,
    );
    return { logoRect, labelRect, text, metrics };
  }, [logoImage, logo, label, stageWidth, stageHeight, fontFamily]);

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

  useEffect(() => {
    const transformer = logoTransformerRef.current;
    if (!transformer) return;
    transformer.nodes(selection === "logo" && logoRef.current ? [logoRef.current] : []);
    transformer.getLayer()?.batchDraw();
  }, [selection, logoImage, overlay.logoRect]);

  /** Logo birakilinca: Konva olcegi genislige katlanip ayar olarak bildiriliyor. */
  const reportLogo = useCallback(() => {
    const node = logoRef.current;
    if (!node || !onLogoChange) return;
    const box = {
      x: node.x(),
      y: node.y(),
      width: node.width() * node.scaleX(),
      height: node.height() * node.scaleY(),
    };
    node.scale({ x: 1, y: 1 });
    onLogoChange(logoSettingsFromBox(box, stageWidth, stageHeight));
  }, [onLogoChange, stageWidth, stageHeight]);

  const displayScale = displayWidth / stageWidth;
  const displayHeight = stageHeight * displayScale;

  // Sahne kucultulmus ciziliyor; cizgi ve tutamak olculeri bu olcege BOLUNUYOR
  // ki ekranda her zaman ayni kalinlikta gorunsunler. Bolunmezse tutamaklar
  // kucuk ekranlarda devasa, buyuk ekranlarda goze gorunmez olurdu.
  const screenPixels = useCallback(
    (pixels: number) => pixels / displayScale,
    [displayScale],
  );

  /**
   * Surukleme/olcekleme SIRASINDAKI anlik yerlesim — yalnizca yansima icin.
   *
   * Parent'a her harekette haber verilmiyor (geri alma yiginina yuzlerce adim
   * dusmesin diye yalnizca birakilinca bildiriliyor); ama yansima urunu anlik
   * takip etmezse surukleme boyunca eski yerinde kalip "kopuk" gorunuyor.
   */
  const [liveTransform, setLiveTransform] = useState<Transform | null>(null);

  const readNode = useCallback((): Transform | null => {
    const node = cutoutRef.current;
    if (!node) return null;
    return { x: node.x(), y: node.y(), scale: node.scaleX(), rotation: node.rotation() };
  }, []);

  const reportTransform = useCallback(() => {
    const next = readNode();
    setLiveTransform(null);
    if (next) onTransformChange(next);
  }, [onTransformChange, readNode]);

  const trackLiveTransform = useCallback(() => {
    if (appearance.reflection) setLiveTransform(readNode());
  }, [appearance.reflection, readNode]);

  // Konva'da filtreler YALNIZCA cache'lenmis bir node uzerinde calisir: filtre
  // zinciri, node'un onbellege alinmis tuvaline uygulaniyor. Cache bir kez
  // kuruluyor (gorsel degistiginde); filtre PARAMETRELERI degistiginde Konva
  // onbellegi kendisi yeniden isliyor, tekrar cache() cagirmak gerekmiyor —
  // her kaydirac hareketinde cache almak buyuk gorsellerde gozle gorulur bir
  // takilma yaratirdi.
  const placement = useMemo(() => {
    if (transform) return transform;
    if (!cutout) return null;
    return fitToStage(stageWidth, stageHeight, cutout.width, cutout.height);
  }, [transform, cutout, stageWidth, stageHeight]);

  // Onbellege GOLGE PAYI ekleniyor: onbellek varsayilan olarak yalnizca
  // gorselin kendi sinirlarini kapsiyor; guclendirilmis golgenin bulanikligi
  // ve kaymasi o sinirin disina tasiyor. Pay urun olcegine bagli oldugu icin
  // olcek degisince onbellek yeniden aliniyor (birakildiginda, harekette degil).
  //
  // Golge ONBELLEGE ISLENIYOR: yalnizca filtre parametreleri Konva'da onbellegi
  // kendiliginden yeniliyor, `shadowEnabled` yenilemiyor. Golge acilip
  // kapatildiginda onbellek yeniden alinmazsa eski hali ekranda kaliyordu
  // (Kaan: "golge hep sabit kaliyor", 17.09.2026).
  const cacheScale = placement?.scale ?? 1;
  const shadowOn = appearance.shadow;
  // Golge boyutu/opakligi de onbellege islendigi icin degisince yeniden aliniyor.
  const { shadowSize, shadowOpacity } = appearance;
  useEffect(() => {
    const node = cutoutRef.current;
    if (!node || !cutout) return;
    node.clearCache();
    node.cache({ offset: Math.ceil(((SHADOW.blur + SHADOW.offsetY) * shadowSize) / (cacheScale || 1)) + 4 });
    node.getLayer()?.batchDraw();
  }, [cutout, cacheScale, shadowOn, shadowSize, shadowOpacity]);

  // Segmentasyon kaynak boyutunu korur; saydam kenarlar yansıma ekseni değildir.
  const visibleBounds = useMemo(() => {
    if (!cutout) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = cutout.width;
    canvas.height = cutout.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(cutout, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] < 16) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return right < left ? undefined : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }, [cutout]);

  const reflection = useMemo(() => {
    const source = liveTransform ?? placement;
    if (!appearance.reflection || !cutout || !source) return null;
    return reflectionPlacement(source, cutout.width, cutout.height, visibleBounds, appearance.reflectionGap);
  }, [appearance.reflection, appearance.reflectionGap, cutout, liveTransform, placement, visibleBounds]);

  const backgroundCrop = useMemo(
    () =>
      backgroundImage
        ? coverCrop(backgroundImage.width, backgroundImage.height, stageWidth, stageHeight)
        : null,
    [backgroundImage, stageWidth, stageHeight],
  );

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
      <Layer listening={false} ref={backgroundLayerRef}>
        {backgroundImage && backgroundCrop ? (
          // `crop`: zemin ESNETILMEDEN bicimi kapliyor (lib/composition.ts
          // `coverCrop`). Onceden dogrudan sahne olcusune zorlaniyordu.
          <KonvaImage
            ref={backgroundNodeRef}
            name={BACKGROUND_FADE_CURRENT}
            image={backgroundImage}
            width={stageWidth}
            height={stageHeight}
            crop={backgroundCrop}
          />
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

      </Layer>

      {/*
        Yansima (17.09.2026, "isik havuzu"nun yerine). AYRI KATMAN sart:
        silikleştirme `destination-in` ile yapiliyor ve bu birlesim modu
        katmanin tum tuvaline uygulaniyor — urunle ayni katmanda olsaydi urunu
        de silerdi. Konva'da olculerek dogrulandi: eksenin hemen altinda
        belirgin, gradyanin sonunda tamamen kayboluyor.
      */}
      {reflection && cutout ? (
        <Layer listening={false}>
          <KonvaImage
            image={cutout}
            x={reflection.x}
            y={reflection.y}
            offsetX={cutout.width / 2}
            offsetY={cutout.height / 2}
            scaleX={reflection.scaleX}
            scaleY={reflection.scaleY}
            rotation={reflection.rotation}
            opacity={REFLECTION.opacity}
          />
          <Rect
            x={0}
            y={reflection.axisY}
            width={stageWidth}
            height={reflection.fadeHeight}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: reflection.fadeHeight }}
            fillLinearGradientColorStops={[0, "rgba(0,0,0,1)", 1, "rgba(0,0,0,0)"]}
            globalCompositeOperation="destination-in"
          />
        </Layer>
      ) : null}

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
            shadowBlur={(SHADOW.blur * appearance.shadowSize) / (placement.scale || 1)}
            shadowOpacity={appearance.shadowOpacity}
            shadowOffsetY={(SHADOW.offsetY * appearance.shadowSize) / (placement.scale || 1)}
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
            onDragStart={beginInteraction}
            onTransformStart={beginInteraction}
            onDragMove={trackLiveTransform}
            onTransform={trackLiveTransform}
            onDragEnd={() => {
              reportTransform();
              endInteraction();
            }}
            onTransformEnd={() => {
              reportTransform();
              endInteraction();
            }}
          />
        ) : null}

        <Transformer
          ref={transformerRef}
          visible={!cleanView}
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

      {/*
        Logo urun gibi suruklenip kose karelerinden boyutlandiriliyor (Kaan,
        17.09.2026: kaydirac yerine). Donme yok, oran korunuyor. Tutamaklar
        disa aktarmada diger Transformer'larla birlikte gizleniyor.
      */}
      <Layer>
        {logoImage && overlay.logoRect ? (
          <KonvaImage
            ref={logoRef}
            image={logoImage}
            x={overlay.logoRect.x}
            y={overlay.logoRect.y}
            width={overlay.logoRect.width}
            height={overlay.logoRect.height}
            opacity={logo.opacity}
            draggable={Boolean(onLogoChange)}
            onMouseDown={() => setSelection("logo")}
            onTouchStart={() => setSelection("logo")}
            onDragStart={beginInteraction}
            onTransformStart={beginInteraction}
            onDragEnd={() => {
              reportLogo();
              endInteraction();
            }}
            onTransformEnd={() => {
              reportLogo();
              endInteraction();
            }}
          />
        ) : null}
        <Transformer
          ref={logoTransformerRef}
          visible={!cleanView}
          rotateEnabled={false}
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          keepRatio
          anchorSize={screenPixels(9)}
          anchorCornerRadius={0}
          anchorStroke="#b08d4f"
          anchorFill="#ffffff"
          anchorStrokeWidth={screenPixels(1.25)}
          borderStroke="#b08d4f"
          borderStrokeWidth={screenPixels(1)}
          borderDash={[screenPixels(4), screenPixels(4)]}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 12 || newBox.height < 12 ? oldBox : newBox
          }
        />
      </Layer>

      {/*
        Urun etiketi EN USTTE ve `listening={false}`: etiketin ustune tiklamak
        urunu secmeyi engellemesin. Sahnenin parcasi oldugu icin disa aktarmaya
        (PNG/JPEG/CMYK/WhatsApp) kendiliginden giriyor.
      */}
      <Layer listening={false}>

        {overlay.text && overlay.labelRect && overlay.metrics ? (
          <Group x={overlay.labelRect.x} y={overlay.labelRect.y}>
            <Rect
              width={overlay.labelRect.width}
              height={overlay.labelRect.height}
              cornerRadius={overlay.labelRect.height / 2}
              fill={label.theme === "dark" ? "rgba(12,11,10,0.74)" : "rgba(255,255,255,0.88)"}
              stroke={label.theme === "dark" ? "rgba(212,175,110,0.55)" : "rgba(0,0,0,0.08)"}
              strokeWidth={overlay.metrics.fontSize * 0.06}
            />
            <Text
              text={overlay.text}
              x={overlay.metrics.paddingX}
              y={overlay.metrics.paddingY}
              fontSize={overlay.metrics.fontSize}
              fontFamily={fontFamily}
              fontStyle="600"
              fill={label.theme === "dark" ? "#f3f0eb" : "#1a1917"}
            />
          </Group>
        ) : null}
      </Layer>
    </Stage>
  );
}
