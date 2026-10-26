// Schritt 2: Jede Produktdetailseite holen und auswerten.
// PrestaShop 1.7 rendert ein vollständiges Produkt-JSON in das Attribut
// data-product="..." – das ist die Hauptquelle. Ergänzt wird es um die
// Varianten-Optionen, den Breadcrumb und die Original-Bildpfade.
// Ausgabe: data/products.json, data/scrape-report.json

import { readFile, writeFile } from 'node:fs/promises';
import { get, decodeAttr, stripTags, pool, progress } from './lib.mjs';

const OUT = new URL('../data/', import.meta.url);

/** PrestaShop legt Originale unter /img/p/<ziffern-aufgeteilt>/<id>.jpg ab. */
function originalImageUrl(idImage) {
  const digits = String(idImage).split('').join('/');
  return `https://shop.birrer-print.ch/img/p/${digits}/${idImage}.jpg`;
}

function extractProductJson(html) {
  const m = html.match(/id="product-details"[\s\S]{0,400}?data-product="([^"]*)"/);
  if (!m) return null;
  try {
    return JSON.parse(decodeAttr(m[1]));
  } catch {
    return null;
  }
}

function extractBreadcrumb(html) {
  const m = html.match(/"breadcrumb":\{"links":(\[[\s\S]*?\]),"count"/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]).map((l) => ({ title: l.title, url: l.url }));
  } catch {
    return [];
  }
}

/** Options-Gruppen aus dem product-variants Block lesen (Radios und Selects). */
function extractVariantGroups(html) {
  const start = html.indexOf('product-variants');
  if (start < 0) return [];
  // Block endet beim nächsten Geschwister-Container
  const rest = html.slice(start, start + 60000);
  const end = rest.search(/product-discounts|product-add-to-cart/);
  const block = end > 0 ? rest.slice(0, end) : rest;

  const groups = [];
  const itemRe = /product-variants-item"[\s\S]*?(?=product-variants-item"|$)/g;
  for (const [item] of block.matchAll(itemRe)) {
    const label = stripTags(item.match(/control-label">([\s\S]*?)<\/span>/)?.[1] || '');
    const groupId = item.match(/id="group_(\d+)"/)?.[1] || null;

    const values = [];
    // Radio-/Checkbox-Darstellung
    for (const [, value, text] of item.matchAll(
      /value="(\d+)"[^>]*>\s*<span class="radio-label">([\s\S]*?)<\/span>/g
    )) {
      values.push({ id_attribute: Number(value), label: stripTags(text) });
    }
    // Dropdown-Darstellung
    for (const [, value, text] of item.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)) {
      values.push({ id_attribute: Number(value), label: stripTags(text) });
    }
    // Farb-/Textur-Darstellung
    for (const [, value, title] of item.matchAll(/value="(\d+)"[^>]*\s+title="([^"]*)"/g)) {
      if (!values.some((v) => v.id_attribute === Number(value)))
        values.push({ id_attribute: Number(value), label: decodeAttr(title) });
    }

    if (label && values.length) {
      const seen = new Set();
      groups.push({
        id_attribute_group: groupId ? Number(groupId) : null,
        name: label,
        values: values.filter((v) => !seen.has(v.id_attribute) && seen.add(v.id_attribute)),
      });
    }
  }
  return groups;
}

