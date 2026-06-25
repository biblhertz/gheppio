# Gheppio — Extension Contract

Extensions are the mechanism for adding institution-specific functionality without modifying `core/`. They are ES modules that export a default object conforming to this contract.

## Quick start

```bash
cp -r extensions/_example extensions/my-feature
# edit extensions/my-feature/index.js
# add "extensions/my-feature/" to config.json → "extensions": [...]
```

## Extension types

| type | Description |
|---|---|
| `overlay` | Adds a new SPARQL overlay query or custom map layer |
| `panel` | Registers a side panel (shown alongside or instead of infopad) |
| `infopad-section` | Appends a new section to the infopad for matching entities |

## Lifecycle

```
page load → map style ready → extension.init(map, config, core)
user action → extension.activate(map, config, core, param?)
user action → extension.deactivate(map)
```

`init()` runs once. `activate()`/`deactivate()` may run many times. Extensions must be idempotent — `activate()` called twice must not double-add layers.

## Core API reference

### `core.sparql`

```js
// Run a raw SPARQL query via the configured proxy
const result = await core.sparql.query(sparqlString);
// result is the raw SPARQL JSON { results: { bindings: [...] } }

// Run query and pipe results directly to the overlay layer
// Handles status messages and map fitting automatically
await core.sparql.runOverlay(sparqlString, 'Label for status pill');

// Clear the overlay layer
core.sparql.clearOverlay();
```

### `core.infopad`

```js
// Load and show the infopad for a Wikidata QID
await core.infopad.open('Q12345');

// Hide the infopad
core.infopad.close();
```

### `core.panels`

```js
// Register a custom side panel (desktop only, floats beside infopad)
core.panels.register({
    id: 'my-panel',
    label: 'My Panel',
    render: async (container, qid, config) => {
        // populate container with DOM
    }
});

core.panels.show('my-panel');
core.panels.hide('my-panel');
```

### `core.map`

```js
// Add a group of Mapbox GL layers under a namespaced prefix
// Layers are automatically removed on style change and re-added
core.map.addLayerGroup('my-ext', [
    { id: 'my-ext-fill', type: 'fill', source: 'my-ext-source', ... }
]);

// Remove all layers in the group
core.map.removeLayerGroup('my-ext');
```

### `core.status`

```js
// Show the status pill (bottom-center)
core.status.set('Loading data…');            // loading style (navy + spinner)
core.status.set('Done — 42 results', true);  // autohide after 3s
```

### `core.config`

Read-only access to the parsed `config.json`:

```js
const lang = core.config.wikidata.fetchLanguages[0];
const couchEndpoint = core.config.couch?.endpoint;
```

## infopad-section hook

When `type === 'infopad-section'`, implement `infoPadSection()`:

```js
export default {
    id: 'iccd-photos',
    type: 'infopad-section',

    // Called synchronously after core renders the infopad
    // Return an HTMLElement or null
    infoPadSection(entity, qid, config) {
        const countryId = entity?.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
        if (countryId !== 'Q38') return null;   // Italy only

        const section = document.createElement('div');
        section.className = 'panel-section';
        // ... build section DOM
        return section;
    }
};
```

## Naming conventions

- Extension IDs: `kebab-case`, unique across all loaded extensions
- Layer IDs: always prefix with your extension ID (`my-ext-fill`, not `fill`)
- Source IDs: same prefix rule

## What extensions must NOT do

- Import or call internal `core/` functions directly (only `core.*` API)
- Modify `OVERLAY_QUERIES` (use the overlay API instead)
- Reach into `map.js` globals
- Assume CouchDB is present (check `config.couch !== null`)
- Add `<script>` tags to the document
