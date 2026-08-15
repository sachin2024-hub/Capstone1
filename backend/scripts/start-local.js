// Starts backend only — mobile connects via same WiFi (no tunnel needed).
// Usage: npm run start:local

const { spawn, execSync } = require('child_process');
const path = require('path');
const { getLocalIp, updateMobileApi, writeConnectionInfo } = require('./update-mobile-api');

const BACKEND_DIR = path.join(__dirname, '..');
const PORT = 5000;

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

function allowFirewallPort() {
  try {
    execSync(
      'netsh advfirewall firewall add rule name="RapidRescue API" dir=in action=allow protocol=TCP localport=5000',
      { stdio: 'ignore' }
    );
    log('Firewall: port 5000 opened for mobile devices.');
  } catch {
    log('Tip: Run terminal as Administrator once to allow port 5000 through Windows Firewall.');
  }
}

const localIp = getLocalIp() || '192.168.1.11';
updateMobileApi({ localIp, connectionMode: 'local' });
writeConnectionInfo({ localIp });

log('RapidRescue — backend only (same WiFi mode)');
log(`Local IP: ${localIp}`);
log(`Backend:  http://localhost:${PORT}`);
log(`Mobile:   http://${localIp}:${PORT}/api/health`);
log('');
log('Make sure your phone is on the SAME WiFi as this laptop.');
log('Tunnel is NOT required for same-WiFi login.');
log('');

allowFirewallPort();

spawn('node', ['server.js'], {
  cwd: BACKEND_DIR,
  stdio: 'inherit',
  shell: true,
});
