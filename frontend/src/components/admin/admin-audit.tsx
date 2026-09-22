"use client";

/**
 * Yönetim paneli — Günlük (`GET /api/admin/audit`, 19.09.2026).
 *
 * `admin_audit_log`'a Faz 6'dan beri her admin eyleminde satır yazılıyordu
 * ama okuyan bir ekran yoktu (Faz 6 denetiminde eksik bulundu). Bu sekme
 * YALNIZ OKUR; tablo veritabanında yalnız eklemeye açık.
 *
 * Her satır bir cümle: "kim · ne yaptı · neye", altında zaman. Ham kimlikler
 * gösterilmiyor; zemin adını katalogdan, kullanıcı e-postasını kaydın kendi
 * ayrıntısından okuyoruz. Ayrıntıda olmayan bir şey tahmin edilmiyor.
 *
 * "Admin" anahtarı (Serhan, 19.09.2026): yöneticiler arasında kaydırılan
 * bir anahtar (iki yönetici için "Serhan | Kaan"); aktif taraf altın. Düğmede
 * YALNIZ AD yazar, e-posta yazmaz. Seçili tarafa tekrar basmak süzgeci
 * kaldırır. Süzme sunucuda (`?actor=`), yoksa sayfalama yanlış olurdu.
 *
 * Günlük YALNIZ yönetici eylemlerini tutar; kullanıcıların kendi işlemleri
 * (kesim, indirme, ödeme) burada görünmez.
 *
 * Sayfalama Kullanıcılar sekmesiyle aynı dil; backend toplam saymıyor,
 * `has_more` ile "Sonraki" açılıyor.
 */

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  ImageMinus,
  ImagePlus,
  Images,
  ShieldCheck,
  ShieldOff,
  Undo2,
  UserX,
  type LucideIcon,
} from "lucide-react";

import { adminFetch, formatDateTime } from "@/components/admin/admin-client";
import {
  AUDIT_ACTIONS,
  type AdminAuditEntry,
  type AdminAuditPage,
  type AuditAction,
} from "@/lib/admin-api";
import { BACKGROUND_NAMES } from "@/lib/background-names";

const ACTION_META: Record<AuditAction, { label: string; filter: string; icon: LucideIcon }> = {
  credit_grant: { label: "bonus kredi verdi", filter: "Kredi verme", icon: Coins },
  credit_revoke: { label: "bonus krediyi geri aldı", filter: "Kredi geri alma", icon: Undo2 },
  user_delete: { label: "hesap silme başlattı", filter: "Hesap silme", icon: UserX },
  background_create: { label: "zemin yükledi", filter: "Zemin yükleme", icon: ImagePlus },
  background_update: { label: "zemini güncelledi", filter: "Zemin güncelleme", icon: Images },
  background_delete: { label: "zemini sildi", filter: "Zemin silme", icon: ImageMinus },
  admin_add: { label: "yönetici yaptı", filter: "Yönetici ekleme", icon: ShieldCheck },
  admin_remove: { label: "yöneticiliği kaldırdı", filter: "Yönetici kaldırma", icon: ShieldOff },
};

const TIER_LABEL: Record<string, string> = { basic: "Temel", full: "Tüm paketler" };

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

function backgroundName(id: string): string {
  return BACKGROUND_NAMES[id] ?? "Adsız zemin";
}

