# birrer-print.ch — Relaunch & Shopify-Migration

**Online:** https://lucayuri.github.io/birrer-print-relaunch/ · **Repo:** https://github.com/LucaYuri/birrer-print-relaunch

**Stand:** 26.10.2026 · **Altshop:** `birrer-print.ch` → `shop.birrer-print.ch` (PrestaShop 1.7, Theme `classic` + Modul CreativeElements)

Vorgehen in drei Etappen: **(1)** Altshop vollständig scrapen · **(2)** Prototyp der neuen Site bauen · **(3)** Katalog nach Shopify übertragen.
Etappe 1 ist abgeschlossen, die Daten liegen in `data/` und `export/`.

---

## 1 · Ausgangslage

| Kennzahl | Wert |
|---|---|
| Produkte | **1 474** (ID 1–2430, lückenlos erfasst) |
| Kategorien | **99** — 12 Hauptgruppen, 87 Unterkategorien (2 Ebenen) |
| Produktbilder | 2 097 Dateien — aber nur **617 verschiedene Motive**, max. 200×200 px (siehe 2.1) |
| Produkte mit Varianten | 608 (immer `Format` × `Schriftgrösse`, max. 28 Kombinationen) |
| Produkte mit Kundentext-Eingabe | 611 |
| Varianten-Zeilen für Shopify | 17 890 |
| Preisspanne | 5 – 3 500 CHF, **55 Produkte ohne Preis** |
| Redaktionelle Seiten | 7 (Startseite, Impressum, AGB, Über uns, Referenzen, Kontakt, Ladengeschäft) |

**Hauptgruppen:** Stempel (636) · Schilder-Signete (278) · Sicherheitskennzeichnung (187) · Türschilder (102) · Folien Kleber (95) · Restaurant-Hotelbedarf (59) · Schriften (49) · Geschenke (28) · Gravuren (14) · Kalligrafie (12) · Ständer (10) · Laser (4)

**Kontakt (aus dem Altshop):** info@birrer-print.ch · 061 721 37 39 · CH-4104 Oberwil / CH-4107 Ettingen

---

## 2 · Befunde, die den Relaunch bestimmen

Diese fünf Punkte sind keine technischen Details, sondern Entscheidungen, die vor dem Shopify-Import fallen müssen.

### 2.1 Bildbestand ist der kritischste Befund
Die 2 097 Bilddateien täuschen einen Bestand vor, den es nicht gibt. Per MD5 über alle Dateien geprüft:

| | |
|---|---|
| Bilddateien | 2 097 |
| **verschiedene Motive** | **617** |
| redundante Dateien | 1 480 (71 %) |
| davon: Schriftmuster-Tabelle | **1 Bild, 623× dupliziert** (550×650 px) |
| **echte Produktfotos** | **616 für 1 474 Produkte** |
| Masse der echten Fotos | 612× **200×200 px**, je 1× 600×400 / 125×200 / 120×140 / 89×68 |

Das heisst konkret:
- **Kein Produktfoto ist grösser als 200×200 px** (bis auf ein einziges 600×400-Bild).
- Die 623 Bilder mit 550×650 px sind nicht 623 Fotos, sondern **ein einziges gescanntes Schriftmuster-Blatt**, das bei jedem konfigurierbaren Artikel als zweites Bild hängt. Es ist eine Auswahlhilfe, kein Produktbild.
- Fotos werden massiv mehrfach verwendet: ein Bild steht für **165 Produkte**, ein weiteres für 110, dann 34, 32, 20, 19 …
- Serverseitig existiert nichts Besseres: `/img/p/.../<id>.jpg` ist die hochgeladene Originaldatei. Geprüft gegen `-original`, `_default` und freie Grössenangaben — alles 404.
- Die 800-px-Ansichten des Shops (`large_default`) sind **keine Hochskalierungen**, sondern das kleine Motiv zentriert auf einer weissen 800×800-Leinwand. Gemessener Füllgrad: **2–6 %**. Wer sie verwendet, zeigt fast nur Weissfläche — im Altshop ist das heute so.
- Auch die Originale sind oft randlastig: Füllgrad im Median **57 %**, im Extremfall 32 %.
- Verifiziert mit `sips` gegen den eigenen JPEG-Parser, 25 Stichproben, 25/25 identisch.

