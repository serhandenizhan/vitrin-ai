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
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Hesabım — Vitrin AI",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <SiteShell>
      <section className="surface-mist section-rhythm page-top">
        <div className="mx-auto w-full max-w-xl px-5">
          <h1 className="display-section text-balance">Hesabım</h1>
          <div className="mt-8">
            <AccountPanel />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
