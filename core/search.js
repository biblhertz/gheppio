// ============================================================================
// CORE/SEARCH.JS — Gheppio header search bars
//
// Depends on: core/utils.js (log)
//
// Two independent search bars wired to elements in index.html:
//   #building-input / #building-autocomplete  — entity search (buildings, places)
//   #overlay-param  / #artist-autocomplete    — artist/architect search for overlays
//
// Both use the Wikidata wbsearchentities API with a configurable term filter.
// Selecting a building result fires 'gheppio:entity-selected'.
// Selecting an artist result stores the QID and fires 'gheppio:artist-selected'.
//
// Call initSearch(config) once after the DOM is ready.
// ============================================================================

import { log } from './utils.js';

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * @param {object} config  — parsed config.json
 */
export function initSearch(config) {
    const lang  = config.search?.buildingTerms?.language ?? 'en';
    const terms = config.search?.buildingTerms?.terms    ?? [];

    _initBuildingSearch(lang, terms);
    _initArtistSearch(lang);
}

// ── Shared Wikidata search ────────────────────────────────────────────────────

/**
 * Query wbsearchentities and return results.
 *
 * @param {string} q      — search string
 * @param {string} lang   — language for labels and descriptions
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function _wbSearch(q, lang = 'en', limit = 12) {
    const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
        action:   'wbsearchentities',
        search:   q,
        language: lang,
        uselang:  lang,
        type:     'item',
        limit:    String(limit),
        format:   'json',
        origin:   '*'
    });
    try {
        const data = await (await fetch(url)).json();
        return data.search || [];
    } catch (_) {
        return [];
    }
}

// ── Autocomplete dropdown ─────────────────────────────────────────────────────

/**
 * Render a list of search results into a dropdown container.
 * Returns the element that was clicked via onSelect callback.
 *
 * @param {object[]}  results
 * @param {HTMLElement} container  — the autocomplete div
 * @param {HTMLElement} anchor     — the input element (for positioning)
 * @param {function}  onSelect     — called with the chosen result object
 */
function _renderDropdown(results, container, anchor, onSelect) {
    container.innerHTML = '';
    if (!results.length) { container.style.display = 'none'; return; }

    results.forEach(r => {
        const div = document.createElement('div');
        div.className = 'ac-item';
        div.innerHTML =
            `<span class="ac-label">${_esc(r.label)}</span>` +
            (r.description ? `<span class="ac-desc">${_esc(r.description)}</span>` : '');
        div.addEventListener('mousedown', e => {
            e.preventDefault();
            onSelect(r);
            container.innerHTML = '';
            container.style.display = 'none';
        });
        container.appendChild(div);
    });

    const rect = anchor.getBoundingClientRect();
    container.style.left    = rect.left + 'px';
    container.style.top     = (rect.bottom + 2) + 'px';
    container.style.width   = Math.max(rect.width, 280) + 'px';
    container.style.display = 'block';
}

function _closeOnOutsideClick(container, anchor) {
    document.addEventListener('click', e => {
        if (!container.contains(e.target) && e.target !== anchor) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    });
}

// ── Building / entity search ──────────────────────────────────────────────────

const ART_HISTORY_TERMS = [
    // Italian
    'chiesa', 'basilica', 'cattedrale', 'duomo', 'cappella', 'oratorio',
    'monastero', 'abbazia', 'convento', 'santuario', 'palazzo', 'villa',
    'castello', 'fortezza', 'torre', 'tempio', 'anfiteatro', 'teatro',
    'museo', 'biblioteca', 'fontana', 'monumento', 'arco', 'ponte',
    // English (always included as fallback)
    'church', 'cathedral', 'chapel', 'monastery', 'abbey', 'palace',
    'castle', 'temple', 'amphitheatre', 'theater', 'museum', 'library',
    'fountain', 'monument', 'arch', 'bridge', 'tower', 'building',
    // French
    'basilique', 'cathédrale', 'église', 'château', 'palais',
    // German
    'kirche', 'dom', 'schloss', 'burg', 'kloster',
];

