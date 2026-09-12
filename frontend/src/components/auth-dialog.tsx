"use client";

/**
 * Giris, kayit ve "parolami unuttum" penceresi (Faz 4, Supabase Auth).
 *
 * Faz 2'deki "Hesap sistemi yakinda" penceresinin yerini aldi; ust cubuktaki
 * ve sol paneldeki cagri noktalari (`openSignIn`) aynen kaldi. Pencere
 * `openSignIn("signup")` ile dogrudan kayit ekraninda da acilabiliyor.
 *
 * KAYIT IKI ADIM (kullanici istegi 13.09.2026: "bir uygulamaya giris yaparken
 * gereken tum sorular, bizimkilere uygun"):
 *  1. Hesap: ad, soyad, e-posta, parola, parola tekrar.
 *  2. Isletme: isletme adi, turu, sehir, telefon (istege bagli), kullanim
 *     kosullari + KVKK onayi (zorunlu), ticari ileti izni (istege bagli, AYRI).
 * Neyin neden soruldugu ve SORULMADIGI: lib/profile.ts. Tek uzun form yerine
 * iki adim: pencere telefonda ekrani asmasin, kullanici once hesabini sonra
 * isletmesini dusunsun.
 *
 * PAROLA: en az 8 karakter, buyuk harf, kucuk harf ve rakam (bkz.
 * lib/password-policy.ts). Kurallar yazarken canli gosteriliyor; asil sinir
 * Supabase'in parola ayari.
 *
 * GUVENLIK KARARLARI (kullanici numaralandirmasi, ROADMAP Faz 4):
 *  - Hata mesajlari `auth-errors.ts`ten: yanlis parola ile kayitsiz e-posta
 *    ayni mesaji veriyor.
 *  - Kayitta "bu e-posta zaten kayitli" DENMIYOR; kayitli bir adresle de
 *    "e-postanizi kontrol edin" ekrani cikiyor.
 *  - Parola sifirlamada da ayni ilke.
 *
 * E-posta baglantilari `/auth/callback`e donuyor; orada `next` parametresi
 * acik yonlendirmeye karsi temizleniyor.
 */

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, KeyRound, LoaderCircle, MailCheck, X } from "lucide-react";

import { PasswordChecklist } from "@/components/password-checklist";
import {
  useWorkspace,
  WELCOME_QUERY_PARAM,
  type AuthMode,
} from "@/components/workspace-provider";
import { authErrorMessage } from "@/lib/auth-errors";
import { passwordProblem } from "@/lib/password-policy";
import {
  ACCOUNT_TYPES,
  BUSINESS_TYPES,
  MAX_BUSINESS_NAME_LENGTH,
  isAccountType,
  MAX_NAME_LENGTH,
  TERMS_VERSION,
  businessNameProblem,
  isBusinessType,
  isTurkeyCity,
  nameProblem,
  normalizeName,
  normalizePhone,
  phoneProblem,
} from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { TURKEY_CITIES_SORTED } from "@/lib/turkey-cities";
import { cn } from "@/lib/utils";

/** Sifirlama baglantisinin acacagi sayfa. */
export const NEW_PASSWORD_PATH = "/auth/yeni-parola";

const TITLES: Record<AuthMode, string> = {
  signin: "Giriş yapın",
  signup: "Hesap oluşturun",
  forgot: "Parolanızı sıfırlayın",
};

const DESCRIPTIONS: Record<AuthMode, string> = {
  signin: "Hesabınızla giriş yaparak çalışmalarınıza ulaşın.",
  signup: "Ücretsiz. Çalışmalarınız hesabınızda saklanır, her cihazdan ulaşırsınız.",
  forgot:
    "Hesabınızın e-posta adresini yazın, yeni parola belirlemeniz için bir bağlantı gönderelim.",
};

type SignupStep = 1 | 2;

