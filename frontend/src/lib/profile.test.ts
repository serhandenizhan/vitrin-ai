import { describe, expect, it } from "vitest";

import {
  businessNameProblem,
  displayName,
  formatPhone,
  nameProblem,
  normalizeName,
  normalizePhone,
  phoneProblem,
  readProfile,
} from "@/lib/profile";

describe("nameProblem", () => {
  it.each(["Kaan", "Şükrü", "İlkay", "Ayşe Gül", "O'Neil", "Yılmaz-Öztürk"])(
    "Turkce ve bilesik isimleri kabul ediyor: %s",
    (name) => {
      expect(nameProblem("Ad", name)).toBeNull();
    },
  );

  it.each([
    ["bos", "   "],
    ["rakam", "Kaan2"],
    ["etiket", "<script>"],
    ["tire ile baslayan", "-Kaan"],
    ["cok uzun", "A".repeat(51)],
  ])("reddediyor: %s", (_label, name) => {
    expect(nameProblem("Ad", name)).not.toBeNull();
  });
});

describe("businessNameProblem", () => {
  it.each(["Altın & Pırlanta Ltd. Şti.", "Kuyumcu 1923", "Şencan (Kapalıçarşı)"])(
    "gercekci isletme adlarini kabul ediyor: %s",
    (name) => {
      expect(businessNameProblem(name)).toBeNull();
    },
  );

  it.each(["", "A", "<b>Kuyum</b>", "&Kuyum"])("reddediyor: %j", (name) => {
    expect(businessNameProblem(name)).not.toBeNull();
  });
});

describe("normalizePhone", () => {
  it.each([
    ["0532 123 45 67", "+905321234567"],
    ["532-123-4567", "+905321234567"],
    ["+90 (532) 123 45 67", "+905321234567"],
    ["905321234567", "+905321234567"],
    ["0212 555 00 11", "+902125550011"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["123", "0632 123 45 67", "0532 123 45 6", "abc"])("reddediyor: %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("telefon istege bagli: bos gecerli", () => {
    expect(phoneProblem("")).toBeNull();
    expect(phoneProblem("123")).not.toBeNull();
  });

  it("okunur bicime ceviriyor", () => {
    expect(formatPhone("+905321234567")).toBe("0532 123 45 67");
    expect(formatPhone(null)).toBe("");
  });
});

describe("normalizeName", () => {
  it("bosluklari topluyor", () => {
    expect(normalizeName("  Ayşe   Gül ")).toBe("Ayşe Gül");
  });
});

describe("readProfile", () => {
  it("metadata'dan butun alanlari okuyor", () => {
    expect(
      readProfile({
        first_name: "Kaan",
        last_name: "Şencan",
        account_type: "company",
        business_name: "Şencan Kuyumculuk",
        business_type: "workshop",
        city: "İstanbul",
        phone: "+905321234567",
        marketing_opt_in: true,
        terms_accepted_at: "2026-09-13T10:00:00.000Z",
      }),
    ).toEqual({
      firstName: "Kaan",
      lastName: "Şencan",
      accountType: "company",
      businessName: "Şencan Kuyumculuk",
      businessType: "workshop",
      city: "İstanbul",
      phone: "+905321234567",
      marketingOptIn: true,
      termsAcceptedAt: "2026-09-13T10:00:00.000Z",
    });
  });

  it("listede olmayan ya da yanlis tipteki degerleri yok sayiyor", () => {
    const profile = readProfile({
      first_name: 42,
      business_type: "admin",
      city: "Atlantis",
      phone: "yok",
      marketing_opt_in: "true",
    });
    expect(profile).toMatchObject({
      firstName: null,
      businessType: null,
      city: null,
      phone: null,
      // Metin "true" izin sayilmiyor; izin yalnizca acik bir true.
      marketingOptIn: false,
    });
    expect(readProfile(null).firstName).toBeNull();
  });
});

describe("displayName", () => {
  it("adi, yoksa e-postanin basini gosteriyor", () => {
    expect(displayName({ firstName: "Kaan", email: "k@ornek.com" })).toBe("Kaan");
    expect(displayName({ firstName: null, email: "kaan.s@ornek.com" })).toBe("kaan.s");
  });

  it("sirket hesabinda sirket adini, bireyselde kisi adini gosteriyor", () => {
    const base = { firstName: "Kaan", email: "k@ornek.com", businessName: "Şencan Kuyumculuk" };
    expect(displayName({ ...base, accountType: "company" })).toBe("Şencan Kuyumculuk");
    expect(displayName({ ...base, accountType: "individual" })).toBe("Kaan");
  });

  it("hesap turu secilmemis eski hesapta sirket adina karar vermiyor", () => {
    expect(
      displayName({ firstName: "Kaan", email: "k@ornek.com", accountType: null, businessName: "X" }),
    ).toBe("Kaan");
  });
});

describe("readProfile hesap turu", () => {
  it("gecerli turu okuyor, gecersizi yok sayiyor", () => {
    expect(readProfile({ account_type: "company" }).accountType).toBe("company");
    expect(readProfile({ account_type: "admin" }).accountType).toBeNull();
  });
});
