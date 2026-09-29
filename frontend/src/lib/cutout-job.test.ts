/**
 * `runCutout` — yukleme + kuyruk yoklamasi (Faz 7).
 *
 * Sahte zamanlayiciyla yazildi; bekleyen isler `advanceTimersByTimeAsync`
 * ile bosaltiliyor (kok CLAUDE.md ders 27: tek bir `await` mikro gorev
 * kuyrugunu bosaltmaz ve test duzeltme olmadan da yesil kalabilir).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindJobKey, CutoutCancelled, CutoutError, runCutout } from "@/lib/cutout-job";

const png = (mocked = false) =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { "Content-Type": "image/png", "X-Mock-Response": mocked ? "true" : "false" },
  });
const queued = (status = "queued") => Response.json({ job_id: "k", status }, { status: 202 });
const failure = (code: string, retrySafe: boolean, status = 503, retryAfter?: string) =>
  Response.json(
    { error: `hata: ${code}`, code, ...(retrySafe ? { retry_safe: true } : {}) },
    { status, headers: retryAfter ? { "Retry-After": retryAfter } : {} },
  );

/** Anahtar ureten ve cagrilari kaydeden sahte ortam. */
function setup(responses: Array<Response | Error>) {
  let key = 0;
  const calls: Array<{ url: string; key: string | null }> = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), key: new Headers(init?.headers).get("Idempotency-Key") });
    const next = responses.shift();
    if (!next) throw new Error("beklenmeyen istek");
    if (next instanceof Error) throw next;
    return next;
  });
  return {
    calls,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getKey: () => `anahtar-${key}`,
    renewKey: vi.fn(() => {
      key += 1;
    }),
  };
}

