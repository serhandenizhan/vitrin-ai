import { describe, expect, it } from "vitest";

import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  formatBytes,
  getExtension,
  isPreviewableInBrowser,
  resolveContentType,
  validateFile,
} from "./upload-constraints";

/**
 * Bu dosyanin asil isi, backend ile ELLE senkron tutulan kisitlarin
 * beklendigi gibi davrandigini sabitlemek. Ozellikle HEIC yolu: Windows'ta
 * tarayici .heic icin cogu zaman bos content-type bildiriyor ve backend
 * beyan edilen turu sart kosuyor — bu davranis sessizce bozulursa iPhone'dan
 * gelen her fotograf reddedilir.
 */

function makeFile(name: string, type: string, size = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  // File.size salt okunur; testte boyutu dogrudan tanimliyoruz.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("resolveContentType", () => {
  it("tarayicinin bildirdigi gecerli turu oldugu gibi kabul eder", () => {
    expect(resolveContentType({ name: "a.jpg", type: "image/jpeg" })).toBe(
      "image/jpeg",
    );
  });

  it("tur bos geldiginde uzantidan cozer", () => {
    // Windows'ta .heic icin gozlenen gercek durum.
    expect(resolveContentType({ name: "IMG_0001.heic", type: "" })).toBe(
      "image/heic",
    );
  });

  it("tur taninmiyorsa uzantidan cozer", () => {
    expect(
      resolveContentType({
        name: "IMG_0001.HEIC",
        type: "application/octet-stream",
      }),
    ).toBe("image/heic");
  });

  it("desteklenmeyen uzanti icin null doner", () => {
    expect(resolveContentType({ name: "belge.pdf", type: "application/pdf" })).toBeNull();
  });

  it("uzantisiz dosya icin null doner", () => {
    expect(resolveContentType({ name: "dosya", type: "" })).toBeNull();
  });
});

describe("getExtension", () => {
  it("uzantiyi kucuk harfe cevirir", () => {
    expect(getExtension("FOTO.JPEG")).toBe("jpeg");
  });

  it("birden fazla noktada son parcayi alir", () => {
    expect(getExtension("urun.v2.webp")).toBe("webp");
  });

  it("uzanti yoksa bos string doner", () => {
    expect(getExtension("dosya")).toBe("");
  });
});

describe("isPreviewableInBrowser", () => {
  it("HEIC/HEIF onizlenemez sayar", () => {
    // Tarayicilar HEIC goruntuleyemiyor; arayuz bunun yerine bilgi karti
    // gosteriyor. Bu kural bozulursa kullanici bos bir kutu goruyor.
    expect(isPreviewableInBrowser({ name: "a.heic", type: "" })).toBe(false);
    expect(isPreviewableInBrowser({ name: "a.heif", type: "image/heif" })).toBe(
      false,
    );
  });

  it("diger formatlari onizlenebilir sayar", () => {
    expect(isPreviewableInBrowser({ name: "a.png", type: "image/png" })).toBe(true);
  });
});

describe("validateFile", () => {
  it("gecerli dosyaya null doner", () => {
    expect(validateFile(makeFile("a.png", "image/png"))).toBeNull();
  });

  it("desteklenmeyen turu reddeder", () => {
    const hata = validateFile(makeFile("belge.pdf", "application/pdf"));
    expect(hata?.message).toContain("Desteklenmeyen dosya türü");
  });

  it("sinirin uzerindeki dosyayi reddeder ve boyutu mesajda gecer", () => {
    const hata = validateFile(
      makeFile("buyuk.png", "image/png", MAX_FILE_SIZE_BYTES + 1),
    );
    expect(hata?.message).toContain(String(MAX_FILE_SIZE_MB));
  });

  it("tam sinirdaki dosyayi kabul eder", () => {
    // Sinir kapsayici: backend de `>` ile karsilastiriyor.
    expect(
      validateFile(makeFile("tam.png", "image/png", MAX_FILE_SIZE_BYTES)),
    ).toBeNull();
  });
});

describe("formatBytes", () => {
  it("bayt, kilobayt ve megabayti ayirir", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
