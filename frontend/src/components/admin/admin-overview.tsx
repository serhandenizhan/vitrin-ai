"use client";

/**
 * Yönetim paneli — Genel bakış (`GET /api/admin/stats`).
 *
 * Başarısız iş ORANI bilinçli olarak hesaplanmıyor: backend iki sayıyı ayrı
 * veriyor ki payda sıfırken "%0 hata" gibi yanıltıcı bir şey gösterilmesin.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import {
  adminFetch,
  formatMoney,
  formatNumber,
  subscriptionLabel,
} from "@/components/admin/admin-client";
import { DailyBars } from "@/components/admin/daily-bars";
import { STATS_DAY_OPTIONS, type AdminStats } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

/**
 * Kaynak: `billing_transactions.type` CHECK kısıtı (migration 0005) —
 * 18.09.2026'da birebir alındı (ders 19). İlk taslakta tahminle `payment`
 * yazılmıştı; gerçek değer `charge`.
 */
const REVENUE_TYPE: Record<string, string> = {
  charge: "Tahsilat",
  refund: "İade",
  chargeback: "İtiraz",
  chargeback_reversal: "İtiraz iptali",
};

export function AdminOverview() {
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: string } | { status: "ready"; stats: AdminStats }
  >({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void adminFetch<AdminStats>(`/api/admin/stats?days=${days}`).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", stats: result.data } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [days, reloadKey]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Zaman aralığı" className="glass-panel flex gap-1 rounded-full p-1">
          {STATS_DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => {
                if (option === days) return;
                setState({ status: "loading" });
                setDays(option);
              }}
              className={cn(
                "press min-h-9 rounded-full px-4 text-sm transition-colors",
                days === option ? "bg-gold text-[#171614]" : "text-white/65 hover:bg-white/8 hover:text-white",
              )}
            >
              Son {option} gün
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={reload}
          className="press on-dark-muted flex min-h-9 items-center gap-2 rounded-full px-3 text-sm hover:text-white"
        >
          <RefreshCw className="size-4" aria-hidden />
          Yenile
        </button>
      </div>

      {state.status === "loading" ? (
        <p className="on-dark-muted mt-10 text-center text-sm" role="status">
          İstatistikler yükleniyor…
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="mt-10 text-center text-sm text-red-300">
          {state.error}
        </p>
      ) : (
        <OverviewBody stats={state.stats} />
      )}
    </div>
  );
}

function OverviewBody({ stats }: { stats: AdminStats }) {
  const ops = stats.operations;
  const opsTotal = ops.open_alerts + ops.open_actions + ops.open_storage_jobs;
  return (
    <div className="soft-fade mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Bugün kesim" value={stats.usage.today} />
        <Tile label="Son 7 gün" value={stats.usage.last_7_days} />
        <Tile label="Son 30 gün" value={stats.usage.last_30_days} />
        <Tile label="Toplam kesim" value={stats.usage.all_time} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <DailyBars title="Günlük kesim" unit="kesim" series={stats.daily_usage} />
        <DailyBars title="Günlük yeni hesap" unit="kayıt" series={stats.daily_signups} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={`Kesim işleri (son ${stats.days} gün)`}>
          <Row label="Tamamlanan" value={formatNumber(stats.reservations.consumed)} />
          <Row label="Başarısız (kredi iade)" value={formatNumber(stats.reservations.released)} />
          <Row label="Süren" value={formatNumber(stats.reservations.pending)} />
        </Card>

        <Card title="Abonelikler">
          {stats.subscriptions_by_status.length === 0 ? (
            <Empty />
          ) : (
            stats.subscriptions_by_status.map((row) => (
              <Row key={row.status} label={subscriptionLabel(row.status)} value={formatNumber(row.count)} />
            ))
          )}
          {stats.active_periods_by_plan.length ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="on-dark-muted mb-1 text-xs">Aktif dönem — plana göre</p>
              {stats.active_periods_by_plan.map((row) => (
                <Row key={row.plan_id} label={row.plan_id} value={formatNumber(row.count)} />
              ))}
            </div>
          ) : null}
        </Card>

        <Card title="Bonus krediler">
          <Row label="Verilen" value={formatNumber(stats.credit_grants.granted)} />
          <Row label="Kullanılan" value={formatNumber(stats.credit_grants.used)} />
          <Row label="Açık bakiye" value={formatNumber(stats.credit_grants.outstanding)} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Gelir hareketleri (son ${stats.days} gün)`}>
          {stats.revenue.length === 0 ? (
            <Empty />
          ) : (
            stats.revenue.map((row) => (
              <Row
                key={`${row.type}-${row.status}-${row.currency}`}
                label={`${REVENUE_TYPE[row.type] ?? row.type} · ${row.status} · ${formatNumber(row.count)} adet`}
                value={formatMoney(row.amount_minor_units, row.currency)}
              />
            ))
          )}
        </Card>

        <Card title="Operasyon">
          {opsTotal === 0 ? (
            <p className="on-dark-muted text-sm">Bekleyen alarm ya da iş yok.</p>
          ) : (
            <p className="mb-2 flex items-center gap-2 text-sm text-amber-300">
              <AlertTriangle className="size-4" aria-hidden />
              İlgilenilmesi gereken {formatNumber(opsTotal)} kayıt var
            </p>
          )}
          <Row label="Açık ödeme alarmı" value={formatNumber(ops.open_alerts)} />
          <Row label="Bekleyen sağlayıcı işi" value={formatNumber(ops.open_actions)} />
          <Row label="Bekleyen depolama silme işi" value={formatNumber(ops.open_storage_jobs)} />
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-panel rounded-3xl p-5">
      <p className="on-dark-muted text-xs">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel rounded-3xl p-5">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="on-dark-muted min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

function Empty() {
  return <p className="on-dark-muted text-sm">Kayıt yok.</p>;
}
