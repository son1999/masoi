import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ma-soi/shared'],
  reactStrictMode: true,
};

export default nextConfig;
