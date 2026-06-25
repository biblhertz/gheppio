# Gheppio — Deployment Guide

## Requirements

- Web server (Apache / nginx) with PHP ≥ 7.4
- Write access to `/var/cache/sparql/` (or configure another cache path in `sparql-proxy.php`)
- A Mapbox account with a public token (domain-restricted recommended)
- (Optional) CouchDB instance for text/archive integration

## Quick start

```bash
git clone https://github.com/kewerner/gheppio.git
cd gheppio

# Copy the demo config as your starting point
cp demo/config.json config.json
cp demo/queries.js queries.js

# Edit config.json — set your token, center, institution details
# Edit queries.js — define your SPARQL overlays

# Serve from any static + PHP host
# The only PHP file is sparql-proxy.php
```

## New instance from scratch

```bash
mkdir instances/myinstitution
cp config.json instances/myinstitution/config.json
cp demo/queries.js instances/myinstitution/queries.js

# Fill in config.json:
#   institution.*
#   map.token, map.center, map.zoom
#   sparql.proxy  (usually "./sparql-proxy.php")
#   infopad.sections.records.sources  (your authority file links)
#   couch  (null if you have no CouchDB)

# When deploying, symlink or copy your instance files to root:
ln -sf instances/myinstitution/config.json config.json
ln -sf instances/myinstitution/queries.js queries.js
```

## SPARQL proxy setup

`sparql-proxy.php` caches Wikidata SPARQL responses to avoid hammering the public endpoint and to speed up repeated queries.

Default cache directory: `/var/cache/sparql/`

```bash
mkdir -p /var/cache/sparql
chown www-data:www-data /var/cache/sparql
chmod 700 /var/cache/sparql
```

If you cannot write to `/var/cache/`, edit the `$cacheDir` variable in `sparql-proxy.php`.

## Mapbox token

Create a public token at https://account.mapbox.com/access-tokens/ and restrict it to your domain. Paste the `pk.*` token into `config.json → map.token`.

If you use Mapbox default styles (Streets, Light, Outdoors, Satellite), no custom style URL is needed. Set `config.json → map.defaultStyle` to e.g. `"mapbox://styles/mapbox/light-v11"`.

## Demo mode

Set `"demo": true` in `config.json` to disable all CouchDB calls. The application will work with Wikidata only. Useful for evaluation or for institutions that have no digitized holdings backend.

## classes.js

`core/classes.js` contains the `ALLOWED_CLASSES` set — the Wikidata class QIDs that are shown as dots on the live map layer. The default set is tuned for European cultural heritage (churches, palaces, castles, archaeological sites, museums).

Extend it for your domain by adding QIDs to the set. For Dura Europos, you might add Mesopotamian building types. Do not modify core — copy `core/classes.js` to your instance directory and reference it in `index.html` before `core/map.js`.

## Historic map layers

To add historic map layers for a city, add an entry to `config.json → historicMaps[]`:

```json
{
  "id": "my-city",
  "bounds": { "north": 48.90, "south": 48.82, "west": 2.29, "east": 2.42 },
  "layers": [
    { "key": "modern",    "label": "OSM Modern",   "style": "modern" },
    { "key": "turgot",    "label": "Turgot 1739",  "style": "mapbox://styles/youruser/yourStyleId" }
  ]
}
```

The switcher button appears automatically when the map viewport overlaps the bounding box, and disappears when the user pans away.

## Apache example

```apache
<VirtualHost *:443>
    ServerName datahub.example.org
    DocumentRoot /var/www/gheppio

    <Directory /var/www/gheppio>
        Options -Indexes
        AllowOverride None
        Require all granted
    </Directory>

    # Cache directory outside webroot
    # (sparql-proxy.php writes here directly)
</VirtualHost>
```

## Nginx example

```nginx
server {
    listen 443 ssl;
    server_name datahub.example.org;
    root /var/www/gheppio;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```
