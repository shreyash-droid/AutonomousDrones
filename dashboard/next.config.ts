import type { NextConfig } from "next";

// The Python backend (simulation/server.py) serves the AI model, flight logs and
// the live Ground Control Station. The dashboard proxies it under /backend/*.
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  devIndicators: false, // keep the demo screen clean
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${BACKEND}/:path*` }];
  },
};

export default nextConfig;
