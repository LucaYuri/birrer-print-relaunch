// Schritt 1: Kategorien aus der PrestaShop-Sitemap lesen und alle Produkt-URLs
// über die Kategorieseiten einsammeln (resultsPerPage=1000 -> 1 Request/Kategorie,
// mit Paginierungs-Fallback falls die Gesamtzahl nicht erreicht wird).
// Ausgabe: data/categories.json, data/product-urls.json

import { writeFile } from 'node:fs/promises';
import { BASE, get, stripTags, pool, progress } from './lib.mjs';

const OUT = new URL('../data/', import.meta.url);
const PER_PAGE = 1000;

async function discoverCategories() {
  const { body } = await get(`${BASE}/Sitemap`);
  const seen = new Map();
  const re = /href="(https:\/\/shop\.birrer-print\.ch\/(\d+)-([a-z0-9-]+))"[^>]*>([^<]*)</gi;
  let m;
  while ((m = re.exec(body))) {
    const [, url, id, slug, label] = m;
    if (slug === 'startseite') continue;
    if (!seen.has(url)) {
      seen.set(url, { id: Number(id), slug, url, name: stripTags(label) || slug });
    }
  }
  return [...seen.values()].sort((a, b) => a.id - b.id);
}

// Produkt-URLs treten in mehreren Formen auf:
//   /<kategorie-slug>/<id_product>-<slug>.html
//   /<id_product>-<slug>.html                       (ohne Kategorie-Präfix)
//   /.../<id_product>-<id_product_attribute>-<slug>.html   (Variante)
// Kategorie-URLs (/<id>-<slug> ohne .html) werden durch das erzwungene .html ausgeschlossen.
function parseProductLinks(html) {
  const out = new Map(); // id_product -> url
  const re =
    /https:\/\/shop\.birrer-print\.ch\/(?:[a-z0-9][a-z0-9-]*\/)?(\d+)(?:-\d+)?-[^"'?\s<>]*?\.html/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = Number(m[1]);
    const url = m[0].replace(/#.*$/, '');
    // Erste gesehene URL pro Produkt gewinnt; die kanonische Form kommt später
    // ohnehin aus dem data-product JSON der Detailseite.
    if (!out.has(id)) out.set(id, url);
  }
  return out;
}

function parseTotal(html) {
  // "1 - 12 von 636 Artikel(n)"  bzw.  "<p>636 Artikel gefunden</p>"
  let m = html.match(/\d+\s*-\s*\d+\s+von\s+(\d+)\s+Artikel/i);
  if (m) return Number(m[1]);
  m = html.match(/total-products[^>]*>\s*(?:<p>)?\s*(\d+)\s+Artikel/i);
  return m ? Number(m[1]) : null;
}

async function crawlCategory(cat) {
  const found = new Map(); // id_product -> url
  const collect = (html) => {
    for (const [id, url] of parseProductLinks(html)) {
      if (!found.has(id)) found.set(id, url);
    }
  };

  const first = await get(`${cat.url}?resultsPerPage=${PER_PAGE}`);
  const total = parseTotal(first.body);
  collect(first.body);

  // Die Sitemap-Linktexte sind teils nur Slugs ("stempel"). Der echte
  // Kategoriename steht im <h1>, die Einordnung im Breadcrumb.
  const h1 = stripTags(first.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || '');
  let path = [];
  try {
    const bc = first.body.match(/"breadcrumb":\{"links":(\[[\s\S]*?\]),"count"/);
    if (bc) path = JSON.parse(bc[1]).map((l) => l.title).filter((t) => t !== 'Startseite');
  } catch {
    /* Breadcrumb optional */
  }

  // Fallback: falls der Shop resultsPerPage ignoriert, klassisch durchpaginieren.
  if (total != null && found.size < total) {
    for (let page = 2; page <= Math.ceil(total / 12) + 2; page++) {
      const { body } = await get(`${cat.url}?resultsPerPage=${PER_PAGE}&page=${page}`);
      const before = found.size;
      collect(body);
      if (found.size === before) break;
      if (found.size >= total) break;
    }
  }

  return {
    ...cat,
    name: h1 || cat.name,
    name_sitemap: cat.name,
    path, // vollständiger Kategoriepfad, z. B. ["Stempel","Holzstempel"]
    parent: path.length > 1 ? path[path.length - 2] : null,
    level: path.length,
    total_reported: total,
    product_count: found.size,
    complete: total == null ? null : found.size >= total,
    products: [...found.entries()].map(([id_product, url]) => ({ id_product, url })),
  };
}

const categories = await discoverCategories();
console.log(`Kategorien gefunden: ${categories.length}`);

let done = 0;
const crawled = await pool(categories, 4, async (cat) => {
  const res = await crawlCategory(cat);
  progress('Kategorien gecrawlt', ++done, categories.length);
  return res;
});

const ok = crawled.filter((c) => !c.__error);
const failed = crawled.filter((c) => c.__error);

// Produkte über alle Kategorien zusammenführen (ein Produkt kann in mehreren liegen).
const byProduct = new Map();
for (const cat of ok) {
  for (const { id_product, url } of cat.products) {
    if (!byProduct.has(id_product)) byProduct.set(id_product, { id_product, url, categories: [] });
    byProduct.get(id_product).categories.push({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      path: cat.path,
      level: cat.level,
    });
  }
}

const productUrls = [...byProduct.values()].sort((a, b) => a.id_product - b.id_product);

await writeFile(new URL('categories.json', OUT), JSON.stringify(ok, null, 2));
await writeFile(new URL('product-urls.json', OUT), JSON.stringify(productUrls, null, 2));

const incomplete = ok.filter((c) => c.complete === false);
console.log(`\nKategorien ok: ${ok.length}, fehlgeschlagen: ${failed.length}`);
if (failed.length) console.log(failed.map((f) => `  ${f.item?.url}: ${f.__error}`).join('\n'));
if (incomplete.length) {
  console.log('UNVOLLSTÄNDIG:');
  incomplete.forEach((c) => console.log(`  ${c.id}-${c.slug}: ${c.product_count}/${c.total_reported}`));
}
console.log(`Eindeutige Produkte: ${productUrls.length}`);
console.log(`ID-Bereich: ${productUrls[0]?.id_product} – ${productUrls.at(-1)?.id_product}`);
