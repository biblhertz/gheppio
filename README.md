# gheppio 🦅

**A configurable, institution-deployable Wikidata heritage map.**

Gheppio lets cultural heritage organisations deploy a map-based research interface that connects Wikidata items to their own digitized holdings, photographic archives, and authority files — without writing application code.

Each institution provides a `config.json` and a `queries.js`. Everything else is shared core.

---

## What it does

- Renders Wikidata items as live map dots, filtered by a configurable class allowlist
- Shows an infopad per item: Wikipedia extract, images, and links to external authority files (configurable per institution)
- "What's here" panel: P276 / P195 / P361 relations queried live
- SPARQL overlay system: run named queries, see results as a dot layer
- Building and artist autocomplete search via Wikidata API
- Historic map layer switcher (geo-bounded, config-driven)
- Mobile-responsive with swipe-to-close and bottom-sheet panel

## Demo instance: Dura Europos

The included demo targets the Dura Europos excavation site (Syria, Q193930) — one of the most thoroughly documented ancient sites on Wikidata. No institutional backend required.

```bash
git clone https://github.com/kewerner/gheppio
cd gheppio
cp demo/config.json config.json
cp demo/queries.js queries.js
# add your Mapbox token to config.json
# serve with any PHP-capable web server
```

## Deploying your own instance

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Extending

See [docs/EXTENSIONS.md](docs/EXTENSIONS.md) for the extension contract. Copy `extensions/_example/` to write your first extension.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[EUPL v1.2](LICENSE) — open source, copyleft, non-commercial-friendly. Developed at the [Bibliotheca Hertziana – Max-Planck-Institut für Kunstgeschichte](https://www.biblhertz.it), Rome.

## Name

*Gheppio* (Italian) — the Common Kestrel (*Falco tinnunculus*). A small falcon that hovers precisely over its target before striking. A fitting metaphor for pinpointing heritage in a sea of map data.
