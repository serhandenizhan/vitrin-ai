"use client";

/**
 * Gecmis calismalar deposu — hesaba bagli, SUNUCUDA (Faz 4).
 *
 * Faz 2'de gecici olarak tarayicida (IndexedDB) tutuluyordu (kok CLAUDE.md
 * ders 8). Faz 4'te yalnizca bu dosyanin govdesi degisti; fonksiyon adlari
 * ayni kaldi. Istekler Next.js vekillerinden (`/api/projects`) FastAPI'ye
 * gidiyor; token vekilde ekleniyor.
 *
 * Urun kararlari (Kaan, 12.09.2026):
 *  - Tarayicidaki eski kayitlar hesaba TASINMIYOR; eski IndexedDB deposu
 *    `discardLegacyBrowserHistory` ile siliniyor (cihazda sessizce veri
 *    birakmamak icin).
 *  - Yalnizca SONUC saklaniyor, ozgun fotograf degil.
 *
 * Ag hatalarinda fonksiyonlar firlatmiyor: gecmis ikincil bir ozellik, asil
 * akis (kesim + indirme) bundan etkilenmemeli.
 */

import type { WorkRecord } from "@/lib/project-record";

export type { WorkRecord } from "@/lib/project-record";

/** Kaydedilecek yeni calisma. */
export type NewWork = {
  fileName: string;
  isMocked: boolean;
  durationSeconds: number | null;
  /** Arka plani kaldirilmis sonuc (PNG). */
  result: Blob;
};

/** Kenar cubugundaki onizleme icin kucuk kare. */
const THUMB_SIZE = 128;

/** Faz 2'deki tarayici deposunun adi. */
const LEGACY_DB_NAME = "vitrin-ai";

/** Kayitlari yeniden eskiye dogru dondurur. Oturum yoksa bos liste. */
export async function listWorks(): Promise<WorkRecord[]> {
  try {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()) as WorkRecord[];
  } catch {
    return [];
  }
}

export async function saveWork(work: NewWork): Promise<WorkRecord | null> {
  try {
    const thumbnail = await makeThumbnail(work.result);
    const form = new FormData();
    form.append("result", work.result, "result.png");
    form.append("thumbnail", thumbnail, "thumbnail.png");
    form.append("fileName", work.fileName);
    form.append("isMocked", String(work.isMocked));
    if (work.durationSeconds !== null && Number.isFinite(work.durationSeconds)) {
      form.append("durationSeconds", String(work.durationSeconds));
    }

    const response = await fetch("/api/projects", { method: "POST", body: form });
    if (!response.ok) return null;
    return (await response.json()) as WorkRecord;
  } catch {
    return null;
  }
}

/** Basarili olursa true; arayuz kaydi ancak o zaman listeden cikariyor. */
export async function deleteWork(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    // 404: kayit zaten yok (baska sekmede silindi) — sonuc ayni.
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function clearWorks(): Promise<boolean> {
  try {
    const response = await fetch("/api/projects", { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Faz 2'nin tarayici deposunu siler. Urun karari geregi eski kayitlar
 * tasinmiyor; silinmezse fotograf sonuclari bu cihazda kimsenin goremedigi
 * bir yerde kalmaya devam ederdi.
 */
export function discardLegacyBrowserHistory(): void {
  try {
    if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    /* depolama kapali — silinecek bir sey de yok */
  }
}

/**
 * Kucuk kare onizleme uretir.
 *
 * Kenar cubugunda tam boyutlu PNG gostermek her acilista birkac megabaytin
 * indirilmesi demek; 128px'lik bir kare hem hizli hem yeterli. Backend kucuk
 * resmi 512 KB ile sinirliyor, bu boyutta PNG onun cok altinda.
 */
async function makeThumbnail(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Tuval kullanılamıyor.");
  }

  // Orani koruyarak ortala (contain) — kirpmak urunun bir kismini kesiyordu.
  const scale = Math.min(THUMB_SIZE / bitmap.width, THUMB_SIZE / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (THUMB_SIZE - width) / 2, (THUMB_SIZE - height) / 2, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Küçük resim üretilemedi.");
  return blob;
}
