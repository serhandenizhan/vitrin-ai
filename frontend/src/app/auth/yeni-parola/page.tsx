/**
 * Parola sifirlama baglantisinin actigi sayfa: yeni parola belirleme.
 *
 * Akis: "Parolami unuttum" -> e-posta -> `/auth/callback` baglantidaki kodu
 * oturuma ceviriyor -> buraya yonlendiriyor. Yani bu sayfaya gelen kullanicinin
 * (baglanti gecerliyse) bir oturumu var ve `updateUser` ile parolasini
 * degistirebiliyor. Oturum yoksa form bunu soyluyor.
 *
 * Arama motorlarina kapali: paylasilacak ya da bulunacak bir icerik yok.
 */
import type { Metadata } from "next";

import { NewPasswordForm } from "@/components/new-password-form";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Yeni parola — Vitrin AI",
  robots: { index: false },
};

export default function NewPasswordPage() {
  return (
    <SiteShell>
      <section className="surface-mist section-rhythm page-top">
        <div className="mx-auto w-full max-w-sm px-5">
          <NewPasswordForm />
        </div>
      </section>
    </SiteShell>
  );
}
