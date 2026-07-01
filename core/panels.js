// ============================================================================
// CORE/PANELS.JS — Gheppio Located Here panel and side panel system
//
// Depends on: core/utils.js, core/sparql.js
//
// Listens for: 'gheppio:located-here'   → { locationQID, qid }
//              'gheppio:infopad-closed'  → hides located-here panel
//
// The Located Here panel queries P276 / P195 / P361 for items at a location
// and renders them as a thumbnail table.
//
// On desktop:  floats as a side panel alongside the infopad.
// On mobile:   replaces the infopad content with a back-button view.
//
// Custom side panels can be registered by extensions via registerPanel().
// Call initPanels(config) once after DOM is ready.
// ============================================================================

import { log, logError } from './utils.js';
import { query }         from './sparql.js';
import { openEntity, showLightbox } from './infopad.js';

// ── Module state ──────────────────────────────────────────────────────────────

let _config = null;

// Registered custom panels: id → { label, render }
const _panels = {};

// ── Init ──────────────────────────────────────────────────────────────────────

export function initPanels(config) {
    _config = config;

    window.addEventListener('gheppio:located-here', e => {
        const { locationQID, qid } = e.detail;
        _runLocatedHere(locationQID, qid);
    });

    window.addEventListener('gheppio:infopad-closed', () => {
        _hideLocatedHerePanel();
    });

    // Depicted by panel
    window.addEventListener('gheppio:depicted-by', e => {
        _runDepictedBy(e.detail.qid, e.detail.rows);
    });

    // Mobile: tap backdrop to close infopad
    document.getElementById('panel-backdrop')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('gheppio:map-click-empty'));
    });
}

// ── Custom panel API (for extensions) ────────────────────────────────────────

/**
 * Register a named side panel. Extensions call this in their init().
 *
 * @param {object} def
 * @param {string}   def.id
 * @param {string}   def.label
 * @param {function} def.render  — async (container, qid, config) → void
 */
export function registerPanel({ id, label, render }) {
    _panels[id] = { label, render };
}

export function showPanel(id, qid) {
    const def = _panels[id];
    if (!def) return;
    let panel = document.getElementById(`gh-panel-${id}`);
    if (!panel) {
        panel = document.createElement('div');
        panel.id        = `gh-panel-${id}`;
        panel.className = 'gh-side-panel';
        document.body.appendChild(panel);
    }
    panel.innerHTML = '';
    panel.style.display    = 'block';
    panel.style.visibility = 'visible';
    def.render(panel, qid, _config).catch(e => logError('Panel render error:', id, e));
}

export function hidePanel(id) {
    const panel = document.getElementById(`gh-panel-${id}`);
    if (panel) { panel.style.display = 'none'; panel.style.visibility = 'hidden'; }
}

// ── Located Here ──────────────────────────────────────────────────────────────

async function _runLocatedHere(locationQID, qid) {
    if (window.innerWidth <= 768) {
        await _mobileLocatedHere(locationQID, qid);
    } else {
        await _desktopLocatedHere(locationQID, qid);
    }
}

// ── SPARQL ────────────────────────────────────────────────────────────────────

const LABEL_LANGS = 'it,en,de,fr,es,la,nl,mul';

function _sparqlForProp(prop, locationQID, excludeQID) {
    return `
SELECT DISTINCT ?item ?itemLabel ?image WHERE {
  ?item wdt:${prop} wd:${locationQID} .
  FILTER(?item != wd:${excludeQID})
  OPTIONAL { ?item wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABEL_LANGS}". }
}
ORDER BY ?itemLabel
LIMIT 10`;
}

// Forward query: subject has property pointing to items (e.g. P527 has part)
function _sparqlForwardProp(prop, subjectQID) {
    return `
SELECT DISTINCT ?item ?itemLabel ?image WHERE {
  wd:${subjectQID} wdt:${prop} ?item .
  OPTIONAL { ?item wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABEL_LANGS}". }
}
ORDER BY ?itemLabel
LIMIT 20`;
}

async function _fetchLocatedHereRows(locationQID, qid) {
    const endpoint = _config.sparql.proxy;

    const [r276, r195, r361, r527] = await Promise.all([
        fetch(endpoint + '?query=' + encodeURIComponent(_sparqlForProp('P276', locationQID, qid))),
        fetch(endpoint + '?query=' + encodeURIComponent(_sparqlForProp('P195', locationQID, qid))),
        fetch(endpoint + '?query=' + encodeURIComponent(_sparqlForProp('P361', locationQID, qid))),
        fetch(endpoint + '?query=' + encodeURIComponent(_sparqlForwardProp('P527', locationQID)))
    ]);

    const [d276, d195, d361, d527] = await Promise.all([
        r276.ok ? r276.json() : { results: { bindings: [] } },
        r195.ok ? r195.json() : { results: { bindings: [] } },
        r361.ok ? r361.json() : { results: { bindings: [] } },
        r527.ok ? r527.json() : { results: { bindings: [] } }
    ]);

    const rows276 = d276.results?.bindings || [];
    const rows195 = d195.results?.bindings || [];
    const rows361 = d361.results?.bindings || [];
    const rows527 = d527.results?.bindings || [];

    // Deduplicate across property sets
    const seen = new Set(rows276.map(r => r.item?.value));
    const u195 = rows195.filter(r => !seen.has(r.item?.value));
    u195.forEach(r => seen.add(r.item?.value));
    const u361 = rows361.filter(r => !seen.has(r.item?.value));
    u361.forEach(r => seen.add(r.item?.value));
    const u527 = rows527.filter(r => !seen.has(r.item?.value));

    return { rows276, u195, u361, u527 };
}

// ── Table builder ─────────────────────────────────────────────────────────────

