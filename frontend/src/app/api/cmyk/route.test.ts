import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/cmyk/route";

describe("POST /api/cmyk", () => {
  it("rejects an oversized request before parsing multipart data", async () => {
    const response = await POST(
      new Request("http://localhost/api/cmyk", {
        method: "POST",
        headers: { "content-length": String(30 * 1024 * 1024 + 1) },
      }),
    );

    expect(response.status).toBe(413);
  });

  it("returns 503 when no print profile is configured", async () => {
    const response = await POST(
      new Request("http://localhost/api/cmyk", { method: "POST" }),
    );

    expect(response.status).toBe(503);
  });
});
