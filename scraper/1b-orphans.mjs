// Schritt 1b: Lücken im id_product-Bereich abklopfen. Findet Produkte, die in
// keiner Kategorie verlinkt sind (z. B. nur über Suche/Direktlink erreichbar).
// Ergänzt data/product-urls.json.

import { readFile, writeFile } from 'node:fs/promises';
import { BASE, UA, pool, progress } from './lib.mjs';

const OUT = new URL('../data/', import.meta.url);
const known = JSON.parse(await readFile(new URL('product-urls.json', OUT), 'utf8'));
const knownIds = new Set(known.map((p) => p.id_product));

const maxId = Math.max(...knownIds);
const gaps = [];
for (let id = 1; id <= maxId; id++) if (!knownIds.has(id)) gaps.push(id);

console.log(`Bekannte Produkte: ${known.length}, max. ID: ${maxId}, zu prüfende Lücken: ${gaps.length}`);

let done = 0;
const results = await pool(gaps, 8, async (id) => {
  const url = `${BASE}/index.php?controller=product&id_product=${id}`;
  let out = null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'de-CH,de;q=0.9' },
      redirect: 'follow',
    });
    const body = await res.text();
    // PrestaShop liefert bei fehlenden Produkten die 404-Seite aus.
    const is404 =
      res.status === 404 ||
      /page-not-found|seite-nicht-gefunden|"page_name":"pagenotfound"/i.test(body);
    if (!is404 && /data-product="/.test(body)) {
      out = { id_product: id, url: res.url.replace(/#.*$/, ''), categories: [], orphan: true };
    }
  } catch {
    /* Netzwerkfehler -> als nicht gefunden behandeln */
  }
  progress('Lücken geprüft', ++done, gaps.length);
  return out;
});

const orphans = results.filter((r) => r && !r.__error);
console.log(`\nVerwaiste Produkte gefunden: ${orphans.length}`);
orphans.slice(0, 40).forEach((o) => console.log(`  ${o.id_product}  ${o.url}`));
if (orphans.length > 40) console.log(`  … und ${orphans.length - 40} weitere`);

if (orphans.length) {
  const merged = [...known, ...orphans].sort((a, b) => a.id_product - b.id_product);
  await writeFile(new URL('product-urls.json', OUT), JSON.stringify(merged, null, 2));
  console.log(`product-urls.json aktualisiert: ${merged.length} Produkte`);
}
