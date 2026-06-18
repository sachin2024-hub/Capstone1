// Starts backend + Cloudflare tunnel, updates mobile API config.
// Usage: npm run start:all

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { getLocalIp, updateMobileApi, writeConnectionInfo } = require('./update-mobile-api');

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
  const proc = spawn('node', ['server.js'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    shell: true,
  });

  proc.on('close', (code) => {
    log(`Backend stopped (exit ${code ?? 'unknown'}).`);
    log('To start again: npm run start:all');
    process.exit(code ?? 1);
  });

  return proc;
}

function startTunnel(onUrl) {
  const child = spawn(
    'npx',
    ['cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`],
    { shell: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let updated = false;

  function onData(data) {
    const text = data.toString();
    process.stdout.write(text);

    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !updated) {
      updated = true;
      updateMobileApi({ tunnelUrl: match[0], connectionMode: 'auto' });
      writeConnectionInfo({ tunnelUrl: match[0] });
      log(`Tunnel ready: ${match[0]}`);
      log('Mobile app will auto-connect (local WiFi first, then tunnel).');
      onUrl?.(match[0]);
    }
  }

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('close', () => {
    log('Tunnel stopped. Restarting in 5s...');
    setTimeout(() => startTunnel(onUrl), 5000);
  });

  return child;
}

async function main() {
  const localIp = getLocalIp();
  const ip = localIp || '192.168.1.11';
  updateMobileApi({ localIp: ip, connectionMode: 'auto' });
  writeConnectionInfo({ localIp: ip });

  log('RapidRescue — starting backend + tunnel');
  if (localIp) log(`Local IP detected: ${localIp}`);
  else log('Could not detect local IP — check WiFi connection.');

  launchBackend();

  const ready = await waitForBackend();
  if (!ready) {
    log('Backend did not start in time. Check port 5000.');
    process.exit(1);
  }

  log('Backend ready on http://localhost:5000');
  startTunnel();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
