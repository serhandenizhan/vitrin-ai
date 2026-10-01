/**
 * Acilis vitrininin sahneleri.
 *
 * Her sahnede gercek gorseller var: el + taki fotografi ve aracin kendi
 * kesimi (`scripts/prepare-hero-scenes.py`). Model fotografin URUN BOLGESINE
 * uygulaniyor — tum fotografa uygulandiginda parmaklari koruyup halkanin icini
 * dolduruyordu (olculdu, betigin basinda). Takinin kutusu ve yakin plan
 * olculeri de o betikten geliyor (`hero-scene-geometry.json`, elle
 * duzenlenmez): yakinlasmada 3D model tam o kutudan dogar.
 *
 * Istisna: yakin plandaki once/sonra'nin kesimi halka yuzukte ONARILIR
 * (parmaklarin ortugu yerler; betikte `RING_BAND_REPAIR`). Panelin metni bu
 * yuzden kesimin ham model ciktisi oldugunu soylemez.
 *
 * 3D modeller Blender betikleriyle uretiliyor (`scripts/hero-3d/`); urunler
 * ORNEKTIR, satista olan bir urunu temsil etmez.
 */

import { heroAsset } from "@/lib/hero-asset";
import geometry from "@/lib/hero-scene-geometry.json";

export type ProductBox = { x: number; y: number; w: number; h: number };

/** Tasin ustunde parlayan yildiz: takinin kutusuna gore kesir, boy rem. */
export type GlintPoint = { x: number; y: number; size: number };

export type HeroScene = {
  id: string;
  /** Seçim çubuğunda ve yakınlaşma başlığında görünen ad. */
  name: string;
  /** Yakınlaşmadaki kısa künye; her satır tek bir bilgi. */
  facts: string[];
  photoAlt: string;
  cutoutAlt: string;
  /** Meshopt sıkıştırılmış model (`public/hero/`, sürümlü adres). */
  model: string;
  /** Takının fotoğraftaki kutusu (0-1 kesir; betikle üretilir). */
  product: ProductBox;
  /** Yakın plandaki önce/sonra çiftinin ölçüsü (betikle üretilir). */
  close: { width: number; height: number };
  /** Taşların yeri: durağan parıltı burada parlar. */
  glints: GlintPoint[];
  /** Fotoğraf zemininin ölçülen tonu: bölümün arkasındaki ışık bununla boyanır. */
  tone: string;
  /**
   * 3D modelin fotoğraftaki açıya uyması için başlangıç pozu (radyan). Model
   * bu pozdan başlar ve döner; yoksa önden bakar.
   */
  pose?: { yaw: number; pitch: number };
  /**
   * Ürünü elden öne çıkaran parlaklık (CSS brightness). Metal için 1.45;
   * kadife kutu gibi büyük yüzeylerde fazla gelir (ölçüldü: kutu neon kırmızı).
   */
  lift?: number;
  /**
   * Yakınlaşmada kendi kendine hareket: "turn" tam tur döner (takı her
   * yönden güzel), "sway" önden sağa sola salınır (kutunun arkası boş; düz kolye yandan
   * çizgiye dönüşüyor).
   */
  idle?: "turn" | "sway";
  /** Yakınlaşmadaki boyun çarpanı: eğik duran kutu ürün adına taşıyordu. */
  zoomScale?: number;
};

export const HERO_PHOTO_WIDTH = 1600;
export const HERO_PHOTO_HEIGHT = 2000;

type Geometry = { product: ProductBox; close: { width: number; height: number }; tone: string };
const measured = geometry as Record<string, Geometry>;

function measure(id: string): Geometry {
  const found = measured[id];
  if (!found) throw new Error(`hero-scene-geometry.json icinde ${id} yok`);
  return found;
}

