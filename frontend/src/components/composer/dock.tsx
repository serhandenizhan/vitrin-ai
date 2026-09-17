"use client";

/**
 * Alt dock — o an secili aracin PALETI (17.09.2026, Serhan).
 *
 * Isbolumu: dock GOZLE secilen seyleri tasiyor (zemin karelari, bicim
 * kartlari, hazir ayarlar, cikti turleri), denetci ise OKUNARAK ayarlananlari
 * (sayisal kaydiraclar, metin alanlari, adim gezinme). Bu ayrim bilincli:
 * iki yuzey ayni isi yaparsa kullanici hangisinin asil oldugunu bilemiyor.
 *
 * Dock tuvalin UZERINDE duruyor. Urune dokunuldugu anda `isQuiet` ile silikleip
 * geri cekiliyor ki kompozisyonun alti gorunsun — Serhan'in karari. Silikken
 * `pointer-events` de kapaniyor: yari saydam bir katmanin altindaki tuvale
 * yapilan suruklemeyi yutmasi, "surukleme calismiyor" gibi gorunurdu.
 */

import type { ReactNode } from "react";

export type DockProps = {
  /** Solda duran arac adi; ayni zamanda erisilebilir ad. */
  title: string;
  /** Sagda duran baglam denetimi (ornegin kategori menusu dugmesi). */
  action?: ReactNode;
  /** Urun surukleniyor mu — dock o sirada geri cekiliyor. */
  isQuiet?: boolean;
  children: ReactNode;
};

export function Dock({ title, action, isQuiet = false, children }: DockProps) {
  return (
    <div
      role="group"
      aria-label={title}
      className={
        "glass-panel glass-dock pointer-events-auto w-full max-w-[min(42rem,100%)] rounded-2xl px-3 pt-2.5 pb-3 " +
        (isQuiet ? "dock-quiet" : "")
      }
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="text-[0.8125rem] font-medium tracking-[-0.01em]">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Dock icindeki yatay serit.
 *
 * `palette-fade` sag kenari solduruyor: son kart YARIM gorunsun ve devaminin
 * oldugu belli olsun (Serhan'in istegi — "devaminin oldugu yarim kalan son
 * kartla belli olsun"). Kaydirma yoksa maske zararsiz.
 */
export function DockStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      aria-label={label}
      // `px-1.5 py-1` + esit negatif margin: secili karenin altin halkasi
      // (`ring-offset-2` + `scale-105`) kaydirma kutusunun kenarinda
      // KIRPILIYORDU — tarayicida gorundu. Padding halkaya yer aciyor,
      // negatif margin hizalamayi bozmuyor.
      className="palette-fade -mx-1.5 -my-1 flex snap-x gap-2 overflow-x-auto px-1.5 py-1"
    >
      {children}
    </div>
  );
}
