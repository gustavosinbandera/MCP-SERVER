/**
 * Indexador de URLs: obtiene el contenido de una URL (HTML → texto) y lo indexa en Qdrant.
 * Permite indexar "información de URLs con contenido importante" en la misma colección mcp_docs.
 */
import { createHash } from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { convert } from 'html-to-text';
import { embed, hasEmbedding, getVectorSize } from './embedding';
import { chunkText } from './chunking';
import { getQdrantClient } from './qdrant-client';
import { COLLECTION_NAME, BATCH_UPSERT_SIZE } from './config';

const FETCH_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024; // 2 MB

const cookieJar = new Map<string, string>();

function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function mergeSetCookie(host: string, response: Response): void {
  const setCookie = response.headers.getSetCookie?.();
  if (!setCookie || setCookie.length === 0) return;
  const existing = cookieJar.get(host) || '';
  const parts = existing ? existing.split('; ').filter(Boolean) : [];
  const seen = new Set(parts.map((p) => p.split('=')[0]));
  for (const raw of setCookie) {
    const nameVal = raw.split(';')[0].trim();
    const name = nameVal.split('=')[0];
    if (name && !seen.has(name)) {
      parts.push(nameVal);
      seen.add(name);
    }
  }
  if (parts.length > 0) cookieJar.set(host, parts.join('; '));
}

