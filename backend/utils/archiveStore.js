const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'archive-store.json');
const SAVED_STATUSES = ['Pending', 'Outside', 'For Referral', 'Referred', 'Completed', 'In Progress', 'En Route', 'Arrived', 'Resolved', 'Cancelled'];

function emptyStore() {
  return { incidents: {}, dispatch: [], callLogs: [] };
}

function loadStore() {
  try {
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
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

function rememberStatus(incidentId, status) {
  if (!SAVED_STATUSES.includes(status)) return;
  const store = loadStore();
  store.incidents[String(incidentId)] = status;
  saveStore(store);
}

function takeSavedStatus(incidentId) {
  const store = loadStore();
  const key = String(incidentId);
  const saved = store.incidents[key];
  if (saved) {
    delete store.incidents[key];
    saveStore(store);
  }
  return SAVED_STATUSES.includes(saved) ? saved : null;
}

function archiveId(listName, id) {
  const store = loadStore();
  const key = String(id);
  if (!store[listName].map(String).includes(key)) {
    store[listName].push(Number(id) || id);
    saveStore(store);
  }
}

function restoreId(listName, id) {
  const store = loadStore();
  const key = String(id);
  store[listName] = store[listName].filter((item) => String(item) !== key);
  saveStore(store);
}

function listArchived(listName) {
  return loadStore()[listName].map(String);
}

function isArchived(listName, id) {
  return listArchived(listName).includes(String(id));
}

module.exports = {
  SAVED_STATUSES,
  rememberStatus,
  takeSavedStatus,
  archiveId,
  restoreId,
  listArchived,
  isArchived,
};
