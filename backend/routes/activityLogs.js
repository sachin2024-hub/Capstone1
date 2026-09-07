const express = require('express');
const router = express.Router();
const { logActivity, listActivities } = require('../utils/activityLogger');

// GET /api/activity-logs
router.get('/', (req, res) => {
  try {
    const { q, action, from, to } = req.query;
    const logs = listActivities({ q, action, from, to });
    return res.json({ logs, total: logs.length });
  } catch (err) {
    return res.status(500).json({ message: 'Could not load activity logs.' });
  }
});

// POST /api/activity-logs/logout
router.post('/logout', (req, res) => {
  logActivity(req, {
    action: 'admin.logout',
    entity_type: 'admin',
    details: 'Signed out of the admin control panel.',
  });
  return res.json({ message: 'Logged out.' });
});

module.exports = router;
