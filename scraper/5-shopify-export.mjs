// Schritt 5: Shopify-Importdaten aus dem Scrape erzeugen.
//
// Zwei Ausgabeformate, damit die Übertragung unabhängig vom Weg funktioniert:
//   a) export/shopify-products-*.csv  – offizieller Shopify-CSV-Import (Admin UI)
//   b) export/shopify-products.json   – normalisierte Payloads für Admin-API /
//                                       Shopify MCP (productSet-Mutation)
//
// Bilder werden per URL auf den noch laufenden Altshop referenziert; Shopify
// lädt sie beim Import selbst herunter. Der Altshop muss dafür online bleiben,
// bis der Import durch ist.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const EXPORT = new URL('export/', ROOT);
await mkdir(EXPORT, { recursive: true });

const products = JSON.parse(await readFile(new URL('data/products.json', ROOT), 'utf8'));
const imagesReport = JSON.parse(await readFile(new URL('data/images-report.json', ROOT), 'utf8'));
const dims = new Map(imagesReport.images.map((i) => [i.id_image, i]));

const VENDOR = 'BIRRER Print';
const ROWS_PER_FILE = 5000;

/** Eindeutiges, URL-sicheres Handle; Kollisionen werden mit der ID aufgelöst. */
const usedHandles = new Set();
function handleFor(p) {
  let h = (p.link_rewrite || p.name || `produkt-${p.id_product}`)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || `produkt-${p.id_product}`;
  if (usedHandles.has(h)) h = `${h}-${p.id_product}`;
  usedHandles.add(h);
  return h;
}

/** Kartesisches Produkt der Options-Werte -> eine Zeile pro Shopify-Variante. */
function combinations(groups) {
  if (!groups.length) return [[]];
  return groups.reduce(
    (acc, g) => acc.flatMap((combo) => g.values.map((v) => [...combo, { group: g.name, value: v.label }])),
    [[]]
  );
}

/** Bestes verfügbares Bild – die 800px-Themeversion ist meist schärfer als das Original. */
function bestImageUrl(img) {
  const d = dims.get(img.id_image);
  if (img.url_large && (d?.width ?? 0) < 800) return img.url_large;
  return img.url_original || img.url_large;
}

function bodyHtml(p) {
  const parts = [];
  if (p.description_html) parts.push(p.description_html.trim());
  else if (p.description_short_html) parts.push(p.description_short_html.trim());

  if (p.features.length) {
    parts.push(
      '<ul>' + p.features.map((f) => `<li><strong>${f.name}:</strong> ${f.value}</li>`).join('') + '</ul>'
    );
  }
  if (p.customization_fields.length) {
    parts.push(
      '<p><strong>Für diesen Artikel benötigen wir von Ihnen:</strong></p><ul>' +
        p.customization_fields.map((f) => `<li>${f.label}${f.required ? ' (erforderlich)' : ''}</li>`).join('') +
        '</ul>'
    );
  }
  return parts.join('\n');
}

function tagsFor(p) {
  const tags = new Set();
  for (const c of p.categories) tags.add(c.name);
  if (p.breadcrumb[1]) tags.add(p.breadcrumb[1]);
  if (p.customization_fields.length) tags.add('Individualisierbar');
  if (p.variant_groups.length) tags.add('Mit Varianten');
  if (!p.price_amount) tags.add('Preis auf Anfrage');
  tags.add(`PS-ID-${p.id_product}`); // Rückverfolgbarkeit zur PrestaShop-ID
  return [...tags].map((t) => t.replace(/,/g, ' ')).join(', ');
}

// ---------------------------------------------------------------- CSV-Aufbau
const CSV_HEADERS = [
  'Handle','Title','Body (HTML)','Vendor','Product Category','Type','Tags','Published',
  'Option1 Name','Option1 Value','Option2 Name','Option2 Value','Option3 Name','Option3 Value',
  'Variant SKU','Variant Grams','Variant Inventory Tracker','Variant Inventory Qty',
  'Variant Inventory Policy','Variant Fulfillment Service','Variant Price','Variant Compare At Price',
  'Variant Requires Shipping','Variant Taxable','Variant Barcode',
  'Image Src','Image Position','Image Alt Text','Gift Card',
  'SEO Title','SEO Description','Status',
];

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [];
const apiPayloads = [];
const warnings = [];

