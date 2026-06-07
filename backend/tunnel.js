// Auto-restarting tunnel - run with: node tunnel.js
const { exec } = require('child_process');
const https = require('https');

const PORT = 5000;
let currentUrl = '';

function startTunnel() {
  console.log('🔄 Starting localtunnel...');
  const child = exec(`npx localtunnel --port ${PORT}`, (err) => {
    if (err) {
      console.log('Tunnel closed, restarting in 3s...');
      setTimeout(startTunnel, 3000);
    }
  });

  child.stdout.on('data', (data) => {
    const match = data.match(/https:\/\/[^\s]+\.loca\.lt/);
    if (match && match[0] !== currentUrl) {
      currentUrl = match[0];
      console.log('\n✅ Tunnel URL:', currentUrl);
      console.log('📱 Update this in: mobile/RapidRescue/services/api.ts\n');
    }
  });

  child.stderr.on('data', (data) => {
    if (data.includes('error') || data.includes('Error')) {
      console.log('Tunnel error, restarting...');
      child.kill();
    }
  });

  child.on('close', () => {
    console.log('Tunnel disconnected, restarting in 3s...');
    setTimeout(startTunnel, 3000);
  });
}

startTunnel();
