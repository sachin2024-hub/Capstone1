// Starts backend + public Cloudflare tunnel so ANY phone can log in
// (mobile data or any WiFi). Usage: npm run start:all

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getLocalIp, updateMobileApi, writeConnectionInfo } = require('./update-mobile-api');
const { ensureCloudflared } = require('./ensure-cloudflared');
const { extractTrycloudflareUrl, isTunnelEdgeConnected, quickTunnelArgs } = require('./trycloudflare-url');

const PORT = 5000;
const BACKEND_DIR = path.join(__dirname, '..');

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

function waitForBackend(maxAttempts = 40) {
  return new Promise((resolve) => {
    let attempt = 0;

    const tryOnce = () => {
      attempt += 1;
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else if (attempt < maxAttempts) setTimeout(tryOnce, 1000);
        else resolve(false);
      });
      req.on('error', () => {
        if (attempt < maxAttempts) setTimeout(tryOnce, 1000);
        else resolve(false);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempt < maxAttempts) setTimeout(tryOnce, 1000);
        else resolve(false);
      });
    };

    tryOnce();
  });
}

function launchBackend() {
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    windowsHide: true,
  });

  proc.on('close', (code) => {
    log(`Backend stopped (exit ${code ?? 'unknown'}).`);
    log('To start again: npm run start:all');
    process.exit(code ?? 1);
  });

  return proc;
}

function startNamedTunnel(binPath, token, publicUrl) {
  log('Starting named Cloudflare tunnel (fixed URL)...');

  if (publicUrl) {
    const clean = publicUrl.replace(/\/$/, '');
    const ip = getLocalIp() || '192.168.1.11';
    writeConnectionInfo({ localIp: ip, tunnelUrl: clean });
    updateMobileApi({ tunnelUrl: clean, connectionMode: 'tunnel' });
    log('');
    log('==============================================');
    log(`Fixed public URL: ${clean}`);
    log('This URL stays the same after laptop restart.');
    log('Laptop must still be ON with npm run start:all.');
    log('==============================================');
    log('');
  }

  const child = spawn(binPath, ['tunnel', 'run', '--token', token, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (data) => process.stdout.write(data));
  child.stderr.on('data', (data) => process.stdout.write(data));
  child.on('error', (err) => log(`Tunnel error: ${err.message}`));
  child.on('close', (code) => {
    log(`Named tunnel stopped (exit ${code ?? 'unknown'}). Restarting in 5s...`);
    setTimeout(() => startNamedTunnel(binPath, token, publicUrl), 5000);
  });
  return child;
}

function startTunnel(binPath) {
  log(`Starting public tunnel with ${path.basename(binPath)}...`);

  const child = spawn(binPath, quickTunnelArgs(PORT), {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let updated = false;
  let publicUrl = null;
  let edgeReady = false;

  function onData(data) {
    const text = data.toString();
    process.stdout.write(text);

    publicUrl = publicUrl || extractTrycloudflareUrl(text);
    edgeReady = edgeReady || isTunnelEdgeConnected(text);
    if (publicUrl && edgeReady && !updated) {
      updated = true;
      const ip = getLocalIp() || '192.168.1.11';
      writeConnectionInfo({ localIp: ip, tunnelUrl: publicUrl });
      updateMobileApi({ tunnelUrl: publicUrl, connectionMode: 'tunnel' });
      log('');
      log('==============================================');
      log(`Public URL ready: ${publicUrl}`);
      log('Any phone can log in now — WiFi or mobile data.');
      log('If Expo reloads once, that is normal. Then tap Log In.');
      log('==============================================');
      log('');
    }
  }

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (err) => {
    log(`Tunnel error: ${err.message}`);
  });

  child.on('close', (code) => {
    log(`Tunnel stopped (exit ${code ?? 'unknown'}). Restarting in 5s...`);
    setTimeout(() => startTunnel(binPath), 5000);
  });

  return child;
}

async function main() {
  const localIp = getLocalIp();
  const ip = localIp || '192.168.1.11';
  updateMobileApi({ localIp: ip, connectionMode: 'tunnel' });
  writeConnectionInfo({ localIp: ip });

  log('RapidRescue — starting backend + public tunnel');
  log('Goal: any cellphone can log in (not same-WiFi only).');
  if (localIp) log(`Local IP detected: ${localIp}`);

  launchBackend();

  const ready = await waitForBackend();
  if (!ready) {
    log('Backend did not start in time. Check port 5000.');
    process.exit(1);
  }

  log('Backend ready on http://localhost:5000');

  try {
    log('Preparing Cloudflare tunnel (first run may download ~20MB)...');
    const binPath = await ensureCloudflared();
    const namedToken = process.env.CLOUDFLARE_TUNNEL_TOKEN;
    const publicUrl = process.env.PUBLIC_URL;
    if (namedToken) {
      startNamedTunnel(binPath, namedToken, publicUrl);
    } else {
      startTunnel(binPath);
    }
  } catch (err) {
    log(`Could not start public tunnel: ${err.message}`);
      log('Same-WiFi login still works at http://' + ip + ':5000');
      log('Fix internet / try again so phones on mobile data or other WiFi can connect.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