**Produkte nach Bildlage:** 850 haben ausschliesslich 200-px-Bilder, 623 haben ein 200-px-Foto plus die Schriftmuster-Tabelle, 1 Produkt hat das 600×400-Bild.

> **Konsequenz:** Mit diesem Bestand lässt sich kein Shop bauen, der 2026 verkauft — unabhängig vom Layout. Das ist keine Design-, sondern eine Beschaffungsfrage. Realistischer Weg: Fotoproduktion nach Priorität. Da ein Foto bis zu 165 Artikel abdeckt, reichen **grob 150–200 neue Aufnahmen für den grössten Teil des Sortiments** — die 616 Motive sind die Obergrenze, nicht 1 474. Das macht die Aufgabe bezahlbar.
> Die Schriftmuster-Tabelle gehört im neuen Shop nicht als Produktbild hinterlegt, sondern als Schriftauswahl ins Konfigurationsformular (siehe 2.3).

**Sofortmassnahme, bereits umgesetzt:** `scraper/3b-crop.mjs` schneidet den Weissraum aus allen Motiven (528 von 617 beschnitten). Das Motiv füllt danach die Kachel, statt darin zu schwimmen — die Auflösung bleibt gleich, aber man erkennt den Artikel. Nebeneffekt: Da nur eine Datei je Motiv statt je `id_image` geschrieben wird, schrumpft der Anzeigebestand von **2 097 Dateien / 54 MB auf 617 Dateien / 6,2 MB**.

