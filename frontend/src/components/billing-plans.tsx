"use client";

/**
 * Paket kartlari ve satin alma formu.
 *
 * TASARIM: kartlarin gorunumu Faz 2'de kilitlenen tasarim dilinden geliyor
 * (koyu zemin, onerilen planda altin kenar ve "Onerilen" rozeti, altin fiyat
 * satiri). PR #17'nin ilk hali bu sayfayi duz beyaz kartlara indirmisti; burasi
 * o gorunumu geri getiriyor.
 *
 * VERI: sunum metinleri (ozet, madde listesi, hangi planin onerildigi) statik
 * ve `paketler/page.tsx`ten `catalog` ile geliyor — bunlar pazarlama metni,
 * veritabaninda yoklar. FIYAT, KOTA ve satin alinabilirlik ise YALNIZCA
 * backend'den (`GET /api/plans`) geliyor. Yayimlanmamis bir plan "Yakinda"
 * kalir: calisir gibi gorunup hicbir sey yapmayan bir dugme kullaniciya kendi
 * hatasi hissi verir (kok CLAUDE.md ders 8). Depoda uydurma fiyat bulunmaz.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { useWorkspace } from "@/components/workspace-provider";
import { BillingError, billingFetch, money, type Plan, type BillingDocument } from "@/lib/billing";

/** Bir planin sayfada nasil anlatildigi — fiyat ve kota buraya YAZILMAZ. */
export type PlanPresentation = {
  id: string;
  ad: string;
  ozet: string;
  maddeler: string[];
  vurgulu: boolean;
};

export function BillingPlans({ catalog }: { catalog: PlanPresentation[] }) {
  const { user, isAuthLoaded } = useWorkspace();
  if (!isAuthLoaded) return <p className="on-dark-muted">Paketler yükleniyor…</p>;
  return <BillingPlansForUser key={user?.id ?? "anonymous"} catalog={catalog} />;
}

function BillingPlansForUser({ catalog }: { catalog: PlanPresentation[] }) {
  const { user, openSignIn } = useWorkspace();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [pending, setPending] = useState("");
  useEffect(() => { billingFetch<Plan[]>("/api/plans").then(setPlans).catch(error => setError(error.message)); }, []);
  async function choose(plan: Plan) {
    if (!user) { openSignIn(); return; }
    setSelected(plan); setAccepted(false); setKey(crypto.randomUUID()); setError(""); setPending("");
    try { setDocuments(await billingFetch<BillingDocument[]>("/api/billing/documents")); }
    catch { setError("Satış sözleşmeleri yüklenemedi."); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) { openSignIn(); return; } if (!selected || !accepted || busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const result = await billingFetch<{ checkout_url: string }>("/api/subscriptions/checkout", { plan_id: selected.id, expected_plan_version_id: selected.plan_version_id, idempotency_key: key,
        consents: documents.map(({ document_type, document_hash, document_version }) => ({ document_type, document_hash, document_version })),
        customer: { name: form.get("name"), surname: form.get("surname"), gsmNumber: form.get("phone"), identityNumber: form.get("identity"), billingAddress: { address: form.get("address"), contactName: `${form.get("name")} ${form.get("surname")}`, city: form.get("city"), country: "Turkey" } } });
      if (!active.current) return;
      if (!/^\/odeme\/[a-f0-9-]{36}$/.test(result.checkout_url)) throw new Error("Ödeme adresi doğrulanamadı.");
      window.location.assign(result.checkout_url);
    } catch (error) {
      // Aynı anda tek bekleyen satın alma var; kullanıcı 30 dakika boyunca
      // başka plan deneyemiyordu ve arayüz bunu açıklamıyordu. Hata artık
      // devam eden işlemin adresini taşıyor: kullanıcı oraya götürülüyor,
      // orada "bu işlemi iptal et, yeni plan seç" seçeneği var.
      if (error instanceof BillingError && error.checkoutUrl) { setPending(error.checkoutUrl); }
      setError(error instanceof Error ? error.message : "Satın alma başlatılamadı.");
    }
    finally { setBusy(false); }
  }

  const yayimlanan = new Map(plans.map(plan => [plan.id, plan]));
  const ucretliYayimlanmadi = plans.length > 0 && plans.every(plan => plan.price_minor_units === 0);

  return <>
    {error && <p role="alert" className="mx-auto my-8 max-w-2xl rounded-2xl bg-white/[0.05] p-5 text-[0.9375rem] ring-1 ring-white/15">{error}{pending && <> <Link className="underline" href={pending}>Devam eden ödemeye git</Link></>}</p>}

    <div className="mt-16 grid items-stretch gap-5 lg:grid-cols-3 lg:gap-6">
      {catalog.map((sunum, sira) => (
        <Reveal key={sunum.id} delay={sira * 90} className={sunum.vurgulu ? "lg:-my-4" : "lg:my-0"}>
          <PlanCard sunum={sunum} plan={yayimlanan.get(sunum.id)} onChoose={choose} />
        </Reveal>
      ))}
    </div>

    {ucretliYayimlanmadi && (
      <Reveal delay={300}>
        <p className="fine-print on-dark-muted mt-12 text-center">
          Ücretli paketler, fiyatları doğrulandıktan sonra burada yayımlanacak.
        </p>
      </Reveal>
    )}

    {selected && <form onSubmit={submit} className="soft-enter mx-auto mt-16 max-w-xl rounded-[1.6rem] bg-white/[0.035] p-7 ring-1 ring-white/10 sm:p-8">
      <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em]">{selected.name} · Fatura bilgileri</h2>
      <p className="on-dark-muted mt-3 text-[0.9375rem] leading-relaxed">Ödeme için giriş yapmış olmanız gerekir. Kart bilgilerinizi bir sonraki adımda iyzico formuna gireceksiniz. Kimlik ve adres bilgileri ödeme sağlayıcısına iletilir.</p>
      {[["name", "Ad", "text"], ["surname", "Soyad", "text"], ["phone", "Telefon (+905xxxxxxxxx)", "tel"], ["identity", "T.C. kimlik numarası", "text"], ["city", "Şehir", "text"], ["address", "Fatura adresi", "text"]].map(([name, label, type]) => <label className="mt-4 block text-[0.9375rem]" key={name}>{label}<input required name={name} type={type} maxLength={name === "address" ? 500 : 100} className="mt-2 block min-h-12 w-full rounded-xl bg-white/[0.04] px-4 ring-1 ring-white/15 outline-none focus:ring-white/35" /></label>)}
      {documents.map(document => <details key={document.document_type} className="mt-4 rounded-xl p-4 ring-1 ring-white/10"><summary className="cursor-pointer text-[0.9375rem]">{document.document_type === "distance_sales" ? "Mesafeli satış sözleşmesi" : "Ön bilgilendirme formu"}</summary><p className="on-dark-muted mt-3 text-[0.875rem] leading-relaxed whitespace-pre-wrap">{document.text || "Sözleşme henüz yayımlanmadı."}</p><p className="fine-print on-dark-muted mt-2">Sürüm: {document.document_version}</p></details>)}
      <label className="mt-5 flex gap-3 text-[0.9375rem]"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} required className="mt-1 size-4 shrink-0" />Ön bilgilendirme formunu ve mesafeli satış sözleşmesini okudum, kabul ediyorum.</label>
      <p className="fine-print on-dark-muted mt-4">Yeni paket doğrulandığında yeni dönem başlar. Kullanılmayan krediler devretmez; dönemler arasında oranlama yapılmaz.</p>
      <button disabled={busy || !accepted || documents.length !== 2 || documents.some(d => !d.text)} className="press bg-gold hover:bg-gold-soft mt-6 flex min-h-12 w-full items-center justify-center rounded-full px-5 text-[0.9375rem] font-medium text-black transition-colors disabled:opacity-40">{busy ? "Hazırlanıyor…" : "Güvenli ödemeye geç"}</button>
    </form>}
  </>;
}

