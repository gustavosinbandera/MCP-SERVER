/**
 * Valida conexión a Azure DevOps (mismo .env que usar-mcp).
 * Uso: node gateway/scripts/azure/validate-azure-connection.cjs
 * Timeout por defecto 15 s; override: AZURE_VALIDATE_TIMEOUT_MS=20000
 */
const path = require('path');
const { loadGatewayEnv } = require('../_shared/script-env.cjs');

loadGatewayEnv();

const BASE = (process.env.AZURE_DEVOPS_BASE_URL || '').trim();
const PROJECT = (process.env.AZURE_DEVOPS_PROJECT || '').trim();
const PAT = (process.env.AZURE_DEVOPS_PAT || '').trim();
const TIMEOUT_MS = Math.max(3000, parseInt(process.env.AZURE_VALIDATE_TIMEOUT_MS || '15000', 10));

if (!BASE || !PROJECT) {
  console.error('Falta config: AZURE_DEVOPS_BASE_URL y AZURE_DEVOPS_PROJECT en gateway/.env');
  process.exit(1);
}
if (!PAT) {
  console.error('Falta AZURE_DEVOPS_PAT en gateway/.env');
  process.exit(1);
}

const base = BASE.replace(/\/+$/, '');
const projectEnc = encodeURIComponent(PROJECT);
const url = `${base}/${projectEnc}/_apis/wit/wiql?api-version=7.0`;
const auth = 'Basic ' + Buffer.from(':' + PAT, 'utf8').toString('base64');

console.log('Validando Azure DevOps...');
console.log('  URL:', url);
console.log('  Timeout:', TIMEOUT_MS, 'ms');
console.log('');

const controller = new AbortController();
const to = setTimeout(() => controller.abort(), TIMEOUT_MS);

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: auth,
  },
  body: JSON.stringify({ query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] = 1' }),
  signal: controller.signal,
})
  .then((res) => {
    clearTimeout(to);
    if (!res.ok) {
      return res.text().then((t) => {
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${t.slice(0, 500)}`);
      });
    }
    return res.json();
  })
  .then((data) => {
    clearTimeout(to);
    console.log('OK. Azure DevOps responde correctamente.');
    if (data && typeof data === 'object') console.log('  (WIQL devolvió respuesta válida)');
    setImmediate(() => process.exit(0));
  })
  .catch((err) => {
    clearTimeout(to);
    const name = err.name || '';
    const msg = err.message || String(err);
    if (name === 'AbortError' || msg.includes('abort')) {
      console.error('TIMEOUT: La conexión a Azure DevOps superó', TIMEOUT_MS, 'ms.');
      console.error('  Posibles causas: VPN requerida, firewall, o devops.magaya.com inaccesible desde tu red (ej. Starlink).');
    } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      console.error('RED: No se pudo conectar al servidor.', msg);
      console.error('  Comprueba VPN si devops.magaya.com es interno.');
    } else {
      console.error('Error:', msg);
    }
    process.exit(1);
  });
