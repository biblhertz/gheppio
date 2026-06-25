// ============================================================================
// CORE/SPARQL.JS — Gheppio SPARQL client and overlay engine
//
// Depends on: core/utils.js (log, logError, setStatus)
// Initialise with: initSparql(config, map)
// Public API: query(), runOverlay(), clearOverlay()
// ============================================================================

import { log, logError, setStatus } from './utils.js';

let _config = null;
let _map    = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * @param {object}          config  — parsed config.json
 * @param {mapboxgl.Map}    map     — live map instance
 */
export function initSparql(config, map) {
    _config = config;
    _map    = map;
}

// ── Raw SPARQL query ──────────────────────────────────────────────────────────

/**
 * Run a SPARQL query through the configured proxy.
 * Returns the raw SPARQL JSON results object.
 *
 * @param {string}      sparql
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}  { results: { bindings: [...] } }
 */
export async function query(sparql, signal) {
    const proxy = _config.sparql.proxy;
    const url   = proxy + '?query=' + encodeURIComponent(sparql);

    const resp = await fetch(url, signal ? { signal } : {});
    if (!resp.ok) throw new Error('SPARQL proxy returned HTTP ' + resp.status);
    return resp.json();
}

// ── Overlay engine ────────────────────────────────────────────────────────────

/**
 * Run a SPARQL query and pipe the results onto the 'overlay' map source.
 * Expects bindings with ?item (URI), ?itemLabel, ?coord (WKT Point).
 * Fits the map to the result bounding box.
 *
 * @param {string} sparql
 * @param {string} label   — shown in the status pill
 */
export async function runOverlay(sparql, label = 'Query') {
    setStatus('Running SPARQL query\u2026');

    try {
        const data     = await query(sparql);
        const geojson  = _bindingsToGeoJSON(data.results?.bindings || []);
        const n        = geojson.features.length;

        _map.getSource('overlay').setData(geojson);

        if (n > 0) _fitOverlay(geojson.features);

        setStatus(`Overlay: ${n} result${n !== 1 ? 's' : ''} \u2014 ${label}`, true);
        return { geojson, count: n };

    } catch (e) {
        logError('Overlay query error:', e);
        setStatus('Query failed \u2014 check SPARQL or try again', true);
        return { geojson: null, count: 0 };
    }
}

/**
 * Clear the overlay source and reset related UI elements.
 */
export function clearOverlay() {
    if (_map?.getSource('overlay')) {
        _map.getSource('overlay').setData({ type: 'FeatureCollection', features: [] });
    }
    setStatus('Overlay cleared.', true);
}

// ── Wikidata entity helpers ───────────────────────────────────────────────────

/**
 * Fetch a single Wikidata entity via wbgetentities.
 *
 * @param {string} qid
 * @returns {Promise<object>}  raw entity object
 */
export async function fetchEntity(qid) {
    const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
        action: 'wbgetentities',
        ids:    qid,
        format: 'json',
        origin: '*'
    });
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Wikidata API returned HTTP ' + resp.status);
    const data = await resp.json();
    return data.entities?.[qid] || null;
}

/**
 * Fetch a label for a QID in the preferred language chain.
 *
 * @param {string}   qid
 * @param {string[]} langOrder  — e.g. ['it', 'en']
 * @returns {Promise<string>}
 */
export async function fetchLabel(qid, langOrder = ['en']) {
    if (!qid) return '';
    try {
        const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
            action:    'wbgetentities',
            ids:       qid,
            props:     'labels',
            languages: langOrder.join('|'),
            format:    'json',
            origin:    '*'
        });
        const resp   = await fetch(url);
        const data   = await resp.json();
        const entity = data.entities?.[qid];
        for (const lang of langOrder) {
            if (entity?.labels?.[lang]?.value) return entity.labels[lang].value;
        }
        return '';
    } catch (e) {
        logError('fetchLabel error:', e);
        return '';
    }
}

/**
 * Fetch entity data for multiple QIDs in batches of 50.
 * Returns maps of qid → label and qid → Set<class QIDs>.
 *
 * @param {string[]}    qids
 * @param {string[]}    langOrder
 * @param {object}      countryMap   — config.wikidata.countryLanguageMap
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ labels: object, classes: object, hasP973: Set }>}
 */
