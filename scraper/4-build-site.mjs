// Schritt 4: Statische Sortimentsübersicht generieren.
// Der Katalog wird direkt in die HTML-Datei eingebettet, damit die Seite ohne
// lokalen Server (file://) funktioniert und zugleich als GitHub Page taugt.
// Bilder kommen aus docs/img/ (beschnitten, eine Datei je Motiv).
// Ausgabe: docs/index.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const products = JSON.parse(await readFile(new URL('data/products.json', ROOT), 'utf8'));
const categories = JSON.parse(await readFile(new URL('data/categories.json', ROOT), 'utf8'));
const imagesReport = JSON.parse(await readFile(new URL('data/images-report.json', ROOT), 'utf8'));
const imageMap = JSON.parse(await readFile(new URL('data/image-map.json', ROOT), 'utf8'));

const imgDims = new Map(imagesReport.images.map((i) => [i.id_image, { w: i.width, h: i.height }]));

// Hauptgruppe = die Level-1-Kategorie des Produkts (Kategorien sind 2-stufig).
const topOf = (p) =>
  p.categories.find((c) => c.level === 1)?.name ||
  p.categories.find((c) => c.path?.length)?.path[0] ||
  p.breadcrumb[1] ||
  '(ohne Kategorie)';

// Unterkategorien eines Produkts, ohne die Hauptgruppe selbst.
const subsOf = (p, top) =>
  [...new Set(p.categories.filter((c) => c.level === 2 && c.name !== top).map((c) => c.name))];

// Schlanker Katalog – nur was die Übersicht braucht.
const slim = products.map((p) => ({
  i: p.id_product,
  n: p.name,
  r: p.reference,
  p: p.price_amount,
  pd: p.price_display,
  t: topOf(p), // Hauptgruppe
  s: subsOf(p, topOf(p)), // Unterkategorien
  c: p.categories.map((c) => c.name),
  d: p.description_short_text || p.description_text,
  dl: p.description_text,
  u: p.url,
  im: p.images.map((img) => ({
    f: imageMap[img.id_image]?.file || null,       // beschnittene Anzeigedatei
    w: imgDims.get(img.id_image)?.w ?? null,       // Originalmass = ehrliche Qualitätsangabe
    h: imgDims.get(img.id_image)?.h ?? null,
    cw: imageMap[img.id_image]?.w ?? null,         // Mass nach dem Beschnitt
    ch: imageMap[img.id_image]?.h ?? null,
  })).filter((i) => i.f),
  v: p.variant_groups.map((g) => ({ n: g.name, v: g.values.map((x) => x.label) })),
  vc: p.variant_combinations,
  cf: p.customization_fields.map((f) => f.label),
  f: p.features.map((f) => [f.name, f.value]),
  q: p.quantity,
}));

const tops = [...new Set(slim.map((p) => p.t))].sort(
  (a, b) => slim.filter((p) => p.t === b).length - slim.filter((p) => p.t === a).length
);

// Viele Bilddateien sind Duplikate (u. a. die Schriftmuster-Tabelle 623×).
// Für eine ehrliche Kennzahl werden die Dateien gehasht.
const motifs = new Map();
for (const img of imagesReport.images) {
  const file = new URL(`data/images/${img.id_image}.jpg`, ROOT);
  const h = createHash('md5').update(readFileSync(file)).digest('hex');
  if (!motifs.has(h)) motifs.set(h, { width: img.width, height: img.height, count: 0 });
  motifs.get(h).count++;
}
// Die Schriftmuster-Tabelle ist kein Produktfoto.
const photos = [...motifs.values()].filter((m) => !(m.width === 550 && m.height === 650));

const stats = {
  distinctPhotos: photos.length,
  maxPhotoWidth: Math.max(...photos.map((m) => m.width || 0)),
  products: slim.length,
  categories: categories.length,
  tops: tops.length,
  images: imagesReport.images_ok,
  withVariants: slim.filter((p) => p.v.length).length,
  customizable: slim.filter((p) => p.cf.length).length,
  noPrice: slim.filter((p) => !p.p).length,
  priceMax: Math.max(...slim.map((p) => p.p || 0)),
  smallImages: Object.entries(imagesReport.original_width_distribution)
    .filter(([k]) => k === '<300px')
    .reduce((s, [, v]) => s + v, 0),
  scraped: new Date().toISOString().slice(0, 10),
};

