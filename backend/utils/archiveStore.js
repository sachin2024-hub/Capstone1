const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'archive-store.json');
const SAVED_STATUSES = ['Pending', 'Outside', 'For Referral', 'Referred', 'Completed', 'In Progress', 'En Route', 'Arrived', 'Resolved', 'Cancelled'];

function emptyStore() {
  return {
    incidents: {},
    dispatch: [],
    callLogs: [],
    blockedAdmins: [],
    archivedAdmins: [],
    userBlockReasons: {},
    adminBlockReasons: {},
    viewedIncidents: {},
  };
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

function listBlockedAdmins() {
  return (loadStore().blockedAdmins || []).map(String);
}

function isAdminBlocked(id) {
  return listBlockedAdmins().includes(String(id));
}

function setAdminBlocked(id, blocked) {
  const store = loadStore();
  const key = String(id);
  const current = (store.blockedAdmins || []).map(String);
  store.blockedAdmins = blocked
    ? current.includes(key) ? current : [...current, key]
    : current.filter((item) => item !== key);
  saveStore(store);
}

function isAdminArchived(id) {
  return isArchived('archivedAdmins', id);
}

function setAdminArchived(id, archived) {
  if (archived) archiveId('archivedAdmins', id);
  else restoreId('archivedAdmins', id);
}

function getUserBlockReason(id) {
  const reasons = loadStore().userBlockReasons || {};
  return reasons[String(id)] || null;
}

function setUserBlockReason(id, reasonId) {
  const store = loadStore();
  store.userBlockReasons = store.userBlockReasons || {};
  if (reasonId) store.userBlockReasons[String(id)] = reasonId;
  else delete store.userBlockReasons[String(id)];
  saveStore(store);
}

function getAdminBlockReason(id) {
  const reasons = loadStore().adminBlockReasons || {};
  return reasons[String(id)] || null;
}

function setAdminBlockReason(id, reasonId) {
  const store = loadStore();
  store.adminBlockReasons = store.adminBlockReasons || {};
  if (reasonId) store.adminBlockReasons[String(id)] = reasonId;
  else delete store.adminBlockReasons[String(id)];
  saveStore(store);
}

function listViewedIncidents() {
  return loadStore().viewedIncidents || {};
}

function isIncidentViewed(id) {
  return Boolean(listViewedIncidents()[String(id)]);
}

function markIncidentViewed(id) {
  const store = loadStore();
  store.viewedIncidents = store.viewedIncidents || {};
  store.viewedIncidents[String(id)] = new Date().toISOString();
  saveStore(store);
}

function clearIncidentViewed(id) {
  const store = loadStore();
  store.viewedIncidents = store.viewedIncidents || {};
  delete store.viewedIncidents[String(id)];
  saveStore(store);
}

module.exports = {
  SAVED_STATUSES,
  rememberStatus,
  takeSavedStatus,
  archiveId,
  restoreId,
  listArchived,
  isArchived,
  isAdminBlocked,
  setAdminBlocked,
  isAdminArchived,
  setAdminArchived,
  getUserBlockReason,
  setUserBlockReason,
  getAdminBlockReason,
  setAdminBlockReason,
  listViewedIncidents,
  isIncidentViewed,
  markIncidentViewed,
  clearIncidentViewed,
};
