/**
 * URL indexer: fetches URL content (HTML → text) and indexes it in Qdrant.
 * Allows indexing "information from important URLs" into the same mcp_docs collection.
 */
import { createHash } from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { convert } from 'html-to-text';
import { embedBatch, hasEmbedding, getVectorSize } from './embedding';
import { chunkText } from './chunking';
import { getQdrantClient } from './qdrant-client';
import { COLLECTION_NAME, BATCH_UPSERT_SIZE, getBranchForProject, getRequireEmbeddings } from './config';
import { recordUrl } from './indexing-stats';
import { recordIndexingEventMetric } from './metrics';

const FETCH_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024; // 2 MB (indexing)
/** Limit for view_url: full document. Env VIEW_URL_MAX_LENGTH in bytes (default 10 MB, max 50 MB). 0 = 50 MB. */
const VIEW_URL_MAX_LENGTH = (() => {
  const n = process.env.VIEW_URL_MAX_LENGTH;
  if (n == null || n === '') return 10 * 1024 * 1024;
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 0) return 10 * 1024 * 1024;
  if (v === 0) return 50 * 1024 * 1024;
  return Math.min(v, 50 * 1024 * 1024);
})();

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
    if (ok) logProgress(`[Login] Signed in on ${host}`);
  } catch {
    // ignore
  }
}

export type LoginMediaWikiResult = { success: boolean; message: string };

/**
 * Log into a MediaWiki site (fetches a login token via API and sets cookies).
 * Uses INDEX_URL_USER and INDEX_URL_PASSWORD from gateway/.env.
 * After a successful login, view_url/index_url/list_url_links will use the session for that host.
 */
