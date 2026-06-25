// ============================================================================
// CORE/MAP.JS — Gheppio map initialisation and live Wikidata layer
//
// Depends on: core/utils.js, core/sparql.js, core/classes.js
//
// Exports:
//   initMap(config)          → Promise<mapboxgl.Map>
//   getMap()                 → mapboxgl.Map
//   setMapStyle(key)
//   addLayerGroup(id, layers)
//   removeLayerGroup(id)
// ============================================================================

import { log, logError, setStatus }           from './utils.js';
import { initSparql, fetchEntitiesBatch }     from './sparql.js';
import { ALLOWED_CLASSES }                    from './classes.js';

// ── Module state ──────────────────────────────────────────────────────────────

let _map       = null;
let _config    = null;

// Active style key: 'modern' | any historicMaps[].layers[].key
let _activeStyleKey = 'modern';

// Layer groups registered by extensions: id → [layerId, ...]
const _layerGroups = {};

// ── Public: init ──────────────────────────────────────────────────────────────

/**
 * Initialise Mapbox GL, wire all event handlers, return the map instance.
 *
 * @param {object} config  — parsed config.json
 * @returns {Promise<mapboxgl.Map>}
 */
export async function initMap(config) {
    _config = config;

    mapboxgl.accessToken = config.map.token;

    if (!mapboxgl.supported()) {
        document.body.innerHTML =
            '<p style="padding:2rem;font-family:sans-serif">Your browser does not support WebGL. ' +
            'Please update your browser or graphics drivers.</p>';
        throw new Error('WebGL not supported');
    }

    _map = new mapboxgl.Map({
        container:  'map',
        style:      config.map.defaultStyle,
        center:     config.map.center,
        zoom:       config.map.zoom,
        pitch:      config.map.pitch    ?? 0,
        bearing:    config.map.bearing  ?? 0,
        maxPitch:   config.map.maxPitch ?? 85,
        hash:       config.map.hash     ?? true,
        antialias:  false
    });

    // Expose map globally for extensions that need direct access
    window.__gheppioMap = _map;

    _map.on('style.load', () => {
        log('Style loaded:', _activeStyleKey);
        _addCoreLayers();
        _fetchWikidata();
        _map.on('moveend', _scheduleFetch);
    });

    _map.on('click', _handleMapClick);

    _addControls();
    _setupHistoricMaps();
    initSparql(config, _map);

    return new Promise(resolve => {
        _map.once('load', () => resolve(_map));
    });
}

export function getMap() { return _map; }

// ── Public: style switching ───────────────────────────────────────────────────

/**
 * Switch to a named map style.
 * 'modern' → config.map.defaultStyle
 * anything else → looked up in config.historicMaps[].layers[]
 *
 * @param {string} key
 */
export function setMapStyle(key) {
    if (key === _activeStyleKey) return;
    _activeStyleKey = key;

    // Sync button active states
    document.querySelectorAll('.gh-hmap-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === key);
    });

    const styleUrl = _resolveStyleKey(key);
    _map.setStyle(styleUrl);

    _map.once('style.load', () => {
        _addCoreLayers();
        _fetchWikidata();
        _map.on('moveend', _scheduleFetch);
        // Re-add extension layer groups
        // (extensions must call addLayerGroup again via their own style.load hook,
        //  or use the re-init callback registered via onStyleReload)
    });
}

// ── Public: layer group API (for extensions) ──────────────────────────────────

/**
 * Add a named group of Mapbox GL layers.
 * Stores layer IDs so they can be removed as a unit.
 *
 * @param {string}   groupId
 * @param {object[]} layerDefs  — Mapbox GL layer spec objects
 */
export function addLayerGroup(groupId, layerDefs) {
    removeLayerGroup(groupId);
    _layerGroups[groupId] = [];
    for (const def of layerDefs) {
        if (!_map.getLayer(def.id)) _map.addLayer(def);
        _layerGroups[groupId].push(def.id);
    }
}

