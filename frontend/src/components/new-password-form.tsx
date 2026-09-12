"use client";

/**
 * Yeni parola formu (`/auth/yeni-parola`).
 *
 * Oturum durumu `useWorkspace`ten okunuyor: sifirlama baglantisi oturumu
 * `/auth/callback`te acti, saglayici bunu INITIAL_SESSION ile gordu. Oturum
 * yoksa (baglanti gecersiz ya da sayfa dogrudan acildi) form hic cizilmiyor;
 * `updateUser` zaten reddederdi ama kullaniciya once bos bir form gosterip
 * sonra hata vermek gereksiz bir adim olurdu.
 *
 * Parola iki kez isteniyor: bu formda tarayicinin kayitli parolasi yok,
 * yanlis yazilan tek alanli bir parola hesabi kullanilamaz birakir.
 *
 * Basarida DIGER cihazlardaki oturumlar kapatiliyor (`scope: "others"`):
 * parola, biri hesaba izinsiz girdigi icin sifirlaniyor olabilir.
 */

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheck, KeyRound, LoaderCircle } from "lucide-react";

import { INPUT_CLASS } from "@/components/auth-dialog";
import { PasswordChecklist } from "@/components/password-checklist";
import { passwordProblem } from "@/lib/password-policy";
import { useWorkspace } from "@/components/workspace-provider";
import { authErrorMessage, MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export function NewPasswordForm() {
  const { user, isAuthLoaded, openSignIn } = useWorkspace();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isDone, setDone] = useState(false);
  const passwordId = useId();
  const confirmationId = useId();
  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirmation) {
      setError("Parolalar birbiriyle aynı değil.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(authErrorMessage(updateError));
        return;
      }
      // Basarisiz olursa parola yine degisti; kullaniciyi bununla
      // bekletmiyoruz.
      await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
      setDone(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthLoaded) {
    return (
      <div role="status" className="flex justify-center py-10">
        <LoaderCircle
          className="text-muted-foreground size-6 animate-spin"
          aria-hidden
        />
        <span className="sr-only">Yükleniyor</span>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="text-center">
        <CircleCheck
          className="text-gold mx-auto size-10"
          strokeWidth={1.5}
          aria-hidden
        />
        <h1 className="display-feature mt-4">Parolanız değişti</h1>
        <p className="on-light-muted mt-3 text-[0.9375rem] leading-relaxed">
          Bu cihazda giriş yapmış durumdasınız. Diğer cihazlardaki oturumlar
          kapatıldı.
        </p>
        <Link
          href="/"
          className="press bg-foreground text-background mt-7 inline-flex min-h-11 items-center rounded-full px-6 text-[0.9375rem] font-medium"
        >
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center">
        <h1 className="display-feature">Bağlantı geçersiz</h1>
        <p className="on-light-muted mt-3 text-[0.9375rem] leading-relaxed">
          Parola sıfırlama bağlantısının süresi dolmuş ya da daha önce
          kullanılmış. Yeni bir bağlantı isteyin.
        </p>
        <button
          type="button"
          onClick={openSignIn}
          className="press bg-foreground text-background mt-7 inline-flex min-h-11 items-center rounded-full px-6 text-[0.9375rem] font-medium"
        >
          Yeni bağlantı iste
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_24px_50px_-22px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
      <span className="bg-gold/15 text-gold flex size-11 items-center justify-center rounded-full">
        <KeyRound className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">
        Yeni parola belirleyin
      </h1>
      <p className="text-muted-foreground mt-1.5 text-[0.875rem] leading-relaxed">
        {user.email ? (
          <>
            <strong className="text-foreground font-medium">{user.email}</strong>{" "}
            hesabı için.
          </>
        ) : null}
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-3">
        {/* Parola yoneticisi hangi hesaba ait oldugunu bilsin diye gizli
            kullanici adi alani (tarayici onerisi). */}
        <input
          type="email"
          autoComplete="username"
          value={user.email ?? ""}
          readOnly
          hidden
        />
        <div>
          <label htmlFor={passwordId} className="text-[0.8125rem] font-medium">
            Yeni parola
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={INPUT_CLASS}
          />
          <PasswordChecklist password={password} />
        </div>
        <div>
          <label
            htmlFor={confirmationId}
            className="text-[0.8125rem] font-medium"
          >
            Yeni parola (tekrar)
          </label>
          <input
            id={confirmationId}
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={INPUT_CLASS}
          />
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-[0.8125rem] text-red-700"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || !password || !confirmation}
          className="press bg-foreground text-background flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-[0.9375rem] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : null}
          Parolayı kaydet
        </button>
      </form>
    </div>
  );
}