function getAuthHeaders(): Record<string, string> {
  const user = process.env.INDEX_URL_USER;
  const pass = process.env.INDEX_URL_PASSWORD;
  if (user && pass) {
    const encoded = Buffer.from(`${user}:${pass}`, 'utf-8').toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

function getCookieHeader(host: string): Record<string, string> {
  const c = cookieJar.get(host);
  return c ? { Cookie: c } : {};
}

async function mediaWikiLogin(origin: string): Promise<boolean> {
  const user = process.env.INDEX_URL_USER;
  const pass = process.env.INDEX_URL_PASSWORD;
  if (!user || !pass) return false;
  const host = getHost(origin);
  if (!host) return false;
  const apiUrl = `${origin.replace(/\/$/, '')}/api.php`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { 'User-Agent': 'MCP-Knowledge-Hub/1.0 (indexer)', ...getAuthHeaders() };
  try {
    const tokenRes = await fetch(`${apiUrl}?action=query&meta=tokens&type=login&format=json`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);
    mergeSetCookie(host, tokenRes);
    const tokenData = await tokenRes.json();
    const token = (tokenData as { query?: { tokens?: { logintoken?: string } }; error?: { code?: string } })
      ?.query?.tokens?.logintoken;
    if (!token && (tokenData as { error?: { code?: string } })?.error?.code === 'readapidenied') {
      return false;
    }
    if (!token) return false;
    const loginController = new AbortController();
    const loginTimeout = setTimeout(() => loginController.abort(), FETCH_TIMEOUT_MS);
    const body = new URLSearchParams({
      action: 'login',
      lgname: user,
      lgpassword: pass,
      lgtoken: token,
      format: 'json',
    });
    const loginRes = await fetch(apiUrl, {
      method: 'POST',
      signal: loginController.signal,
      headers: {
        ...headers,
        ...getCookieHeader(host),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    clearTimeout(loginTimeout);
    mergeSetCookie(host, loginRes);
    const loginData = await loginRes.json();
    const result = (loginData as { login?: { result?: string } })?.login?.result;
    return result === 'Success';
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

async function ensureSessionForUrl(url: string): Promise<void> {
  const host = getHost(url);
  if (!host || cookieJar.has(host)) return;
  const user = process.env.INDEX_URL_USER;
  const pass = process.env.INDEX_URL_PASSWORD;
  if (!user || !pass) return;
  const origin = `${new URL(url).protocol}//${host}`;
  try {
    const ok = await mediaWikiLogin(origin);
    if (ok) logProgress(`[Login] Sesión iniciada en ${host}`);
  } catch {
    // ignorar
  }
}

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim().slice(0, 500) || null : null;
}

/** Extensiones consideradas "archivo" (no página HTML) para list_url_links. */
const FILE_EXT = /\.(pdf|zip|tar|gz|rar|7z|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|gif|svg|webp|mp4|mp3|wav|exe|dll|msi)(\?|#|$)/i;

/**
 * Obtiene el HTML crudo de una URL (para extraer enlaces). Respeta sesión y auth.
 */
async function fetchUrlHtml(url: string): Promise<string> {
  await ensureSessionForUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MCP-Knowledge-Hub/1.0 (indexer)',
        ...getAuthHeaders(),
        ...getCookieHeader(getHost(url)),
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const raw = await res.text();
    if (raw.length > MAX_CONTENT_LENGTH) throw new Error(`Contenido mayor a ${MAX_CONTENT_LENGTH / 1024 / 1024} MB`);
    return raw;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extrae enlaces (href) del HTML y los resuelve a URLs absolutas.
 * Separa en "enlaces" (páginas/sublinks) y "archivos" (por extensión).
 */
export function extractLinksFromHtml(html: string, baseUrl: string): { links: string[]; fileLinks: string[] } {
  const links: string[] = [];
  const fileLinks: string[] = [];
  const seen = new Set<string>();
  try {
    const base = new URL(baseUrl);
    const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(html)) !== null) {
      const href = m[1].trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      let absolute: string;
      try {
        absolute = new URL(href, base).href;
      } catch {
        continue;
      }
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      if (FILE_EXT.test(absolute)) {
        fileLinks.push(absolute);
      } else {
        links.push(absolute);
      }
    }
  } catch {
    // baseUrl inválida
  }
  return { links, fileLinks };
}

export type ListUrlLinksResult = {
  url: string;
  linkCount: number;
  fileCount: number;
  links: string[];
  fileLinks: string[];
  error?: string;
};

/**
 * Lista todos los subenlaces y archivos encontrados en una URL.
 * Devuelve conteos y listas; la tool MCP formatea la salida en Markdown.
 */
export async function listUrlLinks(url: string): Promise<ListUrlLinksResult> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { url, linkCount: 0, fileCount: 0, links: [], fileLinks: [], error: 'URL debe comenzar con http:// o https://' };
  }
  try {
    const html = await fetchUrlHtml(url);
    const { links, fileLinks } = extractLinksFromHtml(html, url);
    return {
      url,
      linkCount: links.length,
      fileCount: fileLinks.length,
      links,
      fileLinks,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { url, linkCount: 0, fileCount: 0, links: [], fileLinks: [], error: msg };
  }
}

/**
 * Formatea el resultado de listUrlLinks en Markdown para la consola/cliente.
 */
export function formatListUrlLinksMarkdown(r: ListUrlLinksResult): string {
  if (r.error) {
    return `## Error\n\nNo se pudo analizar la URL: **${r.url}**\n\n${r.error}`;
  }
  const lines: string[] = [
    `## Enlaces en la URL`,
    '',
    `**URL:** ${r.url}`,
    '',
    `| Tipo | Cantidad |`,
    `|------|----------|`,
    `| Sublinks / páginas | ${r.linkCount} |`,
    `| Archivos | ${r.fileCount} |`,
    '',
    `**Total:** ${r.linkCount + r.fileCount} elementos`,
    '',
  ];
  if (r.links.length > 0) {
    lines.push('### Sublinks (páginas)', '');
    r.links.slice(0, 200).forEach((u) => lines.push(`- ${u}`));
    if (r.links.length > 200) lines.push('', `_… y ${r.links.length - 200} enlaces más._`, '');
    lines.push('');
  }
  if (r.fileLinks.length > 0) {
    lines.push('### Archivos', '');
    r.fileLinks.slice(0, 100).forEach((u) => lines.push(`- ${u}`));
    if (r.fileLinks.length > 100) lines.push('', `_… y ${r.fileLinks.length - 100} archivos más._`, '');
  }
  return lines.join('\n');
}

/**
 * Devuelve el contenido de una URL en formato Markdown (título + texto) para mostrar en consola.
 */
export async function viewUrlContent(url: string): Promise<{ url: string; title: string; content: string; error?: string }> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { url, title: '', content: '', error: 'URL debe comenzar con http:// o https://' };
  }
  try {
    const { title, content } = await fetchUrlContent(url);
    const md = [
      `## ${title}`,
      '',
      `**URL:** ${url}`,
      '',
      '---',
      '',
      content || '_Sin contenido de texto._',
    ].join('\n');
    return { url, title, content: md, error: undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { url, title: '', content: '', error: msg };
  }
}

export async function fetchUrlContent(url: string): Promise<{ title: string; content: string }> {
  await ensureSessionForUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MCP-Knowledge-Hub/1.0 (indexer)',
        ...getAuthHeaders(),
        ...getCookieHeader(getHost(url)),
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const raw = await res.text();
    if (raw.length > MAX_CONTENT_LENGTH) throw new Error(`Contenido mayor a ${MAX_CONTENT_LENGTH / 1024 / 1024} MB`);
    if (contentType.includes('text/html')) {
      const title = extractTitleFromHtml(raw) || url;
      const html = raw.length > MAX_CONTENT_LENGTH ? raw.slice(0, MAX_CONTENT_LENGTH) : raw;
      const content = convert(html, { wordwrap: 120 });
      return { title: title.slice(0, 500), content: content.slice(0, MAX_CONTENT_LENGTH) };
    }
    return { title: url, content: raw.slice(0, MAX_CONTENT_LENGTH) };
  } finally {
    clearTimeout(timeout);
  }
}

function stableIdFromUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

async function ensureCollection(client: QdrantClient): Promise<void> {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
  if (!exists) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: getVectorSize(), distance: 'Cosine' },
    });
  }
}

