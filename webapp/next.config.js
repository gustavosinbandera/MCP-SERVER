/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Proxy /api/* to gateway so Azure, MCP, files work in both dev and production.
    // In Docker behind nginx, nginx may route /api to gateway directly; these rewrites still apply when the browser hits Next.
    const gateway = 'http://localhost:3001';
    return [
      { source: '/api/mcp/tools', destination: `${gateway}/mcp/tools` },
      { source: '/api/mcp/tools/:path*', destination: `${gateway}/mcp/tools/:path*` },
      { source: '/api/mcp', destination: `${gateway}/mcp` },
      { source: '/api/files/:path*', destination: `${gateway}/files/:path*` },
      { source: '/api/azure/:path*', destination: `${gateway}/azure/:path*` },
    ];
  },
};

module.exports = nextConfig;
