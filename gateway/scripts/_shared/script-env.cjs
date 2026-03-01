const fs = require('fs');
const path = require('path');

function findGatewayRoot(startDir) {
  let dir = startDir;
  while (true) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

function gatewayRoot() {
  // scripts/<domain>/<script>.cjs → startDir is scripts/<domain>
  // scripts/_shared/<file>.cjs → startDir is scripts/_shared
  return findGatewayRoot(path.resolve(__dirname, '..'));
}

function distPath(file) {
  return path.join(gatewayRoot(), 'dist', file);
}

function loadGatewayEnv() {
  // Always load gateway/.env, regardless of current working directory
  const envPath = path.join(gatewayRoot(), '.env');
  try {
    // dotenv is a dependency of gateway
    require('dotenv').config({ path: envPath, override: true });
  } catch (err) {
    // If dotenv isn't available for some reason, do nothing.
  }
  return envPath;
}

module.exports = {
  gatewayRoot,
  distPath,
  loadGatewayEnv,
  requireDist: function requireDist(candidates) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    let lastErr = null;
    for (const c of list) {
      if (!c) continue;
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        return require(distPath(c));
      } catch (err) {
        lastErr = err;
      }
    }
    const msg = lastErr && lastErr.message ? lastErr.message : String(lastErr);
    throw new Error(`Failed to require dist module. Candidates: ${list.join(', ')}. Last error: ${msg}`);
  },
};

