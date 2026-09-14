/**
 * Parola kurallari (Faz 4, kullanici karari 13.09.2026: "her sifre kabul
 * edilmesin, buyuk harf kucuk harf").
 *
 * Kurallar Supabase Dashboard > Authentication > Sign In / Up > Password
 * Requirements ayariyla eslesmeli — asil sinir orasi, bu dosya yalnizca
 * kullaniciya daha yazarken ne eksik oldugunu gostermek icin (istemci
 * kontrolu atlanip dogrudan Supabase API'sine istek atilabilir).
 *
 * DERS (14.09.2026, kok CLAUDE.md ders 19): bu dosya onceden yalnizca
 * uzunluk+kucuk+buyuk+rakam istiyordu ve yorumda Supabase ayarinin
 * "lowercase, uppercase letters and digits" oldugu VARSAYILIYORDU —
 * dogrulanmadan. Canli Dashboard ayari aslinda "...and symbols
 * (recommended)" idi: sembolsuz bir parola bu listede TAMAMI YESIL
 * gorunuyor ama Supabase sunucu tarafinda `weak_password` ile reddediyordu.
 * Kullanici "kurallara uyuyor ama kabul etmiyor" diye bildirdi. Bu sinifin
 * dersi: bir istemci kontrolu, kontrol ettigi uzak servisin CANLI ayarinin
 * bir aynasiysa, o ayar dogrulanmadan/donemsel kontrol edilmeden koda
 * gomulmemeli — ayarin kendisi sessizce degisebilir (kim degistirdi
 * onemli degil) ve kontrol sessizce yanlis hale gelir.
 *
 * Harf kurallari ASCII (A-Z, a-z): Supabase de boyle sayiyor. "Ş" gibi bir
 * harf buyuk harf sayilsaydi istemci "tamam" derken sunucu reddederdi.
 */
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";

// Standart yazdirilabilir ASCII noktalama/sembol kumesi (harf, rakam ve
// bosluk HARIC). Bilincli olarak Supabase'in kabul ettigi kumenin bir ALT
// kumesi olacak sekilde dar tutuldu: istemci "tamam" derse sunucu da kabul
// etmeli — tersi (istemci dar, sunucu daha genis kabul ediyor) yalnizca
// gereksiz bir "eksik" uyarisina yol acar, sessiz bir redde degil.
const SYMBOL_PATTERN = /[!-/:-@[-`{-~]/;

export type PasswordRule = {
  id: "length" | "lower" | "upper" | "digit" | "symbol";
  label: string;
  ok: boolean;
};

export function checkPassword(password: string): {
  rules: PasswordRule[];
  isValid: boolean;
} {
  const rules: PasswordRule[] = [
    {
      id: "length",
      label: `En az ${MIN_PASSWORD_LENGTH} karakter`,
      ok: password.length >= MIN_PASSWORD_LENGTH,
    },
    { id: "lower", label: "Bir küçük harf (a-z)", ok: /[a-z]/.test(password) },
    { id: "upper", label: "Bir büyük harf (A-Z)", ok: /[A-Z]/.test(password) },
    { id: "digit", label: "Bir rakam (0-9)", ok: /[0-9]/.test(password) },
    { id: "symbol", label: "Bir sembol (!, @, # gibi)", ok: SYMBOL_PATTERN.test(password) },
  ];
  return { rules, isValid: rules.every((rule) => rule.ok) };
}

/** Ilk eksik kuralin kullaniciya gosterilecek cumlesi; parola uygunsa null. */
export function passwordProblem(password: string): string | null {
  const missing = checkPassword(password).rules.find((rule) => !rule.ok);
  return missing ? `Parola kurallara uymuyor: ${missing.label.toLocaleLowerCase("tr")} gerekli.` : null;
}
