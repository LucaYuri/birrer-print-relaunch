// Schritt 3b: Weissraum aus den Produktbildern schneiden.
//
// Hintergrund: Die Motive des Altshops sind max. 200x200 px und stecken dabei
// oft in viel Weiss (Füllgrad teilweise nur 32 %). Beschnitten füllt das Motiv
// die Kachel und wirkt bei gleicher Anzeigegrösse rund doppelt so gross – die
// Auflösung ändert sich nicht, aber man erkennt etwas.
//
// Von 2097 Dateien sind nur ~617 verschiedene Motive. Beschnitten wird darum
// einmal pro Motiv (MD5). Geschrieben wird eine Datei pro Motiv, benannt nach
// dem Hash – data/image-map.json bildet id_image darauf ab. Das spart gegenüber
// einer Datei je id_image rund 1480 Dubletten.
// Ausgabe: docs/img/<hash>.jpg, data/image-map.json, data/crop-report.json

import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool, progress } from './lib.mjs';

const run = promisify(execFile);
const ROOT = new URL('../', import.meta.url);
const SRC = new URL('data/images/', ROOT);
const OUT = new URL('docs/img/', ROOT);
await mkdir(OUT, { recursive: true });

const JPEG_QUALITY = '80'; // Anzeigebilder – die Quellen sind ohnehin klein
const WHITE = 245; // ab diesem Wert gilt ein Pixel als Hintergrund
const MARGIN = 0.04; // etwas Luft, damit das Motiv nicht am Rand klebt

/** Inhaltsrahmen eines Bildes bestimmen – via sips nach BMP und dann Pixel lesen. */
async function contentBox(file, tmp) {
  await run('sips', ['-s', 'format', 'bmp', file, '--out', tmp]);
  const b = readFileSync(tmp);
  const off = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  const hRaw = b.readInt32LE(22);
  const h = Math.abs(hRaw);
  const bpp = b.readUInt16LE(28);
  const bytes = bpp / 8;
  const rowSize = Math.floor((bpp * w + 31) / 32) * 4;

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const sy = hRaw > 0 ? h - 1 - y : y; // BMP ist meist bottom-up gespeichert
    for (let x = 0; x < w; x++) {
      const i = off + sy * rowSize + x * bytes;
      if (b[i] < WHITE || b[i + 1] < WHITE || b[i + 2] < WHITE) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; // komplett weiss – nicht beschneiden
  return { w, h, x0, y0, cw: x1 - x0 + 1, ch: y1 - y0 + 1 };
}

const report = JSON.parse(await readFile(new URL('data/images-report.json', ROOT), 'utf8'));

// Motive gruppieren: eine Berechnung pro eindeutigem Bildinhalt.
const byHash = new Map();
for (const img of report.images) {
  const buf = readFileSync(new URL(`${img.id_image}.jpg`, SRC));
  const h = createHash('md5').update(buf).digest('hex');
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(img.id_image);
}
const groups = [...byHash.entries()].map(([hash, ids]) => ({ hash, ids }));
console.log(`Bilddateien: ${report.images.length} -> ${groups.length} verschiedene Motive`);

let done = 0;
const results = await pool(groups, 6, async (g, idx) => {
  const lead = g.ids[0];
  const name = g.hash.slice(0, 12);
  const srcFile = fileURLToPath(new URL(`${lead}.jpg`, SRC));
  const tmp = `/tmp/crop-${idx % 12}.bmp`;
  const outLead = fileURLToPath(new URL(`${name}.jpg`, OUT));
  const info = { hash: g.hash, file: `${name}.jpg`, ids: g.ids, copies: g.ids.length };

  try {
    const box = await contentBox(srcFile, tmp);
    if (!box) {
      await copyFile(srcFile, outLead);
      info.action = 'unverändert (leer)';
    } else {
      // Rand zugeben, aber im Bild bleiben
      const pad = Math.max(3, Math.round(Math.max(box.cw, box.ch) * MARGIN));
      const x = Math.max(0, box.x0 - pad);
      const y = Math.max(0, box.y0 - pad);
      const cw = Math.min(box.w - x, box.cw + pad * 2);
      const ch = Math.min(box.h - y, box.ch + pad * 2);
      const fillBefore = (box.cw * box.ch) / (box.w * box.h);

      if (fillBefore > 0.92) {
        await copyFile(srcFile, outLead); // schon randlos
        info.action = 'unverändert';
        info.from = `${box.w}x${box.h}`;
        info.to = `${box.w}x${box.h}`;
        info.width = box.w; info.height = box.h;
      } else {
        await run('sips', ['-c', String(ch), String(cw), '--cropOffset', String(y), String(x),
          '-s', 'formatOptions', JPEG_QUALITY, srcFile, '--out', outLead]);
        info.action = 'beschnitten';
        info.from = `${box.w}x${box.h}`;
        info.to = `${cw}x${ch}`;
        info.width = cw; info.height = ch;
        info.fill_before = Math.round(fillBefore * 100);
      }
    }
    // Keine Kopien nötig – alle IDs dieses Motivs zeigen auf dieselbe Datei.
  } catch (err) {
    info.error = String(err.message || err).split('\n')[0];
    try { await copyFile(srcFile, outLead); } catch { /* Quelle fehlt */ }
  }
  progress('Motive beschnitten', ++done, groups.length);
  return info;
});

for (let i = 0; i < 12; i++) await rm(`/tmp/crop-${i}.bmp`, { force: true });

const ok = results.filter((r) => r && !r.error && !r.__error);
const cropped = ok.filter((r) => r.action === 'beschnitten');
const failed = results.filter((r) => r && (r.error || r.__error));

const out = {
  cropped_at: new Date().toISOString(),
  motifs: groups.length,
  files_written: report.images.length,
  motifs_cropped: cropped.length,
  motifs_unchanged: ok.length - cropped.length,
  motifs_failed: failed.length,
  median_fill_before: (() => {
    const f = cropped.map((r) => r.fill_before).sort((a, b) => a - b);
    return f.length ? f[Math.floor(f.length / 2)] : null;
  })(),
  details: results,
};
await writeFile(new URL('data/crop-report.json', ROOT), JSON.stringify(out, null, 2));

// id_image -> Anzeigedatei + echte Masse nach dem Beschnitt
const map = {};
for (const r of results) {
  if (!r || !r.file) continue;
  for (const id of r.ids) map[id] = { file: r.file, w: r.width ?? null, h: r.height ?? null };
}
await writeFile(new URL('data/image-map.json', ROOT), JSON.stringify(map, null, 2));
console.log(`image-map.json: ${Object.keys(map).length} IDs -> ${new Set(Object.values(map).map(v => v.file)).size} Dateien`);

console.log(`\nbeschnitten: ${cropped.length} Motive, unverändert: ${ok.length - cropped.length}, Fehler: ${failed.length}`);
console.log(`Füllgrad vorher (Median der beschnittenen): ${out.median_fill_before}%`);
if (failed.length) console.log('Fehler:', failed.slice(0, 5).map((f) => f.error));
