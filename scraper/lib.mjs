// Gemeinsame Helfer für den birrer-print.ch Scraper
// Keine externen Dependencies – nur Node >= 18 (fetch, fs/promises).

export const BASE = 'https://shop.birrer-print.ch';
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HTTP-GET mit Retry, Timeout und höflicher Pause. */
export async function get(url, { tries = 3, timeout = 30000, delay = 150 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'de-CH,de;q=0.9' },
        signal: ac.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      await sleep(delay);
      return { url: res.url, body };
    } catch (err) {
      if (attempt === tries) throw err;
      await sleep(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** HTML-Entities aus einem Attributwert zurückübersetzen. */
export function decodeAttr(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Tags entfernen und Whitespace normalisieren. */
export function stripTags(html) {
  if (!html) return '';
  return decodeAttr(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/** Aufgaben mit begrenzter Parallelität abarbeiten. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = { __error: String(err?.message || err), item: items[i] };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export function progress(label, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  process.stdout.write(`\r${label}: ${done}/${total} (${pct}%)   `);
  if (done === total) process.stdout.write('\n');
}