function parseProduct(html, meta) {
  const p = extractProductJson(html);
  if (!p) throw new Error('data-product JSON nicht gefunden');

  const images = (p.images || []).map((img) => ({
    id_image: String(img.id_image),
    cover: String(img.cover) === '1',
    legend: img.legend || '',
    url_original: originalImageUrl(img.id_image),
    url_large: img.bySize?.large_default?.url || img.large?.url || null,
    width_large: img.bySize?.large_default?.width ?? null,
    height_large: img.bySize?.large_default?.height ?? null,
  }));

  const features = (p.features || []).map((f) => ({
    name: stripTags(f.name),
    value: stripTags(f.value),
  }));

  const customization_fields = (p.customizations?.fields || []).map((f) => ({
    id_customization_field: f.id_customization_field,
    label: stripTags(f.label),
    type: f.type,
    required: String(f.required) === '1',
  }));

  const variant_groups = extractVariantGroups(html);
  const variant_combinations = variant_groups.length
    ? variant_groups.reduce((acc, g) => acc * g.values.length, 1)
    : 0;

  return {
    id_product: Number(p.id_product),
    reference: p.reference || '',
    name: stripTags(p.name),
    url: p.link || meta.url,
    link_rewrite: p.link_rewrite || '',

    price_display: p.price || '',
    price_amount: p.price_amount ?? null,
    price_tax_exc: p.price_tax_exc ?? null,
    price_without_reduction: p.price_without_reduction ?? null,
    has_discount: !!p.has_discount,
    discount_amount: p.discount_amount || null,
    tax_rate: p.rate ?? null,
    tax_name: p.tax_name || '',
    show_price: !!p.show_price,

    description_html: p.description || '',
    description_text: stripTags(p.description),
    description_short_html: p.description_short || '',
    description_short_text: stripTags(p.description_short),

    id_category_default: Number(p.id_category_default) || null,
    category_default_name: stripTags(p.category_name || ''),
    categories: meta.categories || [],
    breadcrumb: extractBreadcrumb(html).map((b) => b.title),

    features,
    customization_fields,
    is_customizable: !!p.is_customizable,
    variant_groups,
    variant_combinations,

    images,
    image_count: images.length,

    quantity: p.quantity ?? null,
    availability: stripTags(p.availability_message || ''),
    available_for_order: !!p.available_for_order,
    condition: p.condition || '',
    minimal_quantity: Number(p.minimal_quantity) || 1,

    manufacturer: stripTags(p.manufacturer_name || ''),
    meta_title: stripTags(p.meta_title || ''),
    meta_description: stripTags(p.meta_description || ''),
    date_add: p.date_add || null,
    date_upd: p.date_upd || null,
  };
}

const targets = JSON.parse(await readFile(new URL('product-urls.json', OUT), 'utf8'));
console.log(`Produkte zu scrapen: ${targets.length}`);

let done = 0;
const results = await pool(targets, 6, async (meta) => {
  try {
    const { body } = await get(meta.url);
    return parseProduct(body, meta);
  } finally {
    progress('Produkte gescrapt', ++done, targets.length);
  }
});

const products = results.filter((r) => r && !r.__error).sort((a, b) => a.id_product - b.id_product);
const errors = results
  .filter((r) => r?.__error)
  .map((r) => ({ url: r.item?.url, id_product: r.item?.id_product, error: r.__error }));

const report = {
  scraped_at: new Date().toISOString(),
  source: 'https://shop.birrer-print.ch',
  platform: 'PrestaShop 1.7 (Theme classic + CreativeElements)',
  products_expected: targets.length,
  products_ok: products.length,
  products_failed: errors.length,
  errors,
  stats: {
    with_images: products.filter((p) => p.image_count > 0).length,
    without_images: products.filter((p) => p.image_count === 0).length,
    total_images: products.reduce((s, p) => s + p.image_count, 0),
    unique_images: new Set(products.flatMap((p) => p.images.map((i) => i.id_image))).size,
    with_variants: products.filter((p) => p.variant_groups.length > 0).length,
    with_customization: products.filter((p) => p.customization_fields.length > 0).length,
    with_price_zero: products.filter((p) => !p.price_amount).length,
    with_description: products.filter((p) => p.description_text.length > 0).length,
    without_description: products.filter((p) => !p.description_text).length,
    max_variant_combinations: Math.max(0, ...products.map((p) => p.variant_combinations)),
  },
};

await writeFile(new URL('products.json', OUT), JSON.stringify(products, null, 2));
await writeFile(new URL('scrape-report.json', OUT), JSON.stringify(report, null, 2));

console.log('\n--- Bericht ---');
console.log(JSON.stringify(report, null, 2).slice(0, 2500));
