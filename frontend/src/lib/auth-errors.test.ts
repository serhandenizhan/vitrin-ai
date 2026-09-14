import { describe, expect, it } from "vitest";

import { authErrorMessage, GENERIC_AUTH_ERROR } from "@/lib/auth-errors";

describe("authErrorMessage", () => {
  it("yanlis parola ile kayitsiz e-postayi AYIRT ETMIYOR", () => {
    // Ikisi de Supabase'den invalid_credentials olarak geliyor; mesaj tek.
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 })).toBe(
      "E-posta ya da parola hatalı.",
    );
  });

  it("bilinen kodlari Turkceye ceviriyor", () => {
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(
      /doğrulanmadı/,
    );
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/zayıf/);
    expect(authErrorMessage({ code: "same_password" })).toMatch(/eskisiyle/);
  });

  it("kodsuz 429'u hiz siniri olarak gosteriyor", () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/Çok fazla deneme/);
  });

  it("bilinmeyen hatada Supabase metnini degil genel mesaji gosteriyor", () => {
    expect(authErrorMessage({ code: "unexpected_failure", status: 500 })).toBe(
      GENERIC_AUTH_ERROR,
    );
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  });
});
