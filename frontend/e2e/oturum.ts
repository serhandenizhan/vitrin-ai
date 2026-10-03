import fs from "node:fs";
import path from "node:path";

import type { BrowserContext, Page, Route } from "@playwright/test";

/**
 * Girisli akislar icin SAHTE oturum: gercek Supabase hesabi/secret yok.
 *
 * Nasil: tarayici Supabase oturumunu cerezden okuyor (`onAuthStateChange`
 * INITIAL_SESSION, ag istegi yok) — sahte bir oturum cerezi konur. Next'in
 * `/api/*` vekilleri sunucuda token'i JWKS ile dogruladigi icin sahte token'i
 * kabul etmez; bu yuzden tarayicidan giden `/api/projects`,
 * `/api/subscriptions/me` vb. `page.route` ile taklit edilir.
 *
 * SINIR (durust): bu testler ARAYUZUN oturumlu davranisini sinar; Supabase
 * entegrasyonunu, JWT dogrulamasini ve IDOR'u DEGIL. Onlar backend testlerinde
 * (`test_auth.py`, `test_idor.py`) gercek tokenlarla kapsaniyor.
 */

const KULLANICI_ID = "00000000-0000-4000-8000-00000000e2e0";

function supabaseAdresi(): string {
  const env = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (env) return env;
  // Playwright `.env.local`'i yuklemez; yolu bu dosyanin konumundan turet.
  const dosya = path.resolve(__dirname, "..", ".env.local");
  const satir = fs.existsSync(dosya)
    ? fs.readFileSync(dosya, "utf8").split(/\r?\n/).find((s) => s.startsWith("NEXT_PUBLIC_SUPABASE_URL="))
    : undefined;
  const deger = satir?.slice("NEXT_PUBLIC_SUPABASE_URL=".length).trim();
  if (!deger) throw new Error("NEXT_PUBLIC_SUPABASE_URL yok: oturumlu E2E icin gerekli (frontend/.env.local).");
  return deger;
}

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

export async function sahteOturumAc(context: BrowserContext, metadata: Record<string, unknown> = {}) {
  const adres = new URL(supabaseAdresi());
  const ref = adres.hostname.split(".")[0];
  const simdi = Math.floor(Date.now() / 1000);
  const exp = simdi + 60 * 60 * 24;
  const kullanici = {
    id: KULLANICI_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "e2e@example.com",
    app_metadata: {},
    user_metadata: { first_name: "Deneme", last_name: "Kullanıcı", ...metadata },
    created_at: new Date().toISOString(),
  };
  const oturum = {
    access_token: `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: KULLANICI_ID, exp, role: "authenticated" })}.imza`,
    refresh_token: "sahte-yenileme",
    token_type: "bearer",
    expires_in: 60 * 60 * 24,
    expires_at: exp,
    user: kullanici,
  };
  await context.addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: `base64-${b64url(oturum)}`,
      url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    },
  ]);
  // Sahte oturum yanlislikla gercek Supabase'e gitmesin (yenileme/cikis).
  await context.route(`${adres.origin}/**`, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
}

export const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** Tarayicinin gordugu (vekilin camelCase ciktisi) tek calisma kaydi. */
export const ornekCalisma = (ustune: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  fileName: "e2e-yuzuk.png",
  createdAt: Date.now(),
  isMocked: false,
  durationSeconds: 12,
  status: "draft",
  downloadedAt: null,
  editorState: null,
  resultUrl: "/mock/sample-cutout.png",
  thumbnailUrl: "/mock/sample-cutout.png",
  expiresAt: Date.now() + 3_600_000,
  ...ustune,
});

/**
 * Yaygin vekilleri taklit eder; test ustune yazabilir (sonradan eklenen
 * `page.route` once calisir). Liste bos; yazan istekler (kayit, taslak, silme)
 * basarili doner ki arayuz "kaydedilemedi" durumuna dusmesin.
 */
export async function vekilleriTaklitEt(page: Page) {
  await page.route("**/api/projects**", (r) =>
    r.request().method() === "GET"
      ? r.fulfill(json({ items: [], nextCursor: null }))
      : r.fulfill(json(ornekCalisma())),
  );
  // Backend `subscription_me` gövdesi (routes/billing.py); vekil aynen geçirir.
  // Önceden `{ plan_id, status, remaining }` idi — backend'in hiç üretmediği
  // bir biçim (ders 22; 03.10.2026'da düzeltildi). Kalan: 10 - 0 = 10.
  await page.route("**/api/subscriptions/me", (r) =>
    r.fulfill(
      json({
        subscription: { status: "active", access_until: null, deletion_requested_at: null },
        period: { quota_snapshot: 10, used_this_period: 0, ends_at: "2026-12-31T00:00:00+00:00", plan_id: "atolye" },
        bonus_credits: null,
        admin_exempt: false,
        billing_issue: null,
      }),
    ),
  );
}
