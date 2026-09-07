const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

const IMAGE_DIR = path.join(__dirname, '..', 'data', 'profile-photos');
const MAX_BYTES = 4 * 1024 * 1024;

function parseImagePayload(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const dataUrl = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (dataUrl) {
    return {
      mime: dataUrl[1].toLowerCase(),
      buffer: Buffer.from(dataUrl[2], 'base64'),
    };
  }

  const compact = text.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length < 80) return null;
  return {
    mime: 'image/jpeg',
    buffer: Buffer.from(compact, 'base64'),
  };
}

function extensionFor(mime) {
  if (String(mime).includes('png')) return 'png';
  if (String(mime).includes('webp')) return 'webp';
  return 'jpg';
}

function publicApiUrl(userId) {
  return `/api/auth/users/${userId}/profile-picture`;
}

function findLocalImage(userId) {
  if (!userId || !fs.existsSync(IMAGE_DIR)) return null;
  const file = fs.readdirSync(IMAGE_DIR).find((name) => name.startsWith(`${userId}.`));
  if (!file) return null;
  return {
    path: path.join(IMAGE_DIR, file),
    mime: file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
  };
}

function clearLocalImage(userId) {
  if (!fs.existsSync(IMAGE_DIR)) return;
  fs.readdirSync(IMAGE_DIR)
    .filter((name) => name.startsWith(`${userId}.`))
    .forEach((name) => {
      try { fs.unlinkSync(path.join(IMAGE_DIR, name)); } catch { /* ignore */ }
    });
}

function hasProfilePhoto(userId, user) {
  return Boolean(user?.profile_picture || findLocalImage(userId));
}

function attachProfilePhoto(user) {
  if (!user || user.user_id == null) return user;
  const hasPhoto = hasProfilePhoto(user.user_id, user);
  const next = {
    ...user,
    profile_picture_url: hasPhoto ? publicApiUrl(user.user_id) : user.profile_picture_url || null,
  };
  // Huge data URLs break mobile SecureStore (~2KB). Clients load /profile-picture instead.
  if (typeof next.profile_picture === 'string' && next.profile_picture.startsWith('data:')) {
    delete next.profile_picture;
    if (!next.profile_picture_url) next.profile_picture_url = publicApiUrl(user.user_id);
  }
  return next;
}

async function saveProfilePhoto(userId, rawImage) {
  const parsed = parseImagePayload(rawImage);
  if (!parsed || !parsed.buffer.length) {
    throw new Error('Please choose a clear profile photo.');
  }
  if (parsed.buffer.length > MAX_BYTES) {
    throw new Error('Profile photo is too large. Please choose a smaller image.');
  }

  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });
  clearLocalImage(userId);
  const ext = extensionFor(parsed.mime);
  fs.writeFileSync(path.join(IMAGE_DIR, `${userId}.${ext}`), parsed.buffer);

  const { error } = await supabase
    .from('users')
    .update({ profile_picture: `data:${parsed.mime};base64,${parsed.buffer.toString('base64')}` })
    .eq('user_id', userId);

  if (error && error.code !== '42703' && error.code !== 'PGRST204') {
    console.warn('[profile-photo] could not write column:', error.message);
  }

  return { profile_picture_url: publicApiUrl(userId) };
}

async function loadProfilePhoto(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('profile_picture')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data?.profile_picture) {
    const parsed = parseImagePayload(data.profile_picture);
    if (parsed) return { mime: parsed.mime, buffer: parsed.buffer };
  }

  const local = findLocalImage(userId);
  if (local) {
    return { mime: local.mime, buffer: fs.readFileSync(local.path) };
  }
  return null;
}

async function removeProfilePhoto(userId) {
  clearLocalImage(userId);
  await supabase.from('users').update({ profile_picture: null }).eq('user_id', userId);
}

module.exports = {
  attachProfilePhoto,
  saveProfilePhoto,
  loadProfilePhoto,
  removeProfilePhoto,
  IMAGE_DIR,
};