/** Zemin guncellemesindeki degisiklik: "Paket: Temel → Tüm paketler", "Yayından kaldırıldı". */
function describeUpdate(detail: Record<string, unknown>): string | null {
  const before = (detail.before ?? {}) as Record<string, unknown>;
  const after = (detail.after ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if ("tier" in after) {
    parts.push(`Paket: ${TIER_LABEL[String(before.tier)] ?? before.tier} → ${TIER_LABEL[String(after.tier)] ?? after.tier}`);
  }
  if ("is_active" in after) parts.push(after.is_active ? "Yayına alındı" : "Yayından kaldırıldı");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Eylemin nesnesi ve ayrintisi — yalniz kayitta OLAN bilgi. */
function describe(entry: AdminAuditEntry): { subject: string | null; note: string | null } {
  const detail = entry.detail ?? {};
  switch (entry.action) {
    case "credit_grant":
      return {
        subject: text(detail.amount) ? `${text(detail.amount)} kredi` : null,
        note: text(detail.reason),
      };
    case "credit_revoke":
      return { subject: text(detail.remaining) ? `${text(detail.remaining)} kalan kredi` : null, note: null };
    case "admin_add":
    case "admin_remove":
      return { subject: text(detail.email), note: null };
    case "background_create":
      return {
        subject: backgroundName(entry.subject_id),
        note: text(detail.tier) ? TIER_LABEL[String(detail.tier)] ?? null : null,
      };
    case "background_update":
      return { subject: backgroundName(entry.subject_id), note: describeUpdate(detail) };
    case "background_delete":
      return { subject: backgroundName(entry.subject_id), note: null };
    default:
      return { subject: null, note: null };
  }
}

type Filter = AuditAction | "all";

export function AdminAudit() {
  const [filter, setFilter] = useState<Filter>("all");
  const [actor, setActor] = useState<string | null>(null);
  /** Anahtarin taraflari: ilk yanittan sonra sabit, sayfa/suzgec degisince kaybolmasin. */
  const [admins, setAdmins] = useState<AdminAuditPage["admins"]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: AdminAuditPage }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (filter !== "all") params.set("action", filter);
    if (actor) params.set("actor", actor);
    void adminFetch<AdminAuditPage>(`/api/admin/audit?${params}`).then((result) => {
      if (cancelled) return;
      if (result.ok && Array.isArray(result.data.admins)) setAdmins(result.data.admins);
      setState(result.ok ? { status: "ready", data: result.data } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [page, filter, actor]);

  function chooseActor(id: string) {
    setState({ status: "loading" });
    setPage(1);
    setActor((current) => (current === id ? null : id));
  }

  function choose(next: Filter) {
    if (next === filter) return;
    setState({ status: "loading" });
    setPage(1);
    setFilter(next);
  }

  function goTo(next: number) {
    setState({ status: "loading" });
    setPage(next);
  }

  const items = state.status === "ready" ? state.data.items : [];
  const hasNext = state.status === "ready" && state.data.has_more;

  return (
    <div>
      <p className="on-dark-muted text-center text-xs leading-relaxed">
        Yönetim panelinde yapılan her değişiklik burada kalır. Günlük yalnızca eklemeye açıktır;
        kayıtlar düzenlenemez ya da silinemez.
      </p>

      {admins.length > 1 ? <AdminSwitch admins={admins} active={actor} onChoose={chooseActor} /> : null}

      <div role="group" aria-label="Eylem türü" className="glass-panel mx-auto mt-4 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-3xl p-1">
        {(["all", ...AUDIT_ACTIONS] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => choose(value)}
            className={
              "press min-h-9 rounded-full px-4 text-xs transition-colors duration-200 " +
              (filter === value ? "bg-gold text-[#171614]" : "text-white/65 hover:bg-white/10 hover:text-white")
            }
          >
            {value === "all" ? "Tümü" : ACTION_META[value].filter}
          </button>
        ))}
      </div>

      {state.status === "loading" ? (
        <p className="on-dark-muted mt-10 text-center text-sm" role="status">
          Günlük yükleniyor…
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="mt-10 text-center text-sm text-red-300">
          {state.error}
        </p>
      ) : items.length === 0 ? (
        <p className="on-dark-muted mt-10 text-center text-sm">
          {filter === "all" && !actor ? "Henüz kayıt yok." : "Bu süzgeçte kayıt yok."}
        </p>
      ) : (
        <ol key={filter + page + (actor ?? "")} aria-label="Günlük kayıtları" className="soft-fade mt-6 space-y-2">
          {items.map((entry) => {
            const meta = ACTION_META[entry.action as AuditAction];
            const Icon = meta?.icon ?? Images;
            const { subject, note } = describe(entry);
            const isDestructive = entry.action === "user_delete" || entry.action === "background_delete";
            return (
              <li
                key={entry.id}
                className="glass-panel flex items-start gap-4 rounded-2xl px-5 py-3.5 transition-colors duration-200 hover:bg-white/5"
              >
                <span
                  aria-hidden
                  className={
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full " +
                    (isDestructive ? "bg-red-500/15 text-red-200" : "text-gold bg-white/8")
                  }
                >
                  <Icon className="size-4" strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">
                    <span className="font-medium">
                      {entry.actor_name ?? entry.actor_email ?? "Silinmiş ya da okunamayan hesap"}
                    </span>{" "}
                    <span className="text-white/70">{meta?.label ?? entry.action}</span>
                    {subject ? (
                      <>
                        <span className="text-white/40"> · </span>
                        <span className="font-medium">{subject}</span>
                      </>
                    ) : null}
                  </p>
                  {entry.actor_id ? (
                    <p className="on-dark-muted mt-0.5 break-all text-[0.6875rem]">
                      {entry.actor_email ? `${entry.actor_email} · ` : null}Kimlik: {entry.actor_id}
                    </p>
                  ) : null}
                  {note ? <p className="on-dark-muted mt-0.5 truncate text-xs">{note}</p> : null}
                </div>
                <time dateTime={entry.created_at} className="on-dark-muted shrink-0 pt-0.5 text-xs tabular-nums">
                  {formatDateTime(entry.created_at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}

      <nav aria-label="Sayfalar" className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1 || state.status === "loading"}
          className="press flex min-h-10 items-center gap-1 rounded-full px-4 text-sm text-white/70 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Önceki
        </button>
        <span className="on-dark-muted text-sm tabular-nums">Sayfa {page}</span>
        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={!hasNext}
          className="press flex min-h-10 items-center gap-1 rounded-full px-4 text-sm text-white/70 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35"
        >
          Sonraki
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </nav>
    </div>
  );
}

/**
 * "Admin · Serhan | Kaan" anahtari. Referans: iki konumlu toggle — aktif taraf
 * altin bir "topuzla" dolu, topuz taraflar arasinda KAYAR. Hic taraf secili
 * degilken (tum yoneticiler) topuz yok, iki ad da soluk.
 */
function AdminSwitch({
  admins,
  active,
  onChoose,
}: {
  admins: AdminAuditPage["admins"];
  active: string | null;
  onChoose: (id: string) => void;
}) {
  const index = admins.findIndex((admin) => admin.id === active);
  return (
    <div className="mt-5 flex items-center justify-center gap-3">
      <span className="on-dark-muted text-[0.6875rem] font-medium tracking-[0.12em] uppercase">Admin</span>
      <div
        role="group"
        aria-label="Yöneticiye göre süz"
        className="relative flex rounded-full bg-white/10 p-1 ring-1 ring-white/15"
      >
        {index >= 0 ? (
          <span
            aria-hidden
            className="bg-gold absolute inset-y-1 left-1 rounded-full shadow-[0_6px_16px_-8px_rgb(209_162_91/0.9)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{
              width: `calc((100% - 0.5rem) / ${admins.length})`,
              transform: `translateX(${index * 100}%)`,
            }}
          />
        ) : null}
        {admins.map((admin) => {
          const isActive = admin.id === active;
          return (
            <button
              key={admin.id}
              type="button"
              aria-pressed={isActive}
              title={isActive ? "Tekrar basınca tüm yöneticiler" : undefined}
              onClick={() => onChoose(admin.id)}
              className={
                "press relative z-10 min-h-9 min-w-24 flex-1 rounded-full px-5 text-sm transition-colors duration-300 " +
                (isActive ? "font-medium text-[#171614]" : "text-white/65 hover:text-white")
              }
            >
              {admin.name ?? "Adsız yönetici"}
              <span className="ml-1 text-[0.625rem] opacity-65" aria-label={`Kimlik: ${admin.id}`}>
                · {admin.id.slice(0, 8)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
