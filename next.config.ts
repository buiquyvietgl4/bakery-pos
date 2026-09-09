import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: 'export' as const } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
