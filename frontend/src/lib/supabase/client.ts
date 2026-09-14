/**
 * Tarayicida calisan Supabase istemcisi (istemci bilesenleri icin).
 *
 * Oturum localStorage'da degil CEREZDE tutuluyor (`@supabase/ssr` varsayilani):
 * sunucu bilesenleri, route handler'lar ve `proxy.ts` ayni oturumu okuyabilsin
 * (ROADMAP Faz 4). `createBrowserClient` tarayicida tek bir ornegi yeniden
 * kullaniyor; her cagri yeni bir istemci acmiyor.
 */
import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, publishableKey } = requireSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
