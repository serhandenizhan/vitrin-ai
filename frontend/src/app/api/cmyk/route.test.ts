import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/cmyk/route";
import {
  MAX_FILE_BYTES,
  MAX_INPUT_PIXELS,
  exceedsInputPixelLimit,
} from "@/lib/cmyk-limits";

describe("POST /api/cmyk", () => {
  it("rejects an oversized request before parsing multipart data", async () => {
    const response = await POST(
      new Request("http://localhost/api/cmyk", {
        method: "POST",
        headers: { "content-length": String(MAX_FILE_BYTES + 1) },
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

  it("rejects an oversized chunked request before parsing multipart data", async () => {
    const chunk = new Uint8Array(MAX_FILE_BYTES + 1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = await POST(
      new Request("http://localhost/api/cmyk", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
  });

  it("rejects images whose dimensions exceed the main upload pixel limit", () => {
    expect(exceedsInputPixelLimit(8_000, 5_001)).toBe(true);
    expect(exceedsInputPixelLimit(8_000, 5_000)).toBe(false);
    expect(exceedsInputPixelLimit(MAX_INPUT_PIXELS, 1)).toBe(false);
  });
});
