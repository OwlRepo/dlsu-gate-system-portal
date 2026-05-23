import type { NextConfig } from 'next';

const skipLintBuild = process.env.SKIP_LINT_BUILD === '1';

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: skipLintBuild,
  },
  typescript: {
    ignoreBuildErrors: skipLintBuild,
  },
  images: {
    domains: ['dlsu-portal-be-production.up.railway.app', 'localhost', '10.50.140.110', 'host.docker.internal' ],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9580',
        pathname: '/persistent_uploads/**',
      },
      // Add additional patterns for production if needed
      {
        protocol: 'http',
        hostname: '10.50.140.110',
        port: '9580', 
        pathname: '/persistent_uploads/**',
      }
    ],
  },

  output: 'standalone',
};

export default nextConfig;
