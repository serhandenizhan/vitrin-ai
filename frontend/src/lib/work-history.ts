"use client";

/**
 * Gecmis calismalar deposu — GECICI, tarayici icinde.
 *
 * =========================================================================
 * BU BILINCLI BIR GECICI COZUM (bkz. kok CLAUDE.md ders 8)
 * =========================================================================
 * Yol haritasi proje gecmisini Faz 4'e koyuyor ve orada "bastan SUNUCUDA"
 * diyor — onceki iterasyonda gecmis tarayicida tutulup sonra tasinmisti,
 * bu iterasyonda o tasima isinden kacinilmak isteniyor (bkz. ROADMAP.md
 * Faz 4).
 *
 * Kullanici Faz 2'de gecmisi gorunur istedi. Faz 4'un semasi ve RLS'i henuz
 * yok, dolayisiyla tek secenek tarayici. Bu yuzden:
 *
 *  - Depo bir ARAYUZUN arkasinda duruyor (asagidaki fonksiyonlar). Faz 4'te
 *    yalnizca bu dosyanin govdesi sunucu cagrilariyla degistirilecek;
 *    arayuzun geri kalani hic degismeyecek.
 *  - Kullaniciya arayuzde acikca "bu cihazda saklaniyor, hesap sistemi
 *    gelince hesabiniza tasinacak" yaziliyor — sessizce yapilmiyor.
 *  - Kullanici geemisi kapatabiliyor ve silebiliyor (ayarlar).
 *
 * Neden IndexedDB, localStorage degil: kayitlar metin degil Blob (PNG).
 * localStorage yalnizca string tutar ve base64'e cevirmek hem boyutu ~%33
 * buyutur hem 5MB'lik kotayi birkac kayitta doldurur.
 */

const DB_NAME = "vitrin-ai";
const DB_VERSION = 1;
const STORE = "works";

/** Bu sayidan fazlasi tutulmaz; en eskiler silinir. */
const MAX_RECORDS = 20;

/** Kenar cubugundaki onizleme icin kucuk kare. */
const THUMB_SIZE = 128;

export type WorkRecord = {
  id: string;
  fileName: string;
  createdAt: number;
  isMocked: boolean;
  durationSeconds: number | null;
  /** Arka plani kaldirilmis sonuc. */
  result: Blob;
  /** Kenar cubugunda gosterilen kucuk onizleme. */
  thumbnail: Blob;
};

/** Depo kullanilamiyorsa (gizli sekme, kota, eski tarayici) null doner. */
function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Gizli pencerede ya da depolama kapaliyken acilma basarisiz olabilir —
    // bu bir hata degil, gecmis ozelligi o oturumda yok sayilir.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Kayitlari yeniden eskiye dogru dondurur. */
export async function listWorks(): Promise<WorkRecord[]> {
  const db = await openDatabase();
  if (!db) return [];
  try {
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const all = await promisify(store.getAll() as IDBRequest<WorkRecord[]>);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function saveWork(
  work: Omit<WorkRecord, "id" | "createdAt" | "thumbnail">,
): Promise<WorkRecord | null> {
  const db = await openDatabase();
  if (!db) return null;

  try {
    const thumbnail = await makeThumbnail(work.result);
    const record: WorkRecord = {
      ...work,
      thumbnail,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(record);

    // Sinirin uzerindeki en eski kayitlari at — gecmis, kotayi doldurmamali.
    const all = await promisify(store.getAll() as IDBRequest<WorkRecord[]>);
    const fazlalik = all
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(MAX_RECORDS);
    for (const eski of fazlalik) store.delete(eski.id);

    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
    return record;
  } catch {
    // Kota dolduysa ya da yazma reddedildiyse gecmis kaydedilmez; asil akis
    // (kesim + indirme) bundan etkilenmemeli.
    return null;
  } finally {
    db.close();
  }
}

export async function deleteWork(id: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
  } catch {
    /* yok sayilir */
  } finally {
    db.close();
  }
}

export async function clearWorks(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).clear();
  } catch {
    /* yok sayilir */
  } finally {
    db.close();
  }
}

/**
 * Kucuk kare onizleme uretir.
 *
 * Tam boyutlu PNG'i kenar cubugunda gostermek her acilista birkac megabaytin
 * cozulmesi demek; 128px'lik bir kare hem hizli hem yeterli.
 */
async function makeThumbnail(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return source;
  }

  // Orani koruyarak ortala (contain) — kirpmak urunun bir kismini kesiyordu.
  const scale = Math.min(
    THUMB_SIZE / bitmap.width,
    THUMB_SIZE / bitmap.height,
  );
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(
    bitmap,
    (THUMB_SIZE - width) / 2,
    (THUMB_SIZE - height) / 2,
    width,
    height,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  return blob ?? source;
}
