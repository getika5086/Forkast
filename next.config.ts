import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer/Chromium must run server-side only
  serverExternalPackages: ["puppeteer", "puppeteer-core"],
};

export default nextConfig;
