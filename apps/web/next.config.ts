import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Each entry proxies /api/<service>/* → the local Rust service
      { source: "/api/identity/:path*",     destination: "http://localhost:3001/:path*" },
      { source: "/api/marketplace/:path*", destination: "http://localhost:3002/:path*" },
      { source: "/api/checklist/:path*",  destination: "http://localhost:3003/:path*" },
      { source: "/api/license/:path*",    destination: "http://localhost:3004/:path*" },
      { source: "/api/matching/:path*",   destination: "http://localhost:3005/:path*" },
      { source: "/api/compliance/:path*", destination: "http://localhost:3006/:path*" },
      { source: "/api/telemetry/:path*",  destination: "http://localhost:3007/:path*" },
      { source: "/api/analytics/:path*",  destination: "http://localhost:3008/:path*" },
      { source: "/api/reputation/:path*", destination: "http://localhost:3009/:path*" },
      { source: "/api/payout/:path*",     destination: "http://localhost:3010/:path*" },
    ];
  },
};

export default nextConfig;
