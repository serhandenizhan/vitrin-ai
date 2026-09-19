"use client";

/** Yönetim paneli bileşenlerinin ortak istek ve biçimlendirme yardımcıları. */

export type AdminResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Vekile istek atar; hata gövdesindeki `error` metnini kullanıcıya taşır. */
export async function adminFetch<T>(url: string, init?: RequestInit): Promise<AdminResult<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: body?.error ?? "İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.",
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin." };
  }
}

const dateTime = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" });
const shortDay = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
const integer = new Intl.NumberFormat("tr-TR");

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : "—";
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateOnly.format(new Date(value)) : "—";
}

export function formatDay(value: string): string {
  return shortDay.format(new Date(value));
}

export function formatNumber(value: number): string {
  return integer.format(value);
}

/** Kuruş cinsinden tutar → "₺1.234,50". */
export function formatMoney(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(minorUnits / 100);
}

/**
 * Abonelik durumlarının arayüz karşılığı. Kaynak: `subscriptions.status`
 * CHECK kısıtı (migration 0005) — 18.09.2026'da oradan birebir alındı (ders 19).
 */
export const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: "Aktif",
  trialing: "Deneme",
  past_due: "Ödeme bekliyor",
  canceling: "İptal ediliyor",
  canceled: "İptal",
  expired: "Süresi doldu",
  suspended: "Askıda",
};

export function subscriptionLabel(status: string | null | undefined): string {
  if (!status) return "Abonelik yok";
  return SUBSCRIPTION_STATUS[status] ?? status;
}
