// ============================================================================
// CORE/INFOPAD.JS — Gheppio entity information panel
//
// Depends on: core/utils.js, core/sparql.js
//
// Listens for:  'gheppio:entity-selected' → opens panel for QID
//               'gheppio:map-click-empty' → closes panel
//
// Fires:        'gheppio:infopad-opened'  → { qid, entity }
//               'gheppio:infopad-closed'
//
// Call initInfopad(config, map) once after DOM is ready.
// Public API: openEntity(qid), closePanel()
// ============================================================================

import {
    logError,
    getLangForCountry, buildLangOrder, getBestLabel, getPreferredWikiLang,
    capitalize, expandUrl,
    createSection, createResourceButton
} from './utils.js';

import {
    fetchEntity, fetchLabel,
    fetchWikipediaExtract, fetchWikipediaFull,
    fetchDepictedBy
} from './sparql.js';

// ── Module state ──────────────────────────────────────────────────────────────

let _config = null;
let _map    = null;

// Extension infopad-section hooks: [{ id, fn }]
const _sectionHooks = [];

// Lightbox element (created lazily)
let _lbEl = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initInfopad(config, map) {
    _config = config;
    _map    = map;
    window.addEventListener('gheppio:entity-selected', e => openEntity(e.detail.qid));
    window.addEventListener('gheppio:map-click-empty', ()  => closePanel());
}

