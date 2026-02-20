/**
 * Fetch HTML with a headless browser (Puppeteer) for SPAs that load content via JavaScript.
 * Optional: only used when INDEX_URL_USE_BROWSER=true or when renderJs is requested.
 * If puppeteer is not installed, getHtmlWithBrowser throws a clear error.
 */

const BROWSER_TIMEOUT_MS = Number(process.env.INDEX_BROWSER_TIMEOUT_MS) || 35_000;
const WAIT_AFTER_LOAD_MS = Number(process.env.INDEX_BROWSER_WAIT_MS) || 6_000;
const WAIT_FOR_SELECTOR_MS = 18_000;

/** Selectors that often wrap the main article/content in help/doc SPAs (Salesforce, Magaya, etc.). */
const CONTENT_SELECTORS = [
  '[data-id="content"]',
  'main',
  'article',
  '[role="main"]',
  '.content',
  '.article-body',
  '.doc-content',
  '.body-content',
  '.slds-document',
  '.documentation-body',
  '[class*="document"]',
  '[class*="article"]',
];

export async function getHtmlWithBrowser(url: string): Promise<string> {
  let puppeteer: typeof import('puppeteer');
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error(
      'Puppeteer no está instalado. Para indexar/ver URLs que cargan contenido por JavaScript (SPA), ejecuta en gateway: npm install puppeteer'
    );
  }

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: BROWSER_TIMEOUT_MS,
    });
    await new Promise((r) => setTimeout(r, 2_000));
    for (const selector of CONTENT_SELECTORS) {
      try {
        await page.waitForSelector(selector, { visible: true, timeout: 2_000 });
        break;
      } catch {
        continue;
      }
    }
    try {
      await page.waitForFunction(
        () => {
          const t = document.body?.innerText ?? '';
          return t.length > 400 && !t.trim().startsWith('Loading');
        },
        { timeout: WAIT_FOR_SELECTOR_MS }
      );
    } catch {
      // timeout: use whatever HTML we have
    }
    await new Promise((r) => setTimeout(r, Math.min(WAIT_AFTER_LOAD_MS, 3_000)));
    const frames = page.frames();
    const contentFrame = frames.find((f) => f !== page.mainFrame() && f.url().startsWith('http'));
    if (contentFrame) {
      try {
        const iframeContent = await contentFrame.content();
        const mainContent = await page.content();
        if (iframeContent.length > mainContent.length && iframeContent.length > 500) {
          return iframeContent;
        }
      } catch {
        // use main page
      }
    }
    return await page.content();
  } finally {
    await browser.close();
  }
}