function _initBuildingSearch(lang, configTerms) {
    const input = document.getElementById('building-input');
    const ac    = document.getElementById('building-autocomplete');
    if (!input || !ac) return;

    // Merge config terms with the built-in art-history set (deduped)
    const terms = [...new Set([...configTerms, ...ART_HISTORY_TERMS])];
    const isRelevant = r =>
        terms.some(t => (r.description || '').toLowerCase().includes(t));

    let _timer = null;

    input.addEventListener('input', () => {
        clearTimeout(_timer);
        const q = input.value.trim();
        if (q.length < 2) { ac.innerHTML = ''; ac.style.display = 'none'; return; }
        _timer = setTimeout(async () => {
            const results  = await _wbSearch(q, lang);
            const filtered = results.filter(isRelevant);
            _renderDropdown(
                filtered.length ? filtered : results,
                ac, input,
                r => {
                    input.value = r.label;
                    window.dispatchEvent(new CustomEvent('gheppio:entity-selected', {
                        detail: { qid: r.id, fromSearch: true }
                    }));
                }
            );
        }, 300);
    });

    _closeOnOutsideClick(ac, input);
}

// ── Artist / architect search (used by overlay param field) ───────────────────

// Art-related occupations — multi-language
const ARTIST_TERMS = [
    // Italian
    'pittore', 'pittrice', 'architetto', 'scultore', 'scultrice',
    'artista', 'disegnatore', 'incisore', 'miniaturista', 'orafo',
    'cesellatore', 'mosaicista', 'decoratore', 'ingegnere', 'calligrafo',
    'illustratore', 'scenografo', 'restauratore', 'urbanista',
    // English
    'painter', 'architect', 'sculptor', 'artist', 'draughtsman',
    'engraver', 'miniaturist', 'decorator', 'goldsmith', 'designer',
    'illustrator', 'muralist', 'printmaker', 'draftsman', 'art historian',
    // French
    'peintre', 'architecte', 'sculpteur', 'graveur',
    // German
    'maler', 'bildhauer', 'architekt', 'künstler', 'grafiker',
    // Spanish
    'pintor', 'arquitecto', 'escultor',
];

const isArtRelated = r =>
    ARTIST_TERMS.some(t => (r.description || '').toLowerCase().includes(t));

// Currently selected artist QID — read by the overlay runner
let _selectedArtistQID = null;

export function getSelectedArtistQID() { return _selectedArtistQID; }
export function clearSelectedArtist()  { _selectedArtistQID = null; }

/**
 * Wire artist autocomplete to an input + dropdown pair.
 * Called by initSearch(); also exported so the overlay UI can call it
 * if the param input is created dynamically.
 *
 * @param {HTMLElement} input
 * @param {HTMLElement} ac
 * @param {string}      lang
 */
export function wireArtistSearch(input, ac, lang = 'en') {
    let _timer = null;

    const onInput = () => {
        clearTimeout(_timer);
        _selectedArtistQID = null;
        const q = input.value.trim();
        if (q.length < 2) { ac.innerHTML = ''; ac.style.display = 'none'; return; }
        _timer = setTimeout(async () => {
            const results  = await _wbSearch(q, lang);
            const filtered = results.filter(isArtRelated);
            _renderDropdown(
                filtered.length ? filtered : results,
                ac, input,
                r => {
                    _selectedArtistQID = r.id;
                    input.value   = r.label + (r.description ? ' — ' + r.description : '');
                    input.readOnly = true;
                    window.dispatchEvent(new CustomEvent('gheppio:artist-selected', {
                        detail: { qid: r.id, label: r.label }
                    }));
                }
            );
        }, 300);
    };

    input.addEventListener('input', onInput);
    _closeOnOutsideClick(ac, input);

    // Allow re-editing: remove readOnly when user clears the field
    input.addEventListener('keydown', e => {
        if (input.readOnly && (e.key === 'Backspace' || e.key === 'Delete')) {
            input.readOnly = false;
            input.value    = '';
            _selectedArtistQID = null;
        }
    });

    return { getQID: () => _selectedArtistQID };
}

function _initArtistSearch(lang) {
    const input = document.getElementById('overlay-param');
    const ac    = document.getElementById('artist-autocomplete');
    if (!input || !ac) return;
    wireArtistSearch(input, ac, lang);
}

// ── HTML escape ───────────────────────────────────────────────────────────────

function _esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
