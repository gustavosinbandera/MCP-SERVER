/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Dev-only proxy so local Next dev behaves like nginx in Docker.
    // In Docker/production we rely on nginx routing (/api -> gateway), so keep this off.
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      // MCP tools catalog
      { source: '/api/mcp/tools', destination: 'http://localhost:3001/mcp/tools' },
      { source: '/api/mcp/tools/:path*', destination: 'http://localhost:3001/mcp/tools/:path*' },

      // MCP JSON-RPC endpoint used by the web UI
      { source: '/api/mcp', destination: 'http://localhost:3001/mcp' },

      // Files explorer API
      { source: '/api/files/:path*', destination: 'http://localhost:3001/files/:path*' },

      // Azure work items API
      { source: '/api/azure/:path*', destination: 'http://localhost:3001/azure/:path*' },
    ];
  },
};

module.exports = nextConfig;
