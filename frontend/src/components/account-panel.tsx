"use client";

/**
 * Hesap paneli: bilgiler, parola degistirme, tum cihazlardan cikis, hesap
 * silme (Faz 4).
 *
 * GUVENLIK KARARLARI:
 *  - Parola degistirmek MEVCUT parolayi istiyor. Oturumu acik kalmis bir
 *    bilgisayara oturan biri, eski parolayi bilmeden hesabi ele geciremesin.
 *    Supabase'in "Secure password change" ayari da ayni isi sunucuda yapiyor;
 *    bu kontrol ayar kapali olsa bile gecerli.
 *  - Hesap silme e-posta adresinin elle yazilmasini istiyor: tek tikla geri
 *    donussuz silme olmasin.
 *  - Silme backend'de (gizli anahtar orada); burada yalnizca sonuc bekleniyor.
 */

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import {
  AccountTypePicker,
  Checkbox,
  INPUT_CLASS,
  SelectInput,
  TextInput,
} from "@/components/auth-dialog";
import { PasswordChecklist } from "@/components/password-checklist";
import { useWorkspace, type AuthUser } from "@/components/workspace-provider";
import { authErrorMessage } from "@/lib/auth-errors";
import { passwordProblem } from "@/lib/password-policy";
import {
  BUSINESS_TYPES,
  MAX_BUSINESS_NAME_LENGTH,
  MAX_NAME_LENGTH,
  businessNameProblem,
  formatPhone,
  isAccountType,
  isBusinessType,
  isTurkeyCity,
  nameProblem,
  normalizeName,
  normalizePhone,
  phoneProblem,
} from "@/lib/profile";
import { TURKEY_CITIES_SORTED } from "@/lib/turkey-cities";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function AccountPanel() {
  const { user, isAuthLoaded, openSignIn } = useWorkspace();

  if (!isAuthLoaded) {
    return (
      <div role="status" className="flex justify-center py-10">
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" aria-hidden />
        <span className="sr-only">Yükleniyor</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Card title="Giriş yapmadınız">
        <p className="on-light-muted text-[0.9375rem] leading-relaxed">
          Hesap bilgilerinizi görmek için giriş yapın.
        </p>
        <PrimaryButton onClick={openSignIn} className="mt-5">
          Giriş yap
        </PrimaryButton>
      </Card>
    );
  }

  const email = user.email ?? "";

  return (
    <div className="space-y-5">
      <Card title="Hesap bilgileri">
        <dl className="text-[0.9375rem]">
          <dt className="on-light-muted text-[0.8125rem]">E-posta</dt>
          <dd className="mt-0.5 font-medium break-all">{email}</dd>
        </dl>
      </Card>

      <ProfileCard user={user} />
      <ChangePasswordCard email={email} />
      <SignOutEverywhereCard />
      <DeleteAccountCard email={email} />
    </div>
  );
}

/**
 * Kayitta sorulan bilgilerin duzenlendigi yer: ad, soyad, isletme, sehir,
 * telefon, ticari ileti izni. Faz 4 oncesi acilan hesaplarda bos geliyor;
 * kullanici buradan tamamlayabiliyor.
 *
 * Kullanim kosullari onayi burada DEGISTIRILEMIYOR: kayitta verildi, geri
 * almanin yolu hesabi silmek. Ticari ileti izni ise her an geri alinabilmeli
 * (6563 sayili kanun) — o yuzden burada.
 *
 * Kaydedilince Supabase USER_UPDATED olayi gonderiyor; ust cubuktaki isim
 * kendiliginden guncelleniyor. `updateUser({ data })` yalnizca verilen
 * anahtarlari degistiriyor, onay kaydina dokunmuyor.
 */