for (const p of products) {
  const handle = handleFor(p);
  const combos = combinations(p.variant_groups);
  const price = p.price_amount ?? 0;
  if (!p.price_amount) warnings.push({ id_product: p.id_product, handle, issue: 'Preis 0 / nicht hinterlegt' });
  if (combos.length > 100) warnings.push({ id_product: p.id_product, handle, issue: `${combos.length} Varianten` });

  const g1 = p.variant_groups[0]?.name || null;
  const g2 = p.variant_groups[1]?.name || null;
  const images = p.images.map(bestImageUrl).filter(Boolean);

  combos.forEach((combo, ci) => {
    const first = ci === 0;
    // Shopify-Konvention: Produktfelder nur in der ersten Zeile eines Handles.
    const row = {
      Handle: handle,
      Title: first ? p.name : '',
      'Body (HTML)': first ? bodyHtml(p) : '',
      Vendor: first ? VENDOR : '',
      'Product Category': '',
      Type: first ? p.breadcrumb[1] || p.category_default_name || '' : '',
      Tags: first ? tagsFor(p) : '',
      Published: first ? 'TRUE' : '',
      'Option1 Name': g1 || (first ? 'Title' : ''),
      'Option1 Value': combo[0]?.value || (first ? 'Default Title' : ''),
      'Option2 Name': g2 || '',
      'Option2 Value': combo[1]?.value || '',
      'Option3 Name': '',
      'Option3 Value': '',
      'Variant SKU': combos.length > 1 ? `${p.reference || p.id_product}-${ci + 1}` : p.reference || String(p.id_product),
      'Variant Grams': '0',
      'Variant Inventory Tracker': '',
      'Variant Inventory Qty': '0',
      // Auftragsfertigung: Verkauf auch ohne Lagerbestand zulassen.
      'Variant Inventory Policy': 'continue',
      'Variant Fulfillment Service': 'manual',
      'Variant Price': price.toFixed(2),
      'Variant Compare At Price': '',
      'Variant Requires Shipping': 'TRUE',
      'Variant Taxable': 'TRUE',
      'Variant Barcode': '',
      'Image Src': first ? images[0] || '' : '',
      'Image Position': first && images[0] ? '1' : '',
      'Image Alt Text': first && images[0] ? p.name : '',
      'Gift Card': first ? 'FALSE' : '',
      'SEO Title': first ? (p.meta_title || p.name).slice(0, 70) : '',
      'SEO Description': first ? (p.meta_description || p.description_short_text || p.name).slice(0, 320) : '',
      Status: first ? 'draft' : '', // bewusst als Entwurf – nach Prüfung aktivieren
    };
    rows.push(row);
  });

  // Weitere Bilder: eigene Zeilen, die nur Handle + Bild tragen.
  images.slice(1).forEach((src, i) => {
    const row = Object.fromEntries(CSV_HEADERS.map((h) => [h, '']));
    row.Handle = handle;
    row['Image Src'] = src;
    row['Image Position'] = String(i + 2);
    row['Image Alt Text'] = p.name;
    rows.push(row);
  });

  apiPayloads.push({
    prestashop_id: p.id_product,
    handle,
    title: p.name,
    descriptionHtml: bodyHtml(p),
    vendor: VENDOR,
    productType: p.breadcrumb[1] || p.category_default_name || '',
    tags: tagsFor(p).split(', '),
    status: 'DRAFT',
    seo: {
      title: (p.meta_title || p.name).slice(0, 70),
      description: (p.meta_description || p.description_short_text || p.name).slice(0, 320),
    },
    productOptions: p.variant_groups.map((g) => ({
      name: g.name,
      values: g.values.map((v) => ({ name: v.label })),
    })),
    variants: combos.map((combo, ci) => ({
      sku: combos.length > 1 ? `${p.reference || p.id_product}-${ci + 1}` : p.reference || String(p.id_product),
      price: price.toFixed(2),
      optionValues: combo.map((c) => ({ optionName: c.group, name: c.value })),
      inventoryPolicy: 'CONTINUE',
      taxable: true,
      requiresShipping: true,
    })),
    media: p.images.map((img, i) => ({
      originalSource: bestImageUrl(img),
      alt: img.legend || p.name,
      position: i + 1,
      local_file: `data/images/${img.id_image}${(dims.get(img.id_image)?.width ?? 0) < 800 ? '-800' : ''}.jpg`,
    })),
    // Nicht nach Shopify übertragbar – braucht Theme-Felder oder App:
    customization_fields: p.customization_fields,
    source_url: p.url,
  });
}

// CSV in Dateien zerlegen; ein Handle wird nie über zwei Dateien getrennt.
const chunks = [];
let current = [];
for (const row of rows) {
  if (current.length >= ROWS_PER_FILE && row.Handle !== current[current.length - 1].Handle) {
    chunks.push(current);
    current = [];
  }
  current.push(row);
}
if (current.length) chunks.push(current);

for (const [i, chunk] of chunks.entries()) {
  const name = `shopify-products-${String(i + 1).padStart(2, '0')}.csv`;
  const csv = [
    CSV_HEADERS.join(','),
    ...chunk.map((r) => CSV_HEADERS.map((h) => csvCell(r[h])).join(',')),
  ].join('\n');
  await writeFile(new URL(name, EXPORT), '﻿' + csv); // BOM für Excel/Umlaute
  console.log(`  ${name}: ${chunk.length} Zeilen`);
}

await writeFile(new URL('shopify-products.json', EXPORT), JSON.stringify(apiPayloads, null, 2));
await writeFile(
  new URL('shopify-export-report.json', EXPORT),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      products: products.length,
      csv_rows: rows.length,
      variant_rows: rows.filter((r) => r['Variant Price']).length,
      image_only_rows: rows.filter((r) => !r['Variant Price'] && r['Image Src']).length,
      csv_files: chunks.length,
      products_with_customization: products.filter((p) => p.customization_fields.length).length,
      warnings_count: warnings.length,
      warnings,
    },
    null,
    2
  )
);

console.log(`\nProdukte: ${products.length}`);
console.log(`CSV-Zeilen: ${rows.length} (in ${chunks.length} Dateien)`);
console.log(`API-Payloads: ${apiPayloads.length} -> export/shopify-products.json`);
console.log(`Warnungen: ${warnings.length}`);
