const fs = require('fs');
const path = require('path');
const os = require('os');

const MOBILE_API_FILE = path.join(
  __dirname,
  '../../mobile/RapidRescue/constants/api.ts'
);

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

function updateMobileApi({ localIp, tunnelUrl, connectionMode } = {}) {
  if (!fs.existsSync(MOBILE_API_FILE)) return { localIp, tunnelUrl, connectionMode };

  let content = fs.readFileSync(MOBILE_API_FILE, 'utf8');
  const original = content;

  if (localIp) {
    content = content.replace(
      /export const LOCAL_IP = '[^']*'/,
      `export const LOCAL_IP = '${localIp}'`
    );
  }

  // Do not rewrite TUNNEL_URL here — it changes often and reloads Expo,
  // which kicks the phone off login. Tunnel is stored in connection-info.json.

  if (connectionMode) {
    content = content.replace(
      /export const CONNECTION_MODE[^=]*= '[^']*'/,
      `export const CONNECTION_MODE: 'tunnel' | 'local' | 'auto' = '${connectionMode}'`
    );
  }

  if (content !== original) {
    fs.writeFileSync(MOBILE_API_FILE, content);
  }
  return { localIp, tunnelUrl, connectionMode };
}

const CONNECTION_INFO_FILE = path.join(__dirname, '../connection-info.json');

function writeConnectionInfo({ localIp, tunnelUrl } = {}) {
  let existing = {};
  if (fs.existsSync(CONNECTION_INFO_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONNECTION_INFO_FILE, 'utf8'));
    } catch {
      existing = {};
    }
  }
  const info = {
    ...existing,
    ...(localIp ? { localIp } : {}),
    ...(tunnelUrl ? { tunnelUrl } : {}),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONNECTION_INFO_FILE, JSON.stringify(info, null, 2));
  return info;
}

module.exports = {
  getLocalIp,
  updateMobileApi,
  writeConnectionInfo,
  MOBILE_API_FILE,
  CONNECTION_INFO_FILE,
};
