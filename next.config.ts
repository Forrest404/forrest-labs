import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude the Python worker from Vercel's file bundler
  outputFileTracingExcludes: {
    "*": ["./worker/**/*"],
  },
};

export default nextConfig;