function _buildTable(rows) {
    const table = document.createElement('table');
    table.className = 'lh-table';

    rows.forEach(row => {
        const qid   = (row.item?.value || '').replace('http://www.wikidata.org/entity/', '');
        const label = row.itemLabel?.value || qid;
        const imgThumb = row.image?.value
            ? row.image.value.replace('http://', 'https://') + '?width=60'
            : null;
        const imgLarge = row.image?.value
            ? row.image.value.replace('http://', 'https://') + '?width=600'
            : null;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="lh-img-cell">
                <img src="${imgThumb || ''}" alt="" loading="lazy"
                     style="${imgThumb ? 'cursor:zoom-in' : 'visibility:hidden'}"/>
            </td>
            <td class="lh-label-cell">
                <a class="lh-link" href="?q=${qid}" data-qid="${qid}">${_esc(label)}</a>
                <br/><a class="lh-qid" href="https://www.wikidata.org/wiki/${qid}" target="_blank">${qid}</a>
            </td>`;

        tr.querySelector('.lh-link').addEventListener('click', e => {
            e.preventDefault();
            openEntity(qid);
        });

        if (imgThumb) {
            const imgEl = tr.querySelector('img');
            imgEl.addEventListener('click', () => showLightbox(imgLarge, label));
            imgEl.addEventListener('error', function () { this.style.visibility = 'hidden'; });
        }

        table.appendChild(tr);
    });

    return table;
}

function _populatePanel(container, rows276, u195, u361, u527 = []) {
    container.innerHTML = '';
    if (!rows276.length && !u195.length && !u361.length && !u527.length) {
        container.innerHTML = '<p class="lh-empty">Nothing else found here.</p>';
        return;
    }
    if (rows276.length) container.appendChild(_buildTable(rows276));
    if (u195.length)    container.appendChild(_buildTable(u195));
    if (u361.length)    container.appendChild(_buildTable(u361));
    if (u527.length)    container.appendChild(_buildTable(u527));
}

// ── Desktop: floating side panel ──────────────────────────────────────────────

async function _desktopLocatedHere(locationQID, qid) {
    let panel = document.getElementById('located-here-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'located-here-panel';
        document.body.appendChild(panel);
    }
    panel.innerHTML = '<p class="lh-loading">Loading\u2026</p>';
    panel.style.display    = 'block';
    panel.style.visibility = 'visible';

    try {
        const { rows276, u195, u361, u527 } = await _fetchLocatedHereRows(locationQID, qid);
        _populatePanel(panel, rows276, u195, u361, u527);

        if (!rows276.length && !u195.length && !u361.length && !u527.length) {
            panel.style.display    = 'none';
            panel.style.visibility = 'hidden';
        }
    } catch (e) {
        logError('Located here error:', e);
        panel.innerHTML = '<p class="lh-error">Query failed.</p>';
    }
}

// ── Depicted By ───────────────────────────────────────────────────────────────

function _runDepictedBy(qid, rows) {
    if (window.innerWidth <= 768) {
        _mobileDepictedBy(qid, rows);
    } else {
        _desktopDepictedBy(qid, rows);
    }
}

function _desktopDepictedBy(qid, rows) {
    let panel = document.getElementById('located-here-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'located-here-panel';
        document.body.appendChild(panel);
    }
    panel.innerHTML = '';
    panel.style.display    = 'block';
    panel.style.visibility = 'visible';
    panel.appendChild(_buildTable(rows));
}

function _mobileDepictedBy(qid, rows) {
    const mainPanel = document.getElementById('myData');
    if (!mainPanel) return;

    const buildingName = (mainPanel.querySelector('h1')?.firstChild?.textContent || '').trim();
    mainPanel.innerHTML = '';

    const header  = document.createElement('div');
    header.className = 'lh-mobile-header';
    const backBtn = document.createElement('button');
    backBtn.className = 'lh-back-btn';
    backBtn.innerHTML = '\u2190\u2002' + (buildingName || 'Back');
    backBtn.addEventListener('click', () => openEntity(qid));
    header.appendChild(backBtn);
    mainPanel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';
    mainPanel.appendChild(body);

    if (!rows.length) {
        body.innerHTML = '<p class="lh-empty">Nothing found.</p>';
        return;
    }
    body.appendChild(_buildTable(rows));
}

function _hideLocatedHerePanel() {
    const panel = document.getElementById('located-here-panel');
    if (panel) { panel.style.display = 'none'; panel.style.visibility = 'hidden'; }
}

// ── Mobile: replace infopad content ──────────────────────────────────────────

async function _mobileLocatedHere(locationQID, qid) {
    const mainPanel = document.getElementById('myData');
    if (!mainPanel) return;

    // Grab building name from current h1 before we wipe it
    const buildingName = (mainPanel.querySelector('h1')?.firstChild?.textContent || '').trim();

    mainPanel.innerHTML = '';

    // Back button header
    const header  = document.createElement('div');
    header.className = 'lh-mobile-header';
    const backBtn = document.createElement('button');
    backBtn.className = 'lh-back-btn';
    backBtn.innerHTML = '\u2190\u2002' + (buildingName || 'Back');
    backBtn.addEventListener('click', () => openEntity(qid));
    header.appendChild(backBtn);
    mainPanel.appendChild(header);

    const body = document.createElement('div');
    body.className  = 'panel-body';
    body.innerHTML  = '<p class="lh-loading">Loading\u2026</p>';
    mainPanel.appendChild(body);

    try {
        const { rows276, u195, u361, u527 } = await _fetchLocatedHereRows(locationQID, qid);
        _populatePanel(body, rows276, u195, u361, u527);
    } catch (e) {
        logError('Located here (mobile) error:', e);
        body.innerHTML = '<p class="lh-error">Query failed.</p>';
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}