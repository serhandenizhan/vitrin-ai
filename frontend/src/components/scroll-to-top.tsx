"use client";

/**
 * Sayfa degisiminde en ustten baslamayi garanti eder.
 *
 * Neden gerekli: `globals.css` icinde `html { scroll-behavior: smooth }`
 * tanimli (sayfa ici capa baglantilari icin). Next'in yonlendirmede sayfayi
 * basa alma islemi de bu kurala takiliyor ve YUMUSAK bir kaydirmaya
 * donusuyor; kaydirma tamamlanmadan yeni sayfa ciziliyor ve ziyaretci sayfayi
 * ortasindan aciyor.
 *
 * Birebir olculdu: ana sayfada 2600 px'e kaydirilmisken "Paketler"e
 * tiklandiginda yeni sayfa 1984 px'te aciliyor ve ekranin ortasinda "Sik
 * sorulanlar" duruyordu.
 *
 * `behavior: "instant"` bilincli: `"auto"` spesifikasyona gore CSS'teki
 * `scroll-behavior` degerini kullanir, yani yine yumusak olurdu.
 */

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ScrollToTop() {
  const yol = usePathname();

  useEffect(() => {
    // Capa ile gelinen adreslerde (ornegin /#dene) basa almiyoruz: kullanici
    // acikca sayfanin bir bolumunu istemis.
    if (window.location.hash) return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [yol]);

  return null;
}
