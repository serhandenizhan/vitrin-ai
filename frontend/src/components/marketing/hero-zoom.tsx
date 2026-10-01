"use client";

/**
 * Acilis vitrininin yakinlasmasi: el yuzugu birakip asagi iner ve kaybolur,
 * yuzuk havada donerek buyur ve 3D olarak sahnenin odagina gelir; kapanis
 * bunun tersi (one alinan is, 28.09.2026; zaman cizelgesi
 * `lib/hero-zoom-timeline.ts`).
 *
 * Bu parca `next/dynamic` ile ayri iner (three.js ~250 KB gz) ve acilis
 * aninda hic yuklenmez. Modeller ve isik ortami yalnizca yakinlasmada iner.
 *
 * Katmanlar (ayni tuvalde):
 *  1. El duzlemi: DOM'daki fotografin BIREBIR yerine oturur (ayni kenar
 *     maskesi) ama yuzugu SILINMIS kopyasini gosterir (`<sahne>-el.webp`,
 *     `prepare-hero-scenes.py` uretir); asagi kayarak solar.
 *  2. 3D yuzuk: ilk karede fotograftaki yuzugun yerini ve pozunu alir, bir
 *     tam tur donerek odaga tasinir.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, MeshRefractionMaterial, useEnvironment, useGLTF, useTexture } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { ChevronLeft } from "lucide-react";

import { HeroBeforeAfter } from "@/components/marketing/hero-before-after";
import {
  backdropRect,
  backdropSrc,
  backdropSwatchSrc,
  HERO_BACKDROPS,
  zoomFocus,
  type HeroBackdrop,
} from "@/lib/hero-backdrops";
import { closeSrc, cutoutSrc, handSrc, type HeroScene } from "@/lib/hero-scenes";
import { travelSpin, ZOOM_END, ZOOM_SPEED, zoomFrame } from "@/lib/hero-zoom-timeline";
import { heroAsset } from "@/lib/hero-asset";
import { heroDisplayFont } from "@/lib/hero-display-font";
import { cn } from "@/lib/utils";

/** DOM'daki fotografin, vitrin kapsayicisina gore piksel kutusu. */
export type ZoomOrigin = { left: number; top: number; width: number; height: number };

type Timeline = { seconds: number; direction: 1 | -1; playing: boolean };
type Spin = { yaw: number; pitch: number; dragging: boolean; lastX: number; lastY: number; sway?: number };

const ENV_URL = heroAsset("studio.hdr");

type HeroZoomProps = {
  scene: HeroScene;
  origin: ZoomOrigin;
  /** El katmaninin kadraja gore dikey kaymasi (px; kaydirmaya bagli inis). */
  handOffset: number;
  webgl: boolean;
  reduceMotion: boolean;
  /** Tuval fotografi devraldi; DOM'daki sahne gizlenebilir. */
  onReady: () => void;
  /** Kapanis bitti; bilesen kaldirilabilir. */
  onClosed: () => void;
};

