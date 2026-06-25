// ============================================================================
// GHEPPIO EXTENSION CONTRACT — _example/index.js
//
// Copy this directory to extensions/my-extension/ and fill in your logic.
// Register your extension path in config.json → "extensions": ["extensions/my-extension/"]
//
// The extension loader calls init() after the map is ready, then activate()
// and deactivate() as the user toggles. The `core` object is the only
// supported API surface — do not reach into internal map.js globals.
// ============================================================================

export default {

    // ── Identity ────────────────────────────────────────────────────────────

    id: 'my-extension',           // Must be unique across all loaded extensions
    label: 'My Extension',        // Shown in any generated UI
    type: 'overlay',              // 'overlay' | 'panel' | 'infopad-section'
    icon: '📌',                   // Emoji or URL to 16×16 icon

    // ── Lifecycle ───────────────────────────────────────────────────────────

    /**
     * Called once after the map style has loaded and core is ready.
     * Use this for one-time setup: register sources, add controls, etc.
     *
     * @param {mapboxgl.Map} map      — the live Mapbox GL map instance
     * @param {object}       config   — the parsed config.json for this instance
     * @param {object}       core     — gheppio public API (see below)
     */
    init(map, config, core) {
        // Example: add a custom GeoJSON source
        // map.addSource('my-ext-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    },

    /**
     * Called when the user activates this extension (e.g. clicks a button).
     * Fetch data, show layers, open panels.
     *
     * @param {mapboxgl.Map} map
     * @param {object}       config
     * @param {object}       core
     * @param {*}            param    — optional: value from a dropdown or text field
     */
    activate(map, config, core, param = null) {
        // Example: run a SPARQL query and put results on the overlay layer
        // const sparql = `SELECT ?item ?itemLabel ?coord WHERE { ... }`;
        // core.sparql.runOverlay(sparql, 'My query label');
    },

    /**
     * Called when the user deactivates this extension, or when another
     * exclusive overlay takes over. Clean up layers, panels, listeners.
     *
     * @param {mapboxgl.Map} map
     */
    deactivate(map) {
        // Example: clear your source
        // if (map.getSource('my-ext-source'))
        //     map.getSource('my-ext-source').setData({ type: 'FeatureCollection', features: [] });
    },

    // ── Optional: infopad hook ───────────────────────────────────────────────

    /**
     * If type === 'infopad-section', this function is called after the core
     * infopad has rendered. Return an HTMLElement to append as a new section,
     * or null to add nothing.
     *
     * @param {object} wikidataEntity  — raw Wikidata API entity object
     * @param {string} qid
     * @param {object} config
     * @returns {HTMLElement|null}
     */
    // infoPadSection(wikidataEntity, qid, config) {
    //     return null;
    // }

};

// ============================================================================
// CORE PUBLIC API  (the `core` argument above)
// ============================================================================
//
// core.sparql.query(sparql)                → Promise<SPARQL JSON result>
// core.sparql.runOverlay(sparql, label)    → runs query, puts results on overlay layer, updates status
// core.sparql.clearOverlay()               → clears overlay layer
//
// core.infopad.open(qid)                   → loads and shows the info panel for a QID
// core.infopad.close()                     → hides the info panel
//
// core.panels.register({ id, label, render })  → register a named side panel
// core.panels.show(id)                     → show a registered panel
// core.panels.hide(id)                     → hide a registered panel
//
// core.map.addLayerGroup(id, layers)       → add layers under a namespaced group
// core.map.removeLayerGroup(id)            → remove all layers in group
//
// core.status.set(msg, autohide)           → show/hide the status pill
// core.config                              → the parsed config.json (read-only)
//
// ============================================================================