export function AuthDialog() {
  const { isSignInOpen, closeSignIn, isAuthConfigured, signInMode } = useWorkspace();

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
    <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto p-5">
      <button
        type="button"
        aria-label="Kapat"
        onClick={closeSignIn}
        className="soft-fade fixed inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="giris-baslik"
        className="soft-enter relative my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={closeSignIn}
          aria-label="Kapat"
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3 right-3 flex size-9 items-center justify-center rounded-full transition-colors"
        >
          <X className="size-4" aria-hidden />
        </button>

        {/* Form ayri bir bilesen: pencere her acildiginda (bilesen yeniden
            baglandigi icin) alanlar ve hata mesaji temiz basliyor. */}
        {isAuthConfigured ? (
          <AuthForm initialMode={signInMode} onDone={closeSignIn} />
        ) : (
          <NotConfigured />
        )}
      </div>
    </div>
  );
}

function AuthForm({ initialMode, onDone }: { initialMode: AuthMode; onDone: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<SignupStep>(1);

  // 1. adim
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  // 2. adim
  const [accountType, setAccountType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const ids = {
    firstName: useId(),
    lastName: useId(),
    email: useId(),
    password: useId(),
    passwordAgain: useId(),
    rules: useId(),
    accountType: useId(),
    businessName: useId(),
    businessType: useId(),
    city: useId(),
    phone: useId(),
    terms: useId(),
    marketing: useId(),
    error: useId(),
  };

  const isSignUp = mode === "signup";

  function switchMode(next: AuthMode) {
    setMode(next);
    setStep(1);
    setError(null);
  }

  /** 1. adimin kontrolleri; sorun yoksa null. */
  function accountStepProblem(): string | null {
    if (nameProblem("Ad", firstName)) return nameProblem("Ad", firstName);
    if (nameProblem("Soyad", lastName)) return nameProblem("Soyad", lastName);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Geçerli bir e-posta adresi yazın.";
    const weak = passwordProblem(password);
    if (weak) return weak;
    if (password !== passwordAgain) return "Parolalar birbiriyle aynı değil.";
    return null;
  }

  /** 2. adimin kontrolleri; sorun yoksa null. */
  function businessStepProblem(): string | null {
    if (!isAccountType(accountType)) return "Hesap türünü seçin: bireysel ya da şirket.";
    if (accountType === "company") {
      const nameIssue = businessNameProblem(businessName);
      if (nameIssue) return nameIssue;
      if (!isBusinessType(businessType)) return "İşletme türünü seçin.";
    }
    if (!isTurkeyCity(city)) return "Şehri seçin.";
    const phoneIssue = phoneProblem(phone);
    if (phoneIssue) return phoneIssue;
    if (!acceptsTerms) return "Devam etmek için kullanım koşullarını ve KVKK metnini onaylayın.";
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    if (isSignUp && step === 1) {
      const problem = accountStepProblem();
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setStep(2);
      return;
    }
    if (isSignUp) {
      const problem = accountStepProblem() ?? businessStepProblem();
      if (problem) {
        setError(problem);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const trimmedEmail = email.trim();
    const callbackUrl = `${window.location.origin}/auth/callback`;

    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${callbackUrl}?next=${encodeURIComponent(NEW_PASSWORD_PATH)}`,
        });
        // Adresin kayitli olup olmadigi hicbir durumda belli edilmiyor.
        if (resetError && resetError.code !== "user_not_found") {
          setError(authErrorMessage(resetError));
          return;
        }
        setSentTo(trimmedEmail);
        return;
      }

      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            // Dogrulama baglantisindan donunce "Hos geldiniz" gosterilsin.
            emailRedirectTo: `${callbackUrl}?next=${encodeURIComponent(`/?${WELCOME_QUERY_PARAM}`)}`,
            data: {
              first_name: normalizeName(firstName),
              last_name: normalizeName(lastName),
              account_type: accountType,
              // Bireysel hesapta sirket alanlari hic yazilmiyor: once sirket
              // secilip bilgi girilip sonra bireysele donulduyse kalmasin.
              business_name: accountType === "company" ? normalizeName(businessName) : null,
              business_type: accountType === "company" ? businessType : null,
              city,
              phone: phone.trim() ? normalizePhone(phone) : null,
              marketing_opt_in: marketingOptIn,
              // Kolaylik kaydi; hukuki ispat icin degistirilemez bir tablo
              // gerekiyor (bkz. lib/profile.ts "HUKUK SINIRI").
              terms_accepted_at: new Date().toISOString(),
              terms_version: TERMS_VERSION,
            },
          },
        });
        if (
          signUpError &&
          signUpError.code !== "user_already_exists" &&
          signUpError.code !== "email_exists"
        ) {
          setError(authErrorMessage(signUpError));
          // Parola kurali gibi 1. adima ait bir hataysa oraya donulsun.
          if (signUpError.code === "weak_password" || signUpError.code === "email_address_invalid") {
            setStep(1);
          }
          return;
        }
        setSentTo(trimmedEmail);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (signInError) {
        setError(authErrorMessage(signInError));
        return;
      }
      onDone();
    } catch {
      // Ag hatasi (Supabase'e ulasilamadi).
      setError(authErrorMessage(null));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <>
        <span className="bg-gold/15 text-gold flex size-11 items-center justify-center rounded-full">
          <MailCheck className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <h2 id="giris-baslik" className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">
          E-postanızı kontrol edin
        </h2>
        {mode === "forgot" ? (
          <p className="text-muted-foreground mt-2 text-[0.875rem] leading-relaxed">
            <strong className="text-foreground font-medium">{sentTo}</strong> adresine kayıtlı bir
            hesap varsa, yeni parola belirlemeniz için bir bağlantı gönderdik. Bağlantı kısa bir süre
            geçerli ve bir kez kullanılabilir.
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-[0.875rem] leading-relaxed">
            <strong className="text-foreground font-medium">{sentTo}</strong> adresine bir doğrulama
            bağlantısı gönderdik. Bağlantıya tıkladığınızda hesabınız açılır ve giriş yapmış
            olursunuz.
          </p>
        )}
        <p className="text-muted-foreground mt-3 text-[0.8125rem] leading-relaxed">
          E-posta birkaç dakika içinde gelmezse gereksiz klasörüne bakın.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="press bg-foreground text-background mt-6 flex min-h-11 w-full items-center justify-center rounded-full text-[0.9375rem] font-medium"
        >
          Tamam
        </button>
      </>
    );
  }

  const submitLabel = isSignUp
    ? step === 1
      ? "Devam et"
      : "Hesap oluştur"
    : mode === "forgot"
      ? "Bağlantı gönder"
      : "Giriş yap";

  const canSubmit = (() => {
    if (isSubmitting) return false;
    if (mode === "forgot") return Boolean(email.trim());
    if (mode === "signin") return Boolean(email.trim() && password);
    if (step === 1) {
      return Boolean(firstName.trim() && lastName.trim() && email.trim() && password && passwordAgain);
    }
    const companyReady = accountType !== "company" || Boolean(businessName.trim() && businessType);
    return Boolean(isAccountType(accountType) && companyReady && city && acceptsTerms);
  })();

  return (
    <>
      <span className="bg-gold/15 text-gold flex size-11 items-center justify-center rounded-full">
        <KeyRound className="size-5" strokeWidth={1.75} aria-hidden />
      </span>

      <div className="mt-4 flex items-baseline justify-between gap-3 pr-8">
        <h2 id="giris-baslik" className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
          {isSignUp && step === 2 ? "Hesap türü" : TITLES[mode]}
        </h2>
        {isSignUp ? (
          <span className="text-muted-foreground shrink-0 text-[0.75rem]" aria-live="polite">
            Adım {step} / 2
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1.5 text-[0.875rem] leading-relaxed">
        {isSignUp && step === 2
          ? "Hesabı kendi adınıza mı, işletmeniz adına mı kullanacaksınız?"
          : DESCRIPTIONS[mode]}
      </p>

      {/* `key`: ekran ya da adim degisince form yeniden baglaniyor ve odak
          ilk alana geciyor — kullanici yeni ekrana gectigini hem gorup hem
          klavyeyle hissediyor. Girilen degerler ust bilesende durdugu icin
          "Geri"de kaybolmuyor. */}
      <form
        key={`${mode}-${step}`}
        onSubmit={handleSubmit}
        noValidate
        className="soft-fade mt-5 space-y-3"
      >
        {isSignUp && step === 1 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                id={ids.firstName}
                label="Ad"
                autoComplete="given-name"
                autoFocus
                maxLength={MAX_NAME_LENGTH}
                value={firstName}
                onChange={setFirstName}
              />
              <TextInput
                id={ids.lastName}
                label="Soyad"
                autoComplete="family-name"
                maxLength={MAX_NAME_LENGTH}
                value={lastName}
                onChange={setLastName}
              />
            </div>
            <TextInput
              id={ids.email}
              label="E-posta"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
            />
            <div>
              <TextInput
                id={ids.password}
                label="Parola"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                describedBy={ids.rules}
              />
              <PasswordChecklist id={ids.rules} password={password} />
            </div>
            <TextInput
              id={ids.passwordAgain}
              label="Parola (tekrar)"
              type="password"
              autoComplete="new-password"
              value={passwordAgain}
              onChange={setPasswordAgain}
            />
          </>
        ) : null}

        {isSignUp && step === 2 ? (
          <>
            <AccountTypePicker
              name={ids.accountType}
              value={accountType}
              onChange={setAccountType}
              autoFocus
            />

            {/* Sirket alanlari yalnizca sirket secilince; bireysel hesapta
                hic sorulmuyor. */}
            {accountType === "company" ? (
              <div className="soft-fade space-y-3">
                <TextInput
                  id={ids.businessName}
                  label="Şirket adı"
                  autoComplete="organization"
                  maxLength={MAX_BUSINESS_NAME_LENGTH}
                  value={businessName}
                  onChange={setBusinessName}
                />
                <SelectInput
                  id={ids.businessType}
                  label="İşletme türü"
                  value={businessType}
                  onChange={setBusinessType}
                  options={BUSINESS_TYPES.map((type) => ({ value: type.id, label: type.label }))}
                />
              </div>
            ) : null}

            <SelectInput
              id={ids.city}
              label="Şehir"
              value={city}
              onChange={setCity}
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
              value={phone}
              onChange={setPhone}
            />

            <div className="space-y-2.5 pt-1">
              <Checkbox id={ids.terms} checked={acceptsTerms} onChange={setAcceptsTerms}>
                <span>
                  Kullanım koşullarını ve KVKK aydınlatma metnini okudum, kabul ediyorum.{" "}
                  <span className="text-muted-foreground">(Zorunlu)</span>
                </span>
              </Checkbox>
              {/* Ticari ileti izni zorunlu onaya BAGLANAMAZ: ayri, bos
                  isaretli bir kutu (lib/profile.ts). */}
              <Checkbox id={ids.marketing} checked={marketingOptIn} onChange={setMarketingOptIn}>
                <span>
                  Yeni özellikler ve kampanyalar hakkında e-posta almak istiyorum.{" "}
                  <span className="text-muted-foreground">(İsteğe bağlı)</span>
                </span>
              </Checkbox>
            </div>
          </>
        ) : null}

        {!isSignUp ? (
          <>
            <TextInput
              id={ids.email}
              label="E-posta"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={setEmail}
              describedBy={error ? ids.error : undefined}
            />
            {mode === "signin" ? (
              <TextInput
                id={ids.password}
                label="Parola"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
                describedBy={error ? ids.error : undefined}
                labelAside={
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-muted-foreground hover:text-foreground text-[0.75rem] underline-offset-4 hover:underline"
                  >
                    Parolamı unuttum
                  </button>
                }
              />
            ) : null}
          </>
        ) : null}

        {error ? (
          <p
            id={ids.error}
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-[0.8125rem] text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          {isSignUp && step === 2 ? (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError(null);
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] ring-1 ring-black/15 transition-colors hover:bg-black/5"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Geri
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "press bg-foreground text-background flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-[0.9375rem] font-medium transition-opacity",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            {submitLabel}
          </button>
        </div>
      </form>

      <p className="text-muted-foreground mt-5 text-center text-[0.8125rem]">
        {isSignUp ? (
          <>
            Zaten hesabınız var mı?{" "}
            <ModeLink onClick={() => switchMode("signin")}>Giriş yapın</ModeLink>
          </>
        ) : mode === "forgot" ? (
          <ModeLink onClick={() => switchMode("signin")}>Girişe dön</ModeLink>
        ) : (
          <>
            Hesabınız yok mu?{" "}
            <ModeLink onClick={() => switchMode("signup")}>Hesap oluşturun</ModeLink>
          </>
        )}
      </p>
    </>
  );
}

/* --- Form yapi taslari (hesap sayfasi da kullaniyor) -------------------- */

export function TextInput({
  id,
  label,
  hint,
  value,
  onChange,
  describedBy,
  labelAside,
  type = "text",
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  labelAside?: ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[0.8125rem] font-medium">
          {label}
          {hint ? <span className="text-muted-foreground ml-1.5 font-normal">({hint})</span> : null}
        </label>
        {labelAside}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy}
        className={INPUT_CLASS}
        {...rest}
      />
    </div>
  );
}

/**
 * Bireysel / Sirket secimi. Iki buyuk kart: secimin sonucu (ekranda ne
 * gorunecegi, ileride hangi paketler) acik yaziyor. Yerel radyo dugmeleri
 * uzerine kurulu; klavye ve ekran okuyucu davranisi tarayicidan geliyor.
 */
export function AccountTypePicker({
  name,
  value,
  onChange,
  autoFocus,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Hesap türü</legend>
      <div className="grid grid-cols-2 gap-3">
        {ACCOUNT_TYPES.map((type, index) => {
          const checked = value === type.id;
          return (
            <label
              key={type.id}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition-colors",
                checked
                  ? "border-foreground bg-black/[0.03] ring-1 ring-black/80"
                  : "border-black/15 hover:border-black/30",
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={name}
                  value={type.id}
                  checked={checked}
                  onChange={() => onChange(type.id)}
                  autoFocus={autoFocus && index === 0}
                  className="accent-foreground size-4"
                />
                <span className="text-[0.9375rem] font-medium">{type.label}</span>
              </span>
              <span className="text-muted-foreground pl-6 text-[0.75rem] leading-snug">
                {type.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SelectInput({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[0.8125rem] font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(INPUT_CLASS, "appearance-auto pr-2", !value && "text-muted-foreground")}
      >
        <option value="" disabled>
          Seçin
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-foreground">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Checkbox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem] leading-snug">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-foreground mt-0.5 size-4 shrink-0"
      />
      {children}
    </label>
  );
}

function ModeLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-foreground font-medium underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}

function NotConfigured() {
  return (
    <>
      <span className="bg-gold/15 text-gold flex size-11 items-center justify-center rounded-full">
        <KeyRound className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 id="giris-baslik" className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">
        Giriş şu anda kullanılamıyor
      </h2>
      <p className="text-muted-foreground mt-2 text-[0.875rem] leading-relaxed">
        Hesap sistemi bu ortamda yapılandırılmamış.
      </p>
    </>
  );
}

export const INPUT_CLASS =
  "mt-1 block min-h-11 w-full rounded-xl border border-black/15 bg-white px-3.5 text-[0.9375rem] outline-none transition-shadow focus:border-black/40 focus:ring-3 focus:ring-black/8 aria-invalid:border-red-400";
