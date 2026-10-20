import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Pin the workspace root: a stray lockfile in a parent directory must not change tracing.
const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  reactStrictMode: true,
  // Article images are not displayed (licensing + privacy: hotlinking leaks reader IPs), so the
  // image optimizer has no remote patterns at all.
  images: { remotePatterns: [] },
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
  async headers() {
    return [
      {
        source: '/geo/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, immutable' }],
      },
    ];
  },
};

export default nextConfig;