### 2.2 Produkttexte sind praktisch nicht vorhanden
Die mediane Beschreibung ist **50 Zeichen** lang, **812 Produkte** haben weniger als 60 Zeichen — meist nur der Produktname als Satz („Holzstempel 1 zeilig bis 2 cm lang"). Merkmale/Features sind bei **keinem** Produkt gepflegt.

> **Konsequenz:** SEO und Beratungsqualität lassen sich so nicht herstellen. Empfehlung: Texte gruppenweise statt artikelweise schreiben — eine gute Beschreibung pro Unterkategorie plus kurze artikelspezifische Zeile. Bei 87 Unterkategorien ist das leistbar, bei 1 474 Artikeln nicht.

### 2.3 Kundentext-Eingabe hat in Shopify kein Gegenstück
611 Produkte erfassen im Altshop über PrestaShop-Customization freien Kundentext:
- „Texteingabe, Zeilen 1 bis 10" (546 + 62 Produkte)
- „Gewünschte Schriftart eingeben (siehe Bild)" (558 + 56 Produkte)

Shopify kennt das nicht als Standardfunktion. Drei Wege:

| Weg | Aufwand | Bemerkung |
|---|---|---|
| Line-Item-Properties im Theme | mittel, einmalig | volle Kontrolle, keine Folgekosten — **empfohlen** |
| App (z. B. Produkt-Personalisierung) | gering | monatliche Kosten, Theme-Abhängigkeit |
| Bestellung per Formular/Mail nachgelagert | gering | Bruch im Kaufprozess, nicht empfohlen |

Die Feldlabels sind pro Produkt in `export/shopify-products.json` unter `customization_fields` erhalten — der Import verliert sie nicht, sie werden nur separat ins Theme verdrahtet.

### 2.4 Mehrwertsteuer ist im Altshop nicht konfiguriert
Alle 1 474 Produkte haben `tax_rate: 0`, der Shop zeigt Preise exkl. MwSt. (`display_prices_tax_incl: false`).

> **Konsequenz:** Vor dem Import klären, ob die 1 474 Preise Netto- oder Bruttopreise sind. Bei Netto müssen sie für einen B2C-Shop um 8,1 % erhöht werden, sonst entsteht ein stiller Margenverlust über den ganzen Katalog. **Das ist der kritischste offene Punkt.**

### 2.5 55 Produkte ohne Preis
Darunter „Handprägezange verchromt", „Hausnummer aus Metall", „Warnschilder", „Parkplatzschild", „Prägeschilder" — offenbar Positionen auf Anfrage. Sie sind mit Tag `Preis auf Anfrage` markiert und als Entwurf exportiert. Entscheidung nötig: Preis ergänzen oder als Anfrage-Artikel ohne Kaufbutton führen.

### 2.6 Die Startseite enthält keinen Inhalt
Die Startseite ist eine CreativeElements-Builder-Seite mit einem einzigen Textfragment („Entdecken Sie Vielfalt: … und mehr bei BIRRER Print") und ohne eigene Bilder. Es gibt also keine bestehende Startseiten-Substanz, die übernommen werden müsste — sie wird neu konzipiert.

---

## 3 · Datenbestand

```
data/
  categories.json        99 Kategorien mit Pfad, Ebene, Produktzuordnung
  product-urls.json      1 474 Produkt-URLs mit Kategoriezuordnung
  products.json          1 474 Produkte, vollständig (4,3 MB)
  content.json           7 redaktionelle Seiten (Text + HTML) + Kontaktdaten
  images/                2 097 Originalbilder (Archiv, unverändert)
  image-map.json         id_image -> Anzeigedatei + Masse
  crop-report.json       Beschnitt-Protokoll
  scrape-report.json     Scrape-Protokoll, 0 Fehler
  images-report.json     Bildinventar mit echten Pixelmassen
export/
  shopify-products-01…04.csv   18 513 Zeilen, Shopify-CSV-Import-Format
  shopify-products.json        1 474 Payloads für Admin-API / MCP
  shopify-export-report.json   Exportprotokoll + 55 Warnungen
docs/                    = GitHub Page
  index.html             Sortimentsübersicht (selbst-enthaltend)
  img/                   617 beschnittene Anzeigebilder (6,2 MB)
scraper/
  lib.mjs                HTTP, Retry, Parallelität, HTML-Bereinigung
  1-discover.mjs         Kategorien + Produkt-URLs
  1b-orphans.mjs         ID-Lücken auf verwaiste Produkte prüfen
  2-products.mjs         Produktdetails
  3-images.mjs           Bilder + Pixelmasse
  3b-crop.mjs            Weissraum beschneiden, Duplikate zusammenfassen
  4-build-site.mjs       Übersichts-Website generieren
  5-shopify-export.mjs   Shopify-CSV + API-Payloads
  6-content.mjs          Redaktionelle Seiten
```

**Pipeline neu ausführen** (Reihenfolge einhalten, keine externen Dependencies, Node ≥ 18):

```bash
node scraper/1-discover.mjs      # ~1 min
node scraper/1b-orphans.mjs      # ~2 min, optional (Vollständigkeitsprüfung)
node scraper/2-products.mjs      # ~4 min
node scraper/3-images.mjs        # ~3 min
node scraper/3b-crop.mjs         # ~2 min
node scraper/6-content.mjs       # ~10 s
node scraper/4-build-site.mjs    # instant
node scraper/5-shopify-export.mjs # instant
```

Technische Grundlage des Scrapers: PrestaShop 1.7 rendert pro Produktseite ein vollständiges JSON im Attribut `data-product`. Das ist die Datenquelle — kein HTML-Scraping auf Layoutebene, darum robust. Kategorieseiten liefern mit `?resultsPerPage=1000` den ganzen Inhalt in einem Request.

---

## 4 · Sortimentsübersicht (fertig)

Online unter **https://lucayuri.github.io/birrer-print-relaunch/** — oder lokal `docs/index.html` per Doppelklick öffnen, kein Server nötig. Der Katalog ist in die Datei eingebettet.

- Alle 1 474 Produkte als Raster in drei Grössen (Klein/Mittel/Gross) oder als Tabelle. Die Kacheln sind bewusst grösser als die Quellauflösung — die Bilder werden dadurch weich, aber man erkennt überhaupt etwas.
- Navigation über 12 Hauptgruppen mit aufklappbaren Unterkategorien
- Volltextsuche über Name, Beschreibung, Artikelnummer, Kategorie
- Sortierung nach Kategorie, Name, Preis, Artikelnummer
- Schnellfilter: nur Varianten · nur Texteingabe · ohne Preis
- Detailansicht mit allen Bildern (inkl. **echter Pixelmasse pro Bild** vor und nach dem Beschnitt — macht das Bildproblem aus 2.1 direkt sichtbar), Varianten, Kundeneingabefeldern, Kategorien und Link in den Altshop
- Klick auf ein Bild öffnet es in voller Grösse

Zweck: Sortimentsüberblick und Entscheidungsgrundlage für Bereinigung — nicht der Prototyp der neuen Site.

---

## 5 · Etappe 2: Prototyp

Noch offen. Vorschlag zur Abstimmung:

**Technik:** Shopify-Theme auf Basis von *Dawn*, angepasst. Begründung: Der Shop muss am Ende in Shopify laufen; ein Prototyp in Next.js oder Webflow würde zweimal gebaut. Ausnahme: wenn der Prototyp nur als Designentwurf dient, ist Figma oder eine statische Seite schneller.

**Zu klärende Punkte vor dem Prototyp:**
1. Bildstrategie (2.1) — bestimmt das ganze Layout
2. Navigationsstruktur: 12 Hauptgruppen × 87 Unterkategorien sind viel. Zusammenfassen oder als Mega-Menü?
3. Soll die Konfiguration (Schriftart, Textzeilen) im Produktformular stattfinden oder in einem eigenen Konfigurator-Schritt?
4. B2B- oder B2C-Ausrichtung — beeinflusst MwSt.-Darstellung (2.4) und Preisanzeige

---

## 6 · Etappe 3: Übertragung nach Shopify

### 6.1 Status Shopify MCP

> **Der Shopify-MCP-Server ist in dieser Umgebung nicht verbunden.** Aktuell verfügbar: Figma, Webflow, Google Drive/Gmail/Calendar, Vercel (nicht authentifiziert). Die Übertragung konnte darum nicht ausgeführt werden — die Daten sind aber so aufbereitet, dass beide Wege ohne Nacharbeit funktionieren.

Vor Etappe 3 nötig:
1. Shopify-Store anlegen (Entwicklungs- oder Testshop genügt zum Start)
2. Shopify-MCP-Server in Claude Code registrieren und authentifizieren
3. Oder: Custom App im Shopify-Admin mit Schreibrechten auf `products`, `product_listings`, `files`

### 6.2 Weg A — Shopify MCP / Admin-API *(empfohlen)*

Quelle: `export/shopify-products.json`, 1 474 Payloads mit Feldnamen der GraphQL-Mutation `productSet`.

Pro Produkt enthalten: `handle`, `title`, `descriptionHtml`, `vendor`, `productType`, `tags`, `status: DRAFT`, `seo`, `productOptions`, `variants` (mit `sku`, `price`, `optionValues`, `inventoryPolicy: CONTINUE`), `media` (Quell-URL **und** lokaler Dateipfad), `customization_fields`, `prestashop_id`.

Vorteile gegenüber CSV: Fehler sind pro Produkt zuordenbar, der Lauf ist wiederholbar, und über `prestashop_id` bleibt jedes Shopify-Produkt auf den Altshop rückverfolgbar.

Empfohlenes Vorgehen: **zuerst 10 Produkte** aus unterschiedlichen Gruppen (mindestens eines mit 28 Varianten, eines mit Kundentext, eines ohne Preis), prüfen, dann der Rest in Blöcken.

### 6.3 Weg B — CSV-Import über den Shopify-Admin

`export/shopify-products-01.csv` … `-04.csv`, zusammen 18 513 Zeilen (17 890 Varianten + 623 zusätzliche Bildzeilen), aufgeteilt in 4 Dateien à ≤ 5 000 Zeilen. Ein Produkt-Handle wird nie über zwei Dateien getrennt. Dateien **in der Reihenfolge 01 → 04** importieren.

Validiert: 32 Spalten, alle 18 513 Zeilen mit korrekter Spaltenzahl, RFC-4180-konform, BOM für Excel.

### 6.4 Feld-Mapping

| PrestaShop | Shopify | Anmerkung |
|---|---|---|
| `link_rewrite` | `Handle` | Umlaute transliteriert, Kollisionen mit ID aufgelöst |
| `name` | `Title` | |
| `description` + Merkmale + Kundeneingaben | `Body (HTML)` | zu einem HTML-Block zusammengeführt |
| Hauptkategorie | `Type` | |
| alle Kategorien + Status-Tags + `PS-ID-<id>` | `Tags` | `PS-ID` erhält die Rückverfolgbarkeit |
| `variant_groups[0]` → `Format` | `Option1` | |
| `variant_groups[1]` → `Schriftgrösse` | `Option2` | |
| `reference` | `Variant SKU` | bei Varianten mit Suffix `-1`…`-28` |
| `price_amount` | `Variant Price` | **siehe 2.4 — MwSt. ungeklärt** |
| — | `Variant Inventory Policy: continue` | Auftragsfertigung, kein Lagerbestand |
| Bild-URLs des Altshops | `Image Src` | Shopify lädt beim Import selbst nachher |
| `meta_title` / `meta_description` | `SEO Title` / `SEO Description` | |
| — | `Status: draft` | **alles als Entwurf** — bewusst |

### 6.5 Zwei Dinge, die beim Import schiefgehen können

1. **Der Altshop muss online bleiben.** Beide Wege referenzieren Bilder per URL auf `shop.birrer-print.ch`. Wird der Altshop vor Abschluss des Imports abgeschaltet, kommen die Produkte ohne Bilder an. Alternative: die 2 097 Dateien aus `data/images/` vorab in Shopify Files hochladen und die URLs im Export ersetzen (`local_file` ist pro Bild hinterlegt).
2. **Alles landet als Entwurf.** Das ist Absicht — nichts geht versehentlich live. Die Aktivierung erfolgt erst nach Prüfung von Preisen (2.4), Bildern (2.1) und Texten (2.2).

### 6.6 Was der Import *nicht* abdeckt

- Kundentext-Felder (2.3) → Theme-Arbeit
- Kategorien als Shopify-Collections → aus `data/categories.json` separat anzulegen; die Tags sind dafür schon vorbereitet (Smart Collections nach Tag)
- URL-Weiterleitungen alt → neu, nötig für SEO
- Kunden, Bestellungen, Preisstaffeln (im Altshop keine gepflegt)
- Redaktionelle Seiten → aus `data/content.json` als Shopify-Pages anzulegen

---

## 7 · Offene Entscheidungen

| # | Entscheidung | Blockiert |
|---|---|---|
| 1 | Sind die 1 474 Preise netto oder brutto? (2.4) | Shopify-Import |
| 2 | Bildstrategie: neu fotografieren oder Layout anpassen? (2.1) | Prototyp |
| 3 | Produkttexte: gruppenweise schreiben? (2.2) | Go-Live, SEO |
| 4 | Kundentext-Eingabe: Theme oder App? (2.3) | Prototyp |
| 5 | 55 Artikel ohne Preis: bepreisen oder auf Anfrage? (2.5) | Go-Live |
| 6 | Navigationsstruktur: 87 Unterkategorien zusammenfassen? | Prototyp |
| 7 | Shopify-Store + MCP-Zugang einrichten (6.1) | Etappe 3 |

---

## 8 · Nächster Schritt

Sortiment in `site/index.html` durchgehen und die Entscheidungen 1, 2 und 5 treffen. Danach Shopify-Store + MCP einrichten, Testimport von 10 Produkten, dann der Rest.

---

### Nebenbefund
Der lokale Projektordner heisst `_birrer print ` — mit **Leerzeichen am Ende**. Das ist beim Beschneiden bereits konkret aufgeschlagen: `URL.pathname` kodiert das Leerzeichen zu `%20`, worauf `sips` die Datei nicht mehr fand. Im Repo heisst das Projekt sauber `birrer-print-relaunch`; der lokale Ordner sollte vor dem Prototyp ebenfalls umbenannt werden.
