import { expect, test, type Page } from "@playwright/test";

import { json, sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Ödeme akışı: /paketler -> sözleşme onayı -> /odeme/{id} durum yoklaması
// (Faz 7 kapanışı, açık takip 12 madde 3; 03.10.2026, Kaan).
//
// TAKLİT BİÇİMİ (ders 22): ödeme vekilleri (`lib/billing-proxy.ts`) BAŞARILI
// yanıtı backend gövdesiyle AYNEN geçirir; bu yüzden aşağıdaki başarılı
// gövdeler backend'in döndürdüğü biçimdedir (`routes/billing.py`,
// `services/billing/checkout.py` → `serialize_session`, `documents`). HATALAR
// ise vekilde `{ error, code, checkout_url? }` biçimine çevrilir
// (`lib/backend-proxy.ts` `callBackend`); hata taklitleri o biçimde ve
// mesaj/kodlar backend'deki `billing_error` çağrılarından birebir alındı.
//
// SINIR: iyzico formunun kendisi sınanmaz (gerçek form yerelde açılamıyor,
// checkout kapalı); iframe'in içeriği sahte bir paragraf.

const OTURUM_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const BEKLEYEN_ID = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

// GET /api/plans: SELECT p.id,p.name,v.id AS plan_version_id,v.price_minor_units,...
const PLANLAR = [
  { id: "deneme", name: "Deneme", plan_version_id: "11111111-0000-4000-8000-000000000001", price_minor_units: 0, currency: "TRY", monthly_quota: 5, background_tier: "basic", trial_period_days: 0 },
  { id: "atolye", name: "Atölye", plan_version_id: "11111111-0000-4000-8000-000000000002", price_minor_units: 49900, currency: "TRY", monthly_quota: 100, background_tier: "full", trial_period_days: 7 },
];

// GET /api/billing/documents: `documents()` iki belge döndürür.
const BELGELER = ["distance_sales", "pre_information"].map((tur) => ({
  document_type: tur,
  document_version: "2026-09-15",
  document_hash: "a".repeat(64),
  locale: "tr",
  text: `${tur} sözleşme metni`,
}));

const gelecek = () => new Date(Date.now() + 30 * 60_000).toISOString();

/** GET /api/subscriptions/checkout/{id}: `SELECT id,status,expires_at,checkout_form_content`. */
function oturum(ustune: Record<string, unknown> = {}) {
  return {
    id: OTURUM_ID,
    status: "pending",
    expires_at: gelecek(),
    checkout_form_content: "<p>iyzico formu (sahte)</p>",
    ...ustune,
  };
}

async function paketlerAc(page: Page) {
  await page.route("**/api/plans", (r) => r.fulfill(json(PLANLAR)));
  await page.route("**/api/billing/documents", (r) => r.fulfill(json(BELGELER)));
  await page.goto("/paketler");
}

async function formuDoldur(page: Page) {
  await page.getByRole("button", { name: "Paketi seç" }).first().click();
  await page.getByLabel("Ad", { exact: true }).fill("Deneme");
  await page.getByLabel("Soyad").fill("Kullanıcı");
  await page.getByLabel("Telefon (+905xxxxxxxxx)").fill("+905551112233");
  await page.getByLabel("T.C. kimlik numarası").fill("11111111110");
  await page.getByLabel("Şehir").fill("İstanbul");
  await page.getByLabel("Fatura adresi").fill("Kapalıçarşı");
  await page.getByLabel(/Ön bilgilendirme formunu ve mesafeli satış sözleşmesini okudum/).check();
}

test.beforeEach(async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sahteOturumAc(context);
  await vekilleriTaklitEt(page);
});

test("paket seçilir, sözleşmeler onaylanır, ödeme sayfasında form çıkar ve doğrulanınca abonelik açılır", async ({ page }) => {
  // Yoklama 5 sn'de bir; gerçek saati beklememek için sahte saat.
  await page.clock.install();
  let durum = oturum();
  await page.route(`**/api/subscriptions/checkout/${OTURUM_ID}`, (r) => r.fulfill(json(durum)));
  let gonderilen: Record<string, unknown> | null = null;
  await page.route("**/api/subscriptions/checkout", (r) => {
    gonderilen = r.request().postDataJSON();
    // `serialize_session`
    return r.fulfill(json({ id: OTURUM_ID, status: "pending", expires_at: gelecek(), checkout_url: `/odeme/${OTURUM_ID}` }));
  });

  await paketlerAc(page);
  await expect(page.getByText("₺499,00").first()).toBeVisible();
  await formuDoldur(page);
  await page.getByRole("button", { name: "Güvenli ödemeye geç" }).click();

  await expect(page).toHaveURL(new RegExp(`/odeme/${OTURUM_ID}$`));
  expect(gonderilen).toMatchObject({
    plan_id: "atolye",
    expected_plan_version_id: PLANLAR[1].plan_version_id,
    consents: BELGELER.map(({ document_type, document_hash, document_version }) => ({ document_type, document_hash, document_version })),
    customer: { name: "Deneme", surname: "Kullanıcı", gsmNumber: "+905551112233", identityNumber: "11111111110" },
  });
  expect(typeof (gonderilen as { idempotency_key?: unknown } | null)?.idempotency_key).toBe("string");

  const form = page.frameLocator('iframe[title="iyzico güvenli ödeme formu"]');
  await expect(form.getByText("iyzico formu (sahte)")).toBeVisible();

  // Ödeme doğrulandı: backend tamamlanmış oturumda formu boşaltır.
  durum = oturum({ status: "completed", checkout_form_content: null });
  await page.clock.fastForward(5_000);
  await expect(page.getByRole("status").filter({ hasText: "Aboneliğiniz doğrulandı ve kullanıma açıldı." })).toBeVisible();
  await expect(page.locator('iframe[title="iyzico güvenli ödeme formu"]')).toHaveCount(0);
});

