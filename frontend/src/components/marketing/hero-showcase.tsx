"use client";

/**
 * Acilis vitrini: el + taki sahneleri arasinda yayli kaydirma, secilen
 * sahneye yakinlasma (one alinan is, 28.09.2026 — ROADMAP).
 *
 * Kaydirma DOM'da: her karede React render'i yerine yayin konumu dogrudan
 * sahnelerin `transform`'una yaziliyor; React yalnizca etkin sahne
 * degistiginde render ediyor. Yakinlasma (three.js) ayri bir parcada ve
 * ilk etkilesime kadar hic inmiyor (`hero-zoom.tsx`).
 *
 * Girdiler: surukleme / parmakla kaydirma, trackpad'in YATAY hareketi,
 * oklar, klavye, alttaki kucuk resimler. Dikey tekerlek her zaman sayfaya
 * birakilir (`horizontalWheelSlides`).
 */

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

import {
  horizontalWheelSlides,
  isSettled,
  relativeOffset,
  releaseTarget,
  slideLook,
  stepSpring,
  WHEEL_SNAP_DELAY_MS,
  wrapIndex,
  type SlideLook,
  type SpringState,
} from "@/lib/hero-carousel";
import {
  closeSrc,
  cutoutSrc,
  HERO_PHOTO_HEIGHT,
  HERO_PHOTO_WIDTH,
  HERO_SCENES,
  pageHandSrc,
  sceneLayout,
  type HeroScene,
} from "@/lib/hero-scenes";
import { cn } from "@/lib/utils";

import { Glint } from "@/components/marketing/hero-glint";

import type { ZoomOrigin } from "@/components/marketing/hero-zoom";

const loadZoom = () => import("@/components/marketing/hero-zoom");
const HeroZoom = dynamic(loadZoom, { ssr: false });

/** Surukleme bu kadar yatay pikselden sonra "kaydirma" sayilir; oncesi dokunus. */
const DRAG_SLOP_PX = 8;

