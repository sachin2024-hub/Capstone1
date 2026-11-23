const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Optional photos taken by the reporter. Stored as files (no DB migration needed).
// File name: <incidentId>-<random>.<ext>. The random part makes the public URL unguessable.
const PHOTO_DIR = path.join(__dirname, '..', 'data', 'incident-photos');
const URL_PREFIX = '/uploads/incident-photos';
const MAX_PHOTOS = 3;
const MAX_BYTES = 4 * 1024 * 1024;

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function parseImage(raw) {
  const m = String(raw || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/is);
  if (!m) return null;
  const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) return null;
  const buffer = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) return null;
  return { ext, buffer };
}

function filesFor(incidentId) {
  if (!fs.existsSync(PHOTO_DIR)) return [];
  const prefix = `${Number(incidentId)}-`;
  return fs.readdirSync(PHOTO_DIR).filter((name) => name.startsWith(prefix)).sort();
}

function listPhotoUrls(incidentId) {
  return filesFor(incidentId).map((name) => `${URL_PREFIX}/${name}`);
}

/** Replaces the incident's photos with the given data URLs (so a retried upload never duplicates). */
function savePhotos(incidentId, rawImages) {
  const list = Array.isArray(rawImages) ? rawImages.slice(0, MAX_PHOTOS) : [];
  if (!list.length) throw new Error('No photo received.');

  const parsed = list.map((raw) => {
    const img = parseImage(raw);
    if (!img) throw new Error('One of the photos could not be read.');
    if (img.buffer.length > MAX_BYTES) throw new Error('A photo is too large. Please use a smaller one.');
    return img;
  });

  if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });
  filesFor(incidentId).forEach((name) => {
    try { fs.unlinkSync(path.join(PHOTO_DIR, name)); } catch { /* ignore */ }
  });
  parsed.forEach((img) => {
    const name = `${Number(incidentId)}-${crypto.randomBytes(8).toString('hex')}.${img.ext}`;
    fs.writeFileSync(path.join(PHOTO_DIR, name), img.buffer);
  });
  return listPhotoUrls(incidentId);
}

function removePhotos(incidentId) {
  filesFor(incidentId).forEach((name) => {
    try { fs.unlinkSync(path.join(PHOTO_DIR, name)); } catch { /* ignore */ }
  });
}

module.exports = { PHOTO_DIR, URL_PREFIX, MAX_PHOTOS, listPhotoUrls, savePhotos, removePhotos };
