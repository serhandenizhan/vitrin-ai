import { describe, expect, it } from "vitest";

import { isProjectId, toWorkRecord } from "@/lib/project-record";

describe("toWorkRecord", () => {
  it("backend kaydini arayuz kaydina ceviriyor", () => {
    const record = toWorkRecord(
      {
        id: "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b",
        file_name: "yuzuk.heic",
        created_at: "2026-09-12T10:00:00+00:00",
        is_mocked: false,
        duration_seconds: 14.2,
        result_url: "https://r2.example/result.png?imza",
        thumbnail_url: "https://r2.example/thumb.png?imza",
        expires_in: 3600,
      },
      1_000,
    );

    expect(record).toEqual({
      id: "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b",
      fileName: "yuzuk.heic",
      createdAt: Date.parse("2026-09-12T10:00:00Z"),
      isMocked: false,
      durationSeconds: 14.2,
      // R2 adresi degil, ayni kokenden vekil (tuval kirlenmesin).
      resultUrl: "/api/projects/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b/result",
      thumbnailUrl: "https://r2.example/thumb.png?imza",
      expiresAt: 1_000 + 3_600_000,
    });
  });
});

describe("isProjectId", () => {
  it("UUID kabul ediyor", () => {
    expect(isProjectId("3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b")).toBe(true);
  });

  it.each(["..", "../admin", "abc", "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b?x=1", ""])(
    "yol degistirebilecek degeri reddediyor: %j",
    (value) => {
      expect(isProjectId(value)).toBe(false);
    },
  );
});
