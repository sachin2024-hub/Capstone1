require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const p = new Pool({ connectionString: process.env.DATABASE_URL });
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'valid-ids.json'), 'utf8'));
const imgDir = path.join(__dirname, '..', 'data', 'valid-ids');

async function main() {
  for (const [uid, rec] of Object.entries(meta)) {
    let dataUrl = null;
    if (fs.existsSync(imgDir)) {
      const file = fs.readdirSync(imgDir).find((n) => n.startsWith(`${uid}.`));
      if (file) {
        const buf = fs.readFileSync(path.join(imgDir, file));
        const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    }

    const sql = `
      UPDATE users
      SET
        id_type = $2,
        id_number = $3,
        id_image = COALESCE($4, id_image),
        verification_status = $5
      WHERE user_id = $1
      RETURNING user_id, id_type, (id_image IS NOT NULL) AS has_img, verification_status
    `;
    const r = await p.query(sql, [
      uid,
      rec.id_type || null,
      rec.id_number || null,
      dataUrl,
      rec.verification_status || 'Pending review',
    ]);
    console.log(
      `user ${uid}: matched=${r.rowCount}`,
      r.rows[0] || '(no DB row)',
      `imageBytes=${dataUrl ? dataUrl.length : 0}`
    );
  }
  await p.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
