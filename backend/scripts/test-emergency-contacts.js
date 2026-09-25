require('dotenv').config();
const { setContacts, getContacts } = require('../utils/emergencyContactStore');

(async () => {
  const userId = process.argv[2] || 35;
  const saved = await setContacts(userId, [
    { name: 'Mama', phone_number: '09468464846' },
  ]);
  console.log('saved:', saved);
  const loaded = await getContacts(userId);
  console.log('loaded:', loaded);
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