/**
 * Remove all layers in a named group.
 *
 * @param {string} groupId
 */
export function removeLayerGroup(groupId) {
    const ids = _layerGroups[groupId] || [];
    for (const id of ids) {
        if (_map.getLayer(id)) _map.removeLayer(id);
    }
    delete _layerGroups[groupId];
}

// ── Core layer setup ──────────────────────────────────────────────────────────

function _addCoreLayers() {
    // ── Live Wikidata source + layers ─────────────────────────────────────────
    const srcId = 'wikidata-live';
    const lyId  = 'wd-points';

    if (!_map.getSource(srcId)) {
        _map.addSource(srcId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
    }

    if (!_map.getLayer(lyId)) {
        _map.addLayer({
            id: lyId, type: 'circle', source: srcId,
            paint: {
                'circle-radius':       5,
                'circle-color':        '#c8102e',
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#fff',
                'circle-opacity':      0.9
            }
        });
    }

    if (!_map.getLayer(lyId + '-labels')) {
        _map.addLayer({
            id: lyId + '-labels', type: 'symbol', source: srcId,
            layout: {
                'text-field':         ['get', 'label'],
                'text-font':          ['Open Sans SemiBold', 'Arial Unicode MS Regular'],
                'text-size':          13,
                'text-anchor':        'bottom',
                'text-offset':        [0, -0.6],
                'text-justify':       'auto',
                'text-allow-overlap': false
            },
            paint: {
                'text-color':      '#0d2046',
                'text-halo-color': 'rgba(255,255,255,0.8)',
                'text-halo-width': 2
            }
        });
    }

    // ── SPARQL overlay source + layers ────────────────────────────────────────
    if (!_map.getSource('overlay')) {
        _map.addSource('overlay', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
    }

    if (!_map.getLayer('overlay-points')) {
        _map.addLayer({
            id: 'overlay-points', type: 'circle', source: 'overlay',
            paint: {
                'circle-radius':       8,
                'circle-color':        '#e09b00',
                'circle-stroke-width': 2,
                'circle-stroke-color': 'rgba(255,255,255,0.9)',
                'circle-opacity':      0.92
            }
        });
    }

    if (!_map.getLayer('overlay-labels')) {
        _map.addLayer({
            id: 'overlay-labels', type: 'symbol', source: 'overlay',
            layout: {
                'text-field':         ['get', 'label'],
                'text-font':          ['Overpass SemiBold', 'Arial Unicode MS Regular'],
                'text-size':          14,
                'text-anchor':        'bottom',
                'text-offset':        [0, -0.8],
                'text-justify':       'auto',
                'text-allow-overlap': false
            },
            paint: {
                'text-color':      '#7a4400',
                'text-halo-color': 'rgba(255,255,255,0.85)',
                'text-halo-width': 2.5
            }
        });
    }
}

// ── Live Wikidata fetch ───────────────────────────────────────────────────────

// bbox → { geojson, ts }
const _bboxCache = {};
const CACHE_TTL  = 5 * 60 * 1000;

let _abortCtrl   = null;
let _fetchTimer  = null;

function _scheduleFetch() {
    clearTimeout(_fetchTimer);
    _fetchTimer = setTimeout(_fetchWikidata, _config.wikidata.debounceMs ?? 600);
}

function _bboxKey(b) {
    const r = v => Math.round(v * 100) / 100; // ~1 km grid
    return `${r(b.getNorth())},${r(b.getWest())},${r(b.getSouth())},${r(b.getEast())}`;
}

async function _fetchWikidata() {
    const minZoom = _config.wikidata.minZoom ?? 14;
    if (_map.getZoom() < minZoom) {
        setStatus('Zoom in to load Wikidata items', false, false);
        _map.getSource('wikidata-live')
            ?.setData({ type: 'FeatureCollection', features: [] });
        return;
    }

    const b        = _map.getBounds();
    const cacheKey = _bboxKey(b);
    const cached   = _bboxCache[cacheKey];

    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        const n = cached.geojson.features.length;
        _map.getSource('wikidata-live').setData(cached.geojson);
        setStatus(`${n} Wikidata item${n !== 1 ? 's' : ''} in view (cached)`, true);
        return;
    }

    if (_abortCtrl) _abortCtrl.abort();
    _abortCtrl = new AbortController();

    setStatus('Loading Wikidata\u2026');

    const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
        action:      'query',
        list:        'geosearch',
        gsbbox:      `${b.getNorth()}|${b.getWest()}|${b.getSouth()}|${b.getEast()}`,
        gsprop:      'type|name|dim',
        gslimit:     '500',
        gsnamespace: '0',
        format:      'json',
        origin:      '*'
    });

    try {
        const res   = await fetch(url, { signal: _abortCtrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data  = await res.json();
        const items = data?.query?.geosearch || [];

        if (!items.length) {
            _map.getSource('wikidata-live')
                .setData({ type: 'FeatureCollection', features: [] });
            setStatus('No Wikidata items in view', true);
            return;
        }

        const langOrder = _config.wikidata.fetchLanguages ?? ['en'];
        const countryMap = _config.wikidata.countryLanguageMap ?? {};
        const qids = items.map(i => i.title);
        const { labels, classes, hasP973 } =
            await fetchEntitiesBatch(qids, langOrder, countryMap, _abortCtrl.signal);

        const geojson = _geosearchToGeoJSON(items, labels, classes, hasP973);
        const n       = geojson.features.length;

        _bboxCache[cacheKey] = { geojson, ts: Date.now() };
        _map.getSource('wikidata-live').setData(geojson);
        setStatus(`${n} Wikidata item${n !== 1 ? 's' : ''} in view`, true);

    } catch (err) {
        if (err.name === 'AbortError') return;
        logError('Wikidata fetch error:', err);
        setStatus('Error loading Wikidata — try again', true);
    }
}

function _geosearchToGeoJSON(items, labels, classes, hasP973) {
    const features = [];
    for (const item of items) {
        const qid     = item.title;
        const itemCls = classes[qid] || new Set();
        const matched = [...itemCls].find(c => ALLOWED_CLASSES.has(c));
        if (!matched) continue;

        // Filter nameless fountain stubs
        if (matched === 'Q483453' || matched === 'Q110443935') {
            const lbl = labels[qid] || item.name || '';
            if (!lbl || lbl === 'Fountain' || lbl === 'Dancing fountain') continue;
            if (matched === 'Q483453' && hasP973.has(qid)) continue;
        }

        const raw = labels[qid] || item.name || qid;
        features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
            properties: {
                qid,
                label: raw.charAt(0).toUpperCase() + raw.slice(1),
                class: matched
            }
        });
    }
    return { type: 'FeatureCollection', features };
}

