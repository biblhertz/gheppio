// ============================================================================
// HERTZIANA EXTENSION: iccd
// Appends ICCD Foto and ICG Grafica buttons to the Images section of the
// infopad. Italy-only — silently skips all non-Italian items.
//
// Type: infopad-section
// Config dependency: none (uses core entity data only)
// ============================================================================

// Rome and Vatican QIDs (must match core LOCATION_IDS or be self-contained)
const ROME_VATICAN  = new Set(['Q220', 'Q237', 'Q3940419']);
const MAJOR_CITIES  = new Set([
    'Q2634', 'Q656', 'Q3476', 'Q391980', 'Q13666', 'Q3519', 'Q2656',
    'Q2044', 'Q2028', 'Q1903', 'Q1891', 'Q1449', 'Q641', 'Q617',
    'Q495', 'Q490'
]);

export default {

    id: 'iccd',
    label: 'ICCD / ICG',
    type: 'infopad-section',

    init() {},
    activate() {},
    deactivate() {},

    /**
     * @param {object} entity   — raw Wikidata entity (entity.claims.*)
     * @param {string} qid
     * @param {object} config
     * @param {object} context  — { adminLabel, labelValue }
     * @returns {HTMLElement|null}
     */
    infoPadSection(entity, qid, config, context = {}) {
        const countryId  = entity?.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
        if (countryId !== 'Q38') return null;   // Italy only

        const locationId = entity?.claims?.P131?.[0]?.mainsnak?.datavalue?.value?.id;
        const { adminLabel = '', labelValue = '' } = context;

        const section = document.createElement('div');
        section.className = 'panel-section iccd-section';

        const heading = document.createElement('p');
        heading.innerHTML = '<span class="subhead">Photo archives</span>';
        section.appendChild(heading);

        // ── ICCD Foto ────────────────────────────────────────────────────────
        let iccdUrl = null;
        if (ROME_VATICAN.has(locationId)) {
            iccdUrl = `https://fotografia.cultura.gov.it/fotografie#h.lrcc=roma&k.text=${encodeURI(labelValue)}`;
        } else if (MAJOR_CITIES.has(locationId)) {
            iccdUrl = `https://fotografia.cultura.gov.it/fotografie#h.lrcc=${encodeURI(adminLabel)}&k.text=${encodeURI(labelValue)}`;
        } else if (adminLabel) {
            iccdUrl = `https://fotografia.cultura.gov.it/fotografie#h.lrcc=${encodeURI(adminLabel)}`;
        }
        if (iccdUrl) _addBtn(section, 'ICCD', iccdUrl);

        // ── ICG Grafica (Rome / Vatican only) ────────────────────────────────
        if (ROME_VATICAN.has(locationId) && labelValue) {
            const q = encodeURIComponent(labelValue).replace(/%20/g, '+').replace(/%27/g, '+');
            _addBtn(section, 'ICG', `https://www.calcografica.it/cerca.php?q=${q}`);
        }

        return section.querySelector('button') ? section : null;
    }
};

function _addBtn(container, label, url) {
    const btn = document.createElement('button');
    btn.innerHTML = `<a title="${label}" href="${url}" target="_blank"><span>${label}</span></a>`;
    container.appendChild(btn);
}
