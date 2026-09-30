/**
 * Frontend hata izleme temizleyicileri + gerçek SDK'dan geçen uçtan uca test.
 *
 * Birim testleri temizleme kurallarını tek tek sınar. Asıl kanıt sondaki
 * test: gerçek `@sentry/nextjs` istemcisi bizim ayarlarımızla kurulur, bir
 * hata yakalatılır ve SDK'nın ağa çıkaracağı zarf sahte bir taşıyıcıda
 * incelenir. Temizleyiciyi elle çağırıp "temiz" demek, SDK'nın gerçekte ne
 * topladığını hiç sınamazdı (kök CLAUDE.md ders 22).
 */
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  maskText,
  REDACTED,
  scrubBreadcrumb,
  scrubEvent,
  stripQuery,
} from "@/lib/error-tracking";

const TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.imza-parcasi";
const EMAIL = "musteri@kuyumcu.example";

// Testler SDK'nın tam tipini değil, temizleyicinin baktığı alanları kurar.
const asEvent = (value: object) => value as unknown as ErrorEvent;
const asCrumb = (value: object) => value as unknown as Breadcrumb;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("temizleyiciler", () => {
  it("e-posta, JWT, Bearer ve Supabase oturum çerezini maskeler", () => {
    const text = maskText(
      `kullanıcı ${EMAIL} token ${TOKEN} Bearer abc.def sb-proje-auth-token.0=gizli`,
    );
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("abc.def");
    expect(text).not.toContain("gizli");
  });

  it("adresten sorgu dizesini ve parçayı atar", () => {
    expect(stripQuery("https://site.example/auth/callback?code=gizli&next=/hesap#x")).toBe(
      "https://site.example/auth/callback",
    );
    expect(stripQuery("/odeme/123?email=a@b.co")).toBe("/odeme/123");
  });

  it("olaydan kimlik bilgisi başlıklarını, çerezi, gövdeyi, sorguyu ve kullanıcıyı siler", () => {
    const event = scrubEvent(asEvent({
      request: {
        url: `https://site.example/hesap?email=${EMAIL}`,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          cookie: "sb=gizli",
          "X-Expected-User-Id": "kullanici",
          "User-Agent": "Mozilla",
        },
        cookies: { sb: "gizli" },
        data: "form içeriği",
        query_string: `email=${EMAIL}`,
      },
      user: { id: "u", ip_address: "1.2.3.4", email: EMAIL },
    }));
    const request = event.request as unknown as Record<string, unknown>;
    const headers = request.headers as Record<string, string>;
    expect(headers.Authorization).toBe(REDACTED);
    expect(headers.cookie).toBe(REDACTED);
    expect(headers["X-Expected-User-Id"]).toBe(REDACTED);
    expect(headers["User-Agent"]).toBe("Mozilla");
    expect(request.cookies).toBe(REDACTED);
    expect(request.data).toBe(REDACTED);
    expect(request.query_string).toBe(REDACTED);
    expect(request.url).toBe("https://site.example/hesap");
    expect(event).not.toHaveProperty("user");
    expect(JSON.stringify(event)).not.toContain(EMAIL);
  });

  it("tıklama kırıntısını tamamen atar, gezinme/istek kırıntısından sorguyu siler", () => {
    expect(scrubBreadcrumb(asCrumb({ category: "ui.click", message: "button.Ürün: Altın yüzük" }))).toBeNull();
    expect(scrubBreadcrumb(asCrumb({ category: "ui.input", message: "input#ad" }))).toBeNull();

    const navigation = scrubBreadcrumb(asCrumb({
      category: "navigation",
      data: { from: "/auth/callback?code=gizli", to: "/hesap?sekme=profil" },
    }));
    expect(navigation?.data).toEqual({ from: "/auth/callback", to: "/hesap" });

    const fetchCrumb = scrubBreadcrumb(asCrumb({
      category: "fetch",
      data: { url: `/api/admin/users?q=${EMAIL}`, method: "GET" },
    }));
    expect(fetchCrumb?.data).toEqual({ url: "/api/admin/users", method: "GET" });
  });

  it("olayın içine gömülü kırıntıları da temizler", () => {
    const event = scrubEvent(asEvent({
      breadcrumbs: [
        { category: "ui.click", message: "Altın yüzük" },
        { category: "console", message: `giriş: ${EMAIL}` },
      ],
    }));
    expect(event.breadcrumbs).toEqual([{ category: "console", message: "giriş: [e-posta]" }]);
  });
});

