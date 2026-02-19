/**
 * Parchea dist/mcp-server.js para que Node resuelva el SDK (require sin .js falla en algunas versiones).
 */
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'dist', 'mcp-server.js');
let code = fs.readFileSync(p, 'utf8');
code = code.replace(
  /require\("@modelcontextprotocol\/sdk\/server\/mcp"\)/g,
  'require("@modelcontextprotocol/sdk/server/mcp.js")'
);
code = code.replace(
  /require\("@modelcontextprotocol\/sdk\/server\/stdio"\)/g,
  'require("@modelcontextprotocol/sdk/server/stdio.js")'
);
fs.writeFileSync(p, code);
console.log('Patched dist/mcp-server.js (MCP SDK requires)');
