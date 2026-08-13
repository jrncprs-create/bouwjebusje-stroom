# Camperstroom — bouwjebusje.nl/stroom

Statische samensteller-wizard voor camper-stroomsystemen, subsite van [bouwjebusje.nl](https://bouwjebusje.nl/stroom/).

## Structuur

```
content/     alle tekst, apparaten, producten en rekenregels (json + md) — hier pas je aan
templates/   de opmaak, los van de content
assets/      css en javascript
build.js     genereert de site in public/  →  node build.js
```

## Deploy (automatisch)

1. Push naar `main` → GitHub Actions draait `node build.js` en zet het resultaat op de branch **`deploy`**.
2. Een geplande taak in Plesk (Cloud86) downloadt die branch en pakt hem uit in de map `stroom/` van de docroot van bouwjebusje.nl.

Handmatig testen: `node build.js` en `node test-rekenlogica.js`.

## Afspraken

- Geen harde prijzen bij producten (bol-voorwaarden): prijsklassen.
- Geen foto's van de projectbussen Rocky en de witte bus — zie `content/media.json`.
- `bol_site_id` in `content/site.json` invullen na goedkeuring bol-partnerprogramma; alle links worden dan automatisch getagd.

© CPRS, Amsterdam.
