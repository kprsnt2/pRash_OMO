import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist is a Node-side parser; keep it out of the server bundle.
  serverExternalPackages: ["pdfjs-dist"],
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