export async function fetchEntitiesBatch(qids, langOrder, countryMap = {}, signal) {
    const labels  = {};
    const classes = {};
    const hasP973 = new Set();

    for (let i = 0; i < qids.length; i += 50) {
        const batch = qids.slice(i, i + 50).join('|');
        const url   = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
            action:    'wbgetentities',
            ids:       batch,
            props:     'labels|claims',
            claimids:  'P31|P17|P973',
            languages: langOrder.join('|'),
            format:    'json',
            origin:    '*'
        });

        try {
            const resp = await fetch(url, signal ? { signal } : {});
            const data = await resp.json();

            for (const [qid, entity] of Object.entries(data.entities || {})) {
                // Language-aware label
                const countryQid = entity.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
                const preferred  = (countryQid && countryMap[countryQid]) || langOrder[0] || 'en';
                const order      = [preferred, ...langOrder, 'en'].filter((v, i, a) => a.indexOf(v) === i);
                for (const lang of order) {
                    if (entity.labels?.[lang]?.value) { labels[qid] = entity.labels[lang].value; break; }
                }
                // P31 class set
                classes[qid] = new Set(
                    (entity.claims?.P31 || [])
                        .map(c => c.mainsnak?.datavalue?.value?.id)
                        .filter(Boolean)
                );
                // P973 flag
                if (entity.claims?.P973?.length) hasP973.add(qid);
            }
        } catch (_) { /* silent — partial results are acceptable */ }
    }

    return { labels, classes, hasP973 };
}

/**
 * Fetch a Wikipedia intro extract.
 *
 * @param {string} title
 * @param {string} lang
 * @returns {Promise<string|null>}
 */
export async function fetchWikipediaExtract(title, lang = 'en') {
    if (!title) return null;
    try {
        const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
            action:      'query',
            format:      'json',
            origin:      '*',
            prop:        'extracts',
            exintro:     '1',
            explaintext: '1',
            titles:      title
        });
        const resp  = await fetch(url);
        const data  = await resp.json();
        const pages = data.query?.pages;
        const page  = pages && Object.values(pages)[0];
        if (!page || page.pageid === undefined || page.missing !== undefined) return null;
        return page.extract || null;
    } catch (e) {
        logError('fetchWikipediaExtract error:', e);
        return null;
    }
}

/**
 * Fetch a full Wikipedia article (with section markup).
 *
 * @param {string} title
 * @param {string} lang
 * @returns {Promise<{ title: string, extract: string }|null>}
 */
export async function fetchWikipediaFull(title, lang = 'en') {
    if (!title) return null;
    try {
        const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
            action:        'query',
            format:        'json',
            formatversion: '2',
            origin:        '*',
            prop:          'extracts',
            titles:        title
        });
        const resp  = await fetch(url);
        const data  = await resp.json();
        const page  = data.query?.pages?.[0];
        if (!page || page.missing) return null;
        return { title: page.title, extract: page.extract };
    } catch (e) {
        logError('fetchWikipediaFull error:', e);
        return null;
    }
}


/**
 * Fetch items that depict a given QID (reverse P180 lookup).
 * Returns bindings with ?item, ?itemLabel, ?image.
 *
 * @param {string} qid
 * @param {string} proxy   — sparql-proxy URL
 * @returns {Promise<object[]>}
 */
export async function fetchDepictedBy(qid, proxy) {
    const sparql = `
SELECT DISTINCT ?item ?itemLabel ?image WHERE {
  ?item wdt:P180 wd:${qid} .
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,it". }
}
ORDER BY ?itemLabel
LIMIT 30`;
    try {
        const url  = proxy + '?query=' + encodeURIComponent(sparql);
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const data = await resp.json();
        return data.results?.bindings || [];
    } catch (_) { return []; }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _bindingsToGeoJSON(bindings) {
    const features = [];
    for (const row of bindings) {
        const coordStr = row.coord?.value || '';
        const match    = coordStr.match(/Point\(([0-9.\-]+)\s+([0-9.\-]+)\)/i);
        if (!match) continue;
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [parseFloat(match[1]), parseFloat(match[2])]
            },
            properties: {
                label:    row.itemLabel?.value || '',
                wikidata: row.item?.value      || ''
            }
        });
    }
    return { type: 'FeatureCollection', features };
}

function _fitOverlay(features) {
    const lngs = features.map(f => f.geometry.coordinates[0]);
    const lats = features.map(f => f.geometry.coordinates[1]);
    _map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, pitch: 0, duration: 1000 }
    );
}