function ProfileCard({ user }: { user: AuthUser }) {
  const initial = {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    // Hesap turu eklenmeden once acilan hesaplarda bos: kullanici secsin,
    // yerine karar verilmesin (bkz. lib/profile.ts `displayName`).
    accountType: user.accountType ?? "",
    businessName: user.businessName ?? "",
    businessType: user.businessType ?? "",
    city: user.city ?? "",
    phone: formatPhone(user.phone),
    marketingOptIn: user.marketingOptIn,
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = {
    firstName: useId(),
    lastName: useId(),
    accountType: useId(),
    businessName: useId(),
    businessType: useId(),
    city: useId(),
    phone: useId(),
    marketing: useId(),
  };

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDone(false);
  }

  const isUnchanged = (Object.keys(initial) as (keyof typeof initial)[]).every((key) =>
    typeof initial[key] === "string"
      ? normalizeName(String(form[key])) === initial[key]
      : form[key] === initial[key],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const problem =
      nameProblem("Ad", form.firstName) ??
      nameProblem("Soyad", form.lastName) ??
      (isAccountType(form.accountType) ? null : "Hesap türünü seçin: bireysel ya da şirket.") ??
      (form.accountType === "company"
        ? (businessNameProblem(form.businessName) ??
          (isBusinessType(form.businessType) ? null : "İşletme türünü seçin."))
        : null) ??
      (isTurkeyCity(form.city) ? null : "Şehri seçin.") ??
      phoneProblem(form.phone);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await createClient().auth.updateUser({
        data: {
          first_name: normalizeName(form.firstName),
          last_name: normalizeName(form.lastName),
          account_type: form.accountType,
          // Bireysele gecilince sirket bilgisi silinir; ekranda ve ileride
          // paket seciminde eski sirket adi kalmasin.
          business_name: form.accountType === "company" ? normalizeName(form.businessName) : null,
          business_type: form.accountType === "company" ? form.businessType : null,
          city: form.city,
          phone: form.phone.trim() ? normalizePhone(form.phone) : null,
          marketing_opt_in: form.marketingOptIn,
        },
      });
      if (updateError) {
        setError(authErrorMessage(updateError));
        return;
      }
      setDone(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Profil bilgileri">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            id={ids.firstName}
            label="Ad"
            autoComplete="given-name"
            maxLength={MAX_NAME_LENGTH}
            value={form.firstName}
            onChange={(value) => update("firstName", value)}
          />
          <TextInput
            id={ids.lastName}
            label="Soyad"
            autoComplete="family-name"
            maxLength={MAX_NAME_LENGTH}
            value={form.lastName}
            onChange={(value) => update("lastName", value)}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium">Hesap türü</p>
          <AccountTypePicker
            name={ids.accountType}
            value={form.accountType}
            onChange={(value) => update("accountType", value)}
          />
        </div>

        {form.accountType === "company" ? (
          <div className="soft-fade space-y-3">
            <TextInput
              id={ids.businessName}
              label="Şirket adı"
              autoComplete="organization"
              maxLength={MAX_BUSINESS_NAME_LENGTH}
              value={form.businessName}
              onChange={(value) => update("businessName", value)}
            />
            <SelectInput
              id={ids.businessType}
              label="İşletme türü"
              value={form.businessType}
              onChange={(value) => update("businessType", value)}
              options={BUSINESS_TYPES.map((type) => ({ value: type.id, label: type.label }))}
            />
          </div>
        ) : null}

        <SelectInput
          id={ids.city}
          label="Şehir"
          value={form.city}
          onChange={(value) => update("city", value)}
          options={TURKEY_CITIES_SORTED.map((name) => ({ value: name, label: name }))}
        />
        <TextInput
          id={ids.phone}
          label="Telefon"
          hint="İsteğe bağlı"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="0532 123 45 67"
          value={form.phone}
          onChange={(value) => update("phone", value)}
        />
        <Checkbox
          id={ids.marketing}
          checked={form.marketingOptIn}
          onChange={(value) => update("marketingOptIn", value)}
        >
          <span>Yeni özellikler ve kampanyalar hakkında e-posta almak istiyorum.</span>
        </Checkbox>

        {error ? <ErrorText>{error}</ErrorText> : null}
        {done ? (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.8125rem] text-emerald-800">
            Bilgileriniz kaydedildi.
          </p>
        ) : null}

        <PrimaryButton type="submit" disabled={busy || isUnchanged} busy={busy}>
          Kaydet
        </PrimaryButton>
      </form>
    </Card>
  );
}

