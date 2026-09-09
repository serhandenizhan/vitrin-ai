import { describe, expect, it } from "vitest";

import {
  CIKTI_OLCUSU,
  DISA_AKTARMA_ORANI,
  MERKEZ_YAKALAMA_TOLERANSI,
  SAHNE_OLCUSU,
  SIGDIRMA_PAYI,
  VARSAYILAN_GORUNUM,
  aciyiNormalize,
  gorunumVarsayilanMi,
  merkezeYakala,
  sigdirmaDonusumu,
} from "@/lib/composition";

describe("sigdirmaDonusumu", () => {
  it("ürünü sahnenin merkezine koyar", () => {
    const d = sigdirmaDonusumu(800, 600);

    expect(d.x).toBe(SAHNE_OLCUSU / 2);
    expect(d.y).toBe(SAHNE_OLCUSU / 2);
    expect(d.aci).toBe(0);
  });

  it("geniş görselde GENİŞLİĞE göre ölçekler", () => {
    const d = sigdirmaDonusumu(2000, 1000);

    expect(d.olcek).toBeCloseTo((SAHNE_OLCUSU * SIGDIRMA_PAYI) / 2000);
  });

  it("uzun görselde YÜKSEKLİĞE göre ölçekler", () => {
    const d = sigdirmaDonusumu(1000, 2000);

    expect(d.olcek).toBeCloseTo((SAHNE_OLCUSU * SIGDIRMA_PAYI) / 2000);
  });

  it("her iki kenar da sahneye TAMAMEN sığar", () => {
    // `Math.max` kullanılsaydı uzun kenar taşardı ve kullanıcı ürünün
    // kırpıldığını sanırdı. Her iki boyut da sahnenin içinde kalmalı.
    for (const [g, y] of [
      [2400, 800],
      [800, 2400],
      [1000, 1000],
      [37, 1900],
    ]) {
      const d = sigdirmaDonusumu(g, y);

      expect(g * d.olcek).toBeLessThanOrEqual(SAHNE_OLCUSU);
      expect(y * d.olcek).toBeLessThanOrEqual(SAHNE_OLCUSU);
    }
  });

  it("kenarlarda pay bırakır — ürün kenara yapışmaz", () => {
    const d = sigdirmaDonusumu(1000, 1000);

    expect(1000 * d.olcek).toBeCloseTo(SAHNE_OLCUSU * SIGDIRMA_PAYI);
    expect(1000 * d.olcek).toBeLessThan(SAHNE_OLCUSU);
  });
});

describe("aciyiNormalize", () => {
  it("0-359 aralığına indirger", () => {
    expect(aciyiNormalize(0)).toBe(0);
    expect(aciyiNormalize(15)).toBe(15);
    expect(aciyiNormalize(360)).toBe(0);
    expect(aciyiNormalize(375)).toBe(15);
    // "15° döndür"e 72 kez basmak: 1080 derece.
    expect(aciyiNormalize(1080)).toBe(0);
  });

  it("negatif açıyı da pozitife çevirir", () => {
    // JavaScript'in `%` operatörü negatif sayıda negatif döner
    // (`-15 % 360 === -15`); tek bir mod yeterli olmuyor.
    expect(aciyiNormalize(-15)).toBe(345);
    expect(aciyiNormalize(-360)).toBe(0);
    expect(aciyiNormalize(-370)).toBe(350);
  });
});

describe("DISA_AKTARMA_ORANI", () => {
  it("tam sayı — kesirli oran çıktıyı 1999 px yapıyordu", () => {
    // Bu sabitin varlık sebebi bir off-by-one hatası: oran ekran genişliğine
    // (434 px gibi yuvarlak olmayan bir sayıya) dayandığında Konva 2000 yerine
    // 1999 px'lik tuval üretiyordu.
    expect(Number.isInteger(DISA_AKTARMA_ORANI)).toBe(true);
    expect(SAHNE_OLCUSU * DISA_AKTARMA_ORANI).toBe(CIKTI_OLCUSU);
  });
});

describe("merkezeYakala", () => {
  it("tolerans içindeki değeri tam merkeze çeker", () => {
    // Fareyle tam ortayı tutturmak neredeyse imkânsız; 1-2 piksellik kayma
    // 2000 px'e büyütülmüş çıktıda göze batıyor.
    expect(merkezeYakala(500 + MERKEZ_YAKALAMA_TOLERANSI - 1, 500)).toBe(500);
    expect(merkezeYakala(500 - MERKEZ_YAKALAMA_TOLERANSI + 1, 500)).toBe(500);
    expect(merkezeYakala(500, 500)).toBe(500);
  });

  it("tolerans dışında serbest bırakır", () => {
    const uzak = 500 + MERKEZ_YAKALAMA_TOLERANSI + 1;

    expect(merkezeYakala(uzak, 500)).toBe(uzak);
    expect(merkezeYakala(120, 500)).toBe(120);
  });

  it("sınırın tam üstünde yakalar (kapalı aralık)", () => {
    expect(merkezeYakala(500 + MERKEZ_YAKALAMA_TOLERANSI, 500)).toBe(500);
  });
});

describe("gorunumVarsayilanMi", () => {
  it("dokunulmamış görünümde true", () => {
    expect(gorunumVarsayilanMi(VARSAYILAN_GORUNUM)).toBe(true);
  });

  it("tek bir ayar değişse bile false", () => {
    // "Sıfırla" düğmesinin ne zaman görüneceğini bu belirliyor; bir alanı
    // kontrol etmeyi unutmak, kullanıcının geri alamadığı bir ayar bırakırdı.
    expect(
      gorunumVarsayilanMi({ ...VARSAYILAN_GORUNUM, parlaklik: 0.1 }),
    ).toBe(false);
    expect(gorunumVarsayilanMi({ ...VARSAYILAN_GORUNUM, kontrast: 5 })).toBe(
      false,
    );
    expect(
      gorunumVarsayilanMi({ ...VARSAYILAN_GORUNUM, doygunluk: -0.2 }),
    ).toBe(false);
    expect(gorunumVarsayilanMi({ ...VARSAYILAN_GORUNUM, golge: false })).toBe(
      false,
    );
    expect(
      gorunumVarsayilanMi({ ...VARSAYILAN_GORUNUM, isikHavuzu: true }),
    ).toBe(false);
  });
});
