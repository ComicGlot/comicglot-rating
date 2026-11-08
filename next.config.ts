import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Page crops are served only through the authenticated /api/image route.
  images: { unoptimized: true },
};

export default config;
