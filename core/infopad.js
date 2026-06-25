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
    log, logError,
    getLangForCountry, buildLangOrder, getBestLabel, getPreferredWikiLang,
    capitalize, expandUrl,
    setStatus, createSection, createResourceButton
} from './utils.js';

import {
    fetchEntity, fetchLabel,
    fetchWikipediaExtract, fetchWikipediaFull,
    fetchDepictedBy
} from './sparql.js';

// ── Module state ──────────────────────────────────────────────────────────────

let _config = null;
let _map    = null;

// Registered extension infopad-section hooks: [{ id, infoPadSection }]
const _sectionHooks = [];

// ── Init ──────────────────────────────────────────────────────────────────────

export function initInfopad(config, map) {
    _config = config;
    _map    = map;

    window.addEventListener('gheppio:entity-selected', e => openEntity(e.detail.qid));
    window.addEventListener('gheppio:map-click-empty', ()  => closePanel());
}

/**
 * Register an extension infopad-section hook.
 * Called by the extension loader after init().
 *
 * @param {string}   id
 * @param {function} fn  — (entity, qid, config, context) → HTMLElement|null
 */
export function registerSectionHook(id, fn) {
    _sectionHooks.push({ id, fn });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function openEntity(qid) {
    if (!qid) return;
    const panel = _getPanel();

    _hideLocatedHere();
    _showPanel(panel);
    panel.innerHTML = _loadingHTML();

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('q', qid);
    window.history.pushState({}, '', url);

    try {
        const entity   = await fetchEntity(qid);
        if (!entity) throw new Error('Entity not found: ' + qid);

        const langOrder  = _config.wikidata?.fetchLanguages ?? ['en'];
        const countryMap = _config.wikidata?.countryLanguageMap ?? {};
        const countryQid = entity.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
        const wikiLang   = getPreferredWikiLang(entity, countryMap, langOrder)
            ?? getLangForCountry(countryQid, countryMap);

        // QIDs for related entities we need labels for
        const p131Qid  = _claim(entity, 'P131');  // admin territory
        const p276Qid  = _claim(entity, 'P276');  // location (building)
        const p31Qid   = _claim(entity, 'P31');   // instance of
        const p195Qid  = _claim(entity, 'P195');  // collection
        const p361Qid  = _claim(entity, 'P361');  // part of (first, for backward compat)
        // All P361 values (part of) — can be multiple
        const p361Qids = (entity.claims?.P361 || [])
            .map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
        const hasP527  = !!(entity.claims?.P527?.length); // has parts
        // All P189 values (location of discovery) — can be multiple
        const p189Qids = (entity.claims?.P189 || [])
            .map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
        const p189Qid  = p189Qids[0] ?? null;  // first, for compat
        const invNum   = entity.claims?.P217?.[0]?.mainsnak?.datavalue?.value || '';
        const hasP625  = !!entity.claims?.P625;

        const wikiTitle = entity.sitelinks?.[`${wikiLang}wiki`]?.title ?? null;

        // Fetch labels + Wikipedia extract in parallel
        const langFull = buildLangOrder(wikiLang, langOrder);
        const [adminLabel, locationLabel, instanceLabel, collectionLabel, partOfLabel,
            discoveryLabel, ...rest] =
            await Promise.all([
                fetchLabel(p131Qid, langFull),
                (!hasP625 && p276Qid) ? fetchLabel(p276Qid, langFull) : Promise.resolve(''),
                p31Qid  ? fetchLabel(p31Qid, ['en'])    : Promise.resolve(''),
                p195Qid ? fetchLabel(p195Qid, langFull) : Promise.resolve(''),
                p361Qid ? fetchLabel(p361Qid, langFull) : Promise.resolve(''),
                p189Qid ? fetchLabel(p189Qid, langFull) : Promise.resolve(''),
                // All additional P189 values (skip index 0)
                ...p189Qids.slice(1).map(id => fetchLabel(id, langFull)),
                // All additional P361 values (skip index 0, already fetched as p361Qid)
                ...p361Qids.slice(1).map(id => fetchLabel(id, langFull)),
            ]);
        // Split rest into p189Labels and p361Labels
        const p189ExtraCount = Math.max(0, p189Qids.length - 1);
        const p189Labels = rest.slice(0, p189ExtraCount);
        const p361Labels = rest.slice(p189ExtraCount);

        // Build full discovery list: [{qid, label}]
        const discoveryList = p189Qids.map((id, i) => ({
            qid:   id,
            label: i === 0 ? discoveryLabel : (p189Labels[i - 1] || id)
        })).filter(d => d.label);

        // Build full part-of list: [{qid, label}]
        const partOfList = p361Qids.map((id, i) => ({
            qid:   id,
            label: i === 0 ? partOfLabel : (p361Labels[i - 1] || id)
        })).filter(p => p.label);

        let wikiExtract = null;
        if (wikiTitle && _config.infopad?.wikipediaSummary !== false) {
            wikiExtract = await fetchWikipediaExtract(wikiTitle, wikiLang);
        }

        // Depicted-by (reverse P180) — fire and don't block panel render
        const depictedByPromise = fetchDepictedBy(qid, _config.sparql.proxy);

        // Centre map
        _centerMap(entity);

        // Build panel
        panel.innerHTML = '';
        const context = { adminLabel, locationLabel, instanceLabel,
            collectionLabel, partOfLabel, partOfList, invNum,
            p131Qid, p276Qid, p31Qid, p195Qid, p361Qid,
            p189Qid, discoveryLabel, discoveryList,
            hasP625, hasP527, wikiLang, wikiTitle };

        _buildPanel(panel, entity, qid, wikiExtract, context, depictedByPromise);

        // Run extension hooks
        for (const hook of _sectionHooks) {
            try {
                const el = hook.fn(entity, qid, _config, { adminLabel, labelValue: getBestLabel(entity, countryMap, langOrder) });
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
    _hideLocatedHere();
    panel.classList.remove('panel-entering');
    panel.classList.add('panel-leaving');
    setTimeout(() => {
        panel.style.visibility = 'hidden';
        panel.style.display    = 'none';
        panel.classList.remove('panel-leaving');
    }, 250);
    document.body.classList.remove('panel-open');

    const url = new URL(window.location);
    url.searchParams.delete('q');
    window.history.pushState({}, '', url);

    window.dispatchEvent(new CustomEvent('gheppio:infopad-closed'));
}

// ── Panel shell ───────────────────────────────────────────────────────────────

function _buildPanel(panel, entity, qid, wikiExtract, ctx, depictedByPromise = null) {
    const { countryMap, langOrder } = _langConfig();

    // Thumbnail
    _addThumbnail(entity, panel);

    // Header
    _addHeader(entity, qid, panel, ctx);

    // Body
    const body = document.createElement('div');
    body.className = 'panel-body';
    panel.appendChild(body);

    // Wikipedia extract
    if (wikiExtract && ctx.wikiTitle) {
        _addWikipediaSection(wikiExtract, ctx.wikiTitle, ctx.wikiLang, body);
    }

    // "Parts & contents" button — always shown, runs all location queries + P527
    const locationQID = qid;  // always query the item itself
    const btn = document.createElement('button');
    btn.className   = 'location-btn';
    btn.textContent = 'Parts & contents    ▷';
    btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('gheppio:located-here', {
            detail: { locationQID, qid }
        }));
    });
    body.appendChild(btn);

    body.appendChild(_divider());

    // Config-driven sections
    _addTextsSection(entity, qid, ctx.wikiLang, body);
    _addImagesSection(entity, body, depictedByPromise);
    _addRecordsSection(entity, qid, body);

    // Footer
    const note = document.createElement('p');
    const year = new Date().getFullYear();
    const tpl  = _config.institution?.footerNote ?? '{year}';
    note.innerHTML = `<span class="notabene">${tpl.replace('{year}', year)}</span>`;
    panel.appendChild(note);
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

function _addThumbnail(entity, container) {
    const claim = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!claim) return;
    const thumb = document.createElement('div');
    thumb.id = 'gh-thumb';
    thumb.innerHTML = `<img alt="[reference image]"
        src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(claim)}?width=160"/>`;
    container.appendChild(thumb);
}

// ── Header ────────────────────────────────────────────────────────────────────

function _addHeader(entity, qid, container, ctx) {
    const { countryMap, langOrder } = _langConfig();
    const label = getBestLabel(entity, countryMap, langOrder);
    const cap   = s => s ? capitalize(s) : '';

    const qidLine = `<br/><small><a class="qid-link"
        href="https://www.wikidata.org/wiki/${qid}" target="_blank">${qid}</a></small>`;

    // isArtwork: has a collection (P195) OR is located-in a building without its own coordinates.
    // Buildings/places with P361 (part of) but their own P625 are NOT artworks.
    const isArtwork = !!(ctx.collectionLabel || ctx.locationLabel);
    const h1 = document.createElement('h1');

    if (isArtwork) {
        const typeParts = [cap(ctx.instanceLabel), ctx.invNum ? `Inv.\u00a0${ctx.invNum}` : ''].filter(Boolean);
        const typeLine  = typeParts.length ? `<br/><small>${typeParts.join(', ')}</small>` : '';
        const bldLabel  = ctx.collectionLabel || ctx.locationLabel || ctx.partOfLabel;
        const bldQid    = ctx.p195Qid         || ctx.p276Qid       || ctx.p361Qid;
        const bldBtn    = bldLabel
            ? `<a class="location-link location-btn" href="?q=${bldQid}" data-qid="${bldQid}">${bldLabel}</a><br/>`
            : '';
        const discoveryBtns = (ctx.discoveryList?.length)
            ? '<br/><small class="discovery-prefix">From:</small><br/>' +
            ctx.discoveryList.map(d =>
                `<a class="location-link location-btn" href="?q=${d.qid}" data-qid="${d.qid}">${d.label}</a>`
            ).join('<br/>')
            : '';
        h1.innerHTML = `${bldBtn}${label}${typeLine}${discoveryBtns}${qidLine}`;
    } else {
        const locStr  = ctx.adminLabel;
        const typeLine = ctx.instanceLabel
            ? (locStr
                ? `<br/><small>${cap(ctx.instanceLabel)} in ${locStr}</small>`
                : `<br/><small>${cap(ctx.instanceLabel)}</small>`)
            : (locStr ? `<br/><small>${locStr}</small>` : '');
        const invPart = ctx.invNum
            ? `<br/><small class="inventory-num">Inv.\u00a0${ctx.invNum}</small>`
            : '';
        // All P361 "part of" values as navigation buttons — above the title
        const partOfBtns = (ctx.partOfList || [])
            .map(p => `<a class="location-link location-btn" href="?q=${p.qid}" data-qid="${p.qid}">${p.label}</a>`)
            .join(' ');
        const partOfLine = partOfBtns ? `${partOfBtns}<br/>` : '';
        h1.innerHTML = `${partOfLine}${label}${typeLine}${invPart}${qidLine}`;
    }

    // SPA navigation for building links
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
    const div   = document.createElement('div');
    div.className = 'wikipedia-extract';

    const short = extract.length > 300 ? extract.substring(0, 300) + '\u2026' : extract;

    const btn  = document.createElement('button');
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
                btn.innerHTML = '<span>&#x25B3;&nbsp;&nbsp;Summary</span>';
                btn.disabled  = false;
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
            btn.innerHTML = '<span>&#x25BD;&nbsp;&nbsp;Summary</span>';
            para.innerHTML = short;
            fullLoaded = false;
        }
    });

    container.appendChild(div);
}

