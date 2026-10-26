// Schritt 6: Redaktionelle Inhalte sichern (CMS-Seiten, Startseite, Kontakt,
// Firmendaten). Diese Texte werden für die neue Site und die Shopify-Pages
// gebraucht und liegen nicht im Produktdatensatz.
// Ausgabe: data/content.json

import { writeFile } from 'node:fs/promises';
import { BASE, get, stripTags, decodeAttr } from './lib.mjs';

const OUT = new URL('../data/', import.meta.url);

const PAGES = [
  { key: 'startseite', url: `${BASE}/`, title: 'Startseite' },
  { key: 'impressum', url: `${BASE}/content/2-impressum`, title: 'Impressum' },
  { key: 'agb', url: `${BASE}/content/3-allgemeine-geschaeftsbedingungen`, title: 'AGB' },
  { key: 'ueber-uns', url: `${BASE}/content/4-uber-uns`, title: 'Über uns' },
  { key: 'referenzen', url: `${BASE}/content/7-referenzen`, title: 'Referenzen' },
  { key: 'kontakt', url: `${BASE}/kontakt`, title: 'Kontakt' },
  { key: 'shops', url: `${BASE}/shops`, title: 'Ladengeschäft' },
];

/** Hauptinhalt aus dem PrestaShop-Wrapper herausschneiden. */
function mainContent(html) {
  const candidates = [
    /<div[^>]*class="[^"]*page-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/i,
    /<section[^>]*id="content"[^>]*>([\s\S]*?)<\/section>/i,
    /<div[^>]*id="content-wrapper"[^>]*>([\s\S]*?)<footer/i,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m && stripTags(m[1]).length > 40) return m[1];
  }
  return html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i)?.[1] || html;
}

/** Bilder, die im redaktionellen Inhalt verwendet werden. */
function contentImages(html) {
  const out = new Set();
  for (const [, src] of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    const u = decodeAttr(src);
    if (/\/(img|upload|modules)\//.test(u) && !/favicon|logo_stores|blank\./i.test(u)) {
      out.add(u.startsWith('http') ? u : BASE + (u.startsWith('/') ? '' : '/') + u);
    }
  }
  return [...out];
}

const results = [];
for (const page of PAGES) {
  try {
    const { body } = await get(page.url);
    const main = mainContent(body);
    results.push({
      ...page,
      ok: true,
      meta_title: stripTags(body.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''),
      meta_description: decodeAttr(
        body.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''
      ),
      text: stripTags(main),
      html: main.trim(),
      images: contentImages(main),
    });
    console.log(`  ok   ${page.key} (${stripTags(main).length} Zeichen Text)`);
  } catch (err) {
    results.push({ ...page, ok: false, error: String(err.message || err) });
    console.log(`  FEHL ${page.key}: ${err.message || err}`);
  }
}

// Kontaktdaten aus allen Seiten zusammentragen.
const allText = results.map((r) => r.text || '').join('\n');
const contact = {
  emails: [...new Set(allText.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) || [])],
  phones: [...new Set(allText.match(/(?:\+41|0)\s?\d{2}[\s/]?\d{3}\s?\d{2}\s?\d{2}/g) || [])].map((s) =>
    s.replace(/\s+/g, ' ').trim()
  ),
  postal: [...new Set(allText.match(/\b(?:CH-)?\d{4}\s+[A-ZÄÖÜ][a-zäöüß]+/g) || [])].slice(0, 10),
};

const payload = {
  scraped_at: new Date().toISOString(),
  source: BASE,
  shop_name: 'BIRRER-Print Webshop',
  pages: results,
  contact,
};

await writeFile(new URL('content.json', OUT), JSON.stringify(payload, null, 2));

console.log(`\nSeiten ok: ${results.filter((r) => r.ok).length}/${PAGES.length}`);
console.log('Gefundene Kontaktdaten:', JSON.stringify(contact, null, 2));
