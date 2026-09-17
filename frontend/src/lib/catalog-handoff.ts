/**
 * Studyodan kataloga gorsel aktarimi (Kaan, 17.09.2026: katalog boyutunda
 * indirilen gorsel "sablona eklensin", katalogda A4 sayfanin tamamini
 * kaplasin).
 *
 * Studyo ana sayfada, katalog ayri rotada; saglayici her sayfada yeniden
 * kuruluyor (bkz. workspace-provider.tsx). Gorsel bu yuzden sessionStorage
 * uzerinden tasiniyor ve katalog acilinca yerlestikten sonra siliniyor —
 * sayfa yenilendiginde ayni gorsel ikinci kez eklenmesin.
 */

const CATALOG_IMPORT_KEY = "vitrin-ai:catalog-import";

export function storeCatalogImport(dataUrl: string): boolean {
  try {
    window.sessionStorage.setItem(CATALOG_IMPORT_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bekleyen gorseli okur ama SILMEZ. Silme, gorsel sayfaya yerlestikten sonra
 * `clearCatalogImport` ile: gelistirmede React efektleri iki kez calistiriyor
 * ve okurken silmek ilk (iptal edilen) turda gorseli kaybettiriyordu —
 * tarayicida gorulerek yakalandi.
 */
export function peekCatalogImport(): string | null {
  try {
    const value = window.sessionStorage.getItem(CATALOG_IMPORT_KEY);
    return value?.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

export function clearCatalogImport(): void {
  try {
    window.sessionStorage.removeItem(CATALOG_IMPORT_KEY);
  } catch {
    // Depolama kapaliysa silinecek bir sey de yok.
  }
}
