# Gheppio — Architecture

Gheppio is a configurable, institution-deployable Wikidata-based heritage map application. It is designed to be deployed by cultural heritage organisations without modifying core code.

## Design principles

1. **Core is untouched by instances.** Institutions configure via `config.json` and extend via `extensions/`.
2. **Wikidata as the shared identifier spine.** All entities are QIDs. External authority files are linked from the infopad via configurable property→URL mappings.
3. **SPARQL overlays are data, not code.** Overlay queries live in `queries.js` per instance, loaded at runtime.
4. **Extensions register against a stable API.** The `core` object passed to extensions is the only supported surface.

## Repository structure

```
gheppio/
├── core/                    # Generic application logic — never institution-specific
│   ├── map.js               # Map init, Wikidata live layer, style switcher
│   ├── sparql.js            # SPARQL proxy client, overlay engine
│   ├── infopad.js           # Entity info panel (Wikipedia, images, external links)
│   ├── panels.js            # Located Here panel, panel show/hide
│   ├── search.js            # Building search and artist autocomplete
│   ├── classes.js           # ALLOWED_CLASSES: Wikidata class QID allowlist
│   └── utils.js             # Logging, URL params, language helpers
│
├── extensions/
│   └── _example/            # Copy this to write your own extension
│       └── index.js         # Extension contract — see EXTENSIONS.md
│
├── demo/
│   ├── config.json          # Demo instance: Dura Europos (no CouchDB required)
│   └── queries.js           # Demo overlay queries
│
├── instances/               # One subdirectory per deployment
│   └── hertziana/           # Bibliotheca Hertziana production instance
│       ├── config.json
│       ├── queries.js
│       └── extensions/
│           ├── historic-maps/   # Rome/Naples/L'Aquila historic map layer switcher
│           └── iccd/            # ICCD Foto + ICG Grafica buttons (Italy only)
│
├── assets/                  # Default assets (override per instance)
│   ├── logo.svg
│   └── custom.css
│
├── docs/
│   ├── ARCHITECTURE.md      # This file
│   ├── EXTENSIONS.md        # Extension contract reference
│   └── DEPLOYMENT.md        # How to deploy a new instance
│
├── index.html               # Single entry point — loads config, then core
├── config.json              # Active instance config (symlink or copy)
├── config.schema.json       # JSON Schema for config validation
├── sparql-proxy.php         # Server-side SPARQL proxy with file cache
└── LICENSE                  # EUPL v1.2
```

## Config loading

`index.html` fetches `config.json` at startup before initialising the map. All core modules receive the parsed config object. No config keys are hardcoded in `core/`.

```
index.html
  → fetch('config.json')
  → core/map.js(config)
  → core/sparql.js(config)
  → core/infopad.js(config)
  → core/panels.js(config)
  → core/search.js(config)
  → load extensions listed in config.extensions[]
  → load queries.js (OVERLAY_QUERIES array)
```

## Data flow

```
User pans map
  → core/map.js: fetchWikidata() [Wikidata geosearch API]
  → render dots on live layer

User clicks dot or uses building search
  → core/infopad.js: loadWikidataEntity(qid)
  → fetch Wikidata entity data
  → render: thumbnail, header, Wikipedia extract, external links
  → core/panels.js: runLocatedHerePanel() [P276/P195/P361 SPARQL]

User picks SPARQL overlay
  → core/sparql.js: runOverlay(sparql)
  → sparql-proxy.php → query.wikidata.org
  → render dots on overlay layer
```

## Historic map layer switcher

Historic map groups are declared in `config.json → historicMaps[]`. Each group has a bounding box and an ordered list of layer definitions. The switcher UI is generated at runtime from config — no code changes needed to add new cities or maps.

## CouchDB integration

CouchDB is optional. If `config.couch` is `null`, all CouchDB calls are skipped. When present, the infopad checks CouchDB databases for texts linked to the current QID.

## Extension loading

Extensions are ES modules loaded dynamically from paths listed in `config.extensions[]`. Each exports a default object conforming to the extension contract (see `EXTENSIONS.md`). The extension loader calls `init()` once after map load, then `activate()`/`deactivate()` on user action.
