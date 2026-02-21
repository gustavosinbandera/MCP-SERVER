// Run in gateway container: docker cp script mcp-gateway:/tmp/ && docker exec mcp-gateway node /tmp/test-mediawiki-login.mjs
const origin = 'https://dev.magaya.com';
const apiUrl = origin + '/api.php';
const user = process.env.INDEX_URL_USER;
const pass = process.env.INDEX_URL_PASSWORD;
if (!user || !pass) {
  console.error('INDEX_URL_USER or INDEX_URL_PASSWORD missing');
  process.exit(1);
}
const headers = { 'User-Agent': 'MCP-Knowledge-Hub/1.0' };
const tokenRes = await fetch(apiUrl + '?action=query&meta=tokens&type=login&format=json', { headers });
const tokenData = await tokenRes.json();
const token = tokenData?.query?.tokens?.logintoken;
const setCookie = tokenRes.headers.getSetCookie?.().join('; ') || tokenRes.headers.get('set-cookie') || '';
console.log('Token length:', token?.length);
console.log('Set-Cookie present:', !!setCookie);
const body = new URLSearchParams({
  action: 'login',
  lgname: user,
  lgpassword: pass,
  lgtoken: token,
  format: 'json',
});
const loginRes = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'application/x-www-form-urlencoded',
    Cookie: setCookie,
  },
  body: body.toString(),
});
const loginData = await loginRes.json();
console.log('Login result:', JSON.stringify(loginData, null, 2));
