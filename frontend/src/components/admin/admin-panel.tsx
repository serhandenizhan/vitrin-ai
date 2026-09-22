"use client";

/**
 * `/admin` sayfasının istemci kısmı (Faz 6, Kaan).
 *
 * Ekran seçimi (giriş yok / kontrol ediliyor / yetkisiz / hata / panel)
 * YALNIZCA GÖSTERİM: bu sayfa elle açılsa ya da bu kontrol tarayıcıda
 * atlatılsa bile hiçbir veri gelmez, çünkü her admin ucu backend'de
 * `require_admin` ile ayrıca reddediliyor (`SECURITY.md` 3.2).
 */

import { useState } from "react";
import { BarChart3, Images, ScrollText, Users } from "lucide-react";

import { AdminAudit } from "@/components/admin/admin-audit";
import { AdminBackgrounds } from "@/components/admin/admin-backgrounds";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminUserDetail } from "@/components/admin/admin-user-detail";
import { AdminUsers } from "@/components/admin/admin-users";
import { useAdminStatus } from "@/components/admin/use-admin-status";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

type Tab = "overview" | "users" | "backgrounds" | "audit";

export function AdminPanel() {
  const { user, openSignIn } = useWorkspace();
  const status = useAdminStatus(user?.id);
  const [tab, setTab] = useState<Tab>("overview");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  if (status === "signed-out") {
    return (
      <Notice title="Yönetim paneli için giriş yapın">
        <button
          type="button"
          onClick={() => openSignIn()}
          className="press bg-gold mt-6 min-h-11 rounded-full px-6 text-sm font-medium text-black"
        >
          Giriş yap
        </button>
      </Notice>
    );
  }
  if (status === "checking") {
    return (
      <p className="on-dark-muted mt-12 text-center text-sm" role="status">
        Yetki kontrol ediliyor…
      </p>
    );
  }
  if (status === "not-admin") {
    return <Notice title="Bu sayfaya erişiminiz yok">Yönetim paneli yalnızca yöneticilere açıktır.</Notice>;
  }
  if (status === "error") {
    return (
      <Notice title="Yetki bilgisi alınamadı">
        Bağlantınızı kontrol edip sayfayı yenileyin.
      </Notice>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5">
      <div
        role="tablist"
        aria-label="Yönetim bölümleri"
        className="glass-panel dock-strip mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full p-1.5"
      >
        {(
          [
            ["overview", "Genel bakış", BarChart3],
            ["users", "Kullanıcılar", Users],
            ["backgrounds", "Zeminler", Images],
            ["audit", "Günlük", ScrollText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setOpenUserId(null);
            }}
            className={cn(
              "press flex min-h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm transition-colors",
              tab === id ? "bg-gold text-[#171614]" : "text-white/65 hover:bg-white/8 hover:text-white",
            )}
          >
            <Icon className="size-4" strokeWidth={1.7} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* `key`: bolum degisince icerik "tak diye" degil yumusakca gelir. */}
      <div key={tab + (openUserId ?? "")} className="soft-fade mt-10">
        {tab === "overview" ? (
          <AdminOverview />
        ) : tab === "backgrounds" ? (
          <AdminBackgrounds />
        ) : tab === "audit" ? (
          <AdminAudit />
        ) : openUserId ? (
          <AdminUserDetail userId={openUserId} onBack={() => setOpenUserId(null)} />
        ) : (
          <AdminUsers onOpen={setOpenUserId} />
        )}
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel mx-auto mt-12 max-w-xl rounded-3xl p-8 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="on-dark-muted mt-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
