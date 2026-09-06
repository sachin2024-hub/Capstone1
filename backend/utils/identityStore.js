const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

const META_FILE = path.join(__dirname, '..', 'data', 'valid-ids.json');
const IMAGE_DIR = path.join(__dirname, '..', 'data', 'valid-ids');
const MAX_BYTES = 7 * 1024 * 1024;
const IDENTITY_COLUMNS = 'id_type, id_number, verification_status';

function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveMeta(meta) {
  const dir = path.dirname(META_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

function parseImagePayload(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const dataUrl = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (dataUrl) {
    return {
      mime: dataUrl[1].toLowerCase(),
      buffer: Buffer.from(dataUrl[2], 'base64'),
      dataUrl: `data:${dataUrl[1].toLowerCase()};base64,${dataUrl[2]}`,
    };
  }

  const compact = text.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length < 80) return null;
  return {
    mime: 'image/jpeg',
    buffer: Buffer.from(compact, 'base64'),
    dataUrl: `data:image/jpeg;base64,${compact}`,
  };
}

function extensionFor(mime) {
  if (String(mime).includes('png')) return 'png';
  if (String(mime).includes('webp')) return 'webp';
  return 'jpg';
}

function publicApiUrl(userId) {
  return `/api/auth/users/${userId}/id-image`;
}

function isMissingColumnError(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('id_type') ||
    msg.includes('id_image') ||
    msg.includes('id_number') ||
    msg.includes('verification_status')
  );
}

function saveLocalRecord(userId, record, buffer, ext) {
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const existing = fs.readdirSync(IMAGE_DIR).filter((name) => name.startsWith(`${userId}.`));
  existing.forEach((name) => {
    try { fs.unlinkSync(path.join(IMAGE_DIR, name)); } catch { /* ignore */ }
  });
  if (buffer) fs.writeFileSync(path.join(IMAGE_DIR, `${userId}.${ext}`), buffer);
  const meta = loadMeta();
  meta[String(userId)] = record;
  saveMeta(meta);
}

function getLocalRecord(userId) {
  if (!userId) return {};
  return loadMeta()[String(userId)] || {};
}

function findLocalImage(userId) {
  if (!fs.existsSync(IMAGE_DIR)) return null;
  const file = fs.readdirSync(IMAGE_DIR).find((name) => name.startsWith(`${userId}.`));
  if (!file) return null;
  return {
    path: path.join(IMAGE_DIR, file),
    mime: file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
  };
}

async function saveValidId(userId, { id_type, id_number, id_image }) {
  const parsed = parseImagePayload(id_image);
  if (!parsed || !parsed.buffer.length) {
    throw new Error('Please take a clear photo of your valid ID.');
  }
  if (parsed.buffer.length > MAX_BYTES) {
    throw new Error('Valid ID photo is too large. Please retake a clearer, smaller photo.');
  }

  const record = {
    id_type: String(id_type || '').trim() || null,
    id_number: String(id_number || '').trim() || null,
    id_image_url: publicApiUrl(userId),
    verification_status: 'Pending review',
  };
  const ext = extensionFor(parsed.mime);
  saveLocalRecord(userId, record, parsed.buffer, ext);

  const { error } = await supabase
    .from('users')
    .update({
      id_type: record.id_type,
      id_number: record.id_number,
      id_image: parsed.dataUrl,
      verification_status: record.verification_status,
    })
    .eq('user_id', userId);

  if (error) {
    if (isMissingColumnError(error)) {
      console.warn(
        '[valid-id] users table is missing ID columns. Run backend/sql/add_user_valid_id.sql in Supabase SQL Editor.'
      );
    } else {
      console.warn('[valid-id] could not write ID to database:', error.message);
    }
  }

  return record;
}

function attachIdentity(user) {
  if (!user || user.user_id == null) return user;
  const local = getLocalRecord(user.user_id);
  const hasDbImage = Boolean(user.id_image || user.id_type || user.id_number || user.verification_status);
  return {
    ...user,
    id_type: user.id_type || local.id_type || null,
    id_number: user.id_number || local.id_number || null,
    id_image_url: user.id_image_url || (hasDbImage || local.id_image_url ? publicApiUrl(user.user_id) : local.id_image_url) || null,
    verification_status: user.verification_status || local.verification_status || null,
  };
}

async function loadIdImage(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id_image')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data?.id_image) {
    const parsed = parseImagePayload(data.id_image);
    if (parsed) return { mime: parsed.mime, buffer: parsed.buffer };
  }

  const local = findLocalImage(userId);
  if (local) {
    return { mime: local.mime, buffer: fs.readFileSync(local.path) };
  }
  return null;
}

async function removeValidId(userId) {
  const meta = loadMeta();
  delete meta[String(userId)];
  saveMeta(meta);
  if (fs.existsSync(IMAGE_DIR)) {
    fs.readdirSync(IMAGE_DIR)
      .filter((name) => name.startsWith(`${userId}.`))
      .forEach((name) => {
        try { fs.unlinkSync(path.join(IMAGE_DIR, name)); } catch { /* ignore */ }
      });
  }
  await supabase
    .from('users')
    .update({
      id_type: null,
      id_number: null,
      id_image: null,
      verification_status: null,
    })
    .eq('user_id', userId);
}

module.exports = {
  saveValidId,
  attachIdentity,
  loadIdImage,
  removeValidId,
  IDENTITY_COLUMNS,
  isMissingColumnError,
  IMAGE_DIR,
};
