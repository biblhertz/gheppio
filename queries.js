// ============================================================================
// DEMO QUERIES — Dura Europos excavation site (Q193930)
// These are the OVERLAY_QUERIES for the gheppio demo instance.
// ============================================================================

var OVERLAY_QUERIES = [

    { group: 'Dura Europos' },

    {
        id: 'dura-finds',
        label: 'Excavation finds (artworks)',
        sparql: () => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P276 wd:Q464266 .
  ?item wdt:P31 ?type .
  ?item wdt:P31 wd:Q10855061 .
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de". }
}
LIMIT 500`
    },

    {
        id: 'dura-described-in',
        label: 'Items with Pleiades ID',
        sparql: () => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P276 wd:Q464266 .
  ?item wdt:P1584 ?pleiades .
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de". }
}
LIMIT 200`
    },

    { group: 'Dura Europos — findings by type' },

    {
        id: 'dura-type',
        label: 'Findings by type…',
        param: {
            type: 'order-select',
            options: [
                // ── Sacred ───────────────────────────────────────────────────
                { label: 'Temple / sanctuary',    value: 'Q44539|Q1444561|Q2393457|Q1151014|Q123587939' },
                { label: 'Church / domus ecclesiae', value: 'Q16970|Q1094192|Q24398318|Q210077' },
                { label: 'Synagogue',             value: 'Q34627|Q96377522' },
                { label: 'Tomb',                  value: 'Q381885' },
                // ── Military ──────────────────────────────────────────────────
                { label: 'Barracks',              value: 'Q131263' },
                { label: 'Fortification / wall',  value: 'Q57821|Q42948|Q57346|Q88291' },
                { label: 'Tower',                 value: 'Q20034791' },
                { label: 'Gate / city gate',      value: 'Q53060|Q82117' },
                { label: 'Siege works',           value: 'Q3929926|Q21573414' },
                { label: 'Principia / praetorium',value: 'Q2110440|Q1309666' },
                // ── Civic ──────────────────────────────────────────────────
                { label: 'Agora / market / square', value: 'Q187909|Q132510|Q174782' },
                { label: 'Bath / thermae',        value: 'Q785952|Q3633486|Q6581615|Q105723968' },
                { label: 'Theatre / odeon',       value: 'Q19757|Q7362268|Q1143046|Q54831' },
                { label: 'Arch',                  value: 'Q12277|Q143912' },
                // ── Residential ──────────────────────────────────────────────
                { label: 'Insula / city block',   value: 'Q28228887|Q1348006' },
                { label: 'House / domus / palace', value: 'Q3947|Q782970|Q16560|Q53536964' },
                { label: 'Bakery',                value: 'Q274393' },
                // ── Infrastructure ───────────────────────────────────────────
                { label: 'Street',                value: 'Q79007' },
                { label: 'Building (generic)',    value: 'Q41176|Q14752696|Q19860854' },
                // ── Inscriptions & monuments ─────────────────────────────────
                { label: 'Inscription',           value: 'Q1640824|Q1365135|Q90766967|Q125323109' },
                { label: 'Monument / pedestal',   value: 'Q4989906|Q12014132|Q106959886' },
            ]
        },
        sparql: (qids) => {
            const filter = qids.split('|').map(q => `wd:${q}`).join(', ');
            return `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P276 wd:Q464266 .
  ?item wdt:P31 ?type .
  FILTER(?type IN (${filter}))
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de". }
}
LIMIT 300`;
        }
    },

    { group: 'Dura Europos — by excavation season' },

    {
        id: 'dura-season',
        label: 'Items by excavation season…',
        param: {
            type: 'order-select',
            options: [
                { label: 'Cumont 1922',     value: 'Q121331567' },
                { label: 'Cumont 1923',     value: 'Q121331906' },
                { label: '1924 season',     value: 'Q136448244' },
                { label: 'Yale-French S1',  value: 'Q117156400' },
                { label: 'Yale-French S2',  value: 'Q117156391' },
                { label: 'Yale-French S3',  value: 'Q117156387' },
                { label: 'Yale-French S4',  value: 'Q121140100' },
                { label: 'Yale-French S5',  value: 'Q121139897' },
                { label: 'Yale-French S6',  value: 'Q118314216' },
                { label: 'Yale-French S7',  value: 'Q118314228' },
                { label: 'Yale-French S8',  value: 'Q121140207' },
                { label: 'Yale-French S9',  value: 'Q121140334' },
                { label: 'Yale-French S10', value: 'Q121140488' },
            ]
        },
        sparql: (qid) => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P793 wd:${qid} .
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de". }
}
LIMIT 500`
    },

    {
        id: 'dura-siege',
        label: 'Items associated with the Siege',
        sparql: () => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P793 wd:Q1125035 .
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de". }
}
LIMIT 200`
    },

    {
        id: 'dura-earthquake',
        label: 'Items affected by Earthquake 160 CE',
        sparql: () => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P793 wd:Q121294771 .
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de". }
}
LIMIT 200`
    },

    { group: 'Dura Europos — by period' },

    {
        id: 'dura-period',
        label: 'Items by time period…',
        param: {
            type: 'order-select',
            options: [
                { label: 'Roman Period',      value: 'Q123437479' },
                { label: 'Arsacid Period',     value: 'Q123438122' },
                { label: 'Hellenistic Period', value: 'Q124355469' },
                { label: '2nd millennium BC',  value: 'Q26257'     },
                { label: '3rd millennium BC',  value: 'Q29945'     },
            ]
        },
        sparql: (qid) => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P2348 wd:${qid} .
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de". }
}
LIMIT 500`
    },

    { group: 'Syria (wider)' },

    {
        id: 'syria-world-heritage',
        label: 'UNESCO World Heritage Sites',
        sparql: () => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P17 wd:Q858 .
  ?item wdt:P1435 wd:Q9259 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,ar". }
}
LIMIT 100`
    }

];