"use client";

/**
 * Yönetim paneli — Kesim kuyruğu sağlığı (`GET /api/admin/cutout-queue`).
 *
 * NEDEN VAR: kesim işçisi çalışmıyorsa müşteriler hata görmez, sessizce sırada
 * bekler; bu kart o durumu yöneticiye gösterir. Genel bakışın istatistik
 * yüklemesinden BAĞIMSIZ yüklenir ve kendini yeniler: kuyruk durumu saniyeler
 * içinde değişir, istatistik sayfası ise bir kez okunur.
 *
 * Yenilemede önceki veri ekranda KALIR (yükleniyor göstergesi yanıp sönmesin);
 * bir yenileme başarısız olursa eski sayıların güncel sanılmaması için kart
 * bunu açıkça söyler ve son başarılı okumanın saatini gösterir.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash } from "lucide-react";

import { adminFetch, formatNumber } from "@/components/admin/admin-client";
import type { CutoutQueueHealth, CutoutQueueStatus } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

/** Yenileme aralığı: backend nabzı 10 sn'de bir atıyor, ölü sayma 30 sn. */
export const QUEUE_REFRESH_MS = 30_000;

type View = { tone: "ok" | "warn" | "bad"; title: string; detail: (h: CutoutQueueHealth) => string };

/** Süre → "45 sn" / "2 dk 5 sn". */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sn`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${minutes} dk ${rest} sn` : `${minutes} dk`;
}

const VIEWS: Record<CutoutQueueStatus, View> = {
  ok: {
    tone: "ok",
    title: "Kesim işçisi çalışıyor",
    detail: (h) =>
      h.queued
        ? `${formatNumber(h.queued)} iş sırada bekliyor.`
        : "Sırada bekleyen iş yok.",
  },
  no_worker: {
    tone: "bad",
    title: "Kesim işçisi çalışmıyor",
    detail: () =>
      "Canlı işçi yok: kullanıcıların kesimleri hata görmeden sırada bekliyor ve işçi başlatılana kadar sonuç çıkmayacak.",
  },
  stalled: {
    tone: "warn",
    title: "Kuyruk tıkalı görünüyor",
    detail: (h) =>
      `İşçi çalışıyor ama en eski iş ${formatWait(h.oldest_waiting_seconds ?? 0)} bekliyor (eşik ${formatWait(h.stall_threshold_seconds)}).`,
  },
  unavailable: {
    tone: "bad",
    title: "Kuyruğa ulaşılamıyor",
    detail: () => "Redis'e bağlanılamıyor: yeni kesimler şu anda alınamaz.",
  },
};

function isKnownStatus(value: unknown): value is CutoutQueueStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(VIEWS, value);
}

const TONE_CLASS = {
  ok: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-red-300",
} as const;

const TONE_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: CircleSlash } as const;

const clock = new Intl.DateTimeFormat("tr-TR", { timeStyle: "medium" });

type State =
  | { phase: "loading" }
  | { phase: "error"; error: string }
  | {
      phase: "ready";
      health: CutoutQueueHealth;
      checkedAt: Date;
      /** Son yenileme başarısızsa: gösterilen sayıların eski olduğu söylenir. */
      refreshError: string | null;
    };

export function AdminCutoutQueue() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await adminFetch<CutoutQueueHealth>("/api/admin/cutout-queue");
      if (cancelled) return;
      // Tanımadığımız bir durum (backend'e yeni bir durum eklendi ya da yanıt
      // bozuk) kartı ya da paneli çökertmez; başarısız okuma sayılır.
      const error = result.ok
        ? isKnownStatus(result.data?.status)
          ? null
          : "Kuyruk durumu anlaşılamadı."
        : result.error;
      setState((previous) => {
        if (result.ok && error === null) {
          return { phase: "ready", health: result.data, checkedAt: new Date(), refreshError: null };
        }
        const message = error ?? "Kuyruk durumu anlaşılamadı.";
        // İlk okuma başarısızsa hata ekranı; sonraki bir yenileme başarısızsa
        // eski veriyi koru ama eski olduğunu belirt.
        return previous.phase === "ready"
          ? { ...previous, refreshError: message }
          : { phase: "error", error: message };
      });
    }

    void load();
    const timer = setInterval(() => void load(), QUEUE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="glass-panel rounded-3xl p-5" aria-labelledby="cutout-queue-title">
      <h3 id="cutout-queue-title" className="mb-3 text-sm font-medium">
        Kesim kuyruğu
      </h3>
      {state.phase === "loading" ? (
        <p className="on-dark-muted text-sm" role="status">
          Kuyruk durumu yükleniyor…
        </p>
      ) : state.phase === "error" ? (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      ) : (
        <QueueBody state={state} />
      )}
    </section>
  );
}

function QueueBody({ state }: { state: Extract<State, { phase: "ready" }> }) {
  const { health } = state;
  const view = VIEWS[health.status];
  const Icon = TONE_ICON[view.tone];
  const hasCounters = health.status !== "unavailable";
  return (
    <div>
      {/* Sağlıklıysa `status` (sessiz), değilse `alert` (okuyucu hemen duyurur). */}
      <div role={view.tone === "ok" ? "status" : "alert"} className={cn("flex items-start gap-2", TONE_CLASS[view.tone])}>
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{view.title}</p>
          <p className="on-dark-muted mt-0.5 text-sm">{view.detail(health)}</p>
        </div>
      </div>

      {hasCounters ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Counter label="Canlı işçi" value={formatNumber(health.workers ?? 0)} />
          <Counter
            label="Sırada"
            value={`${formatNumber(health.queued ?? 0)}${health.max_queued ? ` / ${formatNumber(health.max_queued)}` : ""}`}
          />
          <Counter label="İşleniyor" value={formatNumber(health.processing ?? 0)} />
          <Counter
            label="En eski bekleyen"
            value={health.oldest_waiting_seconds == null ? "—" : formatWait(health.oldest_waiting_seconds)}
          />
        </div>
      ) : null}

      <p className="on-dark-muted mt-4 text-xs">
        Son kontrol: {clock.format(state.checkedAt)} · {QUEUE_REFRESH_MS / 1000} saniyede bir yenilenir
      </p>
      {state.refreshError ? (
        <p role="alert" className="mt-1 text-xs text-amber-300">
          Son yenileme başarısız ({state.refreshError}); yukarıdaki değerler eski olabilir.
        </p>
      ) : null}
    </div>
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="on-dark-muted text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-[-0.01em]">{value}</p>
    </div>
  );
}
