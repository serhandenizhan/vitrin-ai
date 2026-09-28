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
import { cn } from "@/lib/utils";

/** DOM'daki fotografin, vitrin kapsayicisina gore piksel kutusu. */
export type ZoomOrigin = { left: number; top: number; width: number; height: number };

type Timeline = { seconds: number; direction: 1 | -1; playing: boolean };
type Spin = { yaw: number; pitch: number; dragging: boolean; lastX: number; lastY: number };

const ENV_URL = "/hero/studio.hdr";

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
            dpr={[1, 1.75]}
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

      <aside
        aria-label={`${scene.name} yakından`}
        className={cn(
          "liquid-glass absolute inset-x-4 bottom-4 max-h-[56%] overflow-y-auto rounded-3xl p-5 text-[#f3f0eb] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:inset-x-auto md:top-[calc(var(--header-offset)+1.25rem)] md:right-[max(1.25rem,calc((100%-72rem)/2+1.25rem))] md:bottom-auto md:max-h-[calc(100%-var(--header-offset)-2.5rem)] md:w-[22rem] md:p-6",
          panelOpen ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={requestClose}
          className="press -ml-2 flex h-9 items-center gap-1 rounded-full px-2 text-[0.875rem] text-[#f3f0eb]/80 transition-colors hover:bg-white/10 hover:text-[#f3f0eb]"
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
          Vitrine dön
        </button>

        <h2 className="display-feature mt-3">{scene.name}</h2>
        <ul className="fine-print on-dark-muted mt-2 space-y-0.5">
          {scene.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {webgl ? <p className="fine-print mt-3 text-[#f3f0eb]/70">Sürükleyerek çevirin.</p> : null}

        <fieldset className="mt-5">
          <legend className="fine-print text-[#f3f0eb]/70">Bir zemine koyun</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBackdrop(null)}
              aria-pressed={!backdrop}
              aria-label="Zeminsiz"
              title="Zeminsiz"
              className={cn(
                "flex size-10 items-center justify-center rounded-full bg-[#0c0b0a] ring-1 transition-[box-shadow]",
                !backdrop ? "ring-2 ring-[#f0c779]" : "ring-white/15 hover:ring-white/40",
              )}
            >
              <span aria-hidden className="h-px w-5 rotate-45 bg-white/40" />
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
                  "size-10 overflow-hidden rounded-full ring-1 transition-[box-shadow]",
                  backdrop?.id === item.id ? "ring-2 ring-[#f0c779]" : "ring-white/15 hover:ring-white/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 2 KB'lik kucuk resim */}
                <img src={backdropSwatchSrc(item)} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <p className="fine-print on-dark-muted mt-2 text-pretty">
            {backdrop ? `${backdrop.name}: stüdyodaki zeminlerden biri.` : "Stüdyodaki zeminlerden birkaçı."}
          </p>
        </fieldset>

        <div className="mt-5 w-full max-w-[15rem]">
          <HeroBeforeAfter
            before={close.before}
            after={close.after}
            beforeAlt={scene.photoAlt}
            afterAlt={scene.cutoutAlt}
            width={scene.close.width}
            height={scene.close.height}
            sizes="15rem"
          />
        </div>
        <p className="fine-print on-dark-muted mt-2 text-pretty">
          Çizgiyi sürükleyin: sağda özgün fotoğraf, solda arka planı kaldırılmış hâli.
        </p>

        <a
          href="#dene"
          className="press mt-5 flex min-h-11 w-fit items-center rounded-full bg-[linear-gradient(135deg,#f0c779,#d6a756)] px-6 text-[0.9375rem] font-semibold text-[#171614]"
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
  onReady: () => void;
  onFrameState: (frame: { panel: boolean }) => void;
  onClosed: () => void;
};

function ZoomScene({ scene, origin, handShift, timelineRef, spinRef, reduceMotion, onReady, onFrameState, onClosed }: ZoomSceneProps) {
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
    return { center: toWorld(focus.x, focus.y), height: focus.height * unit };
  }, [size, toWorld, unit]);

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
      if (!s.dragging && t.seconds >= ZOOM_END && !reduceMotion) s.yaw += delta * 0.35;
      // Yolda bir tam tur; kullanicinin cevirdigi aci da yolculukla olceklenir
      // ki kapanista yuzuk fotograftaki pozuna (0) donsun.
      group.rotation.set(s.pitch * frame.travel, travelSpin(frame.travel) + s.yaw * frame.travel, 0);
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
      <Jewel url={scene.model} envMap={env} groupRef={jewel} />
      <HandPlane hand={hand} plane={plane} shift={handShift} materialRef={planeMaterial} />
    </>
  );
}

// --- El duzlemi ---------------------------------------------------------------

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
    <mesh position={plane.center} renderOrder={2}>
      <planeGeometry args={[plane.width, plane.height]} />
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

// --- 3D taki ---------------------------------------------------------------

function Jewel({
  url,
  envMap,
  groupRef,
}: {
  url: string;
  envMap: THREE.Texture;
  groupRef: MutableRefObject<THREE.Group | null>;
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
            <mesh key={mesh.uuid} geometry={mesh.geometry} matrix={mesh.matrixWorld} matrixAutoUpdate={false}>
              <MeshRefractionMaterial
                envMap={envMap}
                bounces={3}
                ior={2.42}
                fresnel={0.9}
                aberrationStrength={0.012}
                fastChroma
                toneMapped={false}
              />
            </mesh>
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
