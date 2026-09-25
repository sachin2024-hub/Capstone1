require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const cols = await p.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
    ORDER BY ordinal_position
  `);
  console.log('=== users columns ===');
  for (const r of cols.rows) console.log(`${r.column_name}: ${r.data_type}`);

  console.log('\n=== ALTER missing columns ===');
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_type TEXT`);
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number TEXT`);
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_image TEXT`);
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT`);
  await p.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  console.log('OK: id_type, id_number, id_image, verification_status, emergency_contacts');

  // Backfill from local valid-ids.json + image files if DB still null
  const metaPath = path.join(__dirname, 'data', 'valid-ids.json');
  const imgDir = path.join(__dirname, 'data', 'valid-ids');
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    meta = {};
  }

  const users = await p.query(
    `SELECT user_id, first_name, id_type, id_image, verification_status FROM users ORDER BY user_id`
  );
  console.log('\n=== users before backfill ===');
  for (const u of users.rows) {
    console.log({
      user_id: u.user_id,
      first_name: u.first_name,
      id_type: u.id_type,
      has_image: Boolean(u.id_image),
      verification_status: u.verification_status,
      local_meta: meta[String(u.user_id)] || null,
    });
  }

  let backfilled = 0;
  for (const [uid, record] of Object.entries(meta)) {
    const row = users.rows.find((u) => String(u.user_id) === String(uid));
    if (!row) continue;
    if (row.id_type && row.id_image) continue;

    let dataUrl = null;
    if (fs.existsSync(imgDir)) {
      const file = fs.readdirSync(imgDir).find((n) => n.startsWith(`${uid}.`));
      if (file) {
        const buf = fs.readFileSync(path.join(imgDir, file));
        const mime = file.endsWith('.png')
          ? 'image/png'
          : file.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    }

    await p.query(
      `UPDATE users
       SET id_type = COALESCE(id_type, $2),
           id_number = COALESCE(id_number, $3),
           id_image = COALESCE(id_image, $4),
           verification_status = COALESCE(verification_status, $5)
       WHERE user_id = $1`,
      [
        uid,
        record.id_type || null,
        record.id_number || null,
        dataUrl,
        record.verification_status || 'Pending review',
      ]
    );
    backfilled += 1;
  }
  console.log(`\nBackfilled ${backfilled} user(s) from local valid-ids store.`);

  const after = await p.query(
    `SELECT user_id, first_name, id_type,
            CASE WHEN id_image IS NULL THEN 'null' ELSE 'HAS_IMAGE(' || length(id_image) || ')' END AS id_image,
            verification_status,
            emergency_contacts
     FROM users ORDER BY user_id`
  );
  console.log('\n=== users after ===');
  console.log(after.rows);

  await p.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
