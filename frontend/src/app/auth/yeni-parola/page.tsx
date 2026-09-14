/**
 * Parola sifirlama baglantisinin actigi sayfa: yeni parola belirleme.
 *
 * Akis: "Parolami unuttum" -> e-posta -> `/auth/callback` baglantidaki kodu
 * oturuma ceviriyor, kisa omurlu sifirlama cerezini yaziyor -> buraya
 * yonlendiriyor.
 *
 * Form yalnizca o cerez varken gosteriliyor: yalnizca oturuma bakilsaydi,
 * oturumu acik bir bilgisayarda adresi elle yazan biri mevcut parolayi
 * bilmeden parolayi degistirebilirdi (bkz. lib/password-recovery.ts). Oturumu
 * olan ama baglantidan gelmeyen kullanici hesap sayfasina yonlendiriliyor.
 *
 * Arama motorlarina kapali: paylasilacak ya da bulunacak bir icerik yok.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { NewPasswordForm } from "@/components/new-password-form";
import { SiteShell } from "@/components/site-shell";
import { RECOVERY_COOKIE } from "@/lib/password-recovery";

export const metadata: Metadata = {
  title: "Yeni parola — Vitrin AI",
  robots: { index: false },
};

export default async function NewPasswordPage() {
  const cookieStore = await cookies();
  const cameFromResetLink = cookieStore.get(RECOVERY_COOKIE)?.value === "1";

  return (
    <SiteShell>
      <section className="surface-mist section-rhythm page-top">
        <div className="mx-auto w-full max-w-sm px-5">
          <NewPasswordForm cameFromResetLink={cameFromResetLink} />
        </div>
      </section>
    </SiteShell>
  );
}
