/**
 * Gecersiz ya da suresi dolmus e-posta baglantisi.
 *
 * `/auth/callback` dogrulayamadigi her baglantida buraya yonlendiriyor.
 * Ayri bir sayfa (ana sayfaya `?auth=...` parametresi degil): mesaj sunucuda
 * ciziliyor, istemcide URL okuyup durum kurmak gerekmiyor ve adres
 * paylasildiginda ne oldugu belli.
 *
 * Hatanin AYRINTISI yazilmiyor (suresi mi doldu, kod mu yanlis): kullaniciya
 * yapabilecegi tek sey soyleniyor.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Bağlantı geçersiz — Vitrin AI",
  robots: { index: false },
};

export default function AuthErrorPage() {
  return (
    <SiteShell>
      <section className="surface-mist section-rhythm page-top">
        <div className="mx-auto w-full max-w-xl px-5 text-center">
          <h1 className="display-section text-balance">Bağlantı geçersiz</h1>
          <p className="lede on-light-muted mx-auto mt-4 text-pretty">
            Bu bağlantının süresi dolmuş ya da daha önce kullanılmış. Giriş
            yapmayı deneyin; hesabınız henüz doğrulanmadıysa yeniden kayıt
            olarak yeni bir bağlantı isteyebilirsiniz.
          </p>
          <Link
            href="/"
            className="press bg-foreground text-background mt-8 inline-flex min-h-11 items-center rounded-full px-6 text-[0.9375rem] font-medium"
          >
            Ana sayfaya dön
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
