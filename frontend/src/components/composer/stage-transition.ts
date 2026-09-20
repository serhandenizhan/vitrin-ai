"use client";

/**
 * Stüdyonun aşama geçişi (Serhan'ın seçimi, 20.09.2026).
 *
 * Tarayıcının kendi sahne geçişi (View Transitions API) + panellerin yandan
 * kayması BİRLİKTE: tuval eski yerinden yeni yerine/boyutuna tarayıcı
 * tarafından taşınırken, eski panel gidilen yönün tersine çıkar ve yeni panel
 * o yönden girer. Kayma DOM'da değil, `::view-transition-old/new(...)` üzerinde
 * — geçiş boyunca ekranda tarayıcının anlık görüntüleri vardır, bir DOM
 * animasyonu o görüntülerin arkasında kalırdı.
 *
 * Denenip elenenler (19–20.09.2026): aşama perdesi (her adımda yorucu), yönlü
 * DOM kayması, karartma, bulanıklık, büyüme, yükselme, perde, dönme, yaklaşma.
 *
 * SENKRON İKİ ŞEYE BAĞLI, ikisi de burada:
 * 1. Aynı süre ve eğri: `--stage-trial-ms` / `--stage-trial-ease` (globals.css)
 *    bütün gruplara (kök, tuval, panel, zemin barı) uygulanır.
 * 2. Tuvalin YENİ boyutu, görüntü alınmadan ÖNCE yazılmalı: `apply`'dan sonra
 *    `measureStage` aynı senkron blokta çağrılır (bkz. `use-stage-size.ts`).
 *
 * Desteklemeyen tarayıcıda (Firefox) aşama anında değişir; "hareketi azalt"
 * açıkken çağıran taraf zaten doğrudan `apply` kullanıyor.
 */

import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished?: Promise<unknown> };
};

/** Geçiş adları — her ada AYNI ANDA yalnızca BİR öğe sahip olabilir. */
export const STAGE_VIEW_NAMES = {
  canvas: "studio-canvas",
  panel: "studio-panel",
  rail: "studio-rail",
} as const;

export function runStageTransition(
  apply: () => void,
  measureStage: () => void,
  /** İleri 1, geri -1: panellerin giriş/çıkış yönü. */
  direction: 1 | -1,
) {
  const doc = document as ViewTransitionDocument;
  const root = document.documentElement;
  if (!doc.startViewTransition) {
    apply();
    return;
  }
  // Yon kok ogede: `::view-transition-*` sozde ogeleri kok ogenin altinda.
  root.style.setProperty("--stage-dir", String(direction));
  root.dataset.stageTransition = "on";
  const transition = doc.startViewTransition(() => {
    flushSync(apply);
    // Tuvalin yeni olcusu goruntu alinmadan once yazilsin.
    flushSync(measureStage);
  });
  void transition.finished?.finally?.(() => {
    delete root.dataset.stageTransition;
  });
}