// ── Config-driven sections ────────────────────────────────────────────────────

function _addTextsSection(entity, qid, wikiLang, container) {
    if (_config.infopad?.sections?.texts?.enabled === false) return;

    const section = createSection('Texts');
    const sources = _config.infopad?.sections?.texts?.sources ?? [];

    for (const src of sources) {
        const val = _propValue(entity, src.property);
        if (!val) continue;
        if (!_conditionMet(entity, src.condition)) continue;
        createResourceButton(section, src.label, expandUrl(src.url, val, qid), src.own ?? false);
    }

    // Wikipedia link (always shown when sitelink exists, not config-listed)
    if (_config.infopad?.wikipediaSummary !== false) {
        const title = entity.sitelinks?.[`${wikiLang}wiki`]?.title;
        if (title) {
            createResourceButton(
                section, 'Wikipedia',
                `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(title)}?useskin=Vector`
            );
        }
    }

    if (section.querySelector('button')) container.appendChild(section);
}

function _addImagesSection(entity, container, depictedByPromise = null) {
    if (_config.infopad?.sections?.images?.enabled === false) return;

    const section  = createSection('Images');
    const imgConf  = _config.infopad?.sections?.images ?? {};
    const sources  = imgConf.sources ?? [];

    // Wikimedia Commons category (P373)
    if (imgConf.wikimediaCommons !== false) {
        const cat = _propValue(entity, 'P373');
        if (cat) createResourceButton(
            section, 'Wikimedia',
            `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(cat)}`
        );
    }

    // Config-declared image sources
    for (const src of sources) {
        const val = _propValue(entity, src.property);
        if (!val) continue;
        if (!_conditionMet(entity, src.condition)) continue;
        createResourceButton(section, src.label, expandUrl(src.url, val), src.own ?? false);
    }

    container.appendChild(section);

    // Depicted by (async — appended when ready)
    if (depictedByPromise) {
        depictedByPromise.then(rows => {
            if (!rows.length) return;
            const sub = createSection('Depicted by');

            // 2-column grid
            const grid = document.createElement('div');
            grid.className = 'db-grid';
            sub.appendChild(grid);

            rows.forEach(row => {
                const qid   = (row.item?.value || '').replace('http://www.wikidata.org/entity/', '');
                const label = row.itemLabel?.value || qid;
                const imgUrl = row.image?.value
                    ? row.image.value.replace('http://', 'https://')
                    : null;
                const thumb = imgUrl ? imgUrl + '?width=60' : null;
                const large = imgUrl ? imgUrl + '?width=600' : null;

                const cell = document.createElement('div');
                cell.className = 'db-row';

                // Left: thumbnail with lightbox trigger
                const thumbDiv = document.createElement('div');
                thumbDiv.className = 'db-thumb';
                if (thumb) {
                    const img = document.createElement('img');
                    img.src     = thumb;
                    img.loading = 'lazy';
                    img.alt     = '';
                    img.addEventListener('click', () => _showLightbox(large, label));
                    img.addEventListener('error', function() { this.style.visibility = 'hidden'; });
                    thumbDiv.appendChild(img);
                }
                cell.appendChild(thumbDiv);

                // Right: label as link to entity
                const labelDiv = document.createElement('div');
                labelDiv.className = 'db-label';
                const a = document.createElement('a');
                a.href       = `?q=${qid}`;
                a.dataset.qid = qid;
                a.textContent = label;
                a.addEventListener('click', e => {
                    e.preventDefault();
                    import('./infopad.js').then(m => m.openEntity(qid));
                });
                labelDiv.appendChild(a);
                cell.appendChild(labelDiv);

                grid.appendChild(cell);
            });

            container.appendChild(sub);
        });
    }
}


