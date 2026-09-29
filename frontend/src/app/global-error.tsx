"use client";

/**
 * Kök düzen (layout) dahil her şey çöktüğünde gösterilen son hata ekranı.
 * Kök düzenin yerine geçtiği için kendi `<html>`/`<body>`'sini çizer ve
 * `globals.css` burada yüklü değildir; renkler bu yüzden satır içi, sitenin
 * sıcak nötr paletinden (`#0c0b0a` zemin, `#f3f0eb` metin, altın vurgu).
 *
 * Hata izleme açıksa (Faz 7) hata buradan bildirilir; kapalıyken SDK
 * yüklenmez. Next 16'da yeniden deneme prop'u `retry` (eski `reset` değil).
 */
import { useEffect } from "react";

import { ERROR_TRACKING_DSN } from "@/lib/error-tracking";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    if (!ERROR_TRACKING_DSN) return;
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0c0b0a",
          color: "#f3f0eb",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          padding: "16px",
        }}
      >
        <main style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
            Beklenmeyen bir hata oluştu
          </h1>
          <p style={{ color: "#a8a29a", fontSize: 17, lineHeight: 1.5, margin: "12px 0 24px" }}>
            Sayfayı yeniden yüklemeyi deneyin. Sorun sürerse{" "}
            <a href="/destek" style={{ color: "#f3f0eb", textDecoration: "underline" }}>
              destek sayfasından
            </a>{" "}
            bize bildirin.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: "#d1a25b",
              color: "#0c0b0a",
              border: "none",
              borderRadius: 999,
              padding: "12px 24px",
              fontSize: 17,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