export function registerSectionHook(id, fn) {
    _sectionHooks.push({ id, fn });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function openEntity(qid) {
    if (!qid) return;

    const panel = _getPanel();
    _hideSidePanels();
    _showPanel(panel);
    panel.innerHTML = _loadingHTML();
    _setUrlParam('q', qid);

    try {
        const entity = await fetchEntity(qid);
        if (!entity) throw new Error('Entity not found: ' + qid);

        // ── Language setup ────────────────────────────────────────────────────
        const langOrder  = _config.wikidata?.fetchLanguages     ?? ['en'];
        const countryMap = _config.wikidata?.countryLanguageMap ?? {};
        const countryQid = _claimQid(entity, 'P17');
        const wikiLang   = getPreferredWikiLang(entity, countryMap, langOrder)
            ?? getLangForCountry(countryQid, countryMap);
        const langFull   = buildLangOrder(wikiLang, langOrder);
        const wikiTitle  = entity.sitelinks?.[`${wikiLang}wiki`]?.title ?? null;

        // ── Claim extraction ──────────────────────────────────────────────────
        const p131Qid  = _claimQid(entity, 'P131');  // admin territory
        const p276Qid  = _claimQid(entity, 'P276');  // location
        const p31Qid   = _claimQid(entity, 'P31');   // instance of
        const p195Qid  = _claimQid(entity, 'P195');  // collection
        const hasP625  = !!entity.claims?.P625;
        const hasP527  = !!(entity.claims?.P527?.length);
        const invNum   = entity.claims?.P217?.[0]?.mainsnak?.datavalue?.value ?? '';

        // All P361 (part of) and P189 (location of discovery) values
        const p361Qids = _claimQids(entity, 'P361');
        const p189Qids = _claimQids(entity, 'P189');

        // ── Parallel label + Wikipedia fetch ──────────────────────────────────
        const [
            adminLabel, locationLabel, instanceLabel, collectionLabel,
            p361Label0, p189Label0,
            ...extraLabels
        ] = await Promise.all([
            fetchLabel(p131Qid, langFull),
            (!hasP625 && p276Qid) ? fetchLabel(p276Qid, langFull) : Promise.resolve(''),
            p31Qid  ? fetchLabel(p31Qid,  ['en'])   : Promise.resolve(''),
            p195Qid ? fetchLabel(p195Qid, langFull) : Promise.resolve(''),
            p361Qids[0] ? fetchLabel(p361Qids[0], langFull) : Promise.resolve(''),
            p189Qids[0] ? fetchLabel(p189Qids[0], langFull) : Promise.resolve(''),
            // Remaining P361 values
            ...p361Qids.slice(1).map(id => fetchLabel(id, langFull)),
            // Remaining P189 values
            ...p189Qids.slice(1).map(id => fetchLabel(id, langFull)),
        ]);

        // Split extraLabels into P361 and P189 extras
        const p361Extra = extraLabels.slice(0, p361Qids.length - 1);
        const p189Extra = extraLabels.slice(p361Qids.length - 1);

        const partOfList = p361Qids
            .map((id, i) => ({ qid: id, label: i === 0 ? p361Label0 : (p361Extra[i - 1] || '') }))
            .filter(p => p.label);

        const discoveryList = p189Qids
            .map((id, i) => ({ qid: id, label: i === 0 ? p189Label0 : (p189Extra[i - 1] || '') }))
            .filter(d => d.label);

        // Wikipedia extract (blocking — needed before render)
        const wikiExtract = (wikiTitle && _config.infopad?.wikipediaSummary !== false)
            ? await fetchWikipediaExtract(wikiTitle, wikiLang)
            : null;

        // Depicted-by — non-blocking, resolves after panel renders
        const depictedByPromise = fetchDepictedBy(qid, _config.sparql.proxy);

        // ── Render ────────────────────────────────────────────────────────────
        _centerMap(entity);
        panel.innerHTML = '';

        const ctx = {
            adminLabel, locationLabel, instanceLabel, collectionLabel,
            partOfList, discoveryList, invNum,
            p131Qid, p276Qid, p31Qid, p195Qid,
            hasP625, hasP527, wikiLang, wikiTitle
        };

        _buildPanel(panel, entity, qid, wikiExtract, ctx, depictedByPromise);

        // Extension hooks
        for (const hook of _sectionHooks) {
            try {
                const el = hook.fn(entity, qid, _config, {
                    adminLabel,
                    labelValue: getBestLabel(entity, countryMap, langOrder)
                });
                if (el instanceof HTMLElement) panel.querySelector('.panel-body')?.appendChild(el);
            } catch (e) {
                logError('Extension hook error:', hook.id, e);
            }
        }

        window.dispatchEvent(new CustomEvent('gheppio:infopad-opened', { detail: { qid, entity } }));

    } catch (err) {
        logError('openEntity error:', err);
        panel.innerHTML = '<p style="padding:1.25rem">Error loading data. Please try again.</p>';
    }
}

export function closePanel() {
    const panel = _getPanel();
    _hideSidePanels();
    panel.classList.remove('panel-entering');
    panel.classList.add('panel-leaving');
    setTimeout(() => {
        panel.style.visibility = 'hidden';
        panel.style.display    = 'none';
        panel.classList.remove('panel-leaving');
    }, 250);
    document.body.classList.remove('panel-open');
    _deleteUrlParam('q');
    window.dispatchEvent(new CustomEvent('gheppio:infopad-closed'));
}

// ── Panel builder ─────────────────────────────────────────────────────────────

function _buildPanel(panel, entity, qid, wikiExtract, ctx, depictedByPromise) {
    _addThumbnail(entity, panel);
    _addHeader(entity, qid, panel, ctx);

    const body = document.createElement('div');
    body.className = 'panel-body';
    panel.appendChild(body);

    if (wikiExtract && ctx.wikiTitle) {
        _addWikipediaSection(wikiExtract, ctx.wikiTitle, ctx.wikiLang, body);
    }

    // Parts & contents button — always present
    _addSidePanelBtn(body, 'Parts & contents', 'gheppio:located-here', { locationQID: qid, qid });

    // Depicted by button — inserted once depictedBy resolves with results
    depictedByPromise.then(rows => {
        if (!rows.length) return;
        _addSidePanelBtn(body, 'Depicted by', 'gheppio:depicted-by', { qid, rows });
    });

    body.appendChild(_divider());

    _addTextsSection(entity, qid, ctx.wikiLang, body);
    _addImagesSection(entity, body);
    _addRecordsSection(entity, qid, body);

    // Footer
    const note = document.createElement('p');
    const year = new Date().getFullYear();
    const tpl  = _config.institution?.footerNote ?? '{year}';
    note.innerHTML = `<span class="notabene">${tpl.replace('{year}', year)}</span>`;
    panel.appendChild(note);
}

// ── Side panel button ─────────────────────────────────────────────────────────

function _addSidePanelBtn(container, label, eventName, detail) {
    const btn = document.createElement('button');
    btn.className   = 'location-btn';
    btn.textContent = `${label}  \u00a0 \u25B7`;
    btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    });
    // Insert before the divider so both buttons stay grouped above the sections
    const divider = container.querySelector('hr.panel-divider');
    divider ? container.insertBefore(btn, divider) : container.appendChild(btn);
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

