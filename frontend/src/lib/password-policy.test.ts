import { describe, expect, it } from "vitest";

import { checkPassword, passwordProblem } from "@/lib/password-policy";

describe("checkPassword", () => {
  it("bes kurali (uzunluk, kucuk, buyuk, rakam, sembol) saglayan parolayi kabul ediyor", () => {
    expect(checkPassword("Kuyumcu2026!").isValid).toBe(true);
    expect(passwordProblem("Kuyumcu2026!")).toBeNull();
  });

  it("sembolsuz bir parolayi REDDEDIYOR (Supabase Dashboard 'Password requirements' ayari sembol de istiyor)", () => {
    // Kullanicinin gercekte yasadigi hata: bu parola eski kod'da (yalnizca
    // uzunluk+kucuk+buyuk+rakam kontrol eden surumde) isValid=true donuyordu
    // ama Supabase sunucu tarafinda `weak_password` ile reddediyordu — checklist
    // yesil, kayit formu kirmizi. Bu test eski koda karsi calistirilsaydi
    // KIRMIZI yanardi.
    expect(checkPassword("Kuyumcu2026").isValid).toBe(false);
    expect(passwordProblem("Kuyumcu2026")).not.toBeNull();
  });

  it.each([
    ["kisa", "Ab1!"],
    ["buyuk harf yok", "kuyumcu2026!"],
    ["kucuk harf yok", "KUYUMCU2026!"],
    ["rakam yok", "Kuyumcular!"],
    ["sembol yok", "Kuyumcu2026"],
  ])("reddediyor: %s", (_label, password) => {
    expect(checkPassword(password).isValid).toBe(false);
    expect(passwordProblem(password)).not.toBeNull();
  });

  it("Turkce buyuk harfi (Ş) Supabase gibi buyuk harf SAYMIYOR", () => {
    // Istemci "tamam" deyip sunucu reddetmesin.
    const upper = checkPassword("şifre2026Ş!").rules.find((rule) => rule.id === "upper");
    expect(upper?.ok).toBe(false);
  });

  it.each(["!", "@", "#", "-"])("'%s' sembol olarak sayiliyor", (symbol) => {
    const rule = checkPassword(`Kuyumcu2026${symbol}`).rules.find((r) => r.id === "symbol");
    expect(rule?.ok).toBe(true);
  });

  it("bosluk sembol SAYILMIYOR", () => {
    const rule = checkPassword("Kuyumcu2026 ").rules.find((r) => r.id === "symbol");
    expect(rule?.ok).toBe(false);
  });

  it("her kuralin durumunu ayri bildiriyor (canli liste icin)", () => {
    const { rules } = checkPassword("abc");
    expect(rules.map((rule) => [rule.id, rule.ok])).toEqual([
      ["length", false],
      ["lower", true],
      ["upper", false],
      ["digit", false],
      ["symbol", false],
    ]);
  });
});
