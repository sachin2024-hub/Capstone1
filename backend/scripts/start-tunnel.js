// Starts Cloudflare tunnel and auto-updates mobile API URL
// Usage: node scripts/start-tunnel.js

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const MOBILE_API_FILE = path.join(
  __dirname,
  '../../mobile/RapidRescue/constants/api.ts'
);

function updateMobileConfig(tunnelUrl) {
  let content = fs.readFileSync(MOBILE_API_FILE, 'utf8');
  content = content.replace(
    /export const TUNNEL_URL = '[^']*'/,
    `export const TUNNEL_URL = '${tunnelUrl}'`
  );
  content = content.replace(
    /export const CONNECTION_MODE[^=]*= '[^']*'/,
    `export const CONNECTION_MODE: 'tunnel' | 'local' = 'tunnel'`
  );
  fs.writeFileSync(MOBILE_API_FILE, content);
  console.log('\n✅ Mobile API URL updated:', tunnelUrl);
  console.log('📱 Press "r" in Expo terminal to reload the app\n');
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
    updateMobileConfig(match[0]);
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
