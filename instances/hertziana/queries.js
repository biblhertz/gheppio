// ============================================================================
// QUERIES.JS — Bibliotheca Hertziana overlay queries
// Place this file in your instance directory and symlink/copy to root.
// ============================================================================

var OVERLAY_QUERIES = [

    { group: 'Artist search' },

    {
        id: 'artist-works',
        label: 'Works by artist / architect…',
        param: { placeholder: 'Type a name…', type: 'artist-search' },
        sparql: (qid) => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  { ?item wdt:P170 wd:${qid} . } UNION { ?item wdt:P84 wd:${qid} . }
  OPTIONAL { ?item wdt:P625 ?directCoord . }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord . }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 300`
    },

    { group: 'Rome' },

    {
        id: 'national-churches-rome',
        label: 'National Churches',
        sparql: () => `
#SLOW
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P625 ?coord .
  ?item wdt:P131 wd:Q220 .
  ?item wdt:P31 wd:Q1649443 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 300`
    },

    { group: 'Naples' },

    {
        id: 'family-churches-naples',
        label: 'Family Churches',
        sparql: () => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P31 wd:Q139671796 .
  ?item wdt:P131 wd:Q2634 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 300`
    },

    { group: 'L\'Aquila' },

    {
        id: 'laquila-described-in-leosini',
        label: 'Items described by Leosini',
        sparql: () => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P1343 wd:Q123420974.
  OPTIONAL { ?item wdt:P625 ?directCoord. }
  OPTIONAL { ?item wdt:P276 ?loc. ?loc wdt:P625 ?locCoord. }
  BIND(COALESCE(?directCoord, ?locCoord) AS ?coord)
  FILTER(BOUND(?coord))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 100`
    },

    { group: 'Italy' },

    {
        id: 'italy-hermitages',
        label: 'Hermitages',
        sparql: () => `
SELECT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P31 wd:Q513550 .
  ?item wdt:P17 wd:Q38 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 500`
    },

    {
        id: 'italy-monastic-granges',
        label: 'Monastic granges',
        sparql: () => `
SELECT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P31 wd:Q1098590 .
  ?item wdt:P17 wd:Q38 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 500`
    },

    {
        id: 'italy-hutzel-photos',
        label: 'Photos by Max Hutzel',
        sparql: () => `
SELECT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P13996 ?value;
        wdt:P17 wd:Q38;
        wdt:P625 ?coord.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 2000`
    },

    {
        id: 'italy-religious-order',
        label: 'Buildings by religious orders…',
        param: {
            type: 'order-select',
            options: [
                { label: 'Benedictines',  value: 'Q131132' },
                { label: 'Cistercians',   value: 'Q166861' },
                { label: 'Camaldolese',   value: 'Q591832' },
                { label: 'Vallombrosans', value: 'Q1999843' },
                { label: 'Celestines',    value: 'Q1093546' },
                { label: 'Franciscans',   value: 'Q913972'  },
                { label: 'Dominicans',    value: 'Q131479'  },
                { label: 'Augustinians',  value: 'Q29075'   },
                { label: 'Jesuits',       value: 'Q36380'   },
                { label: 'Theatines',     value: 'Q1414924' },
                { label: 'Barnabites',    value: 'Q620456'  },
                { label: 'Salesians',     value: 'Q223659'  },
            ]
        },
        sparql: (qid) => `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P17 wd:Q38 .
  ?item wdt:P625 ?coord .
  {
    { ?item wdt:P611 wd:${qid} . }
    UNION
    { ?item wdt:P88  wd:${qid} . }
    UNION
    { ?item wdt:P127 wd:${qid} . }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}
LIMIT 500`
    }

];