// ── Map click ─────────────────────────────────────────────────────────────────

function _handleMapClick(e) {
    const features = _map.queryRenderedFeatures(e.point);
    if (!features.length) {
        // Dispatch a custom event; infopad.js listens and closes the panel
        window.dispatchEvent(new CustomEvent('gheppio:map-click-empty'));
        return;
    }

    // Support both static tileset (.wikidata) and live layer (.qid)
    const raw   = features[0].properties.wikidata || features[0].properties.qid || '';
    const qid   = raw.replace(/^https?:\/\/www\.wikidata\.org\/entity\//, '');
    const fromOverlay = features[0].layer.id === 'overlay-points';

    if (!qid) {
        window.dispatchEvent(new CustomEvent('gheppio:map-click-empty'));
        return;
    }

    window.dispatchEvent(new CustomEvent('gheppio:entity-selected', {
        detail: { qid, fromOverlay }
    }));
}

// ── Controls ──────────────────────────────────────────────────────────────────

function _addControls() {
    // Geocoder (Mapbox)
    if (typeof MapboxGeocoder !== 'undefined') {
        _map.addControl(new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl
        }));
    }

    // Satellite toggle — adds a single button when config.map.satellite = true
    if (_config.map.satellite) {
        const satDiv = document.createElement('div');
        satDiv.className = 'mapboxgl-ctrl mapboxgl-ctrl-group gh-satellite-ctrl';
        const satBtn = document.createElement('button');
        satBtn.className = 'gh-hmap-btn';
        satBtn.dataset.style = 'satellite';
        satBtn.title = 'Satellite';
        satBtn.innerHTML = '<span class="hmap-label">Satellite</span>';
        satBtn.addEventListener('click', () => {
            if (_activeStyleKey === 'satellite') {
                setMapStyle('modern');
            } else {
                // Store previous style to restore on toggle-off
                _map._ghPrevStyle = _activeStyleKey;
                _activeStyleKey = 'satellite';
                satBtn.classList.add('active');
                _map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
                _map.once('style.load', () => {
                    _addCoreLayers();
                    _fetchWikidata();
                    _map.on('moveend', _scheduleFetch);
                });
            }
        });
        satDiv.appendChild(satBtn);
        document.querySelector('.mapboxgl-ctrl-top-right').appendChild(satDiv);
    }

    // Fullscreen
    _map.addControl(new mapboxgl.FullscreenControl({
        container: document.querySelector('body')
    }));

    // Navigation
    _map.addControl(new mapboxgl.NavigationControl());

    // Geolocation
    _map.addControl(new mapboxgl.GeolocateControl({
        positionOptions:   { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading:   true,
        fitBoundsOptions:  { maxZoom: 16 }
    }));
}

