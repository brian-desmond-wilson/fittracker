import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/app2",
  assetPrefix: "/app2",
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
