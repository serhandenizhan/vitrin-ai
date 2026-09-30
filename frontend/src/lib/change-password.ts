/**
 * Hesabim sayfasinda parola degistirme (mevcut parola ile).
 *
 * NEDEN AYRI MODUL (/cso incelemesi, 27.09.2026): mevcut parola eskiden
 * yalnizca TARAYICIDA kontrol ediliyordu (once `signInWithPassword`, sonra
 * `updateUser({ password })`). Oturumu ele gecirmis biri (acik birakilmis
 * bilgisayar) tarayici konsolundan `updateUser` cagirip bu kontrolu hic
 * gecmeden parolayi degistirebiliyordu. Kalici cozum Supabase panelindeki
 * "Require current password when changing password" ayari: Supabase sunucusu
 * mevcut parolayi KENDISI ister. O ayar acildiginda bu cagrinin
 * `current_password`'i gondermesi SART, yoksa Hesabim sayfasi da reddedilir.
 * Ayar kapaliyken alan zararsizdir. Sifirlama baglantisiyla gelen oturum
 * (`/auth/yeni-parola`) Supabase'te bu kuraldan muaf (`session.IsRecovery()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { authErrorMessage } from "@/lib/auth-errors";

type AuthClient = Pick<SupabaseClient["auth"], "signInWithPassword" | "updateUser">;

export async function changePassword(
  auth: AuthClient,
  email: string,
  current: string,
  next: string,
): Promise<string | null> {
  // Tarayicidaki bu kontrol kullaniciya net bir mesaj ve taze bir oturum
  // (Supabase'in "son 24 saatte giris" kurali icin) sagliyor; asil zorunluluk
  // sunucuda (`current_password`).
  const { error: verifyError } = await auth.signInWithPassword({ email, password: current });
  if (verifyError) {
    return verifyError.code === "invalid_credentials"
      ? "Mevcut parolanız hatalı."
      : authErrorMessage(verifyError);
  }

  const { error: updateError } = await auth.updateUser({
    password: next,
    current_password: current,
  });
  return updateError ? authErrorMessage(updateError) : null;
}