function _addThumbnail(entity, container) {
    const val = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!val) return;
    const div = document.createElement('div');
    div.id = 'gh-thumb';
    div.innerHTML = `<img alt="[reference image]"
        src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(val)}?width=160"/>`;
    container.appendChild(div);
}

// ── Header ────────────────────────────────────────────────────────────────────

function _addHeader(entity, qid, container, ctx) {
    const countryMap = _config.wikidata?.countryLanguageMap ?? {};
    const langOrder  = _config.wikidata?.fetchLanguages     ?? ['en'];
    const label      = getBestLabel(entity, countryMap, langOrder);
    const cap        = s => s ? capitalize(s) : '';

    const qidLine = `<br/><small><a class="qid-link"
        href="https://www.wikidata.org/wiki/${qid}" target="_blank">${qid}</a></small>`;

    // Artwork: has a collection (P195) or located-in a building without own coordinates
    const isArtwork = !!(ctx.collectionLabel || ctx.locationLabel);

    const h1 = document.createElement('h1');

    if (isArtwork) {
        const locLabel = ctx.collectionLabel || ctx.locationLabel;
        const locQid   = ctx.p195Qid         || ctx.p276Qid;
        const locBtn   = locLabel
            ? `<a class="location-link location-btn" href="?q=${locQid}" data-qid="${locQid}">${locLabel}</a><br/>`
            : '';

        const typeParts = [cap(ctx.instanceLabel), ctx.invNum ? `Inv.\u00a0${ctx.invNum}` : ''].filter(Boolean);
        const typeLine  = typeParts.length ? `<br/><small>${typeParts.join(', ')}</small>` : '';

        const discoveryBtns = ctx.discoveryList?.length
            ? '<br/><small class="discovery-prefix">From:</small><br/>' +
            ctx.discoveryList
                .map(d => `<a class="location-link location-btn" href="?q=${d.qid}" data-qid="${d.qid}">${d.label}</a>`)
                .join('<br/>')
            : '';

        h1.innerHTML = `${locBtn}${label}${typeLine}${discoveryBtns}${qidLine}`;

    } else {
        const partOfBtns = ctx.partOfList?.length
            ? ctx.partOfList
            .map(p => `<a class="location-link location-btn" href="?q=${p.qid}" data-qid="${p.qid}">${p.label}</a>`)
            .join(' ') + '<br/>'
            : '';

        const locStr   = ctx.adminLabel;
        const typeLine = ctx.instanceLabel
            ? (locStr
                ? `<br/><small>${cap(ctx.instanceLabel)} in ${locStr}</small>`
                : `<br/><small>${cap(ctx.instanceLabel)}</small>`)
            : (locStr ? `<br/><small>${locStr}</small>` : '');

        const invPart = ctx.invNum
            ? `<br/><small class="inventory-num">Inv.\u00a0${ctx.invNum}</small>`
            : '';

        h1.innerHTML = `${partOfBtns}${label}${typeLine}${invPart}${qidLine}`;
    }

    // SPA navigation for all .location-link anchors
    h1.querySelectorAll('.location-link').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            openEntity(a.dataset.qid);
        });
    });

    container.appendChild(h1);
}

// ── Wikipedia section ─────────────────────────────────────────────────────────

