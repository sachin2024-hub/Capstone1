const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const FILE = path.join(__dirname, '..', 'data', 'activity-logs.json');
const MAX_LOGS = 3000;

function emptyStore() {
  return { logs: [] };
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { logs: Array.isArray(parsed.logs) ? parsed.logs : [] };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch {
    /* ignore */
  }
}

function actorFromReq(req, fallback = {}) {
  try {
    const header = req?.headers?.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token && process.env.JWT_SECRET) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.admin_id || decoded?.username) {
        return {
          admin_id: decoded.admin_id || null,
          username: decoded.username || fallback.username || 'Admin',
          role: decoded.role || fallback.role || null,
        };
      }
    }
  } catch {
    /* ignore invalid token */
  }
  return {
    admin_id: fallback.admin_id || null,
    username: fallback.username || 'Unknown',
    role: fallback.role || null,
  };
}

function logActivity(req, entry = {}) {
  const actor = actorFromReq(req, {
    admin_id: entry.admin_id,
    username: entry.username,
    role: entry.role,
  });

  const row = {
    log_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    admin_id: actor.admin_id,
    username: actor.username,
    role: actor.role,
    action: String(entry.action || 'unknown'),
    entity_type: String(entry.entity_type || ''),
    entity_id: entry.entity_id != null ? String(entry.entity_id) : '',
    target: String(entry.target || ''),
    details: String(entry.details || ''),
  };

  const store = loadStore();
  store.logs.unshift(row);
  if (store.logs.length > MAX_LOGS) store.logs.length = MAX_LOGS;
  saveStore(store);
  return row;
}

function listActivities({ q = '', action = '', from = '', to = '' } = {}) {
  let rows = loadStore().logs;
  const query = String(q || '').trim().toLowerCase();
  const actionFilter = String(action || '').trim();

  if (actionFilter && actionFilter !== 'all') {
    rows = rows.filter((row) => row.action === actionFilter);
  }
  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      rows = rows.filter((row) => new Date(row.created_at) >= start);
    }
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999`);
    if (!Number.isNaN(end.getTime())) {
      rows = rows.filter((row) => new Date(row.created_at) <= end);
    }
  }
  if (query) {
    rows = rows.filter((row) => {
      const hay = [
        row.username,
        row.action,
        row.entity_type,
        row.entity_id,
        row.target,
        row.details,
      ].join(' ').toLowerCase();
      return hay.includes(query);
    });
  }
  return rows;
}

module.exports = { logActivity, listActivities, actorFromReq };