function prefersReducedMotion(): boolean {
  return (
    document.documentElement.classList.contains("reduce-motion") ||
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * `sceneScale` (sahnenin kendi olcegi, `sceneLayout`) AYNI transform'a
 * girer: ayri bir CSS `scale` ozelligi translate(-50%)'ten SONRA elemanin
 * kendi ortasi etrafinda calisiyor ve kuculen sahneyi saga itiyordu
 * (telefonda olculdu: kolye 115 px sagda).
 */
function lookStyle(look: SlideLook, sceneScale: number): CSSProperties {
  return {
    transform: `translate3d(calc(-50% + ${look.x * 100}%), 0, 0) scale(${look.scale * sceneScale})`,
    opacity: look.opacity,
    zIndex: look.zIndex,
  };
}

type Zoom = { scene: HeroScene; origin: ZoomOrigin; handOffset: number; webgl: boolean; reduceMotion: boolean };

type HeroShowcaseProps = {
  /** Baslik ve eylem dugmeleri (sunucu bileseni olarak cizilir). */
  children: ReactNode;
  /** Sol alttaki kisa aciklama. */
  lede: ReactNode;
};

export function HeroShowcase({ children, lede }: HeroShowcaseProps) {
  const scenes = HERO_SCENES;
  const count = scenes.length;
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  // Yakinlasma tuvali fotografi birebir devraldiginda DOM'daki sahne gizlenir.
  const [zoomReady, setZoomReady] = useState(false);
  const [glintKey, setGlintKey] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const zoomTriggerRef = useRef<HTMLElement | null>(null);

  const springRef = useRef<SpringState>({ position: 0, velocity: 0 });
  const targetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const activeRef = useRef(0);
  const neighboursRef = useRef(false);
  const wheelTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPosition: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    dragging: boolean;
  } | null>(null);
  // Bir surukleme biterken ayni dokunus "tiklama" da uretir; o tiklama
  // yakinlasma acmamali.
  const suppressClickRef = useRef(false);

  const apply = useCallback(() => {
    const { position } = springRef.current;
    slideRefs.current.forEach((node, index) => {
      if (!node) return;
      Object.assign(
        node.style,
        lookStyle(slideLook(relativeOffset(index, position, count), neighboursRef.current), sceneLayout(scenes[index]).scale),
      );
    });
    const nextActive = wrapIndex(position, count);
    if (nextActive !== activeRef.current) {
      activeRef.current = nextActive;
      setActive(nextActive);
      setGlintKey((key) => key + 1);
    }
  }, [count, scenes]);

  // Dongu kendini bir sonraki karede cagiriyor; ref uzerinden, cunku
  // useCallback kendi adina tanimlanmadan once erisemez.
  const tickRef = useRef<(time: number) => void>(() => undefined);
  const tick = useCallback(
    (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 1 / 60;
      lastTimeRef.current = time;
      if (!dragRef.current?.dragging) {
        springRef.current = stepSpring(springRef.current, targetRef.current, dt);
      }
      apply();
      if (dragRef.current?.dragging || !isSettled(springRef.current, targetRef.current)) {
        frameRef.current = requestAnimationFrame((next) => tickRef.current(next));
      } else {
        springRef.current = { position: targetRef.current, velocity: 0 };
        apply();
        frameRef.current = null;
      }
    },
    [apply],
  );
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const run = useCallback(() => {
    if (prefersReducedMotion() && !dragRef.current?.dragging) {
      springRef.current = { position: targetRef.current, velocity: 0 };
      apply();
      return;
    }
    if (frameRef.current === null) {
      lastTimeRef.current = 0;
      frameRef.current = requestAnimationFrame((next) => tickRef.current(next));
    }
  }, [apply]);

  const go = useCallback(
    (step: number) => {
      targetRef.current = Math.round(targetRef.current) + step;
      run();
    },
    [run],
  );

  const goTo = useCallback(
    (index: number) => {
      const current = Math.round(targetRef.current);
      targetRef.current = current + relativeOffset(index, current, count);
      run();
    },
    [count, run],
  );

  // Komsular yalnizca genis ekranda; telefonda tek sahne.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => {
      neighboursRef.current = media.matches;
      apply();
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [apply]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
    },
    [],
  );

  // Yatay trackpad hareketi. React'in `onWheel`'i pasif oldugu icin
  // preventDefault ancak yerel dinleyiciyle yapilabiliyor.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || count < 2) return;
    const onWheel = (event: WheelEvent) => {
      if (zoom) return;
      const slides = horizontalWheelSlides(event.deltaX, event.deltaY);
      if (slides === null) return;
      event.preventDefault();
      const position = springRef.current.position;
      targetRef.current = position + Math.max(-1, Math.min(1, targetRef.current - position + slides));
      run();
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = window.setTimeout(() => {
        targetRef.current = Math.round(targetRef.current);
        run();
      }, WHEEL_SNAP_DELAY_MS);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [count, run, zoom]);

  // Yakinlasma parcasini bosta onceden indir: tiklandiginda bekleme olmasin.
  // Modeller ve isik ortami yine yalnizca yakinlasmada iner.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2500));
    const handle = idle(() => void loadZoom(), { timeout: 5000 });
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(handle as number);
  }, []);

  const openZoom = useCallback(
    (index: number, trigger: HTMLElement | null) => {
      const root = rootRef.current;
      // Kadraj yuzuk katmanindan olculur (kaydirmayla oynamaz); el katmani
      // kaydirilmissa kaymasi ayrica verilir, tuval eli oradan devralir.
      const ring = slideRefs.current[index]?.querySelector<HTMLElement>(".hero-ring-lift");
      const hand = slideRefs.current[index]?.querySelector<HTMLElement>(".hero-hand");
      if (!root || !ring || !hand) return;
      const rootBox = root.getBoundingClientRect();
      const box = ring.getBoundingClientRect();
      const handOffset = hand.getBoundingClientRect().top - box.top;
      zoomTriggerRef.current = trigger;
      setZoomReady(false);
      setZoom({
        scene: scenes[index],
        origin: { left: box.left - rootBox.left, top: box.top - rootBox.top, width: box.width, height: box.height },
        handOffset,
        webgl: supportsWebGL(),
        reduceMotion: prefersReducedMotion(),
      });
    },
    [scenes],
  );

  const closeZoom = useCallback(() => {
    setZoom(null);
    setZoomReady(false);
    // Odak yakinlasmayi acan dugmeye doner (klavye kullanicisi yerini
    // kaybetmesin) — KAYDIRMADAN: tetikleyici fotografin kendisiyse ekrandan
    // buyuk; Safari onu gostermek icin bolumun icini kaydiriyor, baslik ust
    // cubugun altina kayiyordu (Serhan'in ekran goruntusu, 28.09.2026).
    requestAnimationFrame(() => zoomTriggerRef.current?.focus({ preventScroll: true }));
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoom || count < 2 || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: springRef.current.position,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      dragging: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragging) {
      if (Math.abs(dy) > DRAG_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null; // dikey: sayfa kaydiriliyor
        return;
      }
      if (Math.abs(dx) <= DRAG_SLOP_PX) return;
      drag.dragging = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Yakalamasiz da calisiyor.
      }
      run();
    }
    const slideWidth = slideRefs.current[activeRef.current]?.offsetWidth || 400;
    const position = drag.startPosition - dx / slideWidth;
    const dt = Math.max(1, event.timeStamp - drag.lastTime) / 1000;
    drag.velocity = (-(event.clientX - drag.lastX) / slideWidth) / dt;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    springRef.current = { position, velocity: drag.velocity };
    targetRef.current = position;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.dragging) return;
    suppressClickRef.current = true;
    window.setTimeout(() => (suppressClickRef.current = false), 0);
    targetRef.current = releaseTarget(springRef.current.position, drag.startPosition, drag.velocity);
    run();
  };

  const scene = scenes[active];

  return (
    <div
      ref={rootRef}
      className="relative mx-auto h-svh max-h-[64rem] min-h-[40rem] w-full"
      role="region"
      aria-roledescription="carousel"
      aria-label="Örnek takılar"
      onKeyDown={(event) => {
        if (zoom || count < 2) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          go(1);
        }
      }}
    >
      {/* Arka isik, etkin sahnenin FOTOGRAF ZEMINI tonuyla: uretilen
          fotograflarin zemini sayfadan sicak ve acik (sahne 1: #1c150f /
          #0c0b0a); kenar maskesi tek basina farki kapatmiyor, fotograf
          koyu bir hale icinde duruyordu. Ton betikle olculur. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(38% 62% at 50% 58%, ${scene.tone} 0%, ${scene.tone} 38%, transparent 100%)`,
        }}
      />

      {/* Sahne: fotograflar alttan yukselir, basligin arkasina uzanabilir. */}
      <div
        ref={stageRef}
        className={cn(
          "hero-stage absolute inset-0 z-10 touch-pan-y select-none",
          zoom && zoomReady && "pointer-events-none opacity-0",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {scenes.map((item, index) => {
          const isActive = index === active;
          return (
            <div
              key={item.id}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
              className="hero-slide absolute bottom-0 left-1/2 origin-bottom"
              style={{
                ...lookStyle(slideLook(relativeOffset(index, 0, count), false), sceneLayout(item).scale),
                ["--hero-adjust" as string]: `${sceneLayout(item).adjust * 100}%`,
                ["--hero-lift" as string]: item.lift ?? 1.45,
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${count}: ${item.name}`}
              aria-hidden={!isActive}
            >
              <button
                type="button"
                tabIndex={isActive ? 0 : -1}
                className="group relative block h-full w-full cursor-zoom-in focus-visible:outline-none"
                aria-label={`${item.name}: yakından inceleyin`}
                onPointerEnter={() => void loadZoom()}
                onClick={(event) => {
                  if (suppressClickRef.current) return;
                  if (!isActive) {
                    goTo(index);
                    return;
                  }
                  openZoom(index, event.currentTarget);
                }}
              >
                {/* Duragan halde hafif suzulme; yakinlasma basladiginda durur
                    ki tuval fotografi tam bulundugu yerden devralsin. */}
                <span className={cn("hero-float absolute inset-0", zoom && "hero-float-paused")}>
                  {/* Iki katman: yuzugu silinmis el ve ustunde yuzuk. Duruyorken
                      fotografin kendisi; kaydirinca yalniz el iner (globals.css
                      `.hero-hand`), yuzuk yerinde kalir. */}
                  <Image
                    src={pageHandSrc(item)}
                    alt={item.photoAlt}
                    width={HERO_PHOTO_WIDTH}
                    height={HERO_PHOTO_HEIGHT}
                    priority={index === 0}
                    draggable={false}
                    sizes="(max-width: 768px) 200vw, 72rem"
                    className="hero-photo hero-hand absolute inset-0 h-full w-full object-cover"
                  />
                  <RingLift scene={item} />
                  {isActive && !zoom ? <StoneGlints key={glintKey} scene={item} /> : null}
                </span>
                <span className="pointer-events-none absolute inset-0 rounded-[2rem] ring-[#f0c779]/0 transition group-focus-visible:ring-2 group-focus-visible:ring-[#f0c779]/70" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Alt kenarda okunurluk icin yumusak karartma. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-linear-to-t from-[#0c0b0a]/85 to-transparent"
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 px-5 pt-[calc(var(--header-offset)+2.5rem)] transition-opacity duration-500 lg:pt-[calc(var(--header-offset)+3rem)]",
          zoom && "opacity-0",
        )}
        aria-hidden={zoom ? true : undefined}
      >
        <div className="pointer-events-auto mx-auto w-fit">{children}</div>
      </div>

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-6xl items-end justify-between gap-6 px-5 pb-6 transition-opacity duration-500 lg:pb-9",
          zoom && "pointer-events-none opacity-0",
        )}
      >
        <div className="on-dark-muted hidden max-w-xs md:block">{lede}</div>

        <div className="mx-auto flex flex-col items-center gap-3 md:mx-0 md:items-end">
          <p className="fine-print text-[#f3f0eb]" aria-live="polite">
            {scene.name}
          </p>
          <div className="flex items-center gap-2">
            {count > 1 ? (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Önceki takı"
                className="press hidden size-10 md:flex items-center justify-center rounded-full bg-white/[0.06] text-[#f3f0eb] ring-1 ring-white/12 transition-colors hover:bg-white/12"
              >
                <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
            {count > 1
              ? scenes.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={item.name}
                    aria-current={index === active ? "true" : undefined}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full ring-1 transition-[background-color,box-shadow]",
                      index === active ? "bg-white/12 ring-[#f0c779]/70" : "bg-white/[0.04] ring-white/10 hover:bg-white/10",
                    )}
                  >
                    <Image
                      src={closeSrc(item).after}
                      alt=""
                      width={item.close.width}
                      height={item.close.height}
                      sizes="28px"
                      className="h-7 w-auto object-contain"
                    />
                  </button>
                ))
              : null}
            {count > 1 ? (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Sonraki takı"
                className="press hidden size-10 md:flex items-center justify-center rounded-full bg-white/[0.06] text-[#f3f0eb] ring-1 ring-white/12 transition-colors hover:bg-white/12"
              >
                <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onPointerEnter={() => void loadZoom()}
              onClick={(event) => openZoom(active, event.currentTarget)}
              aria-label="Yakından inceleyin"
              className="press ml-1 flex h-10 items-center gap-2 rounded-full bg-white/[0.06] px-3 text-[0.875rem] font-medium text-[#f3f0eb] ring-1 ring-white/12 transition-colors hover:bg-white/12 sm:px-4"
            >
              <ZoomIn className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="hidden sm:inline">Yakından inceleyin</span>
            </button>
          </div>
        </div>
      </div>

      {zoom ? (
        <HeroZoom
          key={zoom.scene.id}
          scene={zoom.scene}
          origin={zoom.origin}
          handOffset={zoom.handOffset}
          webgl={zoom.webgl}
          reduceMotion={zoom.reduceMotion}
          onReady={() => setZoomReady(true)}
          onClosed={closeZoom}
        />
      ) : null}
    </div>
  );
}

/**
 * Yuzugu elden one cikarir: aracin kesimi ayni kadrajda fotografin ustune
 * biraz daha parlak cizilir (Serhan: "yuzuk cok karanlik, el on planda gibi").
 * Kesim yuzugu birebir izledigi icin kenar yok; yalnizca yuzuk parlar.
 */
function RingLift({ scene }: { scene: HeroScene }) {
  return (
    <Image
      src={cutoutSrc(scene)}
      alt=""
      aria-hidden
      width={HERO_PHOTO_WIDTH}
      height={HERO_PHOTO_HEIGHT}
      draggable={false}
      sizes="(max-width: 768px) 200vw, 72rem"
      className="hero-ring-lift pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}

/**
 * Tasta aralikli parilti (~5 sn'de bir). Isik bandi denendi ve birakildi
 * (Serhan: "hizli ve yapay"); tasin kendi parlamasi yeterli.
 * "Hareketi azalt" acikken CSS gizler.
 */
function StoneGlints({ scene }: { scene: HeroScene }) {
  const { x, y, w, h } = scene.product;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {scene.glints.map((point, index) => (
        <Glint
          key={index}
          left={x + w * point.x}
          top={y + h * point.y}
          size={point.size}
          delay={300 + index * 1400}
          idle
        />
      ))}
    </span>
  );
}
