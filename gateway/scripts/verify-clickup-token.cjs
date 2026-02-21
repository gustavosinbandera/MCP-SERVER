/**
 * Verifica que CLICKUP_API_TOKEN en gateway/.env sea válido.
 * Llama a GET /user (el endpoint más simple). Si falla 401, el token está revocado o es inválido.
 * Uso: desde gateway/ → node scripts/verify-clickup-token.cjs
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: true });

const { getAuthorizedUser, hasClickUpToken } = require('../dist/clickup-client.js');

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }
  try {
    const user = await getAuthorizedUser();
    console.log('Token válido. Usuario:', user.username || user.id, '| id:', user.id);
  } catch (err) {
    console.error('Token inválido o revocado:', err.message);
    console.error('En ClickUp: Settings → Apps → API Token → genera un nuevo token (pk_...) y actualiza gateway/.env');
    process.exit(1);
  }
}

main();
