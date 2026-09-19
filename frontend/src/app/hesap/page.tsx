import { BillingPanel } from "@/components/billing-panel";
/**
 * Hesabim sayfasi (Faz 4, kullanici paneli).
 *
 * Ayri bir sayfa (panel degil): hesap silme gibi geri donussuz bir islem
 * paylasilabilir, yer imine eklenebilir ve kendi basligi olan bir yerde durmali;
 * kenar cubugunun altinda kucuk bir dugme olarak durursa yanlislikla basilir.
 *
 * Oturum yoksa panel giris cagrisi gosteriyor. Sayfanin kendisi herkese acik —
 * gosterdigi hicbir veri sunucuda uretilmiyor; yetki kontrolu her islemde
 * Supabase ve backend tarafinda.
 */
import type { Metadata } from "next";

import { AccountPanel } from "@/components/account-panel";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Hesabım — Vitrin AI",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <SiteShell>
      <section className="surface-black section-rhythm page-top relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[30rem]"
          style={{ background: "radial-gradient(50% 65% at 50% 0%, rgba(212,175,110,0.2), transparent 72%)" }}
        />
        <Reveal className="relative mx-auto w-full max-w-6xl px-5">
          <p className="text-gold text-[0.75rem] font-semibold tracking-[0.12em] uppercase">Hesap merkezi</p>
          <h1 className="display-section mt-3 max-w-3xl text-balance">Hesabınız, güvenliğiniz ve ödemeleriniz</h1>
          <p className="lede on-dark-muted mt-5 max-w-2xl text-pretty">
            Profil bilgilerinizi güncelleyin, oturum güvenliğinizi yönetin ve kredi durumunuzu tek yerde takip edin.
          </p>
        </Reveal>
      </section>
      <section className="surface-mist section-rhythm relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(48%_75%_at_50%_0%,rgba(214,167,86,0.13),transparent_76%)]" />
        <div className="relative mx-auto w-full max-w-6xl px-5">
          <Reveal delay={120}>
            <AccountPanel />
            <BillingPanel />
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