function PlanCard({ sunum, plan, onChoose }: {
  sunum: PlanPresentation;
  plan: Plan | undefined;
  onChoose: (plan: Plan) => void;
}) {
  const ucretsiz = plan?.price_minor_units === 0;
  return (
    <div
      className={
        "relative flex h-full flex-col rounded-[1.6rem] p-7 sm:p-8 " +
        (sunum.vurgulu
          ? "paket-vurgulu bg-[#15130f] shadow-[0_30px_80px_-30px_rgba(212,175,110,0.45)]"
          : "bg-white/[0.035] ring-1 ring-white/10")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em]">{sunum.ad}</h2>
        {sunum.vurgulu ? (
          <span className="bg-gold rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold text-black">Önerilen</span>
        ) : null}
      </div>

      <p className="fine-print on-dark-muted mt-1">{sunum.ozet}</p>

      <div className="mt-8 border-b border-white/10 pb-7">
        <p className={"text-[2.5rem] leading-none font-semibold tracking-[-0.03em] " + (plan ? "text-gold" : "text-[#f3f0eb]")}>
          {plan ? (ucretsiz ? "Ücretsiz" : money(plan.price_minor_units, plan.currency)) : "Yakında"}
        </p>
        <p className="fine-print on-dark-muted mt-2.5">
          {plan
            ? (ucretsiz ? `Şu anda açık · ayda ${plan.monthly_quota} fotoğraf` : `Aylık · ${plan.monthly_quota} fotoğraf`)
            : "Fiyat belirleniyor"}
        </p>
        {plan && plan.trial_period_days > 0 ? (
          <p className="fine-print on-dark-muted mt-2">İlk aboneliğinizde {plan.trial_period_days} gün deneme.</p>
        ) : null}
      </div>

      <ul className="mt-7 flex-1 space-y-3">
        {sunum.maddeler.map((madde) => (
          <li key={madde} className="flex gap-3 text-[0.9375rem] leading-snug">
            <span className="bg-gold/15 text-gold mt-px flex size-5 shrink-0 items-center justify-center rounded-full">
              <Check className="size-3" strokeWidth={2.75} aria-hidden />
            </span>
            <span className="text-[#f3f0eb]/80">{madde}</span>
          </li>
        ))}
      </ul>

      <div className="mt-9">
        {plan && ucretsiz ? (
          <Link href="/#dene" className="press bg-gold hover:bg-gold-soft flex min-h-12 items-center justify-center rounded-full px-5 text-[0.9375rem] font-medium text-black transition-colors">
            Hemen deneyin
          </Link>
        ) : plan ? (
          <button type="button" onClick={() => onChoose(plan)} className="press bg-gold hover:bg-gold-soft flex min-h-12 w-full items-center justify-center rounded-full px-5 text-[0.9375rem] font-medium text-black transition-colors">
            Paketi seç
          </button>
        ) : (
          // Kapali olan acikca kapali duruyor; calisir gibi gorunen bir dugme
          // kullaniciya kendi hatasi hissi verirdi (kok CLAUDE.md ders 8).
          <span className={"flex min-h-12 items-center justify-center rounded-full text-[0.9375rem] " + (sunum.vurgulu ? "bg-white/[0.06] text-[#f3f0eb]/70 ring-1 ring-white/15" : "text-[#f3f0eb]/55 ring-1 ring-white/12")}>
            Yakında açılacak
          </span>
        )}
      </div>
    </div>
  );
}
