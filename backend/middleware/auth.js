const jwt = require('jsonwebtoken');
const { describeBlockReason, blockedAccountMessage } = require('../utils/blockReasons');

/**
 * Verifies the login token AND that a mobile user has not been blocked since logging in.
 *
 * Tokens last a year, so without this check a user the admin just blocked could keep using the
 * app (even send SOS) until the token expired. A blocked user now gets a 403 with
 * `code: 'ACCOUNT_BLOCKED'` and the reason; the mobile app answers by logging out and showing it.
 *
 * Admin tokens (no user_id) are not affected. If the status lookup itself fails we let the
 * request through: an emergency request must never be refused because of a database hiccup.
 */

const STATUS_CACHE_MS = 3000; // the app polls often; keeps this to ~1 lookup per user per 3 s
const statusCache = new Map(); // user_id -> { blocked, at }

function invalidateAccountStatus(userId) {
  if (userId === undefined || userId === null) statusCache.clear();
  else statusCache.delete(String(userId));
}

async function defaultIsBlocked(userId) {
  // required lazily so tests (and anything that only needs the token check) do not open a DB
  const supabase = require('../config/supabase');
  const { data, error } = await supabase
    .from('users')
    .select('account_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.account_status === 'Blocked';
}

function blockedBody(userId) {
  const { getUserBlockReason } = require('../utils/archiveStore');
  const stored = getUserBlockReason(userId);
  const reason = describeBlockReason(stored);
  return {
    code: 'ACCOUNT_BLOCKED',
    message: blockedAccountMessage(stored),
    block_reason: { id: reason.id, label: reason.label, detail: reason.detail },
  };
}

function createAuthenticateToken({
  isBlocked = defaultIsBlocked,
  getBlockedBody = blockedBody,
  now = Date.now,
} = {}) {
  return async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    req.user = decoded;

    const userId = decoded.user_id;
    if (userId === undefined || userId === null || decoded.admin_id) return next();

    try {
      const key = String(userId);
      const cached = statusCache.get(key);
      let blocked;
      if (cached && now() - cached.at < STATUS_CACHE_MS) {
        blocked = cached.blocked;
      } else {
        blocked = await isBlocked(userId);
        statusCache.set(key, { blocked, at: now() });
      }
      if (blocked) return res.status(403).json(getBlockedBody(userId));
    } catch (err) {
      console.warn('[auth] could not check account status, allowing request:', err.message);
    }
    return next();
  };
}

const authenticateToken = createAuthenticateToken();
authenticateToken.createAuthenticateToken = createAuthenticateToken;
authenticateToken.invalidateAccountStatus = invalidateAccountStatus;

module.exports = authenticateToken;