test("devam eden satın alma varken hata gösterilir ve o ödemeye bağlantı verilir", async ({ page }) => {
  // `checkout_pending` (checkout.py) — vekil `detail`i üst düzeye çıkarır.
  await page.route("**/api/subscriptions/checkout", (r) =>
    r.fulfill(json({ error: "Devam eden satın alma işlemi var.", code: "checkout_pending", checkout_url: `/odeme/${BEKLEYEN_ID}` }, 409)),
  );
  await paketlerAc(page);
  await formuDoldur(page);
  await page.getByRole("button", { name: "Güvenli ödemeye geç" }).click();

  const uyari = page.getByRole("alert").filter({ hasText: "Devam eden satın alma işlemi var." });
  await expect(uyari).toBeVisible();
  await expect(uyari.getByRole("link", { name: "Devam eden ödemeye git" })).toHaveAttribute("href", `/odeme/${BEKLEYEN_ID}`);
  await expect(page).toHaveURL(/\/paketler$/);
});

test("iptal hatası bir yoklama turundan SONRA da ekranda kalır (ders 21)", async ({ page }) => {
  await page.clock.install();
  await page.route(`**/api/subscriptions/checkout/${OTURUM_ID}`, (r) =>
    r.request().method() === "POST"
      ? // İptal fail-closed: sağlayıcı doğrulanamıyorsa oturum açık kalır (billing.py).
        r.fulfill(json({ error: "Ödeme sağlayıcısı şu anda doğrulanamıyor.", code: "billing_not_ready" }, 503))
      : r.fulfill(json(oturum())),
  );
  await page.goto(`/odeme/${OTURUM_ID}`);
  await page.getByRole("button", { name: "Bu işlemi iptal et, yeni plan seç" }).click();

  const hata = page.getByRole("alert").filter({ hasText: "Ödeme sağlayıcısı şu anda doğrulanamıyor." });
  await expect(hata).toBeVisible();
  // Yoklamanın başarı dalı yükleme hatasını temizler; iptal hatası AYRI state'te
  // durduğu için bir tur sonra da görünmeli.
  await page.clock.fastForward(5_000);
  await page.clock.fastForward(5_000);
  await expect(hata).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/odeme/${OTURUM_ID}$`));
});

test("iptal başarılı olunca paketler sayfasına dönülür", async ({ page }) => {
  await page.route(`**/api/subscriptions/checkout/${OTURUM_ID}`, (r) =>
    r.request().method() === "POST" ? r.fulfill(json({ status: "failed" })) : r.fulfill(json(oturum())),
  );
  await page.route("**/api/plans", (r) => r.fulfill(json(PLANLAR)));
  await page.goto(`/odeme/${OTURUM_ID}`);
  await page.getByRole("button", { name: "Bu işlemi iptal et, yeni plan seç" }).click();
  await expect(page).toHaveURL(/\/paketler$/);
});

test("süresi dolmuş ödeme oturumu formu göstermez, yeni işleme yönlendirir", async ({ page }) => {
  // Süresi dolan oturumda backend formu boşaltır (checkout_status).
  await page.route(`**/api/subscriptions/checkout/${OTURUM_ID}`, (r) =>
    r.fulfill(json(oturum({ expires_at: new Date(Date.now() - 60_000).toISOString(), checkout_form_content: null }))),
  );
  await page.goto(`/odeme/${OTURUM_ID}`);
  await expect(page.getByText("Bu ödeme oturumu sona erdi.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Yeni işlem başlatın" })).toHaveAttribute("href", "/paketler");
  await expect(page.locator('iframe[title="iyzico güvenli ödeme formu"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bu işlemi iptal et, yeni plan seç" })).toHaveCount(0);
});
