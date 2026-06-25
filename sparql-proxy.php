<?php
// sparql-proxy.php — Gheppio SPARQL proxy with file cache
// Forwards queries to Wikidata (or another endpoint) and caches responses.
//
// Cache directory: set $cacheDir below, or use the SPARQL_CACHE_DIR env var.
// The web server user needs write access to this directory.

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/sparql-results+json; charset=utf-8');

$query = $_GET['query'] ?? '';
if (!$query) { http_response_code(400); echo '{"error":"no query"}'; exit; }

// ── Config ────────────────────────────────────────────────────────────────────

$endpoint = 'https://query.wikidata.org/sparql';
$cacheDir = getenv('SPARQL_CACHE_DIR') ?: sys_get_temp_dir() . '/gheppio-sparql/';
$cacheTTL = 86400; // seconds
$userAgent = 'Gheppio/1.0 (https://github.com/kewerner/gheppio) PHP-curl';

// ── File cache ────────────────────────────────────────────────────────────────

$cacheFile = rtrim($cacheDir, '/') . '/' . md5($query) . '.json';

if (!is_dir($cacheDir)) mkdir($cacheDir, 0700, true);
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
    echo file_get_contents($cacheFile); exit;
}

// ── Upstream request ──────────────────────────────────────────────────────────

$url = $endpoint . '?format=json&query=' . urlencode($query);
set_time_limit(90);

if (function_exists('curl_init')) {
    // ── curl path ─────────────────────────────────────────────────────────────
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_USERAGENT      => $userAgent,
        CURLOPT_HTTPHEADER     => ['Accept: application/sparql-results+json'],
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $result   = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($result === false || $curlErr) {
        http_response_code(502);
        echo json_encode(['error' => 'curl error: ' . $curlErr]);
        exit;
    }
    if ($httpCode !== 200) {
        http_response_code($httpCode);
        echo json_encode(['error' => 'upstream HTTP ' . $httpCode]);
        exit;
    }
} else {
    // ── file_get_contents fallback (no curl) ──────────────────────────────────
    $ctx = stream_context_create(['http' => [
        'method'  => 'GET',
        'header'  => "Accept: application/sparql-results+json\r\nUser-Agent: $userAgent\r\n",
        'timeout' => 60,
    ]]);
    $result = @file_get_contents($url, false, $ctx);
    if ($result === false) {
        http_response_code(502);
        echo json_encode(['error' => 'file_get_contents failed — enable curl or allow_url_fopen']);
        exit;
    }
}

// ── Cache and return ──────────────────────────────────────────────────────────

file_put_contents($cacheFile, $result);
echo $result;
