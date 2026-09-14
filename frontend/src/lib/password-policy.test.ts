import { describe, expect, it } from "vitest";

import { checkPassword, passwordProblem } from "@/lib/password-policy";

describe("checkPassword", () => {
  it("dort kurali saglayan parolayi kabul ediyor", () => {
    expect(checkPassword("Kuyumcu2026").isValid).toBe(true);
    expect(passwordProblem("Kuyumcu2026")).toBeNull();
  });

  it.each([
    ["kisa", "Ab1"],
    ["buyuk harf yok", "kuyumcu2026"],
    ["kucuk harf yok", "KUYUMCU2026"],
    ["rakam yok", "Kuyumcular"],
  ])("reddediyor: %s", (_label, password) => {
    expect(checkPassword(password).isValid).toBe(false);
    expect(passwordProblem(password)).not.toBeNull();
  });

  it("Turkce buyuk harfi (Ş) Supabase gibi buyuk harf SAYMIYOR", () => {
    // Istemci "tamam" deyip sunucu reddetmesin.
    const upper = checkPassword("şifre2026Ş").rules.find((rule) => rule.id === "upper");
    expect(upper?.ok).toBe(false);
  });

  it("her kuralin durumunu ayri bildiriyor (canli liste icin)", () => {
    const { rules } = checkPassword("abc");
    expect(rules.map((rule) => [rule.id, rule.ok])).toEqual([
      ["length", false],
      ["lower", true],
      ["upper", false],
      ["digit", false],
    ]);
  });
});
