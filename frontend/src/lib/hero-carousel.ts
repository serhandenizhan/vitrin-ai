/**
 * Acilis vitrininin kaydirma matematigi — DOM'suz, test edilebilir.
 *
 * Konum (`position`) surekli bir sayi: 2.4, "ucuncu sahnenin %40 otesi"
 * demek. Sahneler halka seklinde dizili (sondan sonra bas gelir), bu yuzden
 * her sahnenin konuma goreli uzakligi EN KISA yoldan olculur.
 *
 * Hareket bir yay (spring): hedef degisir, konum ona sonumlenerek yaklasir.
 * Referans sitedeki his bu; GSAP yerine ~20 satir.
 */

export type SpringState = { position: number; velocity: number };

/** Saniye basina. Kritik sonumlemenin biraz altinda: hafif, tek bir salinim. */
export const SPRING_STIFFNESS = 90;
export const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS) * 0.86;

/** Tekerlek/trackpad: bu kadar piksel yatay kaydirma bir sahne eder. */
export const WHEEL_PX_PER_SLIDE = 320;
/** Tekerlek durduktan sonra bu kadar ms icinde en yakin sahneye oturur. */
export const WHEEL_SNAP_DELAY_MS = 150;

export function wrapIndex(index: number, count: number): number {
  return ((Math.round(index) % count) + count) % count;
}

/** Sahnenin konuma goreli uzakligi, [-count/2, count/2) araliginda. */
export function relativeOffset(slide: number, position: number, count: number): number {
  let offset = (slide - position) % count;
  if (offset < -count / 2) offset += count;
  if (offset >= count / 2) offset -= count;
  return offset;
}

/**
 * Yayin bir adimi. Buyuk `dt` (sekme arka plandayken bir sonraki kare)
 * patlamasin diye alt adimlara bolunur.
 */
export function stepSpring(state: SpringState, target: number, dtSeconds: number): SpringState {
  const steps = 4;
  const dt = Math.min(dtSeconds, 1 / 20) / steps;
  let { position, velocity } = state;
  for (let i = 0; i < steps; i += 1) {
    velocity += ((target - position) * SPRING_STIFFNESS - velocity * SPRING_DAMPING) * dt;
    position += velocity * dt;
  }
  return { position, velocity };
}

export function isSettled(state: SpringState, target: number): boolean {
  return Math.abs(target - state.position) < 0.0005 && Math.abs(state.velocity) < 0.0005;
}

/**
 * Tekerlek olayindan sahne cinsinden kayma — YALNIZCA yatay hareket baskinsa.
 *
 * Dikey tekerlek HER ZAMAN sayfaya birakilir: acilis tek bir ekran ve
 * altinda site devam ediyor; tekerlegi yakalamak ziyaretciyi burada
 * hapsederdi (10.09.2026'da yatay galeri bu yuzden kaldirilmisti).
 * `null` = "bu olay bizim degil, preventDefault cagirma".
 */
export function horizontalWheelSlides(deltaX: number, deltaY: number): number | null {
  if (Math.abs(deltaX) <= Math.abs(deltaY) || deltaX === 0) return null;
  return deltaX / WHEEL_PX_PER_SLIDE;
}

/**
 * Suruklemeyi birakinca varilacak hedef: son hizin yonunde, en yakin tam
 * sahne. Hafif bir firlatma yeterli olsun diye hiz 0.18 sn ileri tasinir;
 * tek surukleme en fazla bir sahne atlar (yedi sahnede "kacirdim" hissi olmasin).
 */
export function releaseTarget(position: number, startPosition: number, velocitySlidesPerSec: number): number {
  const projected = position + velocitySlidesPerSec * 0.18;
  const start = Math.round(startPosition);
  return Math.max(start - 1, Math.min(start + 1, Math.round(projected)));
}

export type SlideLook = { x: number; scale: number; opacity: number; zIndex: number };

/**
 * Bir sahnenin gorunumu, konuma goreli uzakligindan. `x` sahne genisliginin
 * kati. Ortadaki tam boyda; komsular kucuk ve soluk yanlarda duruyor,
 * ikinci komsu gorunmuyor.
 */
export function slideLook(offset: number, showNeighbours: boolean): SlideLook {
  const distance = Math.abs(offset);
  const sign = Math.sign(offset);
  const near = Math.min(distance, 1);
  const x = sign * (near * 0.82 + Math.max(0, distance - 1) * 0.5);
  const scale = 1 - near * 0.42;
  const neighbourOpacity = showNeighbours ? 0.34 : 0;
  const opacity = distance <= 1 ? 1 - near * (1 - neighbourOpacity) : Math.max(0, neighbourOpacity * (2 - distance));
  return { x, scale, opacity, zIndex: 10 - Math.round(distance * 2) };
}
