import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#09090b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: "1.5px solid #fbbf24",
        }}
      >
        {/* "A" lettermark in amber */}
        <span
          style={{
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: 18,
            color: "#fbbf24",
            lineHeight: 1,
            letterSpacing: "-1px",
          }}
        >
          A
        </span>
        {/* small dot — subtle brand mark */}
        <span
          style={{
            position: "absolute",
            bottom: 5,
            right: 5,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#fbbf24",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