// ── Lightbox ──────────────────────────────────────────────────────────────────

let _lbEl = null;

function _showLightbox(src, caption) {
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
        _lbEl.querySelector('#gh-lb-close').addEventListener('click', _closeLightbox);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeLightbox(); });
    }
    _lbEl.querySelector('#gh-lb-img').src         = src;
    _lbEl.querySelector('#gh-lb-caption').textContent = caption;
    _lbEl.style.display = 'flex';
}

function _closeLightbox() {
    if (_lbEl) {
        _lbEl.style.display = 'none';
        _lbEl.querySelector('#gh-lb-img').src = '';
    }
}

function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _addRecordsSection(entity, qid, container) {
    if (_config.infopad?.sections?.records?.enabled === false) return;

    const section = createSection('Records');
    const sources = _config.infopad?.sections?.records?.sources ?? [];

    for (const src of sources) {
        const val = _propValue(entity, src.property);
        if (!val) continue;
        if (!_conditionMet(entity, src.condition)) continue;
        createResourceButton(section, src.label, expandUrl(src.url, val, qid), src.own ?? false);
    }

    if (section.querySelector('button')) container.appendChild(section);
}

// ── Map centering ─────────────────────────────────────────────────────────────

function _centerMap(entity) {
    const lat = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value?.latitude;
    const lon = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value?.longitude;
    if (lat && lon) {
        _map.flyTo({
            center: [lon, lat],
            zoom:   Math.max(_map.getZoom(), 16),
            speed:  1.4, curve: 1.5
        });
    }
}