function _addWikipediaSection(extract, wikiTitle, lang, container) {
    const div = document.createElement('div');
    div.className = 'wikipedia-extract';

    const short = extract.length > 300 ? extract.substring(0, 300) + '\u2026' : extract;

    const btn = document.createElement('button');
    btn.className = 'wiki-more-button';
    btn.innerHTML = '<span>&#x25BD;&nbsp;&nbsp;Summary</span>';
    div.appendChild(btn);

    const para = document.createElement('p');
    para.innerHTML = short;
    div.appendChild(para);

    let fullLoaded = false;

    btn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();

        if (!fullLoaded) {
            btn.innerHTML = '<span>loading\u2026</span>';
            btn.disabled  = true;

            const full = await fetchWikipediaFull(wikiTitle, lang);
            if (full?.extract) {
                btn.innerHTML  = '<span>&#x25B3;&nbsp;&nbsp;Summary</span>';
                btn.disabled   = false;
                para.innerHTML = '';
                const wrap = document.createElement('div');
                wrap.id = 'gh-wikipedia';
                wrap.innerHTML = `<h4>${full.title}</h4><div>${full.extract}</div>
                    <p><small>Licence <a href="https://creativecommons.org/licenses/by-sa/4.0/"
                    target="_blank">CC BY-SA</a></small></p>`;
                para.appendChild(wrap);
                fullLoaded = true;
            } else {
                btn.innerHTML = '<span>&#x25BD;&nbsp;&nbsp;Summary</span>';
                btn.disabled  = false;
            }
        } else {
            btn.innerHTML  = '<span>&#x25BD;&nbsp;&nbsp;Summary</span>';
            para.innerHTML = short;
            fullLoaded     = false;
        }
    });

    container.appendChild(div);
}

// ── Texts section ─────────────────────────────────────────────────────────────

function _addTextsSection(entity, qid, wikiLang, container) {
    if (_config.infopad?.sections?.texts?.enabled === false) return;

    const section = createSection('Texts');
    const sources = _config.infopad?.sections?.texts?.sources ?? [];

    for (const src of sources) {
        const val = _propValue(entity, src.property);
        if (!val || !_conditionMet(entity, src.condition)) continue;
        createResourceButton(section, src.label, expandUrl(src.url, val, qid), src.own ?? false);
    }

    if (_config.infopad?.wikipediaSummary !== false) {
        const title = entity.sitelinks?.[`${wikiLang}wiki`]?.title;
        if (title) createResourceButton(
            section, 'Wikipedia',
            `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(title)}?useskin=Vector`
        );
    }

    if (section.querySelector('button')) container.appendChild(section);
}

// ── Images section ────────────────────────────────────────────────────────────

function _addImagesSection(entity, container) {
    if (_config.infopad?.sections?.images?.enabled === false) return;

    const section = createSection('Images');
    const imgConf = _config.infopad?.sections?.images ?? {};
    const sources = imgConf.sources ?? [];

    if (imgConf.wikimediaCommons !== false) {
        const cat = _propValue(entity, 'P373');
        if (cat) createResourceButton(
            section, 'Wikimedia',
            `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(cat)}`
        );
    }

    for (const src of sources) {
        const val = _propValue(entity, src.property);
        if (!val || !_conditionMet(entity, src.condition)) continue;
        createResourceButton(section, src.label, expandUrl(src.url, val), src.own ?? false);
    }

    if (section.querySelector('button')) container.appendChild(section);
}

// ── Records section ───────────────────────────────────────────────────────────

