// Hash id_type / id_number / id_image already stored in the users table.
// Usage: node scripts/hash-existing-ids.js [--dry-run]
// Before hashing, makes sure a readable local copy exists (data/valid-ids*),
// because a hash can't be turned back into the image/ID text.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { hashIdValue, looksHashed, parseImagePayload, extensionFor, IMAGE_DIR } = require('../utils/identityStore');

const META_FILE = path.join(__dirname, '..', 'data', 'valid-ids.json');
const dryRun = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch { return {}; }
}

async function main() {
  const meta = loadMeta();
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const { rows } = await pool.query(
    'SELECT user_id, id_type, id_number, id_image FROM users WHERE id_type IS NOT NULL OR id_number IS NOT NULL OR id_image IS NOT NULL ORDER BY user_id'
  );

  let done = 0;
  let skipped = 0;
  for (const row of rows) {
    const uid = String(row.user_id);
    const hasLocalImage = fs.readdirSync(IMAGE_DIR).some((n) => n.startsWith(`${uid}.`));
    const rec = meta[uid] || {};

    // 1) back up readable values locally (never overwrite what's already there)
    if (row.id_image && !looksHashed(row.id_image) && !hasLocalImage) {
      const parsed = parseImagePayload(row.id_image);
      if (!parsed) { console.log(`user ${uid}: image unreadable, skipped`); skipped++; continue; }
      if (!dryRun) fs.writeFileSync(path.join(IMAGE_DIR, `${uid}.${extensionFor(parsed.mime)}`), parsed.buffer);
    }
    if (row.id_type && !looksHashed(row.id_type) && !rec.id_type) rec.id_type = row.id_type;
    if (row.id_number && !looksHashed(row.id_number) && !rec.id_number) rec.id_number = row.id_number;
    if (row.id_image && !rec.id_image_url) rec.id_image_url = `/api/auth/users/${uid}/id-image`;
    meta[uid] = { id_type: null, id_number: null, ...rec };

    // 2) hash what is still plain
    const next = {
      id_type: looksHashed(row.id_type) ? row.id_type : hashIdValue(row.id_type),
      id_number: looksHashed(row.id_number) ? row.id_number : hashIdValue(row.id_number),
      id_image: !row.id_image || looksHashed(row.id_image)
        ? row.id_image
        : hashIdValue(parseImagePayload(row.id_image)?.buffer.toString('base64') || row.id_image),
    };
    console.log(`user ${uid}: ${dryRun ? 'would hash' : 'hashing'}`);
    if (!dryRun) {
      await pool.query('UPDATE users SET id_type = $2, id_number = $3, id_image = $4 WHERE user_id = $1', [
        row.user_id, next.id_type, next.id_number, next.id_image,
      ]);
    }
    done++;
  }

  if (!dryRun) fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  console.log(`${dryRun ? '[dry-run] ' : ''}done: ${done}, skipped: ${skipped}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
