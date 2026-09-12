/**
 * Sunucuda calisan Supabase istemcisi (sunucu bilesenleri, route handler'lar).
 *
 * Her istekte YENI bir istemci olusturulmali: istemci o istegin cerezlerine
 * bagli. Modul seviyesinde tek bir ornek tutmak, bir kullanicinin oturumunu
 * baska bir kullanicinin istegine sizdirirdi.
 *
 * Kimlik icin `getSession()` degil `getClaims()` kullanilir: cerezden okunan
 * oturum dogrulanmamis veridir, `getClaims()` token'in imzasini projenin
 * JWKS'iyle dogruluyor.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabaseEnv } from "@/lib/supabase/env";

export async function createClient() {
  const { url, publishableKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Sunucu BILESENINDEN cagrildiginda cerez yazilamaz (Next.js
          // yalnizca route handler ve Server Function'da izin veriyor).
          // Zararsiz: oturumu `proxy.ts` her istekte zaten yeniliyor.
        }
      },
    },
  });
}
