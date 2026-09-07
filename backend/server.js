const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const CONNECTION_INFO_FILE = path.join(__dirname, 'connection-info.json');

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

function readConnectionInfo() {
  try {
    if (fs.existsSync(CONNECTION_INFO_FILE)) {
      return JSON.parse(fs.readFileSync(CONNECTION_INFO_FILE, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeConnectionInfo(patch = {}) {
  const info = {
    ...readConnectionInfo(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONNECTION_INFO_FILE, JSON.stringify(info, null, 2));
  return info;
}

const authRoutes = require('./routes/auth');
const adminAuthRoutes = require('./routes/adminAuth');
const incidentRoutes = require('./routes/incidents');
const responderRoutes = require('./routes/responders');
const dispatchRoutes = require('./routes/dispatch');
const callLogRoutes = require('./routes/callLogs');
const dispatchRecordRoutes = require('./routes/dispatchRecords');
const activityLogRoutes = require('./routes/activityLogs');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '20mb' }));
app.use('/uploads/valid-ids', express.static(path.join(__dirname, 'data', 'valid-ids')));

app.get('/', (req, res) => {
  res.json({ message: 'RapidRescue API is running.' });
});

app.get('/api/health', (req, res) => {
  const liveIp = getLocalIp();
  const info = readConnectionInfo();
  if (liveIp && liveIp !== info.localIp) {
    writeConnectionInfo({ localIp: liveIp });
  }
  res.json({
    ok: true,
    service: 'RapidRescue API',
    localIp: liveIp || info.localIp || null,
    tunnelUrl: info.tunnelUrl || null,
  });
});

// Mobile users
app.use('/api/auth', authRoutes);
// Web admin
app.use('/api/admin', adminAuthRoutes);
// Incidents
app.use('/api/incidents', incidentRoutes);
app.use('/api/responders', responderRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/call-logs', callLogRoutes);
app.use('/api/dispatch-records', dispatchRecordRoutes);
app.use('/api/activity-logs', activityLogRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  if (ip) writeConnectionInfo({ localIp: ip });
  console.log(`✅ RapidRescue server running on http://localhost:${PORT}`);
  if (ip) console.log(`📱 Mobile (same WiFi): http://${ip}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    console.error('');
    console.error('   Meaning: Backend is ALREADY running (or another app uses port 5000).');
    console.error('   Do NOT run "node server.js" again in a second terminal.');
    console.error('');
    console.error('   To restart:  npm run restart');
    console.error('   To stop:     npm run stop');
    console.error('   Check:       open http://localhost:5000 in browser');
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});
