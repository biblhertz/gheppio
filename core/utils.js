// ============================================================================
// CORE/UTILS.JS — Gheppio shared utilities
//
// No external dependencies. No DOM assumptions except status pill (created
// lazily on first call to setStatus). Safe to load before the map.
// ============================================================================

// ── Logging ──────────────────────────────────────────────────────────────────

let _debug = false;

export function initLogging(debug = false) {
    _debug = debug;
}

export function log(...args) {
    if (_debug) console.log('[gheppio]', ...args);
}

export function logError(...args) {
    console.error('[gheppio]', ...args);
}

// ── URL parameters ────────────────────────────────────────────────────────────

export function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

export function setUrlParam(name, value) {
    const url = new URL(window.location);
    url.searchParams.set(name, value);
    window.history.pushState({}, '', url);
}

export function deleteUrlParam(name) {
    const url = new URL(window.location);
    url.searchParams.delete(name);
    window.history.pushState({}, '', url);
}

// ── Language helpers ──────────────────────────────────────────────────────────

/**
 * Build a language priority list for label/Wikipedia lookup.
 * Always deduplicates and ends with 'en' as last-resort fallback.
 *
 * @param {string}   preferred  — ISO code for the item's country language
 * @param {string[]} fetchLangs — config.wikidata.fetchLanguages
 * @returns {string[]}
 */
export function buildLangOrder(preferred, fetchLangs = ['en']) {
    const order = [preferred, ...fetchLangs, 'en'];
    return [...new Set(order.filter(Boolean))];
}

/**
 * Return the configured language for a country QID, or the fallback.
 *
 * @param {string}   countryQid  — e.g. 'Q38'
 * @param {object}   countryMap  — config.wikidata.countryLanguageMap
 * @param {string}   fallback    — default 'en'
 * @returns {string}
 */
export function getLangForCountry(countryQid, countryMap = {}, fallback = 'en') {
    return (countryQid && countryMap[countryQid]) || fallback;
}

/**
 * Pick the best available label from a Wikidata entity object,
 * respecting the country-derived language preference.
 *
 * @param {object}   entity      — entity object from wbgetentities
 * @param {object}   countryMap  — config.wikidata.countryLanguageMap
 * @param {string[]} fetchLangs  — config.wikidata.fetchLanguages
 * @returns {string}
 */
export function getBestLabel(entity, countryMap = {}, fetchLangs = ['en']) {
    const countryQid = entity?.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
    const preferred  = getLangForCountry(countryQid, countryMap);
    const order      = buildLangOrder(preferred, fetchLangs);
    for (const lang of order) {
        const v = entity?.labels?.[lang]?.value;
        if (v) return v;
    }
    return '';
}

/**
 * Find the best Wikipedia sitelink language available on an entity.
 *
 * @param {object}   entity
 * @param {object}   countryMap
 * @param {string[]} fetchLangs
 * @returns {string|null}
 */
export function getPreferredWikiLang(entity, countryMap = {}, fetchLangs = ['en']) {
    const countryQid = entity?.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
    const preferred  = getLangForCountry(countryQid, countryMap);
    const order      = buildLangOrder(preferred, fetchLangs);
    for (const lang of order) {
        if (entity?.sitelinks?.[`${lang}wiki`]) return lang;
    }
    return null;
}

// ── String helpers ────────────────────────────────────────────────────────────

export function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Expand a URL template.
 * Supported tokens: {value}, {qid}
 *
 * @param {string} template  — e.g. "https://example.org/{value}"
 * @param {string} value     — the property value
 * @param {string} qid       — the item QID
 * @returns {string}
 */
export function expandUrl(template, value, qid = '') {
    return template
        .replace('{value}', encodeURIComponent(value))
        .replace('{qid}', encodeURIComponent(qid));
}

// ── Status pill ───────────────────────────────────────────────────────────────

let _statusEl  = null;
let _hideTimer = null;

/**
 * Show the floating status pill (bottom-center of viewport).
 *
 * @param {string}  msg       — message text (HTML allowed)
 * @param {boolean} autohide  — if true, fade out after 3 s (done state)
 * @param {boolean} spinner   — show spinner (loading state only)
 */
export function setStatus(msg, autohide = false, spinner = true) {
    if (!_statusEl) _createStatusEl();

    clearTimeout(_hideTimer);

    if (!autohide) {
        _statusEl.className = 'loading';
        _statusEl.innerHTML = spinner
            ? `<span class="gh-spinner"></span>${msg}`
            : msg;
    } else {
        _statusEl.className = '';
        _statusEl.textContent = msg;
    }

    _statusEl.style.opacity = '1';

    if (autohide) {
        _hideTimer = setTimeout(() => { _statusEl.style.opacity = '0'; }, 3000);
    }
}

function _createStatusEl() {
    // Inject keyframes once
    const style = document.createElement('style');
    style.textContent = `
        @keyframes gh-spin { to { transform: rotate(360deg); } }
        #gh-status { transition: opacity 0.4s, background 0.2s; }
        #gh-status.loading {
            background: #0d2046 !important;
            color: #fff !important;
            border-color: #0d2046 !important;
        }
        #gh-status .gh-spinner {
            display: inline-block;
            width: 11px; height: 11px;
            border: 2px solid rgba(255,255,255,0.35);
            border-top-color: #fff;
            border-radius: 50%;
            animation: gh-spin 0.7s linear infinite;
            margin-right: 7px;
            vertical-align: middle;
        }
    `;
    document.head.appendChild(style);

    _statusEl = document.createElement('div');
    _statusEl.id = 'gh-status';
    _statusEl.style.cssText = [
        'position:fixed', 'bottom:2.5rem', 'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(255,255,255,0.95)',
        'border:1px solid #d4d9e3', 'border-radius:20px',
        'padding:7px 18px', 'font-size:0.78rem',
        'font-family:var(--font-ui,sans-serif)', 'font-weight:600',
        'letter-spacing:0.07em', 'text-transform:uppercase',
        'color:#1a1f2e',
        'box-shadow:0 2px 12px rgba(0,0,0,0.15)',
        'pointer-events:none', 'white-space:nowrap',
        'z-index:150', 'opacity:0'
    ].join(';');
    document.body.appendChild(_statusEl);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Create a labelled section wrapper (used by infopad sections).
 *
 * @param {string} title
 * @returns {HTMLElement}
 */
export function createSection(title) {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';
    const heading = document.createElement('p');
    heading.innerHTML = `<span class="subhead">${title}</span>`;
    wrapper.appendChild(heading);
    return wrapper;
}

/**
 * Append a link-button to a container.
 *
 * @param {HTMLElement} container
 * @param {string}      label
 * @param {string}      url
 * @param {boolean}     own       — highlight as "own resource"
 * @param {string|null} target    — link target attribute
 * @returns {HTMLElement}         — the button element
 */
export function createResourceButton(container, label, url, own = false, target = null) {
    const btn = document.createElement('button');
    if (own) btn.classList.add('btn-own');
    const targetAttr = target ? `target="${target}"` : '';
    btn.innerHTML = `<a ${targetAttr} title="${label}" href="${url}"><span>${label}</span></a>`;
    container.appendChild(btn);
    return btn;
}
