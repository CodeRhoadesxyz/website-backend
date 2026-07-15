<?php
/**
 * Heart & Soul Parrot Rescue — reverse proxy
 * ------------------------------------------
 * Forwards every request under /admin/* and /api/* on this domain to the
 * Node backend hosted on Railway, so the browser only ever sees
 * heartandsoulparrotrescue.com — the Railway URL is never exposed.
 *
 * SETUP:
 * 1. Edit UPSTREAM_BASE below to your actual Railway URL (no trailing slash).
 * 2. Upload this file to your site's document root (same folder as your
 *    homepage's index.html — usually /public_html).
 * 3. Add the rewrite rules from htaccess-snippet.txt to your existing
 *    .htaccess in that same folder (don't replace your whole .htaccess —
 *    just add these lines).
 * 4. Visit https://heartandsoulparrotrescue.com/admin/login.html to confirm.
 *
 * Requires the PHP cURL extension, which is enabled by default on nearly
 * every cPanel host. If you get a 500 error, ask your host to confirm
 * php-curl is enabled for your account.
 */

// ---- CONFIG ----
define('UPSTREAM_BASE', 'https://your-app.up.railway.app'); // <-- set this to your real Railway URL
// ----------------

$requestUri = $_SERVER['REQUEST_URI'];         // e.g. /admin/app.js or /api/auth/login?x=1
$method     = $_SERVER['REQUEST_METHOD'];       // GET, POST, PATCH, DELETE, etc.
$upstreamUrl = UPSTREAM_BASE . $requestUri;

$ch = curl_init($upstreamUrl);

// Forward the request body for methods that have one.
$body = file_get_contents('php://input');
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE']) && $body !== false && $body !== '') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

// Forward the headers that actually matter (cookies for admin auth, content-type for JSON bodies).
$forwardHeaders = [];
if (isset($_SERVER['CONTENT_TYPE'])) {
    $forwardHeaders[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
}
if (isset($_SERVER['HTTP_COOKIE'])) {
    $forwardHeaders[] = 'Cookie: ' . $_SERVER['HTTP_COOKIE'];
}
if (isset($_SERVER['HTTP_ACCEPT'])) {
    $forwardHeaders[] = 'Accept: ' . $_SERVER['HTTP_ACCEPT'];
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);

// Capture response headers (status, content-type, and any Set-Cookie lines) as they arrive.
$responseHeaders = [];
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($curl, $headerLine) use (&$responseHeaders) {
    $trimmed = trim($headerLine);
    if ($trimmed !== '' && strpos($trimmed, ':') !== false) {
        $responseHeaders[] = $trimmed;
    }
    return strlen($headerLine);
});

$responseBody = curl_exec($ch);

if ($responseBody === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Could not reach the rescue backend. Please try again shortly.']);
    curl_close($ch);
    exit;
}

$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($statusCode ?: 502);

// Relay the headers that matter to the browser. Set-Cookie needs replace=false
// so multiple cookies (rare, but possible) don't overwrite each other.
foreach ($responseHeaders as $line) {
    if (stripos($line, 'Transfer-Encoding:') === 0) continue; // let PHP/Apache manage this
    if (stripos($line, 'Connection:') === 0) continue;
    if (stripos($line, 'Set-Cookie:') === 0) {
        header($line, false);
    } else {
        header($line);
    }
}

echo $responseBody;
