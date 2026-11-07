import type { NextConfig } from 'next';

const daemon = process.env.ZORO_DAEMON_URL ?? `http://127.0.0.1:${process.env.ZORO_PORT ?? '7420'}`;

const nextConfig: NextConfig = {
  transpilePackages: ['@zoro/core'],
  // The browser talks to the local daemon through these same-origin rewrites, so the console cookie travels with it.
  async rewrites() {
    return [
      { source: '/api/healthz', destination: `${daemon}/healthz` },
      { source: '/api/public/:path*', destination: `${daemon}/api/public/:path*` },
      // Organization server API: members’ Zoro instances join and sync through the public site address.
      { source: '/api/org/:path*', destination: `${daemon}/api/org/:path*` },
      { source: '/api/console/:path*', destination: `${daemon}/api/console/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'same-origin' }] }];
  },
};

export default nextConfig;
