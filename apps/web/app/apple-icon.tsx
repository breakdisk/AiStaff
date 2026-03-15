import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#09090b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
          border: "6px solid #fbbf24",
        }}
      >
        {/* "Ai" wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 0,
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: 80,
              color: "#fbbf24",
              lineHeight: 1,
              letterSpacing: "-4px",
            }}
          >
            A
          </span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 400,
              fontSize: 52,
              color: "#fafafa",
              lineHeight: 1,
              letterSpacing: "-2px",
            }}
          >
            i
          </span>
        </div>
        {/* pulse dot */}
        <span
          style={{
            position: "absolute",
            bottom: 28,
            right: 32,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#fbbf24",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
