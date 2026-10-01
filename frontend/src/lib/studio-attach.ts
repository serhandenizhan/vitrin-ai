/**
 * Stüdyo kimliksiz açıldıysa, çalışma kimliği sonradan gelince ona bağlar.
 *
 * Sonuç sunucuya kaydedilince gelen kimlik "Arka plan ekle"ye basıldıktan SONRA
 * gelebiliyor; o zamana kadar stüdyo kimliksiz açılır ve otomatik kayıt ile
 * "tamamlandı" işareti çalışmaz (kök CLAUDE.md ders 38). Yalnız AYNI kesimle
 * açılmış, hâlâ kimliksiz bir stüdyoya bağlanır: başka bir çalışmanın stüdyosuna
 * (kullanıcı arada Çalışmalar'dan başkasını açtıysa) dokunulmaz.
 */

export type AttachableStudio = { cutoutUrl: string; workId?: string };

export function attachWorkId<T extends AttachableStudio>(
  current: T | null,
  cutoutUrl: string,
  workId: string,
): T | null {
  if (!current || current.workId || current.cutoutUrl !== cutoutUrl) return current;
  return { ...current, workId };
}