function _addRecordsSection(entity, qid, container) {
    if (_config.infopad?.sections?.records?.enabled === false) return;

    const section = createSection('Records');
    const sources = _config.infopad?.sections?.records?.sources ?? [];

    for (const src of sources) {
        const val = _propValue(entity, src.property);
        if (!val || !_conditionMet(entity, src.condition)) continue;
        createResourceButton(section, src.label, expandUrl(src.url, val, qid), src.own ?? false);
    }

    if (section.querySelector('button')) container.appendChild(section);
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

export function showLightbox(src, caption) {
    if (!_lbEl) {
        _lbEl = document.createElement('div');
        _lbEl.id = 'gh-lightbox';
        _lbEl.innerHTML = `
            <div id="gh-lb-backdrop"></div>
            <div id="gh-lb-box">
                <button id="gh-lb-close">&times;</button>
                <img id="gh-lb-img" src="" alt="">
                <p id="gh-lb-caption"></p>
            </div>`;
        document.body.appendChild(_lbEl);
        _lbEl.querySelector('#gh-lb-backdrop').addEventListener('click', _closeLightbox);
        _lbEl.querySelector('#gh-lb-close').addEventListener('click',   _closeLightbox);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeLightbox(); });
    }
    _lbEl.querySelector('#gh-lb-img').src             = src;
    _lbEl.querySelector('#gh-lb-caption').textContent = caption;
    _lbEl.style.display = 'flex';
}

function _closeLightbox() {
    if (_lbEl) {
        _lbEl.style.display = 'none';
        _lbEl.querySelector('#gh-lb-img').src = '';
    }
}

// ── Map centering ─────────────────────────────────────────────────────────────

function _centerMap(entity) {
    const lat = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value?.latitude;
    const lon = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value?.longitude;
    if (lat && lon) {
        _map.flyTo({ center: [lon, lat], zoom: Math.max(_map.getZoom(), 16), speed: 1.4, curve: 1.5 });
    }
}

// ── Panel show / hide ─────────────────────────────────────────────────────────

function _showPanel(panel) {
    panel.style.visibility = 'visible';
    panel.style.display    = 'block';
    panel.classList.remove('panel-leaving', 'panel-entering');
    void panel.offsetWidth; // force reflow
    panel.classList.add('panel-entering');
    document.body.classList.add('panel-open');
    _setupSwipeToClose(panel);
}

function _setupSwipeToClose(panel) {
    if (!('ontouchstart' in window) || panel._swipeAttached) return;
    panel._swipeAttached = true;
    let startY = 0, startScroll = 0;
    panel.addEventListener('touchstart', e => {
        startY      = e.touches[0].clientY;
        startScroll = panel.scrollTop;
    }, { passive: true });
    panel.addEventListener('touchend', e => {
        if (e.changedTouches[0].clientY - startY >= 80 && startScroll === 0) closePanel();
    }, { passive: true });
}

function _hideSidePanels() {
    const p = document.getElementById('located-here-panel');
    if (p) { p.style.display = 'none'; p.style.visibility = 'hidden'; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getPanel() { return document.getElementById('myData'); }

function _loadingHTML() {
    return `<div style="padding:1.25rem 2.5rem">
        <p style="font-family:var(--font-ui);font-size:0.875rem;font-weight:600;
            color:var(--text-muted);line-height:1.6">
            Querying Wikidata &mdash; please wait&hellip;</p></div>`;
}

function _divider() {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
}

function _setUrlParam(name, value) {
    const url = new URL(window.location);
    url.searchParams.set(name, value);
    window.history.pushState({}, '', url);
}

function _deleteUrlParam(name) {
    const url = new URL(window.location);
    url.searchParams.delete(name);
    window.history.pushState({}, '', url);
}

function _claimQid(entity, pid) {
    return entity.claims?.[pid]?.[0]?.mainsnak?.datavalue?.value?.id ?? null;
}

function _claimQids(entity, pid) {
    return (entity.claims?.[pid] || [])
        .map(c => c.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
}

function _propValue(entity, pid) {
    const stmt = entity.claims?.[pid]?.[0]?.mainsnak?.datavalue;
    if (!stmt) return null;
    if (typeof stmt.value === 'string') return stmt.value;
    if (stmt.value?.text) return stmt.value.text;
    if (stmt.value?.id)   return stmt.value.id;
    return String(stmt.value);
}

function _conditionMet(entity, condition) {
    if (!condition) return true;
    return _propValue(entity, condition.property) === condition.value;
}