function ChangePasswordCard({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = { current: useId(), next: useId(), confirmation: useId(), error: useId() };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setDone(false);

    const problem = passwordProblem(next);
    if (problem) {
      setError(problem);
      return;
    }
    if (next !== confirmation) {
      setError("Yeni parolalar birbiriyle aynı değil.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      // Mevcut parolanin dogrulugu yeniden giris yapilarak kontrol ediliyor;
      // ayni hesap oldugu icin oturum degismiyor, yalnizca yenileniyor.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verifyError) {
        setError(
          verifyError.code === "invalid_credentials"
            ? "Mevcut parolanız hatalı."
            : authErrorMessage(verifyError),
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setError(authErrorMessage(updateError));
        return;
      }
      setCurrent("");
      setNext("");
      setConfirmation("");
      setDone(true);
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Parolayı değiştir">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <Field id={ids.current} label="Mevcut parola">
          <input
            id={ids.current}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            aria-describedby={error ? ids.error : undefined}
            className={INPUT_CLASS}
          />
        </Field>
        <Field id={ids.next} label="Yeni parola">
          <input
            id={ids.next}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            aria-describedby={error ? ids.error : undefined}
            className={INPUT_CLASS}
          />
          <PasswordChecklist password={next} />
        </Field>
        <Field id={ids.confirmation} label="Yeni parola (tekrar)">
          <input
            id={ids.confirmation}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-describedby={error ? ids.error : undefined}
            className={INPUT_CLASS}
          />
        </Field>

        {error ? <ErrorText id={ids.error}>{error}</ErrorText> : null}
        {done ? (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.8125rem] text-emerald-800">
            Parolanız değişti.
          </p>
        ) : null}

        <PrimaryButton type="submit" disabled={busy || !current || !next || !confirmation} busy={busy}>
          Parolayı kaydet
        </PrimaryButton>
      </form>
    </Card>
  );
}

function SignOutEverywhereCard() {
  const { returnToStart } = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      // `global`: bu cihaz dahil TUM oturumlar ve yenileme token'lari
      // iptal ediliyor. Kaybolan bir telefon ya da paylasilan bir bilgisayar icin.
      const { error: signOutError } = await createClient().auth.signOut({ scope: "global" });
      if (signOutError) {
        setError(authErrorMessage(signOutError));
        return;
      }
      returnToStart();
      router.push("/");
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Tüm cihazlardan çıkış">
      <p className="on-light-muted text-[0.875rem] leading-relaxed">
        Bu cihaz dahil, hesabınızın açık olduğu her yerde oturum kapanır.
        Telefonunuzu kaybettiyseniz ya da ortak bir bilgisayarda giriş
        yaptıysanız kullanın.
      </p>
      {error ? <ErrorText className="mt-3">{error}</ErrorText> : null}
      <SecondaryButton onClick={handleClick} disabled={busy} busy={busy} className="mt-4">
        Tüm cihazlardan çıkış yap
      </SecondaryButton>
    </Card>
  );
}

function DeleteAccountCard({ email }: { email: string }) {
  const { returnToStart } = useWorkspace();
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  // Buyuk/kucuk harf ve bosluklar affediliyor; amac dikkat, zorluk degil.
  const matches = typed.trim().toLowerCase() === email.toLowerCase() && email !== "";

  async function handleDelete() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Hesabınız silinemedi.");
        return;
      }
      // Kullanici sunucuda silindi; bu cihazdaki cerezler de temizleniyor.
      await createClient().auth.signOut({ scope: "local" }).catch(() => undefined);
      returnToStart();
      router.push("/");
    } catch {
      setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Hesabı sil" tone="danger">
      <p className="on-light-muted text-[0.875rem] leading-relaxed">
        Hesabınız ve kaydedilmiş bütün çalışmalarınız kalıcı olarak silinir. Bu
        işlem geri alınamaz.
      </p>

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press mt-4 min-h-11 rounded-full px-5 text-[0.9375rem] font-medium text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50"
        >
          Hesabımı silmek istiyorum
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <Field id={inputId} label={`Onaylamak için e-posta adresinizi yazın: ${email}`}>
            <input
              id={inputId}
              type="email"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!matches || busy}
              className="press flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-[0.9375rem] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Hesabımı kalıcı olarak sil
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              className="min-h-11 rounded-full px-5 text-[0.9375rem]"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* --- Kucuk yapi taslari ------------------------------------------------- */

function Card({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1",
        tone === "danger" ? "ring-red-100" : "ring-black/5",
      )}
    >
      <h2 className="mb-3 text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[0.8125rem] font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-muted-foreground mt-1 text-[0.75rem]">{hint}</p> : null}
    </div>
  );
}

function ErrorText({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn("rounded-lg bg-red-50 px-3 py-2 text-[0.8125rem] text-red-700", className)}
    >
      {children}
    </p>
  );
}

function PrimaryButton({
  children,
  busy,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "press bg-foreground text-background flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  busy,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "press flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-medium ring-1 ring-black/15 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