export default function HeroZoom({ scene, origin, handOffset, webgl, reduceMotion, onReady, onClosed }: HeroZoomProps) {
  const timeline = useRef<Timeline>({ seconds: reduceMotion ? ZOOM_END : 0, direction: 1, playing: false });
  const spin = useRef<Spin>({ yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 });
  const [panelOpen, setPanelOpen] = useState(reduceMotion || !webgl);
  const [closing, setClosing] = useState(false);
  // Bu parca yalniz istemcide calisir (ssr:false), pencere olcusu hazir.
  const [compact] = useState(() => window.innerWidth < 768);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const closedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [backdrop, setBackdrop] = useState<HeroBackdrop | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClosed();
  }, [onClosed]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setPanelOpen(false);
    // Zemin once soner: el, karanlik sahneye geri gelsin.
    setBackdrop(null);
    if (reduceMotion || !webgl) {
      finish();
      return;
    }
    timeline.current.direction = -1;
    timeline.current.playing = true;
  }, [closing, finish, reduceMotion, webgl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // WebGL yoksa tuval hic kurulmaz; kesim gorseli sahnenin odaginda durur.
  useEffect(() => {
    if (!webgl) onReady();
  }, [webgl, onReady]);

  useEffect(() => {
    if (panelOpen) closeRef.current?.focus({ preventScroll: true });
  }, [panelOpen]);

  const handleReady = useCallback(() => {
    onReady();
    timeline.current.playing = true;
  }, [onReady]);

  const onFrameState = useCallback(
    (frame: { panel: boolean }) => {
      if (!closing) setPanelOpen((open) => open || frame.panel);
    },
    [closing],
  );

  const close = closeSrc(scene);

  const focus = size ? zoomFocus(size.width, size.height) : null;

  return (
    <div ref={rootRef} className="absolute inset-0 z-30">
      {/* Secilen zemin tuvalin ARKASINDA; oturma noktasi yuzugun alt ucunda. */}
      {focus && size
        ? HERO_BACKDROPS.map((item) => {
            const rect = backdropRect(item, focus, size.width, size.height);
            const active = backdrop?.id === item.id;
            return (
              // eslint-disable-next-line @next/next/no-img-element -- olculeri hesapla veriliyor; next/image kutusu gereksiz
              <img
                key={item.id}
                // Panel acilinca hepsi arkada iner (~160 KB): secince hazir olsun.
                src={panelOpen || active ? backdropSrc(item) : undefined}
                alt=""
                aria-hidden
                className={cn(
                  "pointer-events-none absolute max-w-none transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  active ? "opacity-100" : "opacity-0",
                )}
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
              />
            );
          })
        : null}
      {focus && backdrop ? (
        // Temas golgesi: yuzuk zemine oturuyormus gibi dursun.
        <span
          aria-hidden
          className="soft-fade pointer-events-none absolute rounded-[50%]"
          style={{
            left: focus.x - focus.height * 0.36,
            top: focus.y + focus.height * 0.47,
            width: focus.height * 0.72,
            height: focus.height * 0.07,
            background: "radial-gradient(closest-side, rgba(0,0,0,0.55), transparent)",
            filter: "blur(4px)",
          }}
        />
      ) : null}
      {webgl ? (
        <div
          className={cn("absolute inset-0 cursor-grab touch-none active:cursor-grabbing", reduceMotion && "soft-fade")}
          onPointerDown={(event) => {
            spin.current = { ...spin.current, dragging: true, lastX: event.clientX, lastY: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const s = spin.current;
            if (!s.dragging) return;
            s.yaw += (event.clientX - s.lastX) * 0.01;
            s.pitch = Math.max(-0.6, Math.min(0.6, s.pitch + (event.clientY - s.lastY) * 0.006));
            s.lastX = event.clientX;
            s.lastY = event.clientY;
          }}
          onPointerUp={() => (spin.current.dragging = false)}
          onPointerCancel={() => (spin.current.dragging = false)}
        >
          <Canvas
            // Telefonda (dar ekran) daha dusuk piksel yogunlugu ve daha az ic
            // yansima: kirilma shader'i piksel basina calisir, zayif GPU'da
            // kare dusurmesin. Masaustu kalitesi degismez.
            dpr={compact ? [1, 1.5] : [1, 1.75]}
            camera={{ fov: 20, position: [0, 0, 20], near: 0.1, far: 100 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            aria-hidden
          >
            <Suspense fallback={null}>
              <ZoomScene
                scene={scene}
                origin={origin}
                handShift={handOffset / origin.height}
                timelineRef={timeline}
                spinRef={spin}
                reduceMotion={reduceMotion}
                compact={compact}
                onReady={handleReady}
                onFrameState={onFrameState}
                onClosed={finish}
              />
            </Suspense>
          </Canvas>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- statik yedek; optimizasyon gereksiz
        <img
          src={cutoutSrc(scene)}
          alt={scene.cutoutAlt}
          className="soft-fade absolute top-[8%] left-1/2 h-[46%] -translate-x-1/2 object-contain md:top-[18%] md:left-[34%] md:h-[64%]"
        />
      )}

      {/* Sol ust: vitrine donus. */}
      <button
        ref={closeRef}
        type="button"
        onClick={requestClose}
        className={cn(
          "liquid-glass press absolute top-[calc(var(--header-offset)+1.25rem)] left-[max(1rem,calc((100%-72rem)/2+1.25rem))] flex h-10 items-center gap-1 rounded-full pr-4 pl-3 text-[0.875rem] transition-opacity duration-500",
          panelOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
        Vitrine dön
      </button>

      {/* Urun adi yuzugun ALTINDA, genis ve buyuk harfle (Serhan, 29.09.2026;
          referans blazing-energy basliklari). Acik zeminde koyu yazilir. */}
      {focus ? (
        <div
          className={cn(
            "pointer-events-none absolute -translate-x-1/2 text-center transition-[opacity,color] duration-500",
            panelOpen ? "opacity-100" : "opacity-0",
            backdrop?.light ? "text-[#1a1917]" : "text-[#f3f0eb]",
          )}
          style={{
            left: focus.x,
            top: focus.y + focus.height / 2 + focus.height * 0.07,
            // Desenli zeminde (kadifenin parlak yerleri) okunsun diye yumusak golge.
            textShadow: backdrop?.light
              ? "0 1px 14px rgb(255 255 255 / 0.55)"
              : "0 1px 14px rgb(0 0 0 / 0.55)",
          }}
        >
          <h2
            className={cn(heroDisplayFont.className, "text-[clamp(1.75rem,3.4vw,3.25rem)] leading-none font-extrabold whitespace-nowrap uppercase")}
            style={{ fontVariationSettings: '"wdth" 125', letterSpacing: "-0.01em" }}
          >
            {scene.name}
          </h2>
          <ul className="fine-print mt-3 flex items-center justify-center gap-2 text-[0.75rem] whitespace-nowrap md:gap-3 md:text-[0.875rem]">
            {scene.facts.map((fact, index) => (
              <li key={fact} className="flex items-center gap-2 md:gap-3">
                {index > 0 ? <span aria-hidden className="h-3 w-px bg-current opacity-35" /> : null}
                <span className="opacity-80">{fact}</span>
              </li>
            ))}
          </ul>
          {webgl ? <p className="fine-print mt-2 hidden opacity-55 md:block">Sürükleyerek çevirin</p> : null}
        </div>
      ) : null}

      {/* Sag panel: yalniz zemin, kesim/ozgun ve eylem. */}
      <aside
        aria-label={`${scene.name}: zemin ve kesim`}
        className={cn(
          "liquid-glass hero-panel-glass absolute inset-x-4 bottom-4 max-h-[49%] overflow-y-auto rounded-3xl p-5 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:inset-x-auto md:top-[calc(var(--header-offset)+1.25rem)] md:right-[max(1.25rem,calc((100%-72rem)/2+1.25rem))] md:bottom-auto md:max-h-[calc(100%-var(--header-offset)-2.5rem)] md:w-[21rem] md:p-6",
          panelOpen ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <fieldset>
          <legend className="fine-print text-[#f3f0eb]/75">
            {backdrop ? `Zemin: ${backdrop.name}` : "Stüdyodaki bir zemine koyun"}
          </legend>
          <div className="mt-3 grid grid-cols-6 gap-1.5 md:grid-cols-3 md:gap-2">
            <button
              type="button"
              onClick={() => setBackdrop(null)}
              aria-pressed={!backdrop}
              aria-label="Zeminsiz"
              title="Zeminsiz"
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl bg-[#0c0b0a] ring-1 transition-[box-shadow] md:rounded-2xl",
                !backdrop ? "ring-2 ring-[#f0c779]" : "ring-white/15 hover:ring-white/40",
              )}
            >
              <span aria-hidden className="h-px w-1/2 rotate-45 bg-white/40" />
            </button>
            {HERO_BACKDROPS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setBackdrop(item)}
                aria-pressed={backdrop?.id === item.id}
                aria-label={item.name}
                title={item.name}
                className={cn(
                  "aspect-square overflow-hidden rounded-xl ring-1 transition-[box-shadow] md:rounded-2xl",
                  backdrop?.id === item.id ? "ring-2 ring-[#f0c779]" : "ring-white/15 hover:ring-white/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 2-3 KB'lik kucuk resim */}
                <img src={backdropSwatchSrc(item)} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </fieldset>

        {/* Genislik gorselin oranina gore: dikey bir yakin plan (kolye)
            paneli ekrandan uzun yapiyordu (olculdu). */}
        <div
          className="mx-auto mt-4 w-[var(--ba-sm)] md:mt-5 md:w-[var(--ba-lg)]"
          style={{
            ["--ba-sm" as string]: `${Math.min(8, 9 * Math.max(0.75, scene.close.width / scene.close.height))}rem`,
            ["--ba-lg" as string]: `${Math.min(13, 15 * Math.max(0.75, scene.close.width / scene.close.height))}rem`,
          }}
        >
          <HeroBeforeAfter
            before={close.before}
            after={close.after}
            beforeAlt={scene.photoAlt}
            afterAlt={scene.cutoutAlt}
            width={scene.close.width}
            height={scene.close.height}
            sizes="13rem"
            minAspect={0.75}
          />
        </div>

        <a
          href="#dene"
          className="press mt-4 flex min-h-11 w-full md:mt-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f0c779,#d6a756)] px-6 text-[0.9375rem] font-semibold text-[#171614]"
        >
          Kendi fotoğrafınızı deneyin
        </a>
      </aside>
    </div>
  );
}

// --- Tuval ----------------------------------------------------------------

type ZoomSceneProps = {
  scene: HeroScene;
  origin: ZoomOrigin;
  handShift: number;
  timelineRef: MutableRefObject<Timeline>;
  spinRef: MutableRefObject<Spin>;
  reduceMotion: boolean;
  compact: boolean;
  onReady: () => void;
  onFrameState: (frame: { panel: boolean }) => void;
  onClosed: () => void;
};

function ZoomScene({
  scene,
  origin,
  handShift,
  timelineRef,
  spinRef,
  reduceMotion,
  compact,
  onReady,
  onFrameState,
  onClosed,
}: ZoomSceneProps) {
  const gl = useThree((state) => state.gl);
  const hand = useTexture(handSrc(scene), (loaded) => {
    const texture = loaded as THREE.Texture;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
  });
  const env = useEnvironment({ files: ENV_URL });
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);

  // Piksel -> dunya birimi (z=0 duzleminde).
  const unit = viewport.height / size.height;
  const toWorld = useCallback(
    (px: number, py: number) => new THREE.Vector3((px - size.width / 2) * unit, -(py - size.height / 2) * unit, 0),
    [size, unit],
  );

  const plane = useMemo(
    () => ({
      center: toWorld(origin.left + origin.width / 2, origin.top + origin.height / 2),
      width: origin.width * unit,
      height: origin.height * unit,
    }),
    [origin, toWorld, unit],
  );

  const { product } = scene;
  const productStart = useMemo(
    () => ({
      center: toWorld(
        origin.left + (product.x + product.w / 2) * origin.width,
        origin.top + (product.y + product.h / 2) * origin.height,
      ),
      height: product.h * origin.height * unit,
    }),
    [origin, product, toWorld, unit],
  );

  // Sahnenin odagi — zemin katmaniyla AYNI hesap (`zoomFocus`), yuzuk kaideye otursun.
  const productEnd = useMemo(() => {
    const focus = zoomFocus(size.width, size.height);
    return { center: toWorld(focus.x, focus.y), height: focus.height * (scene.zoomScale ?? 1) * unit };
  }, [scene.zoomScale, size, toWorld, unit]);

  const planeMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const jewel = useRef<THREE.Group | null>(null);
  const reported = useRef({ panel: false });
  const threeScene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Pirlantanin kirilma shader'i ilk GORUNDUGU karede derleniyordu ve
  // tarayici devir aninda birkac saniye donuyordu (olculdu: sonrasi 60 fps).
  // `compile` yalnizca gorunur nesneleri derledigi icin taki bir anlik
  // gorunur yapilip animasyon baslamadan ONCE derletiliyor.
  useEffect(() => {
    let cancelled = false;
    const group = jewel.current;
    if (group) group.visible = true;
    gl.compileAsync(threeScene, camera)
      .catch(() => undefined)
      .finally(() => {
        if (group) group.visible = false;
        if (!cancelled) onReadyRef.current();
      });
    return () => {
      cancelled = true;
    };
  }, [gl, threeScene, camera]);

  useFrame((state, delta) => {
    const t = timelineRef.current;
    if (t.playing) {
      if (reduceMotion) {
        t.seconds = t.direction === 1 ? ZOOM_END : 0;
      } else {
        t.seconds += Math.min(delta, 1 / 10) * ZOOM_SPEED * t.direction;
      }
      if (t.seconds >= ZOOM_END) {
        t.seconds = ZOOM_END;
      } else if (t.seconds <= 0 && t.direction === -1) {
        t.seconds = 0;
        t.playing = false;
        onClosed();
      }
    }
    const frame = zoomFrame(t.seconds);

    if (planeMaterial.current) planeMaterial.current.uniforms.uDrop.value = frame.drop;

    // Isik ortami taki tasinirken doner: yansimalar metalin uzerinde
    // gercekten kayar (sahte bir bant degil, ayni stüdyonun isigi).
    state.scene.environmentRotation.y = frame.travel * 1.3;

    const group = jewel.current;
    if (group) {
      // Hazir olduktan sonra hep gorunur: el katmaninda yuzuk zaten silinmis,
      // ilk karede yuzugun yerini 3D model tutar.
      group.visible = true;
      const from = productStart;
      const to = productEnd;
      group.position.lerpVectors(from.center, to.center, frame.travel);
      const height = THREE.MathUtils.lerp(from.height, to.height, frame.travel);
      group.scale.setScalar(height / (group.userData.modelHeight as number));
      const s = spinRef.current;
      const settled = !s.dragging && t.seconds >= ZOOM_END && !reduceMotion;
      if (settled && scene.idle === "sway") {
        // Suruklenmediyse onden sagi-sola salinim; suruklemeden sonra oraya doner.
        s.sway = (s.sway ?? 0) + delta;
        s.yaw += (Math.sin(s.sway * 0.6) * 0.45 - s.yaw) * Math.min(1, delta * 2);
      } else if (settled) {
        s.yaw += delta * 0.35;
      }
      // Yolda bir tam tur; kullanicinin cevirdigi aci da yolculukla olceklenir
      // ki kapanista yuzuk fotograftaki pozuna (0) donsun.
      const pose = scene.pose ?? { yaw: 0, pitch: 0 };
      group.rotation.set(
        pose.pitch + s.pitch * frame.travel,
        pose.yaw + travelSpin(frame.travel) + s.yaw * frame.travel,
        0,
      );
    }

    const panel = frame.panel && t.direction === 1;
    if (panel !== reported.current.panel) {
      reported.current = { panel };
      onFrameState({ panel });
    }
  });

  return (
    <>
      <Environment map={env} />
      <Jewel url={scene.model} envMap={env} groupRef={jewel} compact={compact} />
      <HandPlane hand={hand} plane={plane} shift={handShift} materialRef={planeMaterial} />
    </>
  );
}

// --- El duzlemi ---------------------------------------------------------------

/** Kamera z=20'de (bkz. Canvas); el z=-4'te, ekranda ayni boyut icin (20+4)/20 buyutulur. */
const CAMERA_Z = 20;
const HAND_Z = -4;
const HAND_SCALE = (CAMERA_Z - HAND_Z) / CAMERA_Z;

const PLANE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLANE_FRAGMENT = /* glsl */ `
  uniform sampler2D uHand;
  uniform float uDrop;
  uniform float uShift;
  varying vec2 vUv;

  // globals.css .hero-photo ile AYNI kenar maskesi (sabit cerceve; el
  // asagi indikce bu maskenin alt kenarindan cikip kaybolur):
  // radial-gradient(50% 84% at 50% 100%, #000 55%, transparent 100%)
  float edgeMask(vec2 uv) {
    float d = length(vec2((uv.x - 0.5) / 0.50, uv.y / 0.84));
    return clamp((1.0 - d) / 0.45, 0.0, 1.0);
  }

  void main() {
    // Icerik asagi kayar: ayni ekran noktasi fotografin daha yukarisini okur.
    // uShift: kaydirmayla zaten inmis elin baslangic kaymasi (kadrajin kesri).
    vec2 uv = vUv + vec2(0.0, uDrop * 0.55 + uShift);
    vec4 hand = texture2D(uHand, uv);
    float inside = step(uv.y, 1.0);
    // Katmanin ust kenari yumusak: fotografin zemini sayfa zemininden biraz
    // farkli; inen katmanin ust siniri cizgi gibi gorunmesin.
    float topSoft = 1.0 - smoothstep(0.72, 1.0, uv.y) * step(0.001, uDrop);
    float fade = 1.0 - smoothstep(0.3, 1.0, uDrop);
    gl_FragColor = vec4(hand.rgb, inside * topSoft * fade * edgeMask(vUv));
    #include <colorspace_fragment>
  }
`;

function HandPlane({
  hand,
  plane,
  shift,
  materialRef,
}: {
  hand: THREE.Texture;
  shift: number;
  plane: { center: THREE.Vector3; width: number; height: number };
  materialRef: MutableRefObject<THREE.ShaderMaterial | null>;
}) {
  const uniforms = useMemo(
    () => ({ uHand: { value: hand }, uDrop: { value: 0 }, uShift: { value: shift } }),
    [hand, shift],
  );
  return (
    // El, takinin ARKASINDA durur: yuzuk parmak uclarinin onunden gecer (orijinal
    // fotografta da oyle). Duzlem kameradan uzaklastirilir ve ayni ekran boyutunu
    // korumak icin buyutulur; takinin opak katmani derinlik yazar, el onun
    // gerisinde kalir. (Eskiden el takinin ONUNDE cizilirdi ve takinin bolgesi
    // zeminle doldurulurdu.)
    <mesh position={[plane.center.x * HAND_SCALE, plane.center.y * HAND_SCALE, HAND_Z]} renderOrder={2}>
      <planeGeometry args={[plane.width * HAND_SCALE, plane.height * HAND_SCALE]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={PLANE_VERTEX}
        fragmentShader={PLANE_FRAGMENT}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// --- Pirlanta isiltisi ------------------------------------------------------

/**
 * Tacin fasetlerinde, faset isigi TAM kameraya yansittigi anda parlayan
 * kucuk yildizlar. Yuzuk dondukce fasetler sirayla yanip soner — gercek
 * pirlantanin "isilti"si. Tum sahneye bloom uygulanmadi: tuval saydam
 * (arkasinda zemin katmani var) ve bloom saydamligi bozuyordu.
 */
// Isiklar tepede bir cember uzerinde (mucevher cekimindeki halka isik).
// Iki deneme olculdu: isiklar ondeyken isilti hic olusmuyordu (tacin yukari
// egik fasetinden yansiyan bakis cizgisi yukari ve geriye gider); ustte uc
// isikla yalnizca arada bir, cok zayif olusuyordu. Dik duran yuzugun taci
// kameraya az goruntugu icin isiklar cevreye yayildi.
const GLINT_LIGHT_COUNT = 8;
const GLINT_LIGHTS = Array.from({ length: GLINT_LIGHT_COUNT }, (_, k) => {
  const angle = (k / GLINT_LIGHT_COUNT) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle) * 0.75, 0.7, Math.sin(angle) * 0.75).normalize();
});

const GLINT_VERTEX = /* glsl */ `
  attribute vec3 aNormal;
  attribute float aHue;
  uniform vec3 uLights[${GLINT_LIGHT_COUNT}];
  uniform float uWorldSize;
  uniform float uViewport;
  varying float vIntensity;
  varying float vHue;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 normal = normalize(mat3(modelMatrix) * aNormal);
    vec3 view = normalize(cameraPosition - world.xyz);
    vec3 mirror = reflect(-view, normal);
    float glint = 0.0;
    for (int i = 0; i < ${GLINT_LIGHT_COUNT}; i++) glint = max(glint, pow(max(dot(mirror, uLights[i]), 0.0), 40.0));
    vIntensity = glint;
    vHue = aHue;
    vec4 clip = projectionMatrix * viewMatrix * world;
    // Boy dunya biriminde (tasin boyuna bagli), ekrana perspektifle cevrilir:
    // kucuk yan taslarda kucuk, yakinlasinca buyur.
    float modelScale = length(modelMatrix[0].xyz);
    gl_PointSize = uWorldSize * modelScale * projectionMatrix[1][1] * uViewport / clip.w * smoothstep(0.02, 0.6, glint);
    gl_Position = clip;
  }
`;

const GLINT_FRAGMENT = /* glsl */ `
  varying float vIntensity;
  varying float vHue;
  vec3 spectrum(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float rays = max(1.0 - abs(p.x) * 10.0, 0.0) * max(1.0 - abs(p.y), 0.0)
               + max(1.0 - abs(p.y) * 10.0, 0.0) * max(1.0 - abs(p.x), 0.0);
    float core = exp(-dot(p, p) * 14.0);
    // Cogu beyaz, bir kismi hafif renkli: kirilmanin ayristirdigi isik.
    vec3 color = mix(vec3(1.0), spectrum(vHue), 0.35 * step(0.5, fract(vHue * 7.0)));
    gl_FragColor = vec4(color, clamp(rays * 0.9 + core, 0.0, 1.0) * vIntensity);
    #include <colorspace_fragment>
  }
`;

function DiamondGlints({ geometry, matrix }: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }) {
  const dpr = useThree((state) => state.viewport.dpr);
  const points = useMemo(() => {
    // Tacin (ust yuz) faset merkezleri ve normalleri.
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = source.getAttribute("position");
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const centers: number[] = [];
    const normals: number[] = [];
    const hues: number[] = [];
    const normal = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      normal.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
      if (normal.y < 0.25) continue;
      // Faset merkezinin biraz ONUNDE: derinlik testi acik (kapak ya da tirnak
      // arkasindaki parilti gorunmesin) ama tasin kendi yuzeyi onu ortmesin.
      const lift = 0.12;
      centers.push(
        (a.x + b.x + c.x) / 3 + normal.x * lift,
        (a.y + b.y + c.y) / 3 + normal.y * lift,
        (a.z + b.z + c.z) / 3 + normal.z * lift,
      );
      normals.push(normal.x, normal.y, normal.z);
      hues.push((centers.length / 3) * 0.618 % 1);
    }
    if (source !== geometry) source.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(centers, 3));
    g.setAttribute("aNormal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("aHue", new THREE.Float32BufferAttribute(hues, 1));
    return g;
  }, [geometry]);

  useEffect(() => () => points.dispose(), [points]);

  const viewportHeight = useThree((state) => state.size.height);
  const worldSize = useMemo(() => {
    geometry.computeBoundingSphere();
    return (geometry.boundingSphere?.radius ?? 3) * 1.1;
  }, [geometry]);
  const uniforms = useMemo(
    () => ({
      uLights: { value: GLINT_LIGHTS },
      uWorldSize: { value: worldSize },
      uViewport: { value: (viewportHeight * dpr) / 2 },
    }),
    [dpr, viewportHeight, worldSize],
  );

  return (
    <points geometry={points} matrix={matrix} matrixAutoUpdate={false} renderOrder={4} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={GLINT_VERTEX}
        fragmentShader={GLINT_FRAGMENT}
        transparent
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// --- 3D taki ---------------------------------------------------------------

function Jewel({
  url,
  envMap,
  groupRef,
  compact,
}: {
  url: string;
  envMap: THREE.Texture;
  groupRef: MutableRefObject<THREE.Group | null>;
  compact: boolean;
}) {
  // Meshopt acik, Draco kapali: cozucu three.js paketinde, dis istek yok.
  const gltf = useGLTF(url, false, true);
  const { meshes, center, height } = useMemo(() => {
    const found: THREE.Mesh[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) found.push(node as THREE.Mesh);
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    return { meshes: found, center: box.getCenter(new THREE.Vector3()), height: box.getSize(new THREE.Vector3()).y };
  }, [gltf]);

  return (
    <group
      ref={(node) => {
        groupRef.current = node;
        if (node) node.userData.modelHeight = height;
      }}
      visible={false}
    >
      <group position={center.clone().negate()}>
        {meshes.map((mesh) =>
          mesh.name.startsWith("diamond") ? (
            <group key={mesh.uuid}>
              <mesh geometry={mesh.geometry} matrix={mesh.matrixWorld} matrixAutoUpdate={false}>
                {/* Ates (renk dagilimi): her renk kanali AYRI izlenir
                    (`fastChroma` kapali) ve kirilma farki buyutuldu; ic
                    yansima sayisi da arttirildi. Tas ekranda kucuk, uc
                    katli maliyet olculdu (bkz. frontend/README). */}
                <MeshRefractionMaterial
                  envMap={envMap}
                  bounces={compact ? 3 : 5}
                  ior={2.42}
                  fresnel={1}
                  aberrationStrength={0.035}
                  toneMapped={false}
                />
              </mesh>
              <DiamondGlints geometry={mesh.geometry} matrix={mesh.matrixWorld} />
            </group>
          ) : (
            <mesh
              key={mesh.uuid}
              geometry={mesh.geometry}
              material={mesh.material}
              matrix={mesh.matrixWorld}
              matrixAutoUpdate={false}
            />
          ),
        )}
      </group>
    </group>
  );
}
