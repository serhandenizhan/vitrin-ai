import { describe, expect, it } from "vitest";

import { attachWorkId } from "@/lib/studio-attach";

describe("attachWorkId — kimlik sonradan gelince stüdyoya bağlama (ders 38)", () => {
  const studio = { cutoutUrl: "blob:a", fileName: "yuzuk.png" };

  it("aynı kesimle açılmış kimliksiz stüdyoya bağlanır, diğer alanlar korunur", () => {
    expect(attachWorkId(studio, "blob:a", "w1")).toEqual({ ...studio, workId: "w1" });
  });

  it("başka bir kesimin stüdyosuna dokunmaz", () => {
    const sonuc = attachWorkId(studio, "blob:baska", "w1");
    expect(sonuc).toBe(studio);
  });

  it("zaten kimliği olan stüdyonun kimliğini EZMEZ", () => {
    const acik = { ...studio, workId: "w0" };
    expect(attachWorkId(acik, "blob:a", "w1")).toBe(acik);
  });

  it("stüdyo kapalıysa (null) kapalı kalır", () => {
    expect(attachWorkId(null, "blob:a", "w1")).toBeNull();
  });
});
