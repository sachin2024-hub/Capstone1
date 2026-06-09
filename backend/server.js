const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminAuthRoutes = require('./routes/adminAuth');
const incidentRoutes = require('./routes/incidents');
const responderRoutes = require('./routes/responders');
const dispatchRoutes = require('./routes/dispatch');
const callLogRoutes = require('./routes/callLogs');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'RapidRescue API is running.' });
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

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`✅ RapidRescue server running on http://localhost:${PORT}`);
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
