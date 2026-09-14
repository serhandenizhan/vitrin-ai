/**
 * E-posta baglantisindan donus: kayit dogrulama, sihirli baglanti, parola
 * sifirlama.
 *
 * Iki bicimi de kabul ediyor:
 *  - `?code=...`  PKCE akisi (`@supabase/ssr` varsayilani). Kod, tarayicida
 *    cerezde duran dogrulayiciyla oturuma cevriliyor — baglantiyi baska bir
 *    tarayicida acan biri oturumu alamiyor.
 *  - `?token_hash=...&type=...`  e-posta sablonu ozellestirilirse gelen bicim.
 *
 * `next` ACIK YONLENDIRMEYE karsi `safeRedirectPath`ten geciyor.
 *
 * Sifirlama baglantisi (`next` = yeni parola sayfasi) basariyla oturuma
 * cevrilince kisa omurlu bir `httpOnly` cerez yaziliyor; yeni parola formu
 * yalnizca o cerez varken aciliyor (bkz. lib/password-recovery.ts).
 */
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  NEW_PASSWORD_PATH,
  RECOVERY_COOKIE,
  RECOVERY_COOKIE_MAX_AGE,
} from "@/lib/password-recovery";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

function success(next: string, origin: string): NextResponse {
  const response = NextResponse.redirect(new URL(next, origin));
  if (next === NEW_PASSWORD_PATH) {
    response.cookies.set(RECOVERY_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: NEW_PASSWORD_PATH,
      maxAge: RECOVERY_COOKIE_MAX_AGE,
    });
  }
  return response;
}

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return success(next, origin);
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) return success(next, origin);
  }

  // Suresi dolmus ya da daha once kullanilmis baglanti. Hata ayrintisi URL'e
  // konmuyor; kullaniciya yalnizca "baglanti gecersiz" deniyor.
  return NextResponse.redirect(new URL("/auth/hata", origin));
}
