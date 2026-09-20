"use client";

/**
 * Yönetim paneli — Zeminler (Faz 6, Kaan).
 *
 * Dört iş: listeleme (`GET /api/admin/backgrounds`), yükleme (`POST`, Faz 3'ten
 * beri duran uç), paket/yayın durumu değiştirme (`PATCH`) ve silme (`DELETE`).
 * Son ikisi 19.09.2026'da Kaan'ın isteğiyle eklendi (Serhan'ın PR 2 kapsamına
 * giriyordu; PR'da ayrıca belirtilecek).
 *
 * PASİF, SİLİNMİŞ DEĞİLDİR ve bu ayrım bilinçli: pasif zemin kullanıcıya gitmez
 * ama satırı ve dosyaları durur, istenince geri açılır. Silme geri alınamaz, bu
 * yüzden iki adımlı (kartın üstünde onay sorulur).
 *
 * Liste kullanıcıya gidenden farklı: pasif zeminleri ve her iki paket
 * seviyesini de gösteriyor (panelin işi, bir zeminin neden kullanıcıya
 * gitmediğini gösterebilmek).
 *
 * Süzgeçler (Serhan, 19.09.2026): stüdyodaki kategori sekmeleriyle AYNI
 * kategoriler (Sade · Desen · Doğal · Lüks — `lib/background-categories.ts`)
 * ve yayın durumu (Yayında / Yayında değil). Her kartta zeminin stüdyodaki
 * adı ve kategorisi yazıyor; kategori katalogdan geldiği için burada
 * değiştirilemiyor (bkz. yükleme formundaki not). Süzgeç yalnız GÖSTERİM:
 * sayılar ve liste her zaman sunucudan gelen tam listeden hesaplanıyor.
 *
 * Önizleme adresleri SÜRELİ imzalı R2 URL'leri; süre backend'den `expires_in`
 * ile geliyor (istemciye sabitlenmiyor — `ROADMAP.md` Faz 3 uyarısı). Süre
 * dolmadan kısa bir pay bırakıp liste kendini yeniliyor, yoksa uzun açık
 * kalan panelde bütün küçük görseller sessizce kırık çıkardı.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { adminFetch, formatDate, formatNumber } from "@/components/admin/admin-client";
import { type AdminBackground } from "@/lib/admin-api";
import {
  BACKGROUND_CATEGORIES,
  type BackgroundCategory,
  backgroundCategory,
} from "@/lib/background-categories";
import { BACKGROUND_NAMES } from "@/lib/background-names";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_SIZE_MB,
  formatBytes,
  validateFile,
} from "@/lib/upload-constraints";

/** Imzali URL'lerin olmesine birakilan pay (saniye). */
const REFRESH_MARGIN_SECONDS = 60;

const TIER_LABEL: Record<string, string> = { basic: "Temel", full: "Tüm paketler" };

const CATEGORY_LABEL = Object.fromEntries(
  BACKGROUND_CATEGORIES.map((category) => [category.id, category.label]),
) as Record<BackgroundCategory, string>;

type CategoryFilter = BackgroundCategory | "all";
type StatusFilter = "all" | "active" | "inactive";

/** Suzgec dugmeleri: ayni hap dili, secili olan altin. */
const FILTER_BUTTON =
  "press flex min-h-9 items-center gap-1.5 rounded-full px-4 text-xs transition-colors duration-200 ";
const FILTER_ON = "bg-gold text-[#171614]";
const FILTER_OFF = "text-white/65 hover:bg-white/10 hover:text-white";

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; items: AdminBackground[] };

