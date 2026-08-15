// Starts backend + public Cloudflare tunnel so ANY phone can log in
// (mobile data or any WiFi). Usage: npm run start:all

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { getLocalIp, updateMobileApi, writeConnectionInfo } = require('./update-mobile-api');
const { ensureCloudflared } = require('./ensure-cloudflared');

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

function startTunnel(binPath) {
  log(`Starting public tunnel with ${path.basename(binPath)}...`);

  const child = spawn(
    binPath,
    ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
  );

  let updated = false;

  function onData(data) {
    const text = data.toString();
    process.stdout.write(text);

    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !updated) {
      updated = true;
      const ip = getLocalIp() || '192.168.1.11';
      updateMobileApi({ localIp: ip, tunnelUrl: match[0], connectionMode: 'auto' });
      writeConnectionInfo({ localIp: ip, tunnelUrl: match[0] });
      log('');
      log('==============================================');
      log(`Public URL ready: ${match[0]}`);
      log('ANY phone can log in now (WiFi or mobile data).');
      log('Reload the Expo app once (press r, or shake phone).');
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
  updateMobileApi({ localIp: ip, connectionMode: 'auto' });
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
    startTunnel(binPath);
  } catch (err) {
    log(`Could not start public tunnel: ${err.message}`);
    log('Same-WiFi login still works at http://' + ip + ':5000');
    log('Fix internet / try again so phones on mobile data can connect.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
