'use strict';

// Cloudflare error logs mention https://api.trycloudflare.com/tunnel — that is NOT a public app URL.
const RESERVED = new Set(['api', 'www', 'dash', 'login', 'developers']);

function extractTrycloudflareUrl(text) {
  const re = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com(?:\/[^\s"'<>]*)?/gi;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    const sub = match[1];
    const rest = match[0].slice(`https://${sub}.trycloudflare.com`.length);
    if (RESERVED.has(sub)) continue;
    if (rest.startsWith('/tunnel')) continue;
    return `https://${sub}.trycloudflare.com`;
  }
  return null;
}

function isTunnelEdgeConnected(text) {
  return /Connection registered/i.test(text) || /Registered tunnel connection/i.test(text);
}

// QUIC/UDP is often blocked on home Wi-Fi. HTTP/2 over TCP stays up.
function quickTunnelArgs(port) {
  return [
    'tunnel',
    '--url',
    `http://127.0.0.1:${port}`,
    '--no-autoupdate',
    '--edge-ip-version',
    '4',
    '--protocol',
    'http2',
  ];
}

module.exports = { extractTrycloudflareUrl, isTunnelEdgeConnected, quickTunnelArgs };
