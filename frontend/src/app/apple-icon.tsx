import { ImageResponse } from "next/og";

import { MarkSvg } from "./mark-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0c0b0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MarkSvg height={84} />
      </div>
    ),
    size,
  );
}