// ── Panel show / hide ─────────────────────────────────────────────────────────

function _showPanel(panel) {
    panel.style.visibility = 'visible';
    panel.style.display    = 'block';
    panel.classList.remove('panel-leaving', 'panel-entering');
    void panel.offsetWidth; // force reflow to restart animation
    panel.classList.add('panel-entering');
    document.body.classList.add('panel-open');
    _setupSwipeToClose(panel);
}

function _setupSwipeToClose(panel) {
    if (!('ontouchstart' in window)) return;
    if (panel._swipeAttached) return;
    panel._swipeAttached = true;
    let startY = 0, startScroll = 0;
    panel.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
        startScroll = panel.scrollTop;
    }, { passive: true });
    panel.addEventListener('touchend', e => {
        if (e.changedTouches[0].clientY - startY >= 80 && startScroll === 0) closePanel();
    }, { passive: true });
}

function _hideLocatedHere() {
    const p = document.getElementById('located-here-panel');
    if (p) { p.style.display = 'none'; p.style.visibility = 'hidden'; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getPanel() {
    return document.getElementById('myData');
}

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

function _langConfig() {
    return {
        countryMap: _config.wikidata?.countryLanguageMap ?? {},
        langOrder:  _config.wikidata?.fetchLanguages     ?? ['en']
    };
}

/**
 * Get the string value of the first statement for a property.
 * Handles string, monolingualtext, and entity-id data types.
 */
function _propValue(entity, pid) {
    const stmt = entity.claims?.[pid]?.[0]?.mainsnak?.datavalue;
    if (!stmt) return null;
    if (typeof stmt.value === 'string') return stmt.value;
    if (stmt.value?.text)              return stmt.value.text;   // monolingualtext
    if (stmt.value?.id)                return stmt.value.id;     // entity-id (QID)
    return String(stmt.value);
}

/**
 * Get the QID value of the first statement for a property.
 */
function _claim(entity, pid) {
    return entity.claims?.[pid]?.[0]?.mainsnak?.datavalue?.value?.id ?? null;
}

/**
 * Evaluate an optional source condition.
 * { property: 'P17', value: 'Q38' } → only show for Italian items.
 */
function _conditionMet(entity, condition) {
    if (!condition) return true;
    return _propValue(entity, condition.property) === condition.value;
}