export async function indexUrl(url: string): Promise<{ indexed: boolean; title: string; error?: string }> {
  const client = getQdrantClient({ checkCompatibility: false });
  await ensureCollection(client);
  try {
    const { title, content } = await fetchUrlContent(url);

    if (hasEmbedding()) {
      const chunks = chunkText(content);
      const points: { id: string; vector: number[]; payload: Record<string, unknown> }[] = [];
      for (const chunk of chunks) {
        const vector = await embed(chunk.text);
        if (vector == null) continue;
        const id = createHash('sha256').update(`${url}#${chunk.chunk_index}`).digest('hex').slice(0, 32);
        points.push({
          id,
          vector,
          payload: {
            title,
            content: chunk.text,
            url,
            chunk_index: chunk.chunk_index,
            total_chunks: chunk.total_chunks,
          },
        });
      }
      if (points.length > 0) {
        await client.delete(COLLECTION_NAME, {
          filter: { must: [{ key: 'url', match: { value: url } }] },
        });
        for (let i = 0; i < points.length; i += BATCH_UPSERT_SIZE) {
          const batch = points.slice(i, i + BATCH_UPSERT_SIZE);
          await client.upsert(COLLECTION_NAME, { wait: true, points: batch });
        }
      }
      return { indexed: true, title };
    }

    const id = stableIdFromUrl(url);
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: [{ id, vector: [0], payload: { title, content, url } }],
    });
    return { indexed: true, title };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { indexed: false, title: url, error: msg };
  }
}

function extractSameOriginLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const links: string[] = [];
  const hrefRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
    try {
      const absolute = new URL(href, base);
      if (absolute.host !== base.host) continue;
      const url = absolute.href.split('#')[0];
      if (!seen.has(url)) {
        seen.add(url);
        links.push(url);
      }
    } catch {
      continue;
    }
  }
  return links;
}

