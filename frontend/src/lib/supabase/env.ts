/**
 * Supabase proje adresi ve publishable anahtari.
 *
 * `NEXT_PUBLIC_` onekli: ikisi de tarayiciya gitmek icin tasarlandi. Veriyi
 * koruyan sey anahtarin gizliligi degil, tablolardaki RLS (bkz. kok CLAUDE.md
 * karar 6). `service_role` / secret anahtar bu uygulamaya HIC girmez.
 *
 * Tanimli degilse null donuyor: Supabase'i yapilandirmamis bir gelistirici
 * (ya da testler) sitenin geri kalanini yine calistirabilsin. Oturum gerektiren
 * yerler bu durumu kendileri acikca ele aliyor — sessizce "giris yapilmis"
 * saymak yok.
 */
export type SupabaseEnv = { url: string; publishableKey: string };

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase yapılandırılmamış: frontend/.env.local içine NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY yazılmalı.",
    );
  }
  return env;
}
