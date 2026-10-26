# BIRRER Print — Relaunch

Vollständiger Abzug des bestehenden PrestaShop-Shops `shop.birrer-print.ch`,
Sortimentsübersicht und vorbereitete Shopify-Migration.

**→ [Sortimentsübersicht ansehen](https://lucayuri.github.io/birrer-print-relaunch/)**

- **[PLAN.md](PLAN.md)** — Konzept, Befunde und Migrationsplan
- `scraper/` — Scraper-Pipeline (Node ≥ 18, keine Dependencies)
- `data/` — Rohdaten: 1474 Produkte, 99 Kategorien, 2097 Bilder, 7 Redaktionsseiten
- `export/` — Shopify-Import: CSV (18 513 Zeilen) + Admin-API-Payloads
- `docs/` — die veröffentlichte Übersichtsseite

## Pipeline neu ausführen

```bash
node scraper/1-discover.mjs       # Kategorien + Produkt-URLs
node scraper/1b-orphans.mjs       # Vollständigkeitsprüfung (optional)
node scraper/2-products.mjs       # Produktdetails
node scraper/3-images.mjs         # Bilder laden
node scraper/3b-crop.mjs          # Weissraum beschneiden
node scraper/6-content.mjs        # Redaktionelle Seiten
node scraper/4-build-site.mjs     # Übersichtsseite bauen
node scraper/5-shopify-export.mjs # Shopify-Export
```
