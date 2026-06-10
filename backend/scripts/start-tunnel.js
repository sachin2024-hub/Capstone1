// Starts Cloudflare tunnel and auto-updates mobile API URL
// Usage: npm run tunnel

const { spawn } = require('child_process');
const { getLocalIp, updateMobileApi, writeConnectionInfo } = require('./update-mobile-api');

const PORT = 5000;

const localIp = getLocalIp();
if (localIp) {
  updateMobileApi({ localIp, connectionMode: 'auto' });
  writeConnectionInfo({ localIp });
}

console.log('🔄 Starting Cloudflare tunnel on port', PORT, '...\n');

const child = spawn('npx', ['cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let updated = false;

function onData(data) {
  const text = data.toString();
  process.stdout.write(text);

  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !updated) {
    updated = true;
    updateMobileApi({ tunnelUrl: match[0], connectionMode: 'auto' });
    writeConnectionInfo({ tunnelUrl: match[0] });
    console.log('\n✅ Mobile API URL updated:', match[0]);
    console.log('📱 Open Expo app — it will auto-connect (WiFi first, then tunnel)\n');
  }
}

child.stdout.on('data', onData);
child.stderr.on('data', onData);

child.on('close', (code) => {
  console.log(`Tunnel exited (${code}). Restarting in 3s...`);
  updated = false;
  setTimeout(() => {
    require('child_process').spawn('node', [__filename], { stdio: 'inherit', shell: true });
  }, 3000);
});