describe("DSN", () => {
  it("DSN yoksa kapalıdır", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { ERROR_TRACKING_DSN } = await import("@/lib/error-tracking");
    expect(ERROR_TRACKING_DSN).toBe("");
  });

  it("ayarlar kişisel veri göndermez, izi ve oturum kaydını açmaz", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://anahtar@izleme.example/1");
    const { errorTrackingOptions } = await import("@/lib/error-tracking");
    const options = errorTrackingOptions();
    expect(options.dsn).toBe("https://anahtar@izleme.example/1");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.includeLocalVariables).toBe(false);
    // İki temizleme katmanı da bağlı: kırıntılar hem eklenirken hem olay
    // gönderilirken temizleniyor; biri düşerse diğeri örter ama fark edilmeli.
    expect(options.beforeSend.name).toBe("scrubEvent");
    expect(options.beforeBreadcrumb.name).toBe("scrubBreadcrumb");
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("integrations");
  });
});

describe("uçtan uca — gerçek SDK", () => {
  it("yakalanan hata maskelenmiş olarak taşıyıcıya ulaşır", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://anahtar@izleme.example/1");
    const { errorTrackingOptions } = await import("@/lib/error-tracking");
    const Sentry = await import("@sentry/nextjs");
    const { createTransport } = Sentry;

    // Sunucu SDK'sı hatanın çevresindeki KAYNAK satırlarını da olaya ekliyor
    // (`context_line`); aranan metinler bu yüzden kaynakta düz yazılmıyor,
    // yoksa test temizliği değil kendi kaynak kodunu ölçerdi.
    const product = ["Altın", "yüzük"].join(" ");
    const resetCode = ["code", "gizli"].join("=");
    const userId = ["kullanici", "1"].join("-");
    const sent: string[] = [];
    Sentry.init({
      ...errorTrackingOptions(),
      transport: (options: Parameters<typeof createTransport>[0]) =>
        createTransport(options, async (request) => {
          const body =
            typeof request.body === "string"
              ? request.body
              : new TextDecoder().decode(request.body);
          sent.push(body);
          return { statusCode: 200 };
        }),
    });
    Sentry.addBreadcrumb({ category: "ui.click", message: `${product} seçildi` });
    Sentry.addBreadcrumb({ category: "navigation", data: { from: `/a?${resetCode}`, to: "/b" } });
    Sentry.getCurrentScope().setUser({ id: userId, email: EMAIL });
    Sentry.captureException(new Error(`kayıt başarısız: ${EMAIL} ${TOKEN}`));
    await Sentry.flush(2000);

    const payload = sent.join("\n");
    expect(payload).toContain("kayıt başarısız");
    expect(payload).not.toContain(EMAIL);
    expect(payload).not.toContain(TOKEN);
    expect(payload).not.toContain(product);
    expect(payload).not.toContain(resetCode);
    expect(payload).not.toContain(userId);
    expect(payload).not.toContain('"vars"'); // yerel değişken yok
    await Sentry.close();
    // Gerçek SDK'nın ilk `import`'u soğuk: tek başına ~0,3 sn, ama 40 meşgul
    // süreçle ölçülünce 3,1 sn'ye çıktı (varsayılan 5 sn sınırına yaklaştı) ve
    // PR #32'de yük altında zaman aşımına düştü. Bu, temizleme mantığı değil
    // modül yükleme süresi; sınır bu yüzden geniş.
  }, 30_000);
});