// ── Historic map layer switcher ───────────────────────────────────────────────
//
// config.historicMaps is an array of groups, each with:
//   { id, bounds: { north, south, east, west }, layers: [{ key, label, style }] }
//
// A button group is created per config entry and shown/hidden as the user
// pans, based on viewport overlap with the group's bounds.

function _setupHistoricMaps() {
    const groups = _config.historicMaps || [];
    if (!groups.length) return;

    const container = document.querySelector('.mapboxgl-ctrl-top-right');

    groups.forEach(group => {
        const div = document.createElement('div');
        div.className = `mapboxgl-ctrl mapboxgl-ctrl-group gh-hmap-ctrl gh-hmap-${group.id}`;
        div.style.display = 'none';

        group.layers.forEach(layer => {
            const btn = document.createElement('button');
            btn.className = 'gh-hmap-btn' + (layer.key === 'modern' ? ' active' : '');
            btn.dataset.style = layer.key;
            btn.title = layer.label;
            btn.innerHTML = `<span class="hmap-label">${layer.label}</span>`;
            btn.addEventListener('click', () => setMapStyle(layer.key));
            div.appendChild(btn);
        });

        container.appendChild(div);

        // Visibility logic
        const check = () => {
            const b       = _map.getBounds();
            const bo      = group.bounds;
            const visible =
                b.getNorth() > bo.south && b.getSouth() < bo.north &&
                b.getEast()  > bo.west  && b.getWest()  < bo.east;

            div.style.display = visible ? '' : 'none';

            // Auto-revert to modern if user pans away while a historic style is active
            if (!visible && _activeStyleInGroup(group)) setMapStyle('modern');
        };

        _map.on('moveend',     check);
        _map.on('style.load',  check);
    });
}

function _activeStyleInGroup(group) {
    return group.layers.some(l => l.key === _activeStyleKey && l.key !== 'modern');
}

function _resolveStyleKey(key) {
    if (key === 'modern') return _config.map.defaultStyle;
    for (const group of (_config.historicMaps || [])) {
        const layer = group.layers.find(l => l.key === key);
        if (layer) return layer.style;
    }
    logError('Unknown style key:', key);
    return _config.map.defaultStyle;
}