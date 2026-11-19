const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
const authenticateToken = require('../middleware/auth');
const { describeBlockReason } = require('../utils/blockReasons');

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET);

function run(middleware, token) {
  return new Promise((resolve) => {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ nextCalled: false, status: this.statusCode, body, req }); },
    };
    Promise.resolve(middleware(req, res, () => resolve({ nextCalled: true, req }))).catch((e) =>
      resolve({ error: e })
    );
  });
}

const body = () => ({ code: 'ACCOUNT_BLOCKED', message: 'blocked', block_reason: { id: 'misuse' } });

test('an active user passes', async () => {
  const mw = authenticateToken.createAuthenticateToken({ isBlocked: async () => false, getBlockedBody: body });
  const r = await run(mw, sign({ user_id: 1 }));
  assert.equal(r.nextCalled, true);
  assert.equal(r.req.user.user_id, 1);
});

test('a blocked user is refused with ACCOUNT_BLOCKED even with a valid token', async () => {
  const mw = authenticateToken.createAuthenticateToken({ isBlocked: async () => true, getBlockedBody: body });
  const r = await run(mw, sign({ user_id: 2 }));
  assert.equal(r.nextCalled, false);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'ACCOUNT_BLOCKED');
  assert.equal(r.body.block_reason.id, 'misuse');
});

test('unblocking takes effect again (after the short cache or an explicit invalidate)', async () => {
  let blocked = true;
  let clock = 1000;
  const mw = authenticateToken.createAuthenticateToken({
    isBlocked: async () => blocked,
    getBlockedBody: body,
    now: () => clock,
  });
  const token = sign({ user_id: 3 });
  assert.equal((await run(mw, token)).nextCalled, false);
  blocked = false;
  authenticateToken.invalidateAccountStatus(3);
  assert.equal((await run(mw, token)).nextCalled, true);
  blocked = true;
  clock += 10_000; // cache expired
  assert.equal((await run(mw, token)).nextCalled, false);
});

test('the status is cached briefly so frequent polling does not hammer the database', async () => {
  let lookups = 0;
  let clock = 1000;
  const mw = authenticateToken.createAuthenticateToken({
    isBlocked: async () => { lookups += 1; return false; },
    getBlockedBody: body,
    now: () => clock,
  });
  const token = sign({ user_id: 4 });
  await run(mw, token);
  await run(mw, token);
  await run(mw, token);
  assert.equal(lookups, 1);
  clock += 5000;
  await run(mw, token);
  assert.equal(lookups, 2);
});

test('admin tokens are not checked against the mobile users table', async () => {
  let lookups = 0;
  const mw = authenticateToken.createAuthenticateToken({ isBlocked: async () => { lookups += 1; return true; }, getBlockedBody: body });
  const r = await run(mw, sign({ admin_id: 9, role: 'Admin' }));
  assert.equal(r.nextCalled, true);
  assert.equal(lookups, 0);
});

test('if the status lookup fails the request still goes through (never refuse an SOS on a DB hiccup)', async () => {
  const mw = authenticateToken.createAuthenticateToken({ isBlocked: async () => { throw new Error('db down'); }, getBlockedBody: body });
  const r = await run(mw, sign({ user_id: 5 }));
  assert.equal(r.nextCalled, true);
});

test('missing or invalid tokens are still rejected as before', async () => {
  const mw = authenticateToken.createAuthenticateToken({ isBlocked: async () => false, getBlockedBody: body });
  assert.equal((await run(mw, null)).status, 401);
  assert.equal((await run(mw, 'garbage')).status, 403);
});

test('block reasons are described for the mobile popup (preset and "others" note)', () => {
  assert.equal(describeBlockReason('misuse').label, 'Misuse of the system');
  const other = describeBlockReason('others::Nag-insulto sa operator');
  assert.equal(other.label, 'Others');
  assert.equal(other.detail, 'Nag-insulto sa operator');
});
