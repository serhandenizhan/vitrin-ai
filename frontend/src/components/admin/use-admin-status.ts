"use client";

/**
 * Oturumdaki kullanıcı yönetici mi (Faz 6, Kaan).
 *
 * YALNIZCA GÖSTERİM İÇİN: hesap menüsündeki "Yönetim paneli" bağlantısını ve
 * `/admin`'in ilk ekranını seçiyor. Yetkilendirme DEĞİL — her admin ucu
 * backend'de `require_admin` ile ayrıca kontrol ediliyor; bu değer tarayıcıda
 * değiştirilse bile hiçbir veri açılmaz (`SECURITY.md` 3.2).
 *
 * Kullanıcı değişince (çıkış/giriş) yeniden soruluyor; cevap GELENE kadar
 * "checking" — bağlantı yanlışlıkla bir an görünüp kaybolmasın.
 */

import { useEffect, useState } from "react";

export type AdminStatus = "signed-out" | "checking" | "admin" | "not-admin" | "error";

export function useAdminStatus(userId: string | null | undefined): AdminStatus {
  const [result, setResult] = useState<{ userId: string; status: AdminStatus } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch("/api/admin/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return "error" as const;
        const body = (await response.json()) as { is_admin?: unknown };
        return body.is_admin === true ? ("admin" as const) : ("not-admin" as const);
      })
      .catch(() => "error" as const)
      .then((status) => {
        if (!cancelled) setResult({ userId, status });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return "signed-out";
  // Onceki kullanicinin cevabi yeni kullaniciya asla tasinmaz.
  if (!result || result.userId !== userId) return "checking";
  return result.status;
}
