/**
 * Descarga una página y todo el contenido de los enlaces que contenga.
 * Uso: node download-wiki-pages.js "https://url-completa-de-la-pagina"
 *
 * Guarda la página principal y cada enlace en ./downloaded-pages/
 * Solo sigue enlaces del mismo dominio (o relativos).
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const OUT_DIR = path.join(__dirname, 'downloaded-pages');
const DELAY_MS = 500; // pausa entre peticiones para no saturar el servidor

function get(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const client = u.protocol === 'https:' ? https : http;
        const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0' } };
        client.get(url, opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        }).on('error', reject);
    });
}

function extractLinks(html, baseUrl) {
    const base = new URL(baseUrl);
    const hrefRegex = /href=["']([^"']+)["']/gi;
    const links = new Set();
    let m;
    while ((m = hrefRegex.exec(html)) !== null) {
        let href = m[1].trim();
        if (href.startsWith('#') || href.startsWith('javascript:')) continue;
        try {
            const full = new URL(href, base);
            if (full.origin === base.origin) links.add(full.href);
        } catch (_) {}
    }
    return Array.from(links);
}

function safeFilename(url) {
    const u = new URL(url);
    let name = u.pathname.replace(/^\//, '').replace(/\//g, '_') || 'index';
    if (name.length > 200) name = name.slice(0, 200);
    if (!/\.(html?|htm)$/i.test(name)) name += '.html';
    return name.replace(/[<>:"|?*]/g, '_');
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    const startUrl = process.argv[2] || process.env.WIKI_URL;
    if (!startUrl) {
        console.error('Uso: node download-wiki-pages.js "https://url-de-la-pagina"');
        console.error('  o: set WIKI_URL=https://... y ejecuta node download-wiki-pages.js');
        process.exit(1);
    }

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log('Descargando página principal...');
    let html;
    try {
        html = await get(startUrl);
    } catch (err) {
        console.error('Error al obtener la página:', err.message);
        process.exit(1);
    }

    const mainFile = path.join(OUT_DIR, safeFilename(startUrl));
    fs.writeFileSync(mainFile, html, 'utf8');
    console.log('Guardada:', mainFile);

    const links = extractLinks(html, startUrl);
    console.log('Enlaces encontrados:', links.length);

    for (let i = 0; i < links.length; i++) {
        const url = links[i];
        const file = path.join(OUT_DIR, safeFilename(url));
        if (fs.existsSync(file)) {
            console.log(`[${i + 1}/${links.length}] Ya existe: ${path.basename(file)}`);
            continue;
        }
        await sleep(DELAY_MS);
        try {
            const content = await get(url);
            fs.writeFileSync(file, content, 'utf8');
            console.log(`[${i + 1}/${links.length}] Guardado: ${path.basename(file)}`);
        } catch (err) {
            console.error(`[${i + 1}/${links.length}] Error ${url}:`, err.message);
        }
    }

    console.log('Listo. Archivos en:', OUT_DIR);
}

main();