const file = new File([new Uint8Array(4)], "yuzuk.jpg", { type: "image/jpeg" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Promise'i sahte zamanla sonuna kadar surer. */
async function settle<T>(promise: Promise<T>, ms = 60_000): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
  promise.then(
    (value) => (outcome = { ok: true, value }),
    (error) => (outcome = { ok: false, error }),
  );
  for (let elapsed = 0; outcome === undefined && elapsed < ms; elapsed += 500) {
    await vi.advanceTimersByTimeAsync(500);
  }
  if (outcome === undefined) throw new Error("sonuçlanmadı");
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

describe("runCutout", () => {
  it("demo/hazir sonuc PNG olarak gelirse hic yoklamaz", async () => {
    const env = setup([png(true)]);
    const result = await settle(runCutout({ file, ...env }));
    expect(result.mocked).toBe(true);
    expect(env.calls).toHaveLength(1);
  });

  it("siradaki isi ayni anahtarla yoklar ve PNG gelince doner", async () => {
    const env = setup([queued(), queued(), queued("processing"), png()]);
    const result = await settle(runCutout({ file, ...env }));

    expect(result.mocked).toBe(false);
    expect(env.calls.map((c) => c.url)).toEqual([
      "/api/remove-background",
      "/api/remove-background/jobs/anahtar-0",
      "/api/remove-background/jobs/anahtar-0",
      "/api/remove-background/jobs/anahtar-0",
    ]);
    expect(env.renewKey).not.toHaveBeenCalled();
  });

  it("yoklamadaki Redis hatasindan sonra ayni isi yoklar, ikinci kredi acmaz", async () => {
    const env = setup([queued(), failure("queue_unavailable", true), queued(), png()]);
    const result = await settle(runCutout({ file, ...env }));

    expect(result.blob.size).toBe(4);
    expect(env.calls.filter((call) => call.url === "/api/remove-background")).toHaveLength(1);
    expect(env.calls.slice(1).map((call) => call.url)).toEqual([
      "/api/remove-background/jobs/anahtar-0",
      "/api/remove-background/jobs/anahtar-0",
      "/api/remove-background/jobs/anahtar-0",
    ]);
    expect(env.renewKey).not.toHaveBeenCalled();
  });

  it("uzun Redis kesintisinde isi durdurur ama anahtari ve krediyi korur", async () => {
    const env = setup([queued(), ...Array.from({ length: 5 }, () => failure("queue_unavailable", true))]);
    const error = await settle(runCutout({ file, ...env })).catch((e) => e);

    expect(error).toBeInstanceOf(CutoutError);
    expect(error.code).toBe("queue_unavailable");
    expect(env.calls.filter((call) => call.url === "/api/remove-background")).toHaveLength(1);
    expect(env.renewKey).not.toHaveBeenCalled();
  });

  it("bekleme uzarsa onSlow'u 30 sn'den once degil, bir kez cagirir", async () => {
    const env = setup([queued(), ...Array.from({ length: 30 }, () => queued()), png()]);
    const onSlow = vi.fn();
    const promise = runCutout({ file, ...env, onSlow });

    await vi.advanceTimersByTimeAsync(29_000);
    expect(onSlow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onSlow).toHaveBeenCalledTimes(1);
    await settle(promise);
    expect(onSlow).toHaveBeenCalledTimes(1);
  });

  it("gecici ve iade edilmis hatayi kullaniciya gostermeden yeni anahtarla tekrar dener", async () => {
    const env = setup([queued(), failure("worker_lost", true), queued(), png()]);
    const result = await settle(runCutout({ file, ...env }));

    expect(result.blob.size).toBe(4);
    expect(env.renewKey).toHaveBeenCalledTimes(1);
    // Ikinci yukleme YENI anahtarla gitti; yoklama da onu izledi.
    expect(env.calls[2]).toEqual({ url: "/api/remove-background", key: "anahtar-1" });
    expect(env.calls[3].url).toBe("/api/remove-background/jobs/anahtar-1");
  });

  it("kuyruk doluysa Retry-After kadar bekleyip yeniden yukler", async () => {
    const env = setup([failure("queue_busy", false, 503, "30"), queued(), png()]);
    const promise = runCutout({ file, ...env });

    await vi.advanceTimersByTimeAsync(29_000);
    expect(env.calls).toHaveLength(1); // 30 sn dolmadan tekrar yok
    await settle(promise);
    expect(env.calls[1].url).toBe("/api/remove-background");
    expect(env.calls[1].key).toBe("anahtar-0");
    expect(env.renewKey).not.toHaveBeenCalled();
  });

  it("POST kuyruk kesintisinde ikinci POST ayni anahtari kullanir", async () => {
    const env = setup([failure("queue_unavailable", false), queued(), png()]);
    const result = await settle(runCutout({ file, ...env }));

    expect(result.blob.size).toBe(4);
    expect(env.calls[0].key).toBe("anahtar-0");
    expect(env.calls[1].key).toBe("anahtar-0");
    expect(env.renewKey).not.toHaveBeenCalled();
  });

  it("kalici hatayi (fotograf islenemedi) gosterir; iade edildigi icin anahtari yeniler", async () => {
    const env = setup([queued(), failure("processing_failed", true, 422)]);
    const error = await settle(runCutout({ file, ...env })).catch((e) => e);

    expect(error).toBeInstanceOf(CutoutError);
    expect(error.code).toBe("processing_failed");
    expect(env.renewKey).toHaveBeenCalledTimes(1);
    expect(env.calls).toHaveLength(2); // sessiz tekrar YOK
  });

  it("retry_safe olmayan hatada anahtari KORUR", async () => {
    const env = setup([failure("request_already_processed", false, 409)]);
    const error = await settle(runCutout({ file, ...env })).catch((e) => e);
    expect(error.code).toBe("request_already_processed");
    expect(env.renewKey).not.toHaveBeenCalled();
  });

  it("oturum dustuyse auth_required koduyla hemen durur", async () => {
    const env = setup([failure("auth_required", false, 401)]);
    const error = await settle(runCutout({ file, ...env })).catch((e) => e);
    expect(error.code).toBe("auth_required");
  });

  it("sessiz tekrar hakki bitince hatayi gosterir", async () => {
    const env = setup([
      queued(), failure("worker_lost", true),
      queued(), failure("worker_lost", true),
      queued(), failure("worker_lost", true),
    ]);
    const error = await settle(runCutout({ file, ...env, silentRetries: 2 })).catch((e) => e);
    expect(error.code).toBe("worker_lost");
    expect(env.renewKey).toHaveBeenCalledTimes(3);
  });

  it("kisa ag kesintilerini tolere eder, surekli kopuklukta durur", async () => {
    const blip = setup([queued(), new TypeError("ag"), new TypeError("ag"), png()]);
    await expect(settle(runCutout({ file, ...blip }))).resolves.toMatchObject({ mocked: false });

    const down = setup([queued(), ...Array.from({ length: 5 }, () => new TypeError("ag"))]);
    const error = await settle(runCutout({ file, ...down })).catch((e) => e);
    expect(error.message).toMatch(/Bağlantı koptu/);
    expect(down.renewKey).not.toHaveBeenCalled(); // is sunucuda surebilir: anahtar korunur
  });

  it("kullanici ekrandan ayrilinca yoklamayi birakir", async () => {
    const env = setup([queued(), queued(), queued()]);
    let cancelled = false;
    const promise = runCutout({ file, ...env, isCancelled: () => cancelled });
    await vi.advanceTimersByTimeAsync(1600);
    cancelled = true;
    const error = await settle(promise).catch((e) => e);
    expect(error).toBeInstanceOf(CutoutCancelled);
    expect(env.calls.length).toBeLessThanOrEqual(2);
  });
});

/**
 * Kaan'in PR #30 incelemesi (28.09.2026): yukleme surerken ekran sifirlanip
 * yeni fotograf secilirse ortak anahtar degisir. Eski is yoklamayi o YENI
 * anahtarla yapiyordu — ya kendi sonucunu hic bulamiyordu (kredi harcanir,
 * gecmise yazilmaz) ya da yeni fotografin sonucunu kendi adiyla gecmise
 * yaziyordu. Iki test de duzeltme geri alininca kirmizi yandi.
 */
describe("is anahtari ekranin ortak anahtarindan ayri", () => {
  it("yukleme surerken ortak anahtar degisse de yoklama yuklemenin anahtariyla yapilir", async () => {
    const shared = { current: "eski-foto" };
    const calls: Array<{ url: string; key: string | null }> = [];
    const responses = [queued(), png()];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), key: new Headers(init?.headers).get("Idempotency-Key") });
      // Yukleme surerken kullanici ekrani sifirlayip ("Yeni calisma") yeni fotograf secti.
      if (String(url) === "/api/remove-background") shared.current = "yeni-foto";
      return responses.shift()!;
    }) as unknown as typeof fetch;

    await settle(
      runCutout({ file, fetchImpl, getKey: () => shared.current, renewKey: () => {} }),
    );

    expect(calls).toEqual([
      { url: "/api/remove-background", key: "eski-foto" },
      { url: "/api/remove-background/jobs/eski-foto", key: null },
    ]);
  });

  it("ekrandan ayrilmis is, sessiz tekrarda yeni oturumun anahtarini ezmez", async () => {
    const shared = { current: "eski-foto" };
    let screenOnThisJob = true;
    let counter = 0;
    const job = bindJobKey(shared, () => screenOnThisJob, () => `yeni-${++counter}`);

    // Kullanici ekrani sifirladi ve yeni fotografa gecti.
    screenOnThisJob = false;
    shared.current = "yeni-oturum";

    job.renewKey(); // eski is: worker_lost -> sessiz tekrar
    expect(job.getKey()).toBe("yeni-1"); // eski is kendi yeni anahtarini kullanir
    expect(shared.current).toBe("yeni-oturum"); // yeni oturumun anahtari yerinde
  });

  it("ekran hala bu isteyken yenilenen anahtar ortak anahtara da yazilir", () => {
    const shared = { current: "ilk" };
    const job = bindJobKey(shared, () => true, () => "ikinci");

    job.renewKey();
    // Kullanici "tekrar dene"ye basarsa iade edilmis eski anahtarla degil,
    // yeni anahtarla gitmeli (kredi kurali degismedi).
    expect(shared.current).toBe("ikinci");
    expect(job.getKey()).toBe("ikinci");
  });
});