const html = `<title>BIRRER Print Sortiment</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{
  --bg:#fbfbfa; --panel:#fff; --line:#e4e2dd; --line-soft:#efedea;
  --ink:#1a1917; --ink-2:#5d5a54; --ink-3:#8f8b83;
  --accent:#9a2b1f; --accent-soft:#f6ebe9;
  --radius:3px;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Inter","Helvetica Neue",Arial,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#141413; --panel:#1c1b1a; --line:#312f2c; --line-soft:#262523;
  --ink:#f0eeea; --ink-2:#a8a49c; --ink-3:#736f68;
  --accent:#e8705e; --accent-soft:#2a1b18;
}}
:root[data-theme="dark"]{
  --bg:#141413; --panel:#1c1b1a; --line:#312f2c; --line-soft:#262523;
  --ink:#f0eeea; --ink-2:#a8a49c; --ink-3:#736f68;
  --accent:#e8705e; --accent-soft:#2a1b18;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}

/* ---------- Kopfzeile ---------- */
header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(12px);border-bottom:1px solid var(--line);padding:14px 22px}
.hrow{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.brand{font-weight:650;letter-spacing:-.015em;font-size:15px}
.brand span{color:var(--accent)}
.sub{font-family:var(--mono);font-size:11px;color:var(--ink-3);letter-spacing:.02em}
.spacer{flex:1}
.statline{display:flex;gap:16px;flex-wrap:wrap;margin-top:11px;font-family:var(--mono);font-size:11px;color:var(--ink-2)}
.statline b{color:var(--ink);font-weight:600}

.controls{display:flex;gap:9px;margin-top:12px;flex-wrap:wrap;align-items:center}
input[type=search],select{font:13px var(--sans);color:var(--ink);background:var(--panel);
  border:1px solid var(--line);border-radius:var(--radius);padding:7px 10px;outline:none}
input[type=search]{flex:1;min-width:190px}
input[type=search]:focus,select:focus{border-color:var(--accent)}
.toggle{display:flex;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.toggle button{font:11px/1 var(--mono);background:var(--panel);color:var(--ink-2);border:0;
  padding:8px 11px;cursor:pointer;letter-spacing:.04em}
.toggle button[aria-pressed=true]{background:var(--accent);color:#fff}
.chip{font:11px var(--mono);background:var(--panel);border:1px solid var(--line);color:var(--ink-2);
  border-radius:var(--radius);padding:7px 10px;cursor:pointer;letter-spacing:.03em}
.chip[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}

/* ---------- Layout ---------- */
.wrap{display:grid;grid-template-columns:218px minmax(0,1fr);gap:0;align-items:start}
nav{position:sticky;top:132px;max-height:calc(100vh - 148px);overflow-y:auto;
  padding:18px 14px 40px;border-right:1px solid var(--line)}
.navhead{font:11px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);
  margin:0 0 9px;padding-left:8px}
nav button{display:flex;width:100%;justify-content:space-between;gap:8px;align-items:baseline;
  background:none;border:0;border-radius:var(--radius);padding:5px 8px;cursor:pointer;
  font:13px var(--sans);color:var(--ink-2);text-align:left}
nav button:hover{background:var(--line-soft);color:var(--ink)}
nav button[aria-current=true]{background:var(--accent-soft);color:var(--accent);font-weight:600}
nav button i{font:10px var(--mono);color:var(--ink-3);font-style:normal;flex:none}
nav button[aria-current=true] i{color:var(--accent)}
nav button.subcat{padding-left:20px;font-size:12px;color:var(--ink-3);position:relative}
nav button.subcat::before{content:"";position:absolute;left:11px;top:50%;width:4px;height:1px;
  background:var(--line)}
nav button.subcat:hover{color:var(--ink-2)}

main{padding:18px 22px 80px;min-width:0}
.meta{font:11px var(--mono);color:var(--ink-3);margin-bottom:13px;letter-spacing:.02em}

/* ---------- Raster ----------
   Die Quellbilder sind nur 200x200 px. Grössere Kacheln zeigen zwar ein
   weicheres Bild, aber man erkennt überhaupt etwas – das ist hier wichtiger. */
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(375px,1fr))}
.grid.sm{gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.grid.lg{gap:26px;grid-template-columns:repeat(auto-fill,minmax(570px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
  overflow:hidden;cursor:pointer;display:flex;flex-direction:column;text-align:left;padding:0;
  font:inherit;color:inherit}
.card:hover{border-color:var(--accent)}
.thumb{aspect-ratio:1;background:#fff;display:grid;place-items:center;overflow:hidden;
  border-bottom:1px solid var(--line-soft);padding:6px}
.thumb img{width:100%;height:100%;object-fit:contain}
.cbody{padding:11px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.cname{font-size:13.5px;line-height:1.35;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;
  -webkit-box-orient:vertical;overflow:hidden}
.grid.lg .cname{font-size:15px;-webkit-line-clamp:3}
.grid.sm .cname{font-size:12px}
.crow{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-top:auto}
.cprice{font:11.5px var(--mono);color:var(--ink);font-weight:600}
.cprice.none{color:var(--ink-3);font-weight:400}
.cref{font:10px var(--mono);color:var(--ink-3)}
.flags{display:flex;gap:3px;flex-wrap:wrap}
.flag{font:9px var(--mono);letter-spacing:.05em;padding:1.5px 4px;border-radius:2px;
  background:var(--line-soft);color:var(--ink-3);text-transform:uppercase}
.flag.v{background:var(--accent-soft);color:var(--accent)}

/* ---------- Liste ---------- */
table{width:100%;border-collapse:collapse;font-size:13px}
th{font:10px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);
  text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);position:sticky;top:132px;
  background:var(--bg);z-index:5}
td{padding:6px 9px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
tbody tr{cursor:pointer}
tbody tr:hover{background:var(--line-soft)}
td img{width:88px;height:88px;object-fit:contain;background:#fff;border:1px solid var(--line-soft);
  border-radius:2px;display:block;padding:3px}
.tnum{font-family:var(--mono);font-size:11.5px;color:var(--ink-2);white-space:nowrap}
.tcat{font-size:11.5px;color:var(--ink-3)}

/* ---------- Detail ---------- */
dialog{border:0;padding:0;background:transparent;max-width:none;max-height:none;width:100%;height:100%}
dialog::backdrop{background:rgba(0,0,0,.55);backdrop-filter:blur(3px)}
.sheet{position:fixed;inset:0 0 0 auto;width:min(720px,100%);background:var(--panel);
  border-left:1px solid var(--line);overflow-y:auto;padding:22px 26px 60px;color:var(--ink)}
.close{position:sticky;top:0;float:right;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius);width:28px;height:28px;cursor:pointer;color:var(--ink-2);font-size:16px;line-height:1}
.dtitle{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:4px 0 6px;padding-right:38px}
.dmeta{font:11px var(--mono);color:var(--ink-3);margin-bottom:16px}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px;margin-bottom:18px}
.shots figure{margin:0}
.shots img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;padding:8px;
  border:1px solid var(--line);border-radius:var(--radius);cursor:zoom-in}
.shots figcaption{font:10px var(--mono);color:var(--ink-3);margin-top:4px;text-align:center}
.shots .warn{color:var(--accent)}
h4{font:10px var(--mono);text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);
  margin:18px 0 7px;padding-bottom:5px;border-bottom:1px solid var(--line-soft)}
.dprice{font-size:17px;font-family:var(--mono);font-weight:600}
.desc{white-space:pre-wrap;font-size:13px;color:var(--ink-2);line-height:1.6}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px}
.kv dt{font-family:var(--mono);font-size:11px;color:var(--ink-3)}
.kv dd{margin:0;color:var(--ink-2)}
.vg{margin-bottom:9px}
.vg .vgn{font-size:12px;font-weight:600;margin-bottom:4px}
.vg .vgv{display:flex;flex-wrap:wrap;gap:4px}
.vgv span{font:11px var(--mono);border:1px solid var(--line);border-radius:2px;padding:2px 6px;color:var(--ink-2)}
ul.cfl{margin:0;padding-left:17px;font-size:12.5px;color:var(--ink-2)}
.src{display:inline-block;margin-top:18px;font:11px var(--mono);color:var(--accent);text-decoration:none;
  border:1px solid var(--accent);border-radius:var(--radius);padding:6px 10px}
.empty{padding:50px 0;text-align:center;color:var(--ink-3);font-family:var(--mono);font-size:12px}

@media (max-width:860px){
  .wrap{grid-template-columns:1fr}
  nav{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line);
    display:flex;gap:6px;overflow-x:auto;padding:10px 14px}
  nav .navhead{display:none}
  nav button{width:auto;white-space:nowrap}
  th{position:static}
}
</style>

<header>
  <div class="hrow">
    <div class="brand">BIRRER <span>Print</span> — Sortimentsübersicht</div>
    <div class="spacer"></div>
    <div class="sub">Quelle shop.birrer-print.ch · PrestaShop 1.7 · Stand ${stats.scraped}</div>
  </div>
  <div class="statline">
    <span><b>${stats.products}</b> Produkte</span>
    <span><b>${stats.categories}</b> Kategorien (${stats.tops} Hauptgruppen)</span>
    <span><b>${stats.images}</b> Bilddateien → nur <b>${stats.distinctPhotos}</b> echte Fotos, max. <b>${stats.maxPhotoWidth}px</b></span>
    <span><b>${stats.withVariants}</b> mit Varianten</span>
    <span><b>${stats.customizable}</b> mit Texteingabe</span>
    <span><b>${stats.noPrice}</b> ohne Preis</span>
  </div>
  <div class="controls">
    <input type="search" id="q" placeholder="Suche: Name, Beschreibung, Referenz, Kategorie …" autocomplete="off">
    <select id="sort">
      <option value="cat">Sortierung: Kategorie</option>
      <option value="name">Name A–Z</option>
      <option value="price-asc">Preis aufsteigend</option>
      <option value="price-desc">Preis absteigend</option>
      <option value="id">Artikelnummer</option>
    </select>
    <div class="toggle" id="view">
      <button data-v="sm" aria-pressed="false">Klein</button>
      <button data-v="grid" aria-pressed="true">Mittel</button>
      <button data-v="lg" aria-pressed="false">Gross</button>
      <button data-v="list" aria-pressed="false">Liste</button>
    </div>
    <button class="chip" id="fv" aria-pressed="false">Nur Varianten</button>
    <button class="chip" id="fc" aria-pressed="false">Nur Texteingabe</button>
    <button class="chip" id="fp" aria-pressed="false">Ohne Preis</button>
  </div>
</header>

<div class="wrap">
  <nav id="nav"></nav>
  <main>
    <div class="meta" id="meta"></div>
    <div id="out"></div>
  </main>
</div>

<dialog id="dlg"><div class="sheet" id="sheet"></div></dialog>

<script>
const P = ${JSON.stringify(slim)};
const TOPS = ${JSON.stringify(tops)};
const IMG = 'img/';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const chf = n => n ? n.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' CHF' : 'kein Preis';
const src = im => IMG + im.f;

const state = { q:'', top:null, sub:null, sort:'cat', view:'grid', fv:false, fc:false, fp:false };

// Suchindex einmalig vorberechnen
P.forEach(p => { p._s = (p.n+' '+p.r+' '+p.d+' '+p.dl+' '+p.c.join(' ')+' '+p.t+' '+p.i).toLowerCase(); });

function filtered(){
  const terms = state.q.toLowerCase().split(/\\s+/).filter(Boolean);
  let r = P.filter(p =>
    (!state.top || p.t === state.top) &&
    (!state.sub || p.s.includes(state.sub)) &&
    (!state.fv || p.v.length) &&
    (!state.fc || p.cf.length) &&
    (!state.fp || !p.p) &&
    terms.every(t => p._s.includes(t))
  );
  const by = {
    name: (a,b) => a.n.localeCompare(b.n,'de'),
    'price-asc': (a,b) => (a.p||0)-(b.p||0) || a.n.localeCompare(b.n,'de'),
    'price-desc': (a,b) => (b.p||0)-(a.p||0) || a.n.localeCompare(b.n,'de'),
    id: (a,b) => a.i-b.i,
    cat: (a,b) => TOPS.indexOf(a.t)-TOPS.indexOf(b.t) || a.n.localeCompare(b.n,'de'),
  }[state.sort];
  return r.sort(by);
}

function flags(p){
  const f = [];
  if (p.v.length) f.push('<span class="flag v">'+p.vc+' Var.</span>');
  if (p.cf.length) f.push('<span class="flag">Text</span>');
  if (p.im.length > 1) f.push('<span class="flag">'+p.im.length+' Bilder</span>');
  return f.length ? '<div class="flags">'+f.join('')+'</div>' : '';
}

function render(){
  const r = filtered();
  document.getElementById('meta').textContent =
    r.length + ' von ' + P.length + ' Produkten'
    + (state.top ? ' · ' + state.top : '') + (state.sub ? ' › ' + state.sub : '')
    + (state.q ? ' · Suche "' + state.q + '"' : '');

  const out = document.getElementById('out');
  if (!r.length){ out.innerHTML = '<div class="empty">Keine Treffer</div>'; return; }

  if (state.view === 'list'){
    out.innerHTML = '<table><thead><tr><th></th><th>Produkt</th><th>Kategorie</th>'
      + '<th>Art.-Nr.</th><th>Preis</th></tr></thead><tbody>'
      + r.map(p => '<tr data-i="'+p.i+'">'
        + '<td>'+(p.im[0] ? '<img loading="lazy" src="'+src(p.im[0])+'" alt="">' : '')+'</td>'
        + '<td>'+esc(p.n)+'</td>'
        + '<td class="tcat">'+esc(p.t)+'</td>'
        + '<td class="tnum">'+esc(p.r||p.i)+'</td>'
        + '<td class="tnum">'+(p.p ? chf(p.p) : '—')+'</td></tr>').join('')
      + '</tbody></table>';
  } else {
    out.innerHTML = '<div class="grid'+(state.view==='grid'?'':' '+state.view)+'">'
      + r.map(p => '<button class="card" data-i="'+p.i+'">'
        + '<div class="thumb">'+(p.im[0] ? '<img loading="lazy" src="'+src(p.im[0])+'" alt="">' : '')+'</div>'
        + '<div class="cbody"><div class="cname">'+esc(p.n)+'</div>'+flags(p)
        + '<div class="crow"><span class="cprice'+(p.p?'':' none')+'">'+(p.p?chf(p.p):'—')+'</span>'
        + '<span class="cref">'+esc(p.r||p.i)+'</span></div></div></button>').join('')
      + '</div>';
  }
}

function renderNav(){
  const counts = {};
  P.forEach(p => counts[p.t] = (counts[p.t]||0)+1);

  let html = '<p class="navhead">Hauptgruppen</p>'
    + '<button data-t="" aria-current="'+(!state.top)+'">Alle<i>'+P.length+'</i></button>';

  for (const t of TOPS){
    html += '<button data-t="'+esc(t)+'" aria-current="'+(state.top===t && !state.sub)+'">'
      + esc(t)+'<i>'+counts[t]+'</i></button>';
    // Unterkategorien nur für die aktive Hauptgruppe ausklappen
    if (state.top === t){
      const subs = {};
      P.filter(p => p.t === t).forEach(p => p.s.forEach(s => subs[s] = (subs[s]||0)+1));
      html += Object.keys(subs).sort((a,b)=>subs[b]-subs[a]).map(s =>
        '<button class="subcat" data-t="'+esc(t)+'" data-s="'+esc(s)+'" aria-current="'
        + (state.sub===s)+'">'+esc(s)+'<i>'+subs[s]+'</i></button>').join('');
    }
  }
  document.getElementById('nav').innerHTML = html;
}

function detail(p){
  const sheet = document.getElementById('sheet');
  sheet.innerHTML =
    '<button class="close" id="x" aria-label="Schliessen">×</button>'
    + '<div class="dtitle">'+esc(p.n)+'</div>'
    + '<div class="dmeta">Art.-Nr. '+esc(p.r||p.i)+' · PrestaShop-ID '+p.i+' · '
      + esc([p.t, ...p.s].join(' › '))+'</div>'
    + (p.im.length ? '<div class="shots">'+p.im.map(im => {
        // Schriftmuster-Tabelle (550x650) ist kein Produktfoto – kennzeichnen.
        const isFont = im.w === 550 && im.h === 650;
        const cropped = im.cw && (im.cw !== im.w || im.ch !== im.h);
        const cap = im.w
          ? (isFont ? 'Schriftmuster-Tabelle · ' : '')
            + 'Original ' + im.w+'×'+im.h+' px'
            + (cropped ? ' · beschnitten auf '+im.cw+'×'+im.ch : '')
          : 'Grösse unbekannt';
        const warn = !isFont && im.w && im.w < 300;
        return '<figure><img loading="lazy" src="'+src(im)+'" alt="" data-full="'+src(im)+'">'
          + '<figcaption class="'+(warn?'warn':'')+'">'+cap
          + (warn ? ' — zu klein für Webshop' : '')+'</figcaption></figure>';
      }).join('')+'</div>' : '')
    + '<h4>Preis</h4><div class="dprice">'+(p.p ? chf(p.p) : 'kein Preis hinterlegt')+'</div>'
    + (p.dl ? '<h4>Beschreibung</h4><div class="desc">'+esc(p.dl)+'</div>' : '')
    + (p.v.length ? '<h4>Varianten ('+p.vc+' Kombinationen)</h4>'+p.v.map(g =>
        '<div class="vg"><div class="vgn">'+esc(g.n)+'</div><div class="vgv">'
        + g.v.map(v => '<span>'+esc(v)+'</span>').join('')+'</div></div>').join('') : '')
    + (p.cf.length ? '<h4>Kundeneingaben bei Bestellung</h4><ul class="cfl">'
        + p.cf.map(f => '<li>'+esc(f)+'</li>').join('')+'</ul>' : '')
    + (p.f.length ? '<h4>Merkmale</h4><dl class="kv">'
        + p.f.map(([k,v]) => '<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>' : '')
    + '<h4>Alle Kategorien</h4><div class="desc">'+esc(p.c.join(', '))+'</div>'
    + '<a class="src" href="'+esc(p.u)+'" target="_blank" rel="noopener">Im Altshop öffnen ↗</a>';
  const dlg = document.getElementById('dlg');
  dlg.showModal();
  sheet.scrollTop = 0;
  document.getElementById('x').onclick = () => dlg.close();
  // Bild anklicken öffnet es in voller Grösse in einem neuen Tab
  sheet.querySelectorAll('.shots img').forEach(img => {
    img.onclick = () => window.open(img.dataset.full, '_blank');
  });
}

// ---- Events ----
document.getElementById('q').addEventListener('input', e => { state.q = e.target.value; render(); });
document.getElementById('sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
document.getElementById('view').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.view = b.dataset.v;
  [...e.currentTarget.children].forEach(x => x.setAttribute('aria-pressed', x === b));
  render();
});
for (const key of ['fv','fc','fp']){
  document.getElementById(key).addEventListener('click', e => {
    state[key] = !state[key];
    e.currentTarget.setAttribute('aria-pressed', state[key]);
    render();
  });
}
document.getElementById('nav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const t = b.dataset.t || null, s = b.dataset.s || null;
  // Klick auf die aktive Unterkategorie hebt den Unterfilter wieder auf.
  if (s) state.sub = state.sub === s ? null : s;
  else state.sub = null;
  state.top = t;
  renderNav(); render();
  window.scrollTo({top:0});
});
document.getElementById('out').addEventListener('click', e => {
  const el = e.target.closest('[data-i]'); if (!el) return;
  const p = P.find(x => x.i === Number(el.dataset.i));
  if (p) detail(p);
});
document.getElementById('dlg').addEventListener('click', e => {
  if (e.target.id === 'dlg') e.target.close();
});

renderNav(); render();
</script>
`;

await mkdir(new URL('docs/', ROOT), { recursive: true });
await writeFile(new URL('docs/index.html', ROOT), html);
console.log(`docs/index.html geschrieben – ${(html.length / 1024).toFixed(0)} KB, ${slim.length} Produkte, ${tops.length} Hauptgruppen`);
