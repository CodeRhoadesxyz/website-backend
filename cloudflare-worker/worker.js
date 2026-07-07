/**
 * Heart & Soul Parrot Rescue — Cloudflare Worker proxy
 * -----------------------------------------------------
 * Forwards requests under /admin/* and /api/* on this domain to the Node
 * backend hosted on Railway, so the browser only ever sees
 * heartandsoulparrotrescue.com — the Railway URL is never exposed.
 *
 * This Worker is only invoked for the routes you configure in the Cloudflare
 * dashboard (heartandsoulparrotrescue.com/admin* and .../api*) — every other
 * request (your homepage, adopt page, etc.) continues straight to your
 * existing cPanel host untouched, without ever touching this code.
 *
 * SETUP: see README.md in this folder for the full walkthrough. The only
 * thing you need to edit below is UPSTREAM.
 */

const UPSTREAM = 'https://your-app.up.railway.app'; // <-- set this to your real Railway URL, no trailing slash

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upstreamUrl = UPSTREAM + url.pathname + url.search;

    // Read the body fully into memory rather than passing request.body through
    // as a stream. These are small JSON payloads, so there's no downside — and
    // streaming a body through fetch() requires a `duplex: "half"` option that
    // was missing here, which silently broke every PATCH/POST save.
    let body;
    if (!['GET', 'HEAD'].includes(request.method)) {
      body = await request.arrayBuffer();
    }

    const init = {
      method: request.method,
      headers: request.headers,
      body,
      redirect: 'manual',
    };

    let response;
    try {
      response = await fetch(upstreamUrl, init);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Could not reach the rescue backend. Please try again shortly.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Pass the upstream response straight through — status, body, and all
    // headers (including Set-Cookie, which the Workers runtime correctly
    // preserves as multiple values) are relayed as-is.
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
};
