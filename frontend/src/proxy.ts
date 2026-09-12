/**
 * Her istekte Supabase oturumunu yeniler (Next.js 16'da `middleware.ts`nin
 * yeni adi `proxy.ts`).
 *
 * NEDEN: access token kisa omurlu (Supabase'de 15 dk). Sunucu bilesenleri
 * cerez YAZAMADIGI icin suresi dolan token'i yenileyecek yer burasi; yenilenen
 * cerezler hem istege (bu istegin geri kalani yeni token'i gorsun) hem yanita
 * (tarayici saklasin) yaziliyor.
 *
 * YETKILENDIRME DEGIL (ROADMAP Faz 4): matcher degisirse ya da bir yol
 * disarida kalirsa bu katman sessizce devre disi kalir. Gercek kontrol
 * FastAPI'de (JWT dogrulamasi + sahiplik filtresi) ve RLS'te.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  // Supabase yapilandirilmamissa oturum da yok; sitenin geri kalani calissin.
  if (!env) return response;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Yenilenen oturum cerezini tasiyan yanit bir CDN'de onbelleklenirse
        // baska bir kullaniciya o cerez verilebilir; Supabase bunu onlemek
        // icin onbellek basliklarini veriyor.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Bu cagri ile yanit arasina baska kod konmamali: token yenilemesi yanit
  // olusmadan tamamlanmazsa yeni cerez yazilamaz ve kullanici rastgele
  // oturumdan duser (@supabase/ssr uyarisi).
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Statik dosyalar ve gorseller haric her sey. Onlarda oturum yok;
     * her birinde Supabase'e token yenileme sormak bosuna gecikme olurdu.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
