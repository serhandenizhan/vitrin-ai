/**
 * Next.js vekillerinin FastAPI'ye iletecegi access token.
 *
 * Tarayici token'i hic gormuyor ve backend'e dogrudan gitmiyor: vekil, istegin
 * cerezindeki oturumdan token'i alip `Authorization: Bearer` ile iletiyor
 * (bkz. backend/app/core/auth.py).
 *
 * Once `getClaims()`: token'in imzasini JWKS ile dogruluyor ve suresi dolmussa
 * yeniliyor. Cerezdeki oturum dogrulanmamis veri oldugu icin `getSession()`
 * tek basina kimlik kaniti sayilmiyor; burada yalnizca DOGRULANMIS oturumun
 * token'ini okumak icin kullaniliyor. Backend token'i yine kendisi dogruluyor —
 * bu kontrol oturumsuz bir istegin 20 MB'lik govdesini hic okumamak icin.
 *
 * Supabase yapilandirilmamissa null: vekil bunu "giris gerekli" olarak ele
 * aliyor, sessizce oturumsuz devam etmiyor.
 */
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function getAccessToken(): Promise<string | null> {
  if (!getSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
