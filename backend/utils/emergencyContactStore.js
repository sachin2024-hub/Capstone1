const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

const FILE = path.join(__dirname, '..', 'data', 'emergency-contacts.json');
const MAX_CONTACTS = 3;
const PHONE_RE = /^09\d{9}$/;

function loadAllLocal() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAllLocal(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function isMissingColumnError(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('emergency_contacts')
  );
}

/**
 * Sanitize optional contacts from client.
 * Empty rows are dropped. Partial rows throw with a clear message.
 */
function sanitizeContacts(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error('Emergency contacts must be a list.');
  }

  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const name = String(row.name || '').trim();
    const phone = normalizePhone(row.phone_number || row.phone);
    const relationship = String(row.relationship || '').trim();

    if (!name && !phone) continue;
    if (!name) throw new Error('Emergency contact name is required when a number is provided.');
    if (!phone) throw new Error('Emergency contact phone is required when a name is provided.');
    if (!PHONE_RE.test(phone)) {
      throw new Error('Emergency contact phone must be a valid PH mobile (09XXXXXXXXX).');
    }
    if (name.length > 80) throw new Error('Emergency contact name is too long.');

    out.push({
      name,
      phone_number: phone,
      relationship: relationship ? relationship.slice(0, 40) : null,
    });
  }

  if (out.length > MAX_CONTACTS) {
    throw new Error(`You can save up to ${MAX_CONTACTS} emergency contacts.`);
  }
  return out;
}

function getContactsLocal(userId) {
  const all = loadAllLocal();
  const list = all[String(userId)];
  return Array.isArray(list) ? list : [];
}

function setContactsLocal(userId, cleaned) {
  const all = loadAllLocal();
  if (cleaned.length === 0) {
    delete all[String(userId)];
  } else {
    all[String(userId)] = cleaned;
  }
  saveAllLocal(all);
  return cleaned;
}

/** Read from users.emergency_contacts; fall back to local JSON if column missing. */
async function getContacts(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('emergency_contacts')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingColumnError(error)) return getContactsLocal(userId);
      return getContactsLocal(userId);
    }

    const list = data?.emergency_contacts;
    if (Array.isArray(list)) return list;
    if (typeof list === 'string') {
      try {
        const parsed = JSON.parse(list);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    // Column exists but empty/null — still prefer DB over stale local
    if (data) return [];
    return getContactsLocal(userId);
  } catch {
    return getContactsLocal(userId);
  }
}

/** Write to users.emergency_contacts; always mirror to local JSON as backup. */
async function setContacts(userId, contacts) {
  const cleaned = sanitizeContacts(contacts);

  // Local backup first so we never lose data if DB write fails
  setContactsLocal(userId, cleaned);

  // JSON.stringify required for local pg JSONB — JS arrays become PG arrays otherwise
  const { error } = await supabase
    .from('users')
    .update({ emergency_contacts: JSON.stringify(cleaned) })
    .eq('user_id', userId);

  if (error && !isMissingColumnError(error)) {
    throw new Error(error.message || 'Could not save emergency contacts to database.');
  }

  return cleaned;
}

module.exports = {
  MAX_CONTACTS,
  sanitizeContacts,
  getContacts,
  setContacts,
  isMissingColumnError,
};
