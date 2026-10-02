// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminCutoutQueue, QUEUE_REFRESH_MS, formatWait } from "@/components/admin/admin-cutout-queue";

/** Sıradaki yanıtları verir; son yanıt tekrarlanır. Her çağrı kaydedilir. */
function mockQueue(...responses: (Response | Error)[]) {
  let index = 0;
  const fetchMock = vi.fn(async () => {
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const health = (over: Record<string, unknown> = {}) =>
  Response.json({
    status: "ok",
    workers: 1,
    queued: 0,
    processing: 0,
    oldest_waiting_seconds: null,
    max_queued: 50,
    stall_threshold_seconds: 120,
    ...over,
  });

/** Bekleyen mikro görevleri boşaltır: `adminFetch` birden çok `await` içeriyor (ders 27). */
async function flush() {
  for (let i = 0; i < 6; i += 1) await act(async () => vi.advanceTimersByTimeAsync(0));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("formatWait", () => {
  it("saniyeyi ve dakikayı okunur yazıyor", () => {
    expect(formatWait(45)).toBe("45 sn");
    expect(formatWait(120)).toBe("2 dk");
    expect(formatWait(125)).toBe("2 dk 5 sn");
  });
});

describe("AdminCutoutQueue — durumlar", () => {
  it("sağlıklıyken sayıları gösteriyor ve alarm vermiyor", async () => {
    mockQueue(health({ workers: 2, queued: 3, processing: 1, oldest_waiting_seconds: 12 }));
    render(createElement(AdminCutoutQueue));
    await flush();

    expect(screen.getByText("Kesim işçisi çalışıyor")).toBeTruthy();
    expect(screen.getByText("3 iş sırada bekliyor.")).toBeTruthy();
    expect(screen.getByText("Canlı işçi").nextSibling?.textContent).toBe("2");
    expect(screen.getByText("Sırada").nextSibling?.textContent).toBe("3 / 50");
    expect(screen.getByText("İşleniyor").nextSibling?.textContent).toBe("1");
    expect(screen.getByText("En eski bekleyen").nextSibling?.textContent).toBe("12 sn");
    // Sağlıklı durum sessiz bir `status`; `alert` değil.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("işçi yokken sorunu açıkça söylüyor ve alert olarak duyuruyor", async () => {
    mockQueue(health({ status: "no_worker", workers: 0 }));
    render(createElement(AdminCutoutQueue));
    await flush();

    expect(screen.getByText("Kesim işçisi çalışmıyor")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("sırada bekliyor");
    expect(screen.getByText("Canlı işçi").nextSibling?.textContent).toBe("0");
  });

  it("tıkalı kuyrukta ilerlemesizlik süresini ve eşiği gösteriyor", async () => {
    mockQueue(health({ status: "stalled", oldest_waiting_seconds: 400, seconds_without_progress: 185 }));
    render(createElement(AdminCutoutQueue));
    await flush();

    expect(screen.getByText("Kuyruk tıkalı görünüyor")).toBeTruthy();
    // Gösterilen, en eski işin bekleme süresi (400 sn) DEĞİL, ilerlemesizlik süresi (185 sn).
    expect(screen.getByRole("alert").textContent).toContain("3 dk 5 sn'dir hiçbir iş tamamlanmadı");
    expect(screen.getByRole("alert").textContent).not.toContain("6 dk");
    expect(screen.getByRole("alert").textContent).toContain("eşik 2 dk");
  });

  it("Redis yokken sayaç göstermiyor (backend göndermiyor), eksik veri 0 gibi görünmüyor", async () => {
    // Backend `unavailable` yanıtında yalnız durum ve eşik verir.
    mockQueue(Response.json({ status: "unavailable", stall_threshold_seconds: 120 }));
    render(createElement(AdminCutoutQueue));
    await flush();

    expect(screen.getByText("Kuyruğa ulaşılamıyor")).toBeTruthy();
    expect(screen.queryByText("Canlı işçi")).toBeNull();
  });
});

describe("AdminCutoutQueue — hata ve bozuk yanıt", () => {
  it("ilk okuma başarısızsa hatayı gösteriyor, çökmüyor", async () => {
    mockQueue(Response.json({ error: "Kesim kuyruğu durumu yüklenemedi." }, { status: 502 }));
    render(createElement(AdminCutoutQueue));
    await flush();

    expect(screen.getByRole("alert").textContent).toBe("Kesim kuyruğu durumu yüklenemedi.");
  });

  it("tanımadığı bir durumu ya da bozuk gövdeyi hata sayıyor (paneli çökertmiyor)", async () => {
    // Genel bakış testlerinin eski taklidi tam olarak bunu yapıyordu: kuyruk
    // adresine istatistik gövdesi döndürüyordu ve kart `undefined` durumda çöktü.
    mockQueue(Response.json({ usage: { today: 3 } }));
    render(createElement(AdminCutoutQueue));
    await flush();

    expect(screen.getByRole("alert").textContent).toBe("Kuyruk durumu anlaşılamadı.");
  });

  it("ağ hatasında hata gösteriyor", async () => {
    mockQueue(new Error("ağ yok"));
    render(createElement(AdminCutoutQueue));
    await flush();

    expect(screen.getByRole("alert").textContent).toContain("Sunucuya ulaşılamadı");
  });
});

describe("AdminCutoutQueue — periyodik yenileme", () => {
  it("her aralıkta yeniden okuyor ve durum değişince ekranı güncelliyor", async () => {
    const fetchMock = mockQueue(health({ status: "no_worker", workers: 0 }), health({ workers: 1 }));
    render(createElement(AdminCutoutQueue));
    await flush();
    expect(screen.getByText("Kesim işçisi çalışmıyor")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Bir yoklama turu ilerletilmeden "hâlâ eski" demek hiçbir şey kanıtlamaz (ders 21).
    await act(async () => vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Kesim işçisi çalışıyor")).toBeTruthy();
    expect(screen.queryByText("Kesim işçisi çalışmıyor")).toBeNull();
  });

  it("yenileme başarısız olursa eski veriyi korur ama eski olabileceğini söyler", async () => {
    mockQueue(health({ workers: 4 }), new Error("ağ koptu"));
    render(createElement(AdminCutoutQueue));
    await flush();

    await act(async () => vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS));
    await flush();

    // Eski sayı ekranda KALIR (boş ekrana dönmez)...
    expect(screen.getByText("Canlı işçi").nextSibling?.textContent).toBe("4");
    // ...ama güncel sanılmasın diye açıkça uyarılır.
    expect(screen.getByRole("alert").textContent).toContain("eski olabilir");
  });

  it("sonraki başarılı yenileme eski-veri uyarısını kaldırıyor", async () => {
    mockQueue(health(), new Error("ağ koptu"), health({ workers: 3 }));
    render(createElement(AdminCutoutQueue));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS));
    await flush();
    expect(screen.getByRole("alert")).toBeTruthy();

    await act(async () => vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS));
    await flush();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Canlı işçi").nextSibling?.textContent).toBe("3");
  });

  it("geç gelen ESKİ yanıt, sonra başlamış isteğin sonucunu ezmiyor", async () => {
    // İlk istek yavaş: yenileme aralığından SONRA döner. O arada ikinci istek
    // başlar ve hemen döner. Eski yanıt geldiğinde ekran yeni durumda kalmalı.
    let resolveSlow: (response: Response) => void = () => {};
    const slow = new Promise<Response>((resolve) => {
      resolveSlow = resolve;
    });
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        return call === 1 ? slow : health({ workers: 2 });
      }),
    );
    render(createElement(AdminCutoutQueue));
    await flush();

    await act(async () => vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS));
    await flush();
    expect(screen.getByText("Kesim işçisi çalışıyor")).toBeTruthy();

    resolveSlow(health({ status: "no_worker", workers: 0 }));
    await flush();

    expect(screen.getByText("Kesim işçisi çalışıyor")).toBeTruthy();
    expect(screen.queryByText("Kesim işçisi çalışmıyor")).toBeNull();
    expect(screen.getByText("Canlı işçi").nextSibling?.textContent).toBe("2");
  });

  it("kapanınca yoklamayı durduruyor", async () => {
    const fetchMock = mockQueue(health());
    const { unmount } = render(createElement(AdminCutoutQueue));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS * 3));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