export function AdminBackgrounds() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tier, setTier] = useState<"basic" | "full">("basic");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowError, setRowError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  /** Mutasyondan önce başlamış liste isteğinin yeni sonucu ezmesini engeller. */
  const mutationVersionRef = useRef(0);

  // setState efekt GOVDESINDE cagrilmiyor, istegin then'inde: efektten dogrudan
  // state degistirmek React 19 lint kuralini (`set-state-in-effect`) ihlal
  // ediyor ve gereksiz bir ekstra render turu aciyor.
  const load = useCallback(
    () => {
      const startedAtVersion = mutationVersionRef.current;
      return adminFetch<AdminBackground[]>("/api/admin/backgrounds").then((result) => {
        if (startedAtVersion !== mutationVersionRef.current) return;
        setState(
          result.ok
            ? { status: "ready", items: result.data }
            : { status: "error", error: result.error },
        );
      });
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Imzali URL'ler olmeden once listeyi tazele.
  useEffect(() => {
    if (state.status !== "ready" || state.items.length === 0) return;
    const shortest = Math.min(...state.items.map((item) => item.expires_in));
    const delay = Math.max(shortest - REFRESH_MARGIN_SECONDS, 30) * 1000;
    const timer = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(timer);
  }, [state, load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid.message);
      return;
    }
    setBusy(true);
    setError("");
    setDone("");
    const body = new FormData();
    body.append("file", file);
    body.append("tier", tier);
    const result = await adminFetch<{ id: string }>("/api/admin/backgrounds", {
      method: "POST",
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    mutationVersionRef.current += 1;
    setDone(file.name + " yüklendi.");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    await load();
  }

  /** Tek bir zeminin paketini/yayın durumunu değiştirir. */
  async function patch(id: string, body: { tier?: "basic" | "full"; isActive?: boolean }) {
    setPendingId(id);
    setRowError("");
    const result = await adminFetch<{ id: string; tier: "basic" | "full"; is_active: boolean }>(
      "/api/admin/backgrounds/" + id,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setPendingId(null);
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    mutationVersionRef.current += 1;
    // Sunucunun DONDURDUGU deger yaziliyor, istemcinin tahmini degil: iki taraf
    // ayrisirsa ekranda yanlis paket gorunur ve kullanici bunu fark edemez.
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            items: current.items.map((item) =>
              item.id === id
                ? { ...item, tier: result.data.tier, is_active: result.data.is_active }
                : item,
            ),
          }
        : current,
    );
  }

  /** Zemini kalici olarak siler (onaydan sonra). */
  async function remove(id: string) {
    setPendingId(id);
    setRowError("");
    const result = await adminFetch("/api/admin/backgrounds/" + id, { method: "DELETE" });
    setPendingId(null);
    if (!result.ok) {
      setRowError(result.error);
      return;
    }
    mutationVersionRef.current += 1;
    setConfirmId(null);
    setState((current) =>
      current.status === "ready"
        ? { status: "ready", items: current.items.filter((item) => item.id !== id) }
        : current,
    );
  }

  const items = state.status === "ready" ? state.items : [];
  const activeCount = items.filter((item) => item.is_active).length;
  // Kategori sayilari yayin suzgecine, yayin sayilari kategori suzgecine gore:
  // her dugme, basilirsa kac zemin kalacagini soyluyor.
  const matchesStatus = (item: AdminBackground) =>
    statusFilter === "all" || item.is_active === (statusFilter === "active");
  const matchesCategory = (item: AdminBackground) =>
    categoryFilter === "all" || backgroundCategory(item.id) === categoryFilter;
  const shown = items.filter((item) => matchesStatus(item) && matchesCategory(item));
  const categoryCount = (category: CategoryFilter) =>
    items.filter(
      (item) => matchesStatus(item) && (category === "all" || backgroundCategory(item.id) === category),
    ).length;
  const statusCount = (status: StatusFilter) =>
    items.filter(
      (item) => matchesCategory(item) && (status === "all" || item.is_active === (status === "active")),
    ).length;

  return (
    <div>
      <form onSubmit={(event) => void upload(event)} className="glass-panel rounded-3xl p-6">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <ImagePlus className="size-4" strokeWidth={1.7} aria-hidden />
          Yeni zemin yükle
        </h2>
        <p className="on-dark-muted mt-1 text-xs leading-relaxed">
          JPEG, PNG, WebP veya HEIC · en fazla {MAX_FILE_SIZE_MB} MB. Küçük önizleme
          sunucuda üretiliyor; kategori ve baskı uyarısı katalogdan geliyor, burada
          ayarlanmıyor.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="admin-background-file">
            Zemin görseli
          </label>
          <input
            id="admin-background-file"
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError("");
              setDone("");
            }}
            className="min-h-10 max-w-full text-sm text-white/80 file:mr-3 file:min-h-9 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:text-sm file:text-white hover:file:bg-white/15"
          />

          <div role="group" aria-label="Paket seviyesi" className="flex gap-1 rounded-full bg-white/8 p-1">
            {(["basic", "full"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tier === value}
                onClick={() => setTier(value)}
                className={
                  "press min-h-9 rounded-full px-4 text-xs transition-colors " +
                  (tier === value ? "bg-gold text-[#171614]" : "text-white/65 hover:bg-white/10 hover:text-white")
                }
              >
                {TIER_LABEL[value]}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!file || busy}
            className="press bg-gold ml-auto flex min-h-10 items-center gap-2 rounded-full px-6 text-sm font-medium text-black transition-[filter,box-shadow] duration-200 hover:shadow-[0_8px_20px_-8px_rgb(209_162_91/0.9)] hover:brightness-110 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:brightness-100"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Yükleniyor…" : "Yükle"}
          </button>
        </div>

        {file ? (
          <p className="on-dark-muted mt-3 text-xs">
            {file.name} · {formatBytes(file.size)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="text-gold mt-3 text-xs">
            {done}
          </p>
        ) : null}
      </form>

      <div className="mt-8 flex items-center gap-3">
        <h2 className="text-sm font-medium">Kütüphane</h2>
        <span className="on-dark-muted text-xs tabular-nums">
          {state.status === "ready"
            ? formatNumber(activeCount) + " yayında · " + formatNumber(items.length) + " toplam"
            : ""}
        </span>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            void load();
          }}
          className="press on-dark-muted ml-auto flex min-h-9 items-center gap-1.5 rounded-full px-4 text-xs ring-1 ring-white/15 transition-colors duration-200 hover:bg-white/10 hover:text-white hover:ring-white/30"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Yenile
        </button>
      </div>

      <p className="on-dark-muted mt-2 text-xs">
        Pasife alınan zemin kullanıcıya gitmez ama silinmez; silme geri alınamaz.
      </p>
      {rowError ? (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {rowError}
        </p>
      ) : null}

      {state.status === "ready" && items.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Kategori" className="glass-panel flex flex-wrap gap-1 rounded-full p-1">
            {(["all", ...BACKGROUND_CATEGORIES.map((category) => category.id)] as CategoryFilter[]).map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={categoryFilter === category}
                onClick={() => setCategoryFilter(category)}
                className={FILTER_BUTTON + (categoryFilter === category ? FILTER_ON : FILTER_OFF)}
              >
                {category === "all" ? "Tümü" : CATEGORY_LABEL[category]}
                <span className="tabular-nums opacity-60">{categoryCount(category)}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Yayın durumu" className="glass-panel flex flex-wrap gap-1 rounded-full p-1 sm:ml-auto">
            {(
              [
                ["all", "Tümü"],
                ["active", "Yayında"],
                ["inactive", "Yayında değil"],
              ] as const
            ).map(([status, label]) => (
              <button
                key={status}
                type="button"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
                className={FILTER_BUTTON + (statusFilter === status ? FILTER_ON : FILTER_OFF)}
              >
                {status === "active" ? <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" /> : null}
                {status === "inactive" ? <span aria-hidden className="size-1.5 rounded-full bg-white/40" /> : null}
                {label}
                <span className="tabular-nums opacity-60">{statusCount(status)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <p className="on-dark-muted mt-10 text-center text-sm" role="status">
          Zeminler yükleniyor…
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="mt-10 text-center text-sm text-red-300">
          {state.error}
        </p>
      ) : items.length === 0 ? (
        <p className="on-dark-muted mt-10 text-center text-sm">Henüz zemin yok.</p>
      ) : shown.length === 0 ? (
        <p className="on-dark-muted mt-10 text-center text-sm">Bu süzgeçte zemin yok.</p>
      ) : (
        <ul
          key={categoryFilter + statusFilter}
          className="soft-fade mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {shown.map((item) => (
            <li
              key={item.id}
              className="glass-panel group overflow-hidden rounded-2xl transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[#d1a25b]/50"
            >
              <div className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- imzali R2 adresi, Next optimizasyonundan gecmiyor */}
                <img
                  src={item.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className={
                    "aspect-square w-full bg-white/5 object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] " +
                    (item.is_active ? "" : "opacity-40 grayscale")
                  }
                />
              </div>
              <div className="space-y-2 px-3 py-2.5">
                <p className="truncate text-[0.8125rem] font-medium" title={BACKGROUND_NAMES[item.id]}>
                  {BACKGROUND_NAMES[item.id] ?? "Adsız zemin"}
                </p>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[0.625rem] text-white/75">
                    {CATEGORY_LABEL[backgroundCategory(item.id)]}
                  </span>
                  <span className="on-dark-muted min-w-0 flex-1 truncate text-[0.6875rem]">
                    {formatDate(item.created_at)}
                  </span>
                  {item.is_active ? null : (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[0.625rem] text-white/70">
                      Pasif
                    </span>
                  )}
                </div>

                <div role="group" aria-label="Paket seviyesi" className="flex gap-1 rounded-full bg-white/8 p-0.5">
                  {(["basic", "full"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={item.tier === value}
                      disabled={pendingId === item.id}
                      onClick={() => void patch(item.id, { tier: value })}
                      className={
                        "press min-h-8 flex-1 rounded-full px-2 text-[0.625rem] transition-colors disabled:opacity-40 " +
                        (item.tier === value ? "bg-gold text-[#171614]" : "text-white/60 hover:bg-white/10 hover:text-white")
                      }
                    >
                      {TIER_LABEL[value]}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.is_active}
                    disabled={pendingId === item.id}
                    onClick={() => void patch(item.id, { isActive: !item.is_active })}
                    className="press on-dark-muted min-h-8 flex-1 rounded-full text-[0.6875rem] ring-1 ring-white/15 transition-colors duration-200 hover:bg-white/10 hover:text-white hover:ring-white/30 disabled:opacity-40"
                  >
                    {item.is_active ? "Yayında" : "Yayına al"}
                  </button>
                  {confirmId === item.id ? (
                    <>
                      <button
                        type="button"
                        disabled={pendingId === item.id}
                        onClick={() => void remove(item.id)}
                        className="press min-h-8 shrink-0 rounded-full bg-red-500/20 px-3 text-[0.6875rem] text-red-200 transition-colors duration-200 hover:bg-red-500/35 disabled:opacity-40"
                      >
                        Sil
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="press on-dark-muted min-h-8 shrink-0 rounded-full px-2 text-[0.6875rem] transition-colors duration-200 hover:bg-white/10 hover:text-white"
                      >
                        Vazgeç
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label="Zemini sil"
                      disabled={pendingId === item.id}
                      onClick={() => {
                        setRowError("");
                        setConfirmId(item.id);
                      }}
                      className="press on-dark-muted flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-white/15 transition-colors duration-200 hover:bg-red-500/15 hover:text-red-200 hover:ring-red-300/40 disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
