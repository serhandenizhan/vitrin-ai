/**
 * Parola kurallari (Faz 4, kullanici karari 13.09.2026: "her sifre kabul
 * edilmesin, buyuk harf kucuk harf").
 *
 * Kurallar Supabase'in "Password requirements: lowercase, uppercase letters
 * and digits" ayariyla BIREBIR: istemci kontrolu atlanabilir (dogrudan
 * Supabase API'sine istek atilabilir), asil sinir Supabase ayari. Bu dosya
 * yalnizca kullaniciya daha yazarken ne eksik oldugunu gostermek icin.
 *
 * Harf kurallari ASCII (A-Z, a-z): Supabase de boyle sayiyor. "Ş" gibi bir
 * harf buyuk harf sayilsaydi istemci "tamam" derken sunucu reddederdi.
 */
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";

export type PasswordRule = {
  id: "length" | "lower" | "upper" | "digit";
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
  ];
  return { rules, isValid: rules.every((rule) => rule.ok) };
}

/** Ilk eksik kuralin kullaniciya gosterilecek cumlesi; parola uygunsa null. */
export function passwordProblem(password: string): string | null {
  const missing = checkPassword(password).rules.find((rule) => !rule.ok);
  return missing ? `Parola kurallara uymuyor: ${missing.label.toLocaleLowerCase("tr")} gerekli.` : null;
}