export async function loginMediaWiki(urlOrOrigin: string): Promise<LoginMediaWikiResult> {
  const user = process.env.INDEX_URL_USER;
  const pass = process.env.INDEX_URL_PASSWORD;
  if (!user || !pass) {
    return {
      success: false,
      message: 'INDEX_URL_USER or INDEX_URL_PASSWORD is missing in gateway/.env. Set them to sign in.',
    };
  }
  let origin: string;
  try {
    const u = new URL(urlOrOrigin.trim());
    origin = `${u.protocol}//${u.host}`;
  } catch {
    return { success: false, message: `Invalid URL/origin: ${urlOrOrigin}` };
  }
  const host = getHost(origin);
  if (!host) return { success: false, message: `Could not extract host from: ${origin}` };
  try {
    const ok = await mediaWikiLogin(origin);
    if (ok) {
      return {
        success: true,
        message: `Signed in on **${host}**. The tools view_url, index_url, and list_url_links will use this session for this site.`,
      };
    }
    return {
      success: false,
      message: `Could not sign in on ${host}. Check username/password in gateway/.env and ensure the site is MediaWiki with a login API.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `Login error: ${msg}` };
  }
}

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim().slice(0, 500) || null : null;
}

/** Get the text of a DOM node (domhandler: type, data, children). Used by view_url to return code in ``` blocks. */
function getTextContentFromNode(node: { type?: string; data?: string; children?: unknown[] } | null | undefined): string {
  if (!node) return '';
  if (node.type === 'text' && typeof node.data === 'string') return node.data.replace(/\r\n/g, '\n');
  if (Array.isArray(node.children) && node.children.length > 0) {
    return node.children
      .map((c) => getTextContentFromNode(c as { type?: string; data?: string; children?: unknown[] }))
      .join('');
  }
  return '';
}

/** Detect code language from class (language-js, mw-highlight-source-javascript, etc.). */
function getCodeLanguageFromElem(elem: { attribs?: Record<string, string>; parent?: { attribs?: Record<string, string> } }): string {
  const cls = elem.attribs?.class ?? elem.parent?.attribs?.class ?? '';
  const m = cls.match(/\b(?:language-|mw-highlight-source-)(\w+)/i) ?? cls.match(/\bsource-(\w+)/i);
  if (m) {
    const lang = m[1].toLowerCase();
    if (['javascript', 'js', 'node'].includes(lang)) return 'javascript';
    if (['typescript', 'ts'].includes(lang)) return 'typescript';
    if (['json'].includes(lang)) return 'json';
    if (['html', 'xml'].includes(lang)) return 'html';
    if (['css', 'scss'].includes(lang)) return 'css';
    if (['bash', 'sh', 'shell'].includes(lang)) return 'bash';
    return lang;
  }
  return '';
}

/**
 * Options for html-to-text. If preserveCodeBlocks is true (view_url), we preserve pre/code and MediaWiki blocks (.mw-highlight),
 * use only .mw-parser-output, and wrap code blocks in ``` so output is ready-to-render Markdown.
 */
function getHtmlToTextOptions(preserveCodeBlocks: boolean): {
  wordwrap: number;
  preserveNewlines?: boolean;
  selectors?: Array<{ selector: string; format: string; options?: Record<string, unknown> }>;
  baseElements?: { selectors: string[]; returnDomByDefault: boolean };
  formatters?: Record<string, (elem: unknown, walk: unknown, builder: unknown, formatOptions: unknown) => void>;
} {
  const base = { wordwrap: 120 };
  if (!preserveCodeBlocks) return base;

  const preAsMarkdownCode: (elem: unknown, walk: unknown, builder: unknown, formatOptions: unknown) => void = (
    elem,
    _walk,
    builder,
    formatOptions,
  ) => {
    const b = builder as { openBlock: (o?: Record<string, unknown>) => void; closeBlock: (o?: Record<string, unknown>) => void; addLiteral: (s: string) => void };
    const opts = (formatOptions as Record<string, unknown>) || {};
    const leading = (opts.leadingLineBreaks as number) ?? 2;
    const trailing = (opts.trailingLineBreaks as number) ?? 2;
    const text = getTextContentFromNode(elem as { type?: string; data?: string; children?: unknown[] });
    const lang = getCodeLanguageFromElem(elem as { attribs?: Record<string, string>; parent?: { attribs?: Record<string, string> } });
    const fence = lang ? `\`\`\`${lang}\n` : '```\n';
    b.openBlock({ leadingLineBreaks: leading });
    b.addLiteral(fence + text.trimEnd() + '\n```');
    b.closeBlock({ trailingLineBreaks: trailing });
  };

  return {
    ...base,
    preserveNewlines: true,
    baseElements: {
      selectors: ['.mw-parser-output'],
      returnDomByDefault: true,
    },
    formatters: {
      preAsMarkdownCode,
    },
    selectors: [
      { selector: 'pre', format: 'preAsMarkdownCode', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
      { selector: 'div.mw-highlight', format: 'preAsMarkdownCode', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
      { selector: 'div[class*="mw-highlight"]', format: 'preAsMarkdownCode', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
    ],
  };
}

/** Extensions considered a "file" (not an HTML page) for list_url_links. */
const FILE_EXT = /\.(pdf|zip|tar|gz|rar|7z|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|gif|svg|webp|mp4|mp3|wav|exe|dll|msi)(\?|#|$)/i;

/**
 * Fetch raw HTML for a URL (to extract links). Respects session and auth.
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
    if (raw.length > MAX_CONTENT_LENGTH) throw new Error(`Content larger than ${MAX_CONTENT_LENGTH / 1024 / 1024} MB`);
    return raw;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract links (href) from HTML and resolve them to absolute URLs.
 * Splits into "links" (pages/sublinks) and "files" (by extension).
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
    // invalid baseUrl
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
 * List all sub-links and files found in a URL.
 * Returns counts and lists; the MCP tool formats the output as Markdown.
 */
export async function listUrlLinks(url: string): Promise<ListUrlLinksResult> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { url, linkCount: 0, fileCount: 0, links: [], fileLinks: [], error: 'URL must start with http:// or https://' };
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
 * Format listUrlLinks result as Markdown for console/client.
 */
export function formatListUrlLinksMarkdown(r: ListUrlLinksResult): string {
  if (r.error) {
    return `## Error\n\nCould not analyze URL: **${r.url}**\n\n${r.error}`;
  }
  const lines: string[] = [
    `## Links on the URL`,
    '',
    `**URL:** ${r.url}`,
    '',
    `| Type | Count |`,
    `|------|----------|`,
    `| Sublinks / pages | ${r.linkCount} |`,
    `| Files | ${r.fileCount} |`,
    '',
    `**Total:** ${r.linkCount + r.fileCount} items`,
    '',
  ];
  if (r.links.length > 0) {
    lines.push('### Sublinks (pages)', '');
    r.links.slice(0, 200).forEach((u) => lines.push(`- ${u}`));
    if (r.links.length > 200) lines.push('', `_… and ${r.links.length - 200} more links._`, '');
    lines.push('');
  }
  if (r.fileLinks.length > 0) {
    lines.push('### Files', '');
    r.fileLinks.slice(0, 100).forEach((u) => lines.push(`- ${u}`));
    if (r.fileLinks.length > 100) lines.push('', `_… and ${r.fileLinks.length - 100} more files._`, '');
  }
  return lines.join('\n');
}

export type ViewUrlContentOptions = { renderJs?: boolean };

/**
 * Return URL content as Markdown (title + text) to display in console.
 * Uses VIEW_URL_MAX_LENGTH to return the full document (without the 2 MB indexing cap).
 * renderJs: if true, uses a headless browser (Puppeteer) for pages that load content via JavaScript (SPA).
 */
export async function viewUrlContent(
  url: string,
  options?: ViewUrlContentOptions,
): Promise<{ url: string; title: string; content: string; error?: string }> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { url, title: '', content: '', error: 'URL must start with http:// or https://' };
  }
  try {
    const { title, content } = await fetchUrlContent(url, {
      maxContentLength: VIEW_URL_MAX_LENGTH,
      renderJs: options?.renderJs,
    });
    const md = [
      `## ${title}`,
      '',
      `**URL:** ${url}`,
      '',
      '---',
      '',
      content || '_No text content._',
    ].join('\n');
    return { url, title, content: md, error: undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { url, title: '', content: '', error: msg };
  }
}

export type FetchUrlContentOptions = { maxContentLength?: number; renderJs?: boolean };

/**
 * Fetch title and text content from a URL (HTML converted to text).
 * For indexing it uses MAX_CONTENT_LENGTH (2 MB). For view_url it uses maxContentLength (e.g. VIEW_URL_MAX_LENGTH).
 * If renderJs is true or INDEX_URL_USE_BROWSER=true, it uses Puppeteer to fetch HTML (SPAs that load via JS).
 */
export async function fetchUrlContent(
  url: string,
  options?: FetchUrlContentOptions,
): Promise<{ title: string; content: string }> {
  const maxLen = options?.maxContentLength ?? MAX_CONTENT_LENGTH;
  const useBrowser = options?.renderJs === true || process.env.INDEX_URL_USE_BROWSER === 'true';

  let raw: string;
  let contentType = '';
  if (useBrowser) {
    const { getHtmlWithBrowser } = await import('./fetch-with-browser');
    raw = await getHtmlWithBrowser(url);
    contentType = 'text/html';
  } else {
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
      contentType = (res.headers.get('content-type') || '').toLowerCase();
      raw = await res.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  if (raw.length > maxLen) throw new Error(`Contenido mayor a ${maxLen / 1024 / 1024} MB`);
  if (contentType.includes('text/html')) {
    const title = extractTitleFromHtml(raw) || url;
    const html = raw.length > maxLen ? raw.slice(0, maxLen) : raw;
    const htmlToTextOptions = getHtmlToTextOptions(maxLen === VIEW_URL_MAX_LENGTH);
    const content = convert(html, htmlToTextOptions);
    return { title: title.slice(0, 500), content: content.slice(0, maxLen) };
  }
  return { title: url, content: raw.slice(0, maxLen) };
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

/** Check whether the URL already has at least one point in the collection (payload.url). */
export async function isUrlIndexed(url: string): Promise<boolean> {
  const client = getQdrantClient({ checkCompatibility: false });
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
  if (!exists) return false;
  const { points } = await client.scroll(COLLECTION_NAME, {
    filter: { must: [{ key: 'url', match: { value: url } }] },
    limit: 1,
    with_payload: false,
    with_vector: false,
  });
  return points.length > 0;
}

export type IndexUrlOptions = { renderJs?: boolean; project?: string };

const DEFAULT_URL_PROJECT = (process.env.INDEX_URL_DEFAULT_PROJECT || 'urls').trim() || 'urls';

export async function indexUrl(url: string, options?: IndexUrlOptions): Promise<{ indexed: boolean; title: string; error?: string }> {
  if (getRequireEmbeddings() && !hasEmbedding()) {
    return {
      indexed: false,
      title: url,
      error: 'INDEX_REQUIRE_EMBEDDINGS=true and OPENAI_API_KEY is missing. URL indexing blocked.',
    };
  }
  const client = getQdrantClient({ checkCompatibility: false });
  await ensureCollection(client);
  try {
    const { title, content } = await fetchUrlContent(url, { renderJs: options?.renderJs });

    const project = (options?.project || DEFAULT_URL_PROJECT).trim();
    const branch = getBranchForProject(project) ?? undefined;

    if (hasEmbedding()) {
      const chunks = chunkText(content);
      const texts = chunks.map((c) => c.text);
      const vectors = await embedBatch(texts);
      const points: { id: string; vector: number[]; payload: Record<string, unknown> }[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const vector = vectors[i];
        if (vector == null) continue;
        const chunk = chunks[i];
        const id = createHash('sha256').update(`${url}#${chunk.chunk_index}`).digest('hex').slice(0, 32);
        const payload: Record<string, unknown> = {
          title,
          content: chunk.text,
          url,
          chunk_index: chunk.chunk_index,
          total_chunks: chunk.total_chunks,
          source_type: 'url',
          project,
        };
        if (branch) payload.branch = branch;
        points.push({ id, vector, payload });
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
      recordUrl(1);
      recordIndexingEventMetric({ source: 'url', indexed: 1, url: 1 });
      return { indexed: true, title };
    }

    const id = stableIdFromUrl(url);
    const payload: Record<string, unknown> = { title, content, url, source_type: 'url', project };
    if (branch) payload.branch = branch;
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: [{ id, vector: [0], payload }],
    });
    recordUrl(1);
    recordIndexingEventMetric({ source: 'url', indexed: 1, url: 1 });
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

export type IndexUrlWithLinksOptions = {
  onProgress?: (current: number, total: number, message: string) => void;
  renderJs?: boolean;
};

async function getPageHtml(url: string, renderJs?: boolean): Promise<string> {
  if (renderJs) {
    const { getHtmlWithBrowser } = await import('./fetch-with-browser');
    return getHtmlWithBrowser(url);
  }
  return fetchHtml(url);
}

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
  const indexOpts = options?.renderJs != null ? { renderJs: options.renderJs } : undefined;
  report(1, 1, `Downloading and indexing: ${url}`);
  const r = await indexUrl(url, indexOpts);
  if (r.indexed) {
    result.indexed++;
    report(1, 1, `OK: ${r.title}`);
  } else {
    if (r.error) result.errors.push(`${url}: ${r.error}`);
    report(1, 1, `Error: ${r.error ?? 'unknown'}`);
  }
  result.total++;
  let html: string;
  try {
    html = await getPageHtml(url, options?.renderJs);
  } catch (e) {
    result.errors.push(`${url} (links): ${e instanceof Error ? e.message : String(e)}`);
    logProgress('Could not fetch links from the page.');
    return result;
  }
  const links = extractSameOriginLinks(html, url).slice(0, maxLinks);
  const total = 1 + links.length;
  logProgress(`Found ${links.length} same-domain links. Indexing up to ${maxLinks}...`);
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const current = i + 2;
    report(current, total, `Indexing: ${link}`);
    const r = await indexUrl(link, indexOpts);
    if (r.indexed) {
      result.indexed++;
      result.urls.push(link);
      report(current, total, `OK: ${r.title}`);
    } else {
      if (r.error) result.errors.push(`${link}: ${r.error}`);
      report(current, total, `Error: ${r.error ?? 'unknown'}`);
    }
    result.total++;
  }
  logProgress(`Done: ${result.indexed}/${result.total} pages indexed, ${result.errors.length} error(s).`);
  return result;
}

export type IndexSiteOptions = {
  onProgress?: (indexed: number, queueLength: number, url: string) => void;
  renderJs?: boolean;
  /** Si true, no reindexa URLs que ya tengan puntos en Qdrant; solo descubre enlaces para seguir el BFS. */
  skipAlreadyIndexed?: boolean;
};

export async function indexSite(
  seedUrl: string,
  maxPages = 1000,
  options?: IndexSiteOptions
): Promise<{ indexed: number; skipped: number; errors: string[]; urls: string[] }> {
  const visited = new Set<string>();
  const queue: string[] = [seedUrl];
  const result = { indexed: 0, skipped: 0, errors: [] as string[], urls: [] as string[] };
  const indexOpts = options?.renderJs != null ? { renderJs: options.renderJs } : undefined;
  while (queue.length > 0 && result.indexed < maxPages) {
    const url = queue.shift()!;
    const urlNorm = url.split('#')[0].trim();
    if (visited.has(urlNorm)) continue;
    visited.add(urlNorm);

    if (options?.skipAlreadyIndexed && (await isUrlIndexed(urlNorm))) {
      result.skipped++;
      logProgress(`[SITE] (${result.indexed + result.skipped}/${maxPages}) Saltado (ya indexada): ${urlNorm}`);
      options?.onProgress?.(result.indexed, queue.length, urlNorm);
      let html: string;
      try {
        html = await getPageHtml(urlNorm, options?.renderJs);
      } catch {
        continue;
      }
      const links = extractSameOriginLinks(html, urlNorm);
      for (const link of links) {
        const norm = link.split('#')[0].trim();
        if (!visited.has(norm) && !queue.includes(norm)) queue.push(norm);
      }
      continue;
    }

    const n = result.indexed + 1;
    logProgress(`[SITE] (${n}/${maxPages}) Indexando: ${urlNorm}`);
    options?.onProgress?.(result.indexed, queue.length, urlNorm);
    try {
      const r = await indexUrl(urlNorm, indexOpts);
      if (r.indexed) {
        result.indexed++;
        result.urls.push(urlNorm);
        logProgress(`[SITE] (${result.indexed}/${maxPages}) OK: ${urlNorm} — ${r.title}`);
      } else {
        if (r.error) result.errors.push(`${urlNorm}: ${r.error}`);
        logProgress(`[SITE] (${n}/${maxPages}) Error: ${urlNorm} — ${r.error ?? 'unknown'}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${urlNorm}: ${msg}`);
      logProgress(`[SITE] (${n}/${maxPages}) Error: ${urlNorm} — ${msg}`);
    }
    if (result.indexed >= maxPages) break;
    let html: string;
    try {
      html = await getPageHtml(urlNorm, options?.renderJs);
    } catch {
      continue;
    }
    const links = extractSameOriginLinks(html, urlNorm);
    for (const link of links) {
      const norm = link.split('#')[0].trim();
      if (!visited.has(norm) && !queue.includes(norm)) queue.push(norm);
    }
  }
  logProgress(
    `[SITE] Done: ${result.indexed} pages indexed, ${result.skipped} skipped (already indexed), ${result.errors.length} error(s).`
  );
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
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20000) : 1000;
}
