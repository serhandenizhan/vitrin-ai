"use client";

/**
 * Yönetim paneli — Kullanıcılar (`GET /api/admin/users`).
 *
 * Arama YALNIZCA E-POSTA ile (Faz 6 kararı, 17.09.2026: ad araması Faz 7'ye
 * ertelendi — GoTrue'nun `filter`'ı bizim profil alanlarımıza bakmıyor). Bu
 * yüzden etiket "E-posta ile ara"; "kullanıcı ara" demek çalışmayan bir
 * vaat olurdu.
 *
 * Sayfalama: backend toplam sayı vermiyor (Supabase yönetici API'si de
 * vermiyor); bir sonraki sayfa, dönen satır sayısı sayfa boyuna eşitse var
 * sayılıyor.
 */

import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";

import {
  adminFetch,
  formatDate,
  formatNumber,
  subscriptionLabel,
} from "@/components/admin/admin-client";
import { USERS_PER_PAGE, type AdminUserPage } from "@/lib/admin-api";

export function AdminUsers({ onOpen }: { onOpen: (userId: string) => void }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: AdminUserPage }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set("query", query);
    void adminFetch<AdminUserPage>(`/api/admin/users?${params}`).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", data: result.data } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [page, query]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "loading" });
    setPage(1);
    setQuery(draft.trim());
  }

  function goTo(next: number) {
    setState({ status: "loading" });
    setPage(next);
  }

  const users = state.status === "ready" ? state.data.users : [];
  const hasNext = users.length === USERS_PER_PAGE;

  return (
    <div>
      <form onSubmit={search} className="glass-panel flex items-center gap-2 rounded-full p-1.5 pl-4" role="search">
        <Search className="size-4 shrink-0 text-white/50" aria-hidden />
        <label htmlFor="admin-user-search" className="sr-only">
          E-posta ile ara
        </label>
        <input
          id="admin-user-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="E-posta ile ara"
          maxLength={254}
          className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
        <button type="submit" className="press bg-gold min-h-10 rounded-full px-5 text-sm font-medium text-black">
          Ara
        </button>
      </form>

      {state.status === "loading" ? (
        <p className="on-dark-muted mt-10 text-center text-sm" role="status">
          Kullanıcılar yükleniyor…
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="mt-10 text-center text-sm text-red-300">
          {state.error}
        </p>
      ) : users.length === 0 ? (
        <p className="on-dark-muted mt-10 text-center text-sm">
          {query ? `"${query}" ile eşleşen kullanıcı yok.` : "Kullanıcı yok."}
        </p>
      ) : (
        <ul className="soft-fade mt-6 space-y-2">
          {users.map((user) => {
            const billing = user.billing;
            const remaining =
              billing && billing.quota_snapshot !== null && billing.used_this_period !== null
                ? billing.quota_snapshot - billing.used_this_period
                : null;
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => onOpen(user.id)}
                  className="press glass-panel flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-5 py-3.5 text-left transition-colors hover:bg-white/5"
                >
                  <span className="flex min-w-0 flex-1 basis-60 items-center gap-2">
                    <span className="truncate text-sm font-medium">{user.email ?? "(e-posta yok)"}</span>
                    {billing?.is_admin ? (
                      <ShieldCheck className="text-gold size-4 shrink-0" aria-label="Yönetici" />
                    ) : null}
                  </span>
                  <span className="on-dark-muted text-xs">{subscriptionLabel(billing?.status)}</span>
                  <span className="on-dark-muted text-xs tabular-nums">
                    {remaining === null ? "Dönem yok" : `Kalan ${formatNumber(remaining)}`}
                    {billing?.bonus_available ? ` + ${formatNumber(billing.bonus_available)} bonus` : ""}
                  </span>
                  <span className="on-dark-muted text-xs">Kayıt {formatDate(user.created_at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label="Sayfalar" className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1 || state.status === "loading"}
          className="press flex min-h-10 items-center gap-1 rounded-full px-4 text-sm text-white/70 ring-1 ring-white/15 hover:text-white disabled:opacity-35"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Önceki
        </button>
        <span className="on-dark-muted text-sm tabular-nums">Sayfa {page}</span>
        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={!hasNext || state.status === "loading"}
          className="press flex min-h-10 items-center gap-1 rounded-full px-4 text-sm text-white/70 ring-1 ring-white/15 hover:text-white disabled:opacity-35"
        >
          Sonraki
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </nav>
    </div>
  );
}
