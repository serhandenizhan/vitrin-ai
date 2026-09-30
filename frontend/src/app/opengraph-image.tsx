import { ImageResponse } from "next/og";

import { MarkSvg } from "./mark-svg";

export const alt = "Vitrin — kuyumcu ürün görseli";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Paylasim onizlemesi (WhatsApp, Instagram, X): koyu zemin, altin isaret, tek cumle. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "radial-gradient(60% 80% at 50% 100%, #2a2015 0%, #0c0b0a 70%)",
          color: "#f3f0eb",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <MarkSvg height={78} />
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>Vitrin</div>
        </div>
        <div style={{ fontSize: 58, fontWeight: 600, letterSpacing: -1.5, textAlign: "center", lineHeight: 1.1 }}>
          Ürününüz kalsın, arka planı gitsin
        </div>
        <div style={{ fontSize: 28, color: "#a8a29a" }}>Kuyumcular için ürün fotoğrafı aracı</div>
      </div>
    ),
    size,
  );
}
