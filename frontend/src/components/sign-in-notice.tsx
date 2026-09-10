"use client";

/**
 * "Giris yap" penceresi — hesap sistemi henuz yok.
 *
 * Neden calismayan bir dugme yerine bu: menude giris yeri OLMASI tasarimi
 * tamamlanmis gosteriyor, ama tiklayinca hicbir sey olmamasi ya da sahte bir
 * form acilmasi kullaniciya yalan soylemek olurdu. Pencere ne olacagini ve
 * su anda kayit gerekmedigini acikca yaziyor.
 *
 * Faz 4'te Supabase Auth geldiginde bu bilesen gercek giris/kayit formuyla
 * degistirilecek; menudeki dugme ve cagri noktasi aynen kalacak.
 */

import { useEffect } from "react";
import { KeyRound, X } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";

export function SignInNotice() {
  const { isSignInOpen, closeSignIn } = useWorkspace();

  // Esc ile kapansin.
  useEffect(() => {
    if (!isSignInOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSignIn();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSignInOpen, closeSignIn]);

  if (!isSignInOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Kapat"
        onClick={closeSignIn}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="giris-baslik"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={closeSignIn}
          aria-label="Kapat"
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3 right-3 flex size-9 items-center justify-center rounded-full transition-colors"
        >
          <X className="size-4" aria-hidden />
        </button>

        <span className="bg-gold/15 text-gold flex size-11 items-center justify-center rounded-full">
          <KeyRound className="size-5" strokeWidth={1.75} aria-hidden />
        </span>

        <h2
          id="giris-baslik"
          className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]"
        >
          Hesap sistemi yakında
        </h2>

        <p className="text-muted-foreground mt-2 text-[0.875rem] leading-relaxed">
          Giriş, kayıt ve hesabınıza bağlı proje geçmişi bir sonraki aşamada
          geliyor. <strong className="text-foreground font-medium">Şu anda
          kayıt gerekmiyor</strong> — fotoğrafınızı yükleyip sonucu hemen
          indirebilirsiniz.
        </p>

        <p className="text-muted-foreground mt-3 text-[0.8125rem] leading-relaxed">
          Çalışmalarınız o zamana kadar yalnızca bu cihazda saklanıyor; hesap
          sistemi geldiğinde hesabınıza taşınacak.
        </p>

        <button
          type="button"
          onClick={closeSignIn}
          className="press bg-foreground text-background mt-6 flex min-h-11 w-full items-center justify-center rounded-full text-[0.9375rem] font-medium"
        >
          Anladım
        </button>
      </div>
    </div>
  );
}