async function fetchHtml(url: string): Promise<string> {
  await ensureSessionForUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MCP-Knowledge-Hub/1.0 (indexer)',
        ...getAuthHeaders(),
        ...getCookieHeader(getHost(url)),
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function logProgress(msg: string): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ${msg}`);
}

export type IndexUrlWithLinksOptions = { onProgress?: (current: number, total: number, message: string) => void };

export async function indexUrlWithLinks(
  url: string,
  maxLinks = 20,
  options?: IndexUrlWithLinksOptions
): Promise<{ indexed: number; total: number; urls: string[]; errors: string[] }> {
  const result = { indexed: 0, total: 0, urls: [] as string[], errors: [] as string[] };
  const report = (current: number, total: number, message: string) => {
    logProgress(`[${current}/${total}] ${message}`);
    options?.onProgress?.(current, total, message);
  };
  report(1, 1, `Descargando e indexando: ${url}`);
  const r = await indexUrl(url);
  if (r.indexed) {
    result.indexed++;
    report(1, 1, `OK: ${r.title}`);
  } else {
    if (r.error) result.errors.push(`${url}: ${r.error}`);
    report(1, 1, `Error: ${r.error ?? 'desconocido'}`);
  }
  result.total++;
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (e) {
    result.errors.push(`${url} (links): ${e instanceof Error ? e.message : String(e)}`);
    logProgress('No se pudieron obtener enlaces de la página.');
    return result;
  }
  const links = extractSameOriginLinks(html, url).slice(0, maxLinks);
  const total = 1 + links.length;
  logProgress(`Encontrados ${links.length} enlaces del mismo dominio. Indexando hasta ${maxLinks}...`);
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const current = i + 2;
    report(current, total, `Indexando: ${link}`);
    const r = await indexUrl(link);
    if (r.indexed) {
      result.indexed++;
      result.urls.push(link);
      report(current, total, `OK: ${r.title}`);
    } else {
      if (r.error) result.errors.push(`${link}: ${r.error}`);
      report(current, total, `Error: ${r.error ?? 'desconocido'}`);
    }
    result.total++;
  }
  logProgress(`Terminado: ${result.indexed}/${result.total} páginas indexadas, ${result.errors.length} error(es).`);
  return result;
}

export type IndexSiteOptions = { onProgress?: (indexed: number, queueLength: number, url: string) => void };

export async function indexSite(
  seedUrl: string,
  maxPages = 1000,
  options?: IndexSiteOptions
): Promise<{ indexed: number; errors: string[]; urls: string[] }> {
  const visited = new Set<string>();
  const queue: string[] = [seedUrl];
  const result = { indexed: 0, errors: [] as string[], urls: [] as string[] };
  while (queue.length > 0 && result.indexed < maxPages) {
    const url = queue.shift()!;
    const urlNorm = url.split('#')[0].trim();
    if (visited.has(urlNorm)) continue;
    visited.add(urlNorm);
    const n = result.indexed + 1;
    logProgress(`[SITE] (${n}/${maxPages}) Indexando: ${urlNorm}`);
    options?.onProgress?.(result.indexed, queue.length, urlNorm);
    try {
      const r = await indexUrl(urlNorm);
      if (r.indexed) {
        result.indexed++;
        result.urls.push(urlNorm);
        logProgress(`[SITE] (${result.indexed}/${maxPages}) OK: ${urlNorm} — ${r.title}`);
      } else {
        if (r.error) result.errors.push(`${urlNorm}: ${r.error}`);
        logProgress(`[SITE] (${n}/${maxPages}) Error: ${urlNorm} — ${r.error ?? 'desconocido'}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${urlNorm}: ${msg}`);
      logProgress(`[SITE] (${n}/${maxPages}) Error: ${urlNorm} — ${msg}`);
    }
    if (result.indexed >= maxPages) break;
    let html: string;
    try {
      html = await fetchHtml(urlNorm);
    } catch {
      continue;
    }
    const links = extractSameOriginLinks(html, urlNorm);
    for (const link of links) {
      const norm = link.split('#')[0].trim();
      if (!visited.has(norm) && !queue.includes(norm)) queue.push(norm);
    }
  }
  logProgress(`[SITE] Terminado: ${result.indexed} páginas indexadas, ${result.errors.length} error(es).`);
  return result;
}

export function getUrlsToIndex(): string[] {
  const raw = process.env.INDEX_URLS;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[;|]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://')));
}

export function getSiteUrlsToIndex(): string[] {
  const raw = process.env.INDEX_SITE_URLS;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[;|]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://')));
}

export function getSiteMaxPages(): number {
  const n = process.env.INDEX_SITE_MAX_PAGES;
  if (n === undefined || n === '') return 1000;
  const parsed = parseInt(n, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10000) : 1000;
}