export const HERO_SCENES: HeroScene[] = [
  {
    id: "sahne1",
    name: "Tek taş yüzük",
    facts: ["Sarı altın", "Yuvarlak kesim pırlanta", "Altı tırnaklı yuva"],
    photoAlt: "Parmak uçlarında tutulan tek taş pırlanta yüzük",
    cutoutAlt: "Arka planı kaldırılmış tek taş yüzük",
    model: heroAsset("ring-solitaire.glb"),
    ...measure("sahne1"),
    glints: [
      { x: 0.6, y: 0.07, size: 1.6 },
      { x: 0.36, y: 0.12, size: 0.9 },
    ],
  },
  {
    id: "sahne3",
    name: "Kutulu yüzük",
    facts: ["Sarı altın", "Üç taşlı yuva", "Kadife kutu"],
    photoAlt: "Avuçta açık kadife kutu içinde üç taşlı yüzük",
    cutoutAlt: "Arka planı kaldırılmış kadife kutu ve yüzük",
    model: heroAsset("box-ring.glb"),
    ...measure("sahne3"),
    pose: { yaw: -0.25, pitch: 0.32 },
    lift: 1.08,
    idle: "sway",
    zoomScale: 0.8,
    glints: [
      { x: 0.46, y: 0.44, size: 1.4 },
      { x: 0.35, y: 0.48, size: 0.8 },
    ],
  },
  {
    id: "sahne2",
    name: "Damla kolye",
    facts: ["Sarı altın", "Armut kesim pırlanta", "Kablo zincir"],
    photoAlt: "Parmaklarda sarkan armut kesim pırlanta kolye",
    cutoutAlt: "Arka planı kaldırılmış damla kolye",
    model: heroAsset("necklace-drop.glb"),
    lift: 1.25,
    idle: "sway",
    ...measure("sahne2"),
    glints: [
      { x: 0.22, y: 0.9, size: 1.4 },
      { x: 0.16, y: 0.94, size: 0.8 },
    ],
  },
  {
    id: "sahne4",
    name: "Alyans çifti",
    facts: ["Sarı altın", "Kanal taşlı", "Düz alyans"],
    photoAlt: "Parmak uçlarında tutulan iki alyans",
    cutoutAlt: "Arka planı kaldırılmış alyans çifti",
    model: heroAsset("wedding-bands.glb"),
    ...measure("sahne4"),
    glints: [
      { x: 0.82, y: 0.14, size: 1.2 },
      { x: 0.74, y: 0.04, size: 0.7 },
    ],
  },
];

/**
 * Sahnenin yerlesimi: urunler fotograflarda cok farkli boyda (kutu karenin
 * yarisi, alyanslar sekizde biri). Her sahne olceklenir ki urunu sahne 1'in
 * yuzugune yakin boyda dursun (tam esitlemek eli asiri buyutup kuculturdu:
 * us 0.6 ve sinirlar), sonra kaydirilir ki urunun merkezi ayni yuksekliğe
 * gelsin.
 *
 * Geometri: fotograf alt ortasindan olceklenir, sonra boyunun `adjust` kati
 * kadar asagi kayar. Bir noktanin alt kenara uzakligi s·(1−y)·H − t·H; bunu
 * sahne 1'inkine esitleyen t = t0 + s·(1−cy) − (1−cy0).
 */
export function sceneLayout(scene: HeroScene): { scale: number; adjust: number } {
  const reference = HERO_SCENES[0].product;
  const ratio = reference.h / scene.product.h;
  const scale = Math.min(1.3, Math.max(0.62, ratio ** 0.6));
  const center = (box: ProductBox) => box.y + box.h / 2;
  const adjust = scale * (1 - center(scene.product)) - (1 - center(reference));
  return { scale, adjust };
}

export function cutoutSrc(scene: HeroScene): string {
  return heroAsset(`${scene.id}-kesim.webp`);
}

/** Yüzüğün bütün bölgesi temizlenmiş el: yakınlaşmada yüzüğü bırakıp inen katman. */
export function handSrc(scene: HeroScene): string {
  return heroAsset(`${scene.id}-el.webp`);
}

/**
 * Sayfadaki el: yakınlaşmadakiyle AYNI takısız el (yüzük kesimi onun üstünde
 * durur). Eskiden metali onarılmış ayrı bir fotoğraftı ve yüzük kalkınca kesik
 * parmak uçları görünüyordu.
 */
export function pageHandSrc(scene: HeroScene): string {
  return handSrc(scene);
}

/** Yakın plandaki önce/sonra: ürün bölgesi ve modelin o bölgeden kesimi. */
export function closeSrc(scene: HeroScene): { before: string; after: string } {
  return { before: heroAsset(`${scene.id}-yakin.webp`), after: heroAsset(`${scene.id}-yakin-kesim.webp`) };
}
