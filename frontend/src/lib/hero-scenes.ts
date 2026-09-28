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
  /** `public/hero/` altındaki meshopt sıkıştırılmış model. */
  model: string;
  /** Takının fotoğraftaki kutusu (0-1 kesir; betikle üretilir). */
  product: ProductBox;
  /** Yakın plandaki önce/sonra çiftinin ölçüsü (betikle üretilir). */
  close: { width: number; height: number };
  /** Taşların yeri: durağan parıltı burada parlar. */
  glints: GlintPoint[];
  /** Fotoğraf zemininin ölçülen tonu: bölümün arkasındaki ışık bununla boyanır. */
  tone: string;
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
    model: "/hero/ring-solitaire.glb",
    ...measure("sahne1"),
    glints: [
      { x: 0.6, y: 0.07, size: 1.6 },
      { x: 0.36, y: 0.12, size: 0.9 },
    ],
  },
];

export function photoSrc(scene: HeroScene): string {
  return `/hero/${scene.id}.webp`;
}

export function cutoutSrc(scene: HeroScene): string {
  return `/hero/${scene.id}-kesim.webp`;
}

/** Yüzüğün bütün bölgesi temizlenmiş el: yakınlaşmada yüzüğü bırakıp inen katman. */
export function handSrc(scene: HeroScene): string {
  return `/hero/${scene.id}-el.webp`;
}

/** Yalnız metali onarılmış el: sayfada yüzük katmanının altında durur. */
export function pageHandSrc(scene: HeroScene): string {
  return `/hero/${scene.id}-el-sayfa.webp`;
}

/** Yakın plandaki önce/sonra: ürün bölgesi ve modelin o bölgeden kesimi. */
export function closeSrc(scene: HeroScene): { before: string; after: string } {
  return { before: `/hero/${scene.id}-yakin.webp`, after: `/hero/${scene.id}-yakin-kesim.webp` };
}
