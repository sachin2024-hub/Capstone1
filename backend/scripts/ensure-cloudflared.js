const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR = path.join(__dirname, '../bin');
const BIN_PATH = path.join(BIN_DIR, 'cloudflared.exe');
const DOWNLOAD_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error('Too many redirects while downloading cloudflared'));
      return;
    }

    https
      .get(url, { headers: { 'User-Agent': 'RapidRescue' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          download(res.headers.location, dest, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed (HTTP ${res.statusCode})`));
          return;
        }

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', (err) => {
          try {
            fs.unlinkSync(dest);
          } catch {
            /* ignore */
          }
          reject(err);
        });
      })
      .on('error', reject);
  });
}

async function ensureCloudflared() {
  if (fs.existsSync(BIN_PATH) && fs.statSync(BIN_PATH).size > 1_000_000) {
    return BIN_PATH;
  }
  await download(DOWNLOAD_URL, BIN_PATH);
  return BIN_PATH;
}

module.exports = { ensureCloudflared, BIN_PATH };
