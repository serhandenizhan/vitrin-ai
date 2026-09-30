/**
 * Yakinlasmadaki urun adinin yazi tipi: Archivo, genisletilmis (wdth 125).
 *
 * Sitenin tasarim dili yalniz Inter kullaniyor; bu yazi tipi YALNIZCA
 * acilis vitrinindeki urun adi icin, Serhan'in istegiyle eklendi (29.09.2026,
 * referans: blazing-energy.netlify.app basliklari). Lisans: SIL Open Font
 * License (Google Fonts), ticari kullanim serbest.
 *
 * `preload: false`: yazi tipi acilista inmez, yakinlasma acilinca iner —
 * ilk gorunme suresini (LCP) etkilemesin.
 */

import { Archivo } from "next/font/google";

export const heroDisplayFont = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  preload: false,
});
