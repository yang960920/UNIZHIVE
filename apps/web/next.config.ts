import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: [
    "@uniz/domain",
    "@uniz/ui",
    "@uniz/db",
    "@uniz/integrations",
    "@uniz/build-engine",
  ],
  poweredByHeader: false,
  devIndicators: false,
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};
export default config;
