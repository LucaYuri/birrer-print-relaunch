// Schritt 3: Alle Produktbilder herunterladen.
// Gespeichert wird das PrestaShop-Original (/img/p/...) als Master; wenn das
// Original kleiner als die large_default-Variante ist, wird zusätzlich die
// 800px-Version gesichert. Dimensionen werden aus dem JPEG-Header gelesen,
// damit die echte Bildqualität dokumentiert ist.
// Ausgabe: data/images/<id_image>.jpg, data/images-report.json

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { UA, pool, progress } from './lib.mjs';

const DATA = new URL('../data/', import.meta.url);
const IMG_DIR = new URL('images/', DATA);
await mkdir(IMG_DIR, { recursive: true });

/** Breite/Höhe aus den SOF-Markern eines JPEG lesen. */
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0..SOF15 ohne DHT(c4), JPGA(c8), DAC(cc)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const products = JSON.parse(await readFile(new URL('products.json', DATA), 'utf8'));

// Bilder eindeutig nach id_image sammeln
const jobs = new Map();
for (const p of products) {
  for (const img of p.images) {
    if (!jobs.has(img.id_image)) {
      jobs.set(img.id_image, {
        id_image: img.id_image,
        url_original: img.url_original,
        url_large: img.url_large,
        id_product: p.id_product,
        product_name: p.name,
        legend: img.legend,
        cover: img.cover,
      });
    }
  }
}

const list = [...jobs.values()];
console.log(`Bilder herunterzuladen: ${list.length}`);

let done = 0;
const results = await pool(list, 8, async (job) => {
  const out = { ...job, saved: null, saved_large: null, width: null, height: null, bytes: 0 };
  try {
    const orig = await fetchBuffer(job.url_original);
    const size = jpegSize(orig);
    out.width = size?.width ?? null;
    out.height = size?.height ?? null;
    out.bytes = orig.length;
    out.saved = `images/${job.id_image}.jpg`;
    await writeFile(new URL(`images/${job.id_image}.jpg`, DATA), orig);

    // Falls das Original winzig ist, zusätzlich die 800px-Theme-Version sichern.
    if (job.url_large && (out.width ?? 0) < 800) {
      try {
        const large = await fetchBuffer(job.url_large);
        out.saved_large = `images/${job.id_image}-800.jpg`;
        const ls = jpegSize(large);
        out.width_large = ls?.width ?? null;
        out.height_large = ls?.height ?? null;
        await writeFile(new URL(`images/${job.id_image}-800.jpg`, DATA), large);
      } catch (err) {
        out.large_error = String(err.message || err);
      }
    }
  } catch (err) {
    out.error = String(err.message || err);
  }
  progress('Bilder geladen', ++done, list.length);
  return out;
});

const ok = results.filter((r) => r && !r.error && !r.__error);
const failed = results.filter((r) => r && (r.error || r.__error));

// Verteilung der Originalgrössen – zeigt die echte Bildqualität des Altshops.
const buckets = {};
for (const r of ok) {
  const w = r.width ?? 0;
  const key = w === 0 ? 'unbekannt' : w < 300 ? '<300px' : w < 600 ? '300–599px' : w < 1000 ? '600–999px' : '>=1000px';
  buckets[key] = (buckets[key] || 0) + 1;
}

const report = {
  downloaded_at: new Date().toISOString(),
  images_total: list.length,
  images_ok: ok.length,
  images_failed: failed.length,
  bytes_total: ok.reduce((s, r) => s + r.bytes, 0),
  original_width_distribution: buckets,
  largest_original: ok
    .slice()
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
    .slice(0, 5)
    .map((r) => ({ id_image: r.id_image, width: r.width, height: r.height, product: r.product_name })),
  failures: failed.map((r) => ({ id_image: r.id_image, url: r.url_original, error: r.error || r.__error })),
  images: ok,
};

await writeFile(new URL('images-report.json', DATA), JSON.stringify(report, null, 2));

console.log(`\nOK: ${ok.length}, Fehler: ${failed.length}`);
console.log(`Gesamtgrösse: ${(report.bytes_total / 1024 / 1024).toFixed(1)} MB`);
console.log('Originalbreiten:', JSON.stringify(buckets));
if (failed.length) console.log('Fehler:', JSON.stringify(report.failures.slice(0, 10), null, 2));
