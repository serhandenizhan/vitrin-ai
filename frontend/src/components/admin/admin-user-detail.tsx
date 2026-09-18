"use client";

/**
 * Yönetim paneli — tek kullanıcı: özet, bonus kredi verme/geri alma, hesap silme.
 *
 * Üç ürün kuralı (kök CLAUDE.md, "Admin paneli (Faz 6)"):
 * - Bonus kredi dönem kotasını BÜYÜTMEZ; ayrı kovada durur, kota bitince harcanır.
 * - Kredi formu İŞİ tanımlayan bir idempotency anahtarı taşır: form açıkken
 *   anahtar sabit, ağda kaybolan bir yanıt yüzünden ikinci basış ikinci krediyi
 *   açmaz. Anahtar YALNIZCA başarıdan sonra yenilenir (ders 23'ün "bayrağı temizleyen
 *   yol aynı commit'te" kuralı).
 * - Yönetici hesabı panelden silinmez (backend 409 `admin_target`); arayüz de
 *   düğmeyi hiç sunmuyor ama asıl kontrol backend'de.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Gift, ShieldCheck, Trash2, Undo2 } from "lucide-react";

import {
  adminFetch,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  subscriptionLabel,
} from "@/components/admin/admin-client";
import {
  CREDIT_AMOUNT_MAX,
  CREDIT_REASON_MAX,
  CREDIT_REASON_MIN,
  type AdminUserDetail as Detail,
  type CreditGrant,
} from "@/lib/admin-api";

export function AdminUserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: string } | { status: "ready"; detail: Detail }
  >({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void adminFetch<Detail>(`/api/admin/users/${userId}`).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", detail: result.data } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return (
    <div className="soft-enter">
      <button
        type="button"
        onClick={onBack}
        className="press on-dark-muted mb-5 flex min-h-9 items-center gap-2 rounded-full pr-3 text-sm hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Kullanıcılar
      </button>

      {state.status === "loading" ? (
        <p className="on-dark-muted text-sm" role="status">
          Kullanıcı yükleniyor…
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      ) : (
        <DetailBody detail={state.detail} userId={userId} onChanged={reload} onDeleted={onBack} />
      )}
    </div>
  );
}

function DetailBody({
  detail,
  userId,
  onChanged,
  onDeleted,
}: {
  detail: Detail;
  userId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const billing = detail.billing;
  const remaining =
    billing && billing.quota_snapshot !== null && billing.used_this_period !== null
      ? billing.quota_snapshot - billing.used_this_period
      : null;

  return (
    <div className="space-y-5">
      <section className="glass-panel rounded-3xl p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-xl font-semibold">{detail.account.email ?? "(e-posta yok)"}</h2>
          {billing?.is_admin ? (
            <span className="text-gold flex items-center gap-1 text-xs font-medium">
              <ShieldCheck className="size-4" aria-hidden />
              Yönetici
            </span>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Abonelik" value={subscriptionLabel(billing?.status)} />
          <Field label="Plan" value={billing?.plan_id ?? "—"} />
          <Field
            label="Dönem kalan"
            value={remaining === null ? "Dönem yok" : `${formatNumber(remaining)} / ${formatNumber(billing!.quota_snapshot!)}`}
          />
          <Field label="Bonus kredi" value={formatNumber(billing?.bonus_available ?? 0)} />
          <Field label="Dönem bitişi" value={formatDate(billing?.period_ends_at)} />
          <Field label="Çalışma sayısı" value={formatNumber(billing?.project_count ?? 0)} />
          <Field label="Kayıt" value={formatDateTime(detail.account.created_at)} />
          <Field label="Son giriş" value={formatDateTime(detail.account.last_sign_in_at)} />
          <Field label="Son kullanım" value={formatDateTime(billing?.last_usage_at)} />
          <Field
            label="E-posta doğrulandı"
            value={detail.account.email_confirmed_at ? formatDate(detail.account.email_confirmed_at) : "Hayır"}
          />
          {billing?.deletion_requested_at ? (
            <Field label="Silme istendi" value={formatDateTime(billing.deletion_requested_at)} />
          ) : null}
        </dl>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <CreditGrantForm userId={userId} disabled={!billing} onGranted={onChanged} />
        <GrantList grants={detail.credit_grants} onRevoked={onChanged} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListCard title="Son ödemeler" empty={detail.transactions.length === 0}>
          {detail.transactions.map((row) => (
            <Line
              key={row.id}
              left={`${formatDate(row.created_at)} · ${row.type} · ${row.status}`}
              right={formatMoney(row.amount_minor_units, row.currency)}
            />
          ))}
        </ListCard>
        <ListCard title="Dönemler" empty={detail.periods.length === 0}>
          {detail.periods.map((row) => (
            <Line
              key={row.id}
              left={`${formatDate(row.starts_at)} – ${formatDate(row.ends_at)} · ${row.plan_id} · ${row.status}`}
              right={`${formatNumber(row.used_this_period)} / ${formatNumber(row.quota_snapshot)}`}
            />
          ))}
        </ListCard>
        <ListCard title="Yasal onaylar" empty={detail.consents.length === 0}>
          {detail.consents.map((row) => (
            <Line
              key={`${row.document_type}-${row.recorded_at}`}
              left={`${row.document_type} · ${row.document_version}`}
              right={formatDate(row.recorded_at)}
            />
          ))}
        </ListCard>
        <ListCard title="Bekleyen sağlayıcı işleri" empty={detail.open_actions.length === 0}>
          {detail.open_actions.map((row) => (
            <Line
              key={row.id}
              left={`${row.kind} · ${row.status} · ${row.attempts} deneme`}
              right={formatDate(row.created_at)}
            />
          ))}
        </ListCard>
      </div>

      {billing?.is_admin ? (
        <p className="on-dark-muted text-sm">
          Yönetici hesapları panelden silinemez; önce yönetici yetkisi kaldırılmalı.
        </p>
      ) : (
        <DeleteAccount
          userId={userId}
          email={detail.account.email}
          alreadyRequested={Boolean(billing?.deletion_requested_at)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function newKey(): string {
  return crypto.randomUUID();
}

function CreditGrantForm({
  userId,
  disabled,
  onGranted,
}: {
  userId: string;
  disabled: boolean;
  onGranted: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1 || value > CREDIT_AMOUNT_MAX) {
      setMessage({ kind: "error", text: `Kredi 1-${formatNumber(CREDIT_AMOUNT_MAX)} arasında bir tam sayı olmalı.` });
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length < CREDIT_REASON_MIN) {
      setMessage({ kind: "error", text: `Gerekçe en az ${CREDIT_REASON_MIN} karakter olmalı.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await adminFetch(`/api/admin/users/${userId}/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: value,
        reason: trimmed,
        idempotencyKey: key,
        // Gun sonu, kullanicinin YEREL saatiyle; vekil ISO'ya (saat dilimli) ceviriyor.
        expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : undefined,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      // Anahtar KORUNUR: ayni is tekrar denendiginde ikinci kredi acilmasin.
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setAmount("");
    setReason("");
    setExpiresOn("");
    setKey(newKey());
    setMessage({ kind: "ok", text: `${formatNumber(value)} bonus kredi verildi.` });
    onGranted();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="glass-panel rounded-3xl p-6">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Gift className="text-gold size-4" aria-hidden />
        Bonus kredi ver
      </h3>
      <p className="on-dark-muted mt-1 text-xs leading-relaxed">
        Dönem kotasını büyütmez; kota bitince harcanır. Kapalı bir aboneliği yeniden açmaz.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Kredi
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={CREDIT_AMOUNT_MAX}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1.5 min-h-10 w-full rounded-full bg-white/8 px-4 text-white ring-1 ring-white/15 outline-none focus:ring-[#d6a756]"
          />
        </label>
        <label className="text-sm">
          Son kullanma <span className="text-white/40">(isteğe bağlı)</span>
          <input
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            className="mt-1.5 min-h-10 w-full rounded-full bg-white/8 px-4 text-white ring-1 ring-white/15 outline-none focus:ring-[#d6a756]"
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        Gerekçe
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={CREDIT_REASON_MAX}
          placeholder="Örn. yaşanan kesinti için telafi"
          className="mt-1.5 min-h-10 w-full rounded-full bg-white/8 px-4 text-white ring-1 ring-white/15 outline-none placeholder:text-white/35 focus:ring-[#d6a756]"
        />
      </label>
      <button
        type="submit"
        disabled={busy || disabled}
        className="press bg-gold mt-4 min-h-10 rounded-full px-5 text-sm font-medium text-black disabled:opacity-45"
      >
        {busy ? "Veriliyor…" : "Kredi ver"}
      </button>
      {disabled ? <p className="on-dark-muted mt-2 text-xs">Bu hesabın aboneliği yok; kredi verilemez.</p> : null}
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={"mt-3 text-sm " + (message.kind === "error" ? "text-red-300" : "text-emerald-300")}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

function GrantList({ grants, onRevoked }: { grants: CreditGrant[]; onRevoked: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // "Suresi doldu mu" icin an, liste acilirken bir kez aliniyor: render
  // icinde `Date.now()` her cizimde farkli sonuc verir (saf olmayan render).
  const [now] = useState(() => Date.now());

  async function revoke(grant: CreditGrant) {
    if (!window.confirm(`Kullanılmamış ${grant.amount - grant.used} kredi geri alınsın mı?`)) return;
    setBusyId(grant.id);
    setError("");
    const result = await adminFetch(`/api/admin/credits/${grant.id}/revoke`, { method: "POST" });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onRevoked();
  }

  return (
    <ListCard title="Verilen bonus krediler" empty={grants.length === 0}>
      {grants.map((grant) => {
        const expired = grant.expires_at !== null && new Date(grant.expires_at).getTime() < now;
        const open = !grant.revoked_at && !expired && grant.used < grant.amount;
        return (
          <div key={grant.id} className="flex items-center justify-between gap-3 py-1 text-sm">
            <div className="min-w-0">
              <p className="truncate">
                {formatNumber(grant.amount)} kredi · {formatNumber(grant.used)} kullanıldı
              </p>
              <p className="on-dark-muted truncate text-xs">
                {formatDate(grant.created_at)} · {grant.reason}
                {grant.revoked_at ? " · geri alındı" : expired ? " · süresi doldu" : ""}
                {grant.expires_at && !grant.revoked_at && !expired ? ` · ${formatDate(grant.expires_at)} bitiş` : ""}
              </p>
            </div>
            {open ? (
              <button
                type="button"
                onClick={() => void revoke(grant)}
                disabled={busyId === grant.id}
                className="press flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs text-white/70 ring-1 ring-white/15 hover:text-white disabled:opacity-45"
              >
                <Undo2 className="size-3.5" aria-hidden />
                Geri al
              </button>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </ListCard>
  );
}

function DeleteAccount({
  userId,
  email,
  alreadyRequested,
  onDeleted,
}: {
  userId: string;
  email: string | null;
  alreadyRequested: boolean;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = Boolean(email) && typed.trim().toLocaleLowerCase("tr") === email!.toLocaleLowerCase("tr");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError("");
    const result = await adminFetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: typed.trim() }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  if (alreadyRequested) {
    return (
      <p className="on-dark-muted text-sm">
        Bu hesap için silme zaten istendi; işlem sırada.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-3xl p-6 ring-1 ring-red-400/30">
      <h3 className="flex items-center gap-2 text-sm font-medium text-red-300">
        <Trash2 className="size-4" aria-hidden />
        Hesabı sil
      </h3>
      <p className="on-dark-muted mt-1 text-xs leading-relaxed">
        Geri alınamaz. Kullanıcının kendi silme akışıyla aynı kuyruğa girer: aktif
        abonelik iptal edilir, görseller ve hesap silinir. Onaylamak için
        kullanıcının e-posta adresini yazın.
      </p>
      <label className="mt-4 block text-sm">
        <span className="sr-only">Kullanıcının e-posta adresi</span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={email ?? ""}
          autoComplete="off"
          className="min-h-10 w-full rounded-full bg-white/8 px-4 text-white ring-1 ring-white/15 outline-none placeholder:text-white/30 focus:ring-red-400"
        />
      </label>
      <button
        type="submit"
        disabled={!matches || busy}
        className="press mt-4 min-h-10 rounded-full bg-red-500/85 px-5 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "Siliniyor…" : "Hesabı sil"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="on-dark-muted text-xs">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="glass-panel rounded-3xl p-6">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {empty ? <p className="on-dark-muted text-sm">Kayıt yok.</p> : <div className="space-y-1.5">{children}</div>}
    </section>
  );
}

function Line({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="on-dark-muted min-w-0 truncate">{left}</span>
      <span className="shrink-0 tabular-nums">{right}</span>
    </div>
  );
}
