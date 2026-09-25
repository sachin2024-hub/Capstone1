const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const authenticateToken = require('../middleware/auth');
const { getUserBlockReason, setUserBlockReason } = require('../utils/archiveStore');
const { BLOCK_REASONS, blockedAccountMessage } = require('../utils/blockReasons');
const { saveValidId, attachIdentity, removeValidId, loadIdImage, IDENTITY_COLUMNS, isMissingColumnError } = require('../utils/identityStore');
const { saveProfilePhoto, loadProfilePhoto, removeProfilePhoto } = require('../utils/profilePhotoStore');
const { verifyIdImage } = require('../utils/idScanner');
const { logActivity } = require('../utils/activityLogger');
const {
  getContacts: getEmergencyContacts,
  setContacts: setEmergencyContacts,
  sanitizeContacts,
} = require('../utils/emergencyContactStore');

const USERNAME_REGEX = /^[a-zA-Z0-9.@_-]{3,50}$/;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!username) return { ok: false, message: 'Username is required.' };
  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      message: 'Username must be 3–50 characters (letters, numbers, . @ _ - only).',
    };
  }
  return { ok: true, username };
}

// POST /api/auth/check-availability — realtime uniqueness for register
router.post('/check-availability', async (req, res) => {
  try {
    const phone = String(req.body?.phone_number || '').replace(/\D/g, '').trim();
    const usernameRaw = String(req.body?.username || '').trim();
    const result = {
      phone_taken: false,
      username_taken: false,
      phone_message: null,
      username_message: null,
    };

    if (phone && /^09\d{9}$/.test(phone)) {
      const { data } = await supabase
        .from('users')
        .select('user_id')
        .eq('phone_number', phone)
        .limit(1);
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length > 0) {
        result.phone_taken = true;
        result.phone_message =
          'This mobile number is already registered. Please use a different mobile number.';
      }
    }

    if (usernameRaw) {
      const check = validateUsername(usernameRaw);
      if (check.ok) {
        const { data } = await supabase
          .from('users')
          .select('user_id')
          .ilike('username', check.username)
          .limit(1);
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        if (rows.length > 0) {
          result.username_taken = true;
          result.username_message =
            'This username is already taken. Please choose a different username.';
        }
      }
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const {
    first_name,
    middle_name,
    last_name,
    phone_number,
    username,
    password,
    address,
    id_type,
    id_number,
    id_image,
    emergency_contacts,
  } = req.body;

  if (!first_name || !last_name || !username || !password) {
    return res.status(400).json({ message: 'First name, last name, username, and password are required.' });
  }

  if (!String(id_type || '').trim() || !id_image) {
    return res.status(400).json({
      field: 'id_image',
      message: 'Please take a photo of your valid ID to finish registration.',
    });
  }

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) {
    return res.status(400).json({ field: 'username', message: usernameCheck.message });
  }

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({
      message: 'Password must be at least 8 characters and include a letter and a number.',
    });
  }

  let optionalContacts = [];
  try {
    optionalContacts = sanitizeContacts(emergency_contacts);
  } catch (contactErr) {
    return res.status(400).json({
      field: 'emergency_contacts',
      message: contactErr.message || 'Invalid emergency contact.',
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedUsername = usernameCheck.username;
    const normalizedPhone = phone_number ? String(phone_number).trim() : '';

    const { data: existingUsername } = await supabase
      .from('users')
      .select('user_id')
      .ilike('username', normalizedUsername)
      .maybeSingle();

    if (existingUsername) {
      return res.status(409).json({
        field: 'username',
        message: 'This username is already taken. Please choose a different username.',
      });
    }

    if (normalizedPhone) {
      const { data: existingPhone } = await supabase
        .from('users')
        .select('user_id')
        .eq('phone_number', normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (existingPhone) {
        return res.status(409).json({
          field: 'phone_number',
          message: 'This mobile number is already registered. Please use a different mobile number.',
        });
      }
    }

    const scan = await verifyIdImage(String(id_type).trim(), id_image);
    if (!scan.match) {
      return res.status(400).json({
        field: 'id_image',
        message: scan.message || 'The ID photo does not match the ID type you selected.',
      });
    }

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          first_name,
          middle_name: middle_name || null,
          last_name,
          phone_number: normalizedPhone || null,
          username: normalizedUsername,
          password: hashedPassword,
          address: address || null,
          account_status: 'Active',
        },
      ])
      .select('user_id, first_name, middle_name, last_name, username, phone_number, address, account_status')
      .single();

    if (error) {
      if (error.code === '23505') {
        const info = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
        if (info.includes('phone')) {
          return res.status(409).json({
            field: 'phone_number',
            message: 'This mobile number is already registered. Please use a different mobile number.',
          });
        }
        return res.status(409).json({
          field: 'username',
          message: 'This username is already taken. Please choose a different username.',
        });
      }
      return res.status(500).json({ message: error.message });
    }

    let identity;
    try {
      identity = await saveValidId(data.user_id, {
        id_type,
        id_number,
        id_image,
      });
    } catch (idErr) {
      await supabase.from('users').delete().eq('user_id', data.user_id);
      return res.status(400).json({
        field: 'id_image',
        message: idErr.message || 'Could not save your valid ID photo.',
      });
    }

    // Optional emergency contacts — saved on users.emergency_contacts
    let savedContacts = [];
    try {
      if (optionalContacts.length) {
        savedContacts = await setEmergencyContacts(data.user_id, optionalContacts);
      }
    } catch {
      savedContacts = [];
    }

    const token = jwt.sign(
      { user_id: data.user_id, username: data.username },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    logActivity(req, {
      username: 'Mobile user',
      action: 'user.register',
      entity_type: 'user',
      entity_id: data.user_id,
      target: `${data.first_name} ${data.last_name}`.trim(),
      details: `${data.first_name} ${data.last_name} registered a mobile account (${data.username}${identity?.id_type ? `, ID: ${identity.id_type}` : ''}).`,
    });

    return res.status(201).json({
      message: 'Registration successful!',
      user: { ...data, ...identity, emergency_contacts: savedContacts },
      token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const { password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', username)
      .maybeSingle();

    if (error || !data) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    if (data.account_status === 'Blocked') {
      return res.status(403).json({
        message: blockedAccountMessage(getUserBlockReason(data.user_id)),
      });
    }

    if (data.account_status !== 'Active') {
      return res.status(403).json({ message: 'Your account is inactive. Contact support.' });
    }

    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { user_id: data.user_id, username: data.username },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    const { password: _password, ...userWithoutPassword } = data;

    return res.json({
      message: 'Login successful!',
      user: attachIdentity(userWithoutPassword),
      token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/auth/me — current logged-in user
router.get('/me', authenticateToken, async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(401).json({ message: 'Access denied.' });
  }

  try {
    let { data, error } = await supabase
      .from('users')
      .select(USER_SAFE_FIELDS_WITH_ID)
      .eq('user_id', user_id)
      .single();

    if (error && isMissingColumnError(error)) {
      ({ data, error } = await supabase
        .from('users')
        .select(USER_SAFE_FIELDS)
        .eq('user_id', user_id)
        .single());
    }

    if (error || !data) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json({
      user: {
        ...attachIdentity(data),
        emergency_contacts: await getEmergencyContacts(user_id),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/auth/emergency-contacts — optional contacts for logged-in user
router.get('/emergency-contacts', authenticateToken, async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) return res.status(401).json({ message: 'Access denied.' });
  return res.json({ contacts: await getEmergencyContacts(user_id) });
});

// PUT /api/auth/emergency-contacts — replace full list (empty array clears)
router.put('/emergency-contacts', authenticateToken, async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) return res.status(401).json({ message: 'Access denied.' });

  try {
    const contacts = await setEmergencyContacts(user_id, req.body?.contacts ?? req.body?.emergency_contacts ?? []);
    return res.json({ message: 'Emergency contacts saved.', contacts });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Could not save emergency contacts.' });
  }
});

// POST /api/auth/forgot-password/verify
router.post('/forgot-password/verify', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const phone_number = String(req.body?.phone_number || '').trim();

  if (!username || !phone_number) {
    return res.status(400).json({ message: 'Username and mobile number are required.' });
  }

  try {
    const { data } = await supabase
      .from('users')
      .select('user_id, username, phone_number, account_status')
      .ilike('username', username)
      .eq('phone_number', phone_number)
      .maybeSingle();

    if (!data) {
      return res.status(404).json({
        message: 'No account matches that username and mobile number.',
      });
    }

    if (data.account_status === 'Blocked') {
      return res.status(403).json({
        message: blockedAccountMessage(getUserBlockReason(data.user_id)),
      });
    }

    if (data.account_status !== 'Active') {
      return res.status(403).json({ message: 'This account cannot reset its password. Contact support.' });
    }

    const reset_token = jwt.sign(
      { user_id: data.user_id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.json({
      message: 'Account verified. You can now set a new password.',
      reset_token,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/forgot-password/reset
router.post('/forgot-password/reset', async (req, res) => {
  const { reset_token, password } = req.body;

  if (!reset_token || !password) {
    return res.status(400).json({ message: 'Reset token and new password are required.' });
  }
  if (String(password).length < 8 || !/[A-Za-z]/.test(String(password)) || !/\d/.test(String(password))) {
    return res.status(400).json({
      field: 'password',
      message: 'Password must be at least 8 characters and include a letter and a number.',
    });
  }

  try {
    const decoded = jwt.verify(reset_token, process.env.JWT_SECRET);
    if (!decoded || decoded.purpose !== 'password_reset' || !decoded.user_id) {
      return res.status(403).json({ message: 'Invalid or expired reset link. Please verify again.' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('password')
      .eq('user_id', decoded.user_id)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const sameAsOld = await bcrypt.compare(String(password), existing.password);
    if (sameAsOld) {
      return res.status(400).json({
        field: 'password',
        message: 'New password must be different from your current password.',
      });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('user_id', decoded.user_id);

    if (error) return res.status(500).json({ message: error.message });

    return res.json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired reset link. Please verify again.' });
  }
});

const USER_SAFE_FIELDS = 'user_id, first_name, middle_name, last_name, username, phone_number, address, account_status, date_registered';
const USER_SAFE_FIELDS_WITH_ID = `${USER_SAFE_FIELDS}, ${IDENTITY_COLUMNS}`;

// PATCH /api/auth/profile — logged-in user updates own account
router.patch('/profile', authenticateToken, async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(401).json({ message: 'Access denied.' });
  }

  const { first_name, middle_name, last_name, username, phone_number, address, password, current_password, profile_picture } = req.body;
  const updates = {};

  if (first_name !== undefined) updates.first_name = String(first_name).trim();
  if (middle_name !== undefined) updates.middle_name = String(middle_name).trim() || null;
  if (last_name !== undefined) updates.last_name = String(last_name).trim();
  if (username !== undefined) {
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.ok) {
      return res.status(400).json({ field: 'username', message: usernameCheck.message });
    }
    updates.username = usernameCheck.username;
  }
  if (phone_number !== undefined) updates.phone_number = String(phone_number).trim() || null;
  if (address !== undefined) updates.address = String(address).trim() || null;

  if (password) {
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    if (!current_password) {
      return res.status(400).json({ message: 'Current password is required to set a new password.' });
    }
    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('password')
      .eq('user_id', user_id)
      .single();
    if (existingError || !existing) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const matches = await bcrypt.compare(String(current_password), existing.password);
    if (!matches) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    updates.password = await bcrypt.hash(String(password), 10);
  }

  if (profile_picture) {
    try {
      await saveProfilePhoto(user_id, profile_picture);
    } catch (err) {
      return res.status(400).json({ message: err.message || 'Could not save profile photo.' });
    }
  }

  if (Object.keys(updates).length === 0) {
    if (profile_picture) {
      const { data: photoUser } = await supabase
        .from('users')
        .select(USER_SAFE_FIELDS)
        .eq('user_id', user_id)
        .single();
      if (!photoUser) return res.status(404).json({ message: 'User not found.' });
      return res.json({ message: 'Profile photo updated.', user: attachIdentity(photoUser) });
    }
    return res.status(400).json({ message: 'No fields to update.' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', user_id)
      .select(USER_SAFE_FIELDS_WITH_ID)
      .single();

    if (error) {
      if (isMissingColumnError(error)) {
        const retry = await supabase
          .from('users')
          .update(updates)
          .eq('user_id', user_id)
          .select(USER_SAFE_FIELDS)
          .single();
        if (retry.error) {
          if (retry.error.code === '23505') {
            return res.status(409).json({ message: 'Username or phone number already in use.' });
          }
          return res.status(500).json({ message: retry.error.message });
        }
        if (!retry.data) return res.status(404).json({ message: 'User not found.' });
        return res.json({ message: 'Profile updated.', user: attachIdentity(retry.data) });
      }
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Username or phone number already in use.' });
      }
      return res.status(500).json({ message: error.message });
    }
    if (!data) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'Profile updated.', user: attachIdentity(data) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/profile-picture — save avatar only

router.post('/profile-picture', authenticateToken, async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(401).json({ message: 'Access denied.' });
  }

  const photo = req.body?.profile_picture || req.body?.photo || req.body?.image;
  if (!photo) {
    return res.status(400).json({
      message: 'Photo did not arrive. Crop a smaller picture, then tap Save photo.',
    });
  }

  try {
    await saveProfilePhoto(user_id, photo);
    const { data: photoUser } = await supabase
      .from('users')
      .select(USER_SAFE_FIELDS)
      .eq('user_id', user_id)
      .single();
    if (!photoUser) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'Profile photo updated.', user: attachIdentity(photoUser) });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Could not save profile photo.' });
  }
});

// GET /api/auth/users  - Get all users (for dashboard)
router.get('/users', async (req, res) => {
  try {
    let { data, error } = await supabase
      .from('users')
      .select(USER_SAFE_FIELDS_WITH_ID)
      .order('date_registered', { ascending: false });

    if (error && isMissingColumnError(error)) {
      ({ data, error } = await supabase
        .from('users')
        .select(USER_SAFE_FIELDS)
        .order('date_registered', { ascending: false }));
    }

    if (error) return res.status(500).json({ message: error.message });
    const rows = (data || []).map((u) => ({
      ...attachIdentity(u),
      block_reason: u.account_status === 'Blocked' ? getUserBlockReason(u.user_id) : null,
    }));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

const USER_STATUSES = ['Active', 'Inactive', 'Blocked', 'Deleted'];

// GET /api/auth/users/:id/profile-picture
router.get('/users/:id/profile-picture', async (req, res) => {
  try {
    const image = await loadProfilePhoto(req.params.id);
    if (!image) return res.status(404).json({ message: 'No profile photo found.' });
    res.set('Content-Type', image.mime);
    res.set('Cache-Control', 'private, max-age=10');
    return res.send(image.buffer);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/auth/users/:id/id-image — valid ID photo from database
router.get('/users/:id/id-image', async (req, res) => {
  try {
    const image = await loadIdImage(req.params.id);
    if (!image) return res.status(404).json({ message: 'No valid ID photo found.' });
    res.set('Content-Type', image.mime);
    res.set('Cache-Control', 'private, max-age=30');
    return res.send(image.buffer);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/auth/users/:id — edit profile or block/unblock
router.patch('/users/:id', async (req, res) => {
  const { first_name, middle_name, last_name, username, phone_number, address, account_status, password, block_reason } = req.body;
  const updates = {};

  if (first_name !== undefined) updates.first_name = first_name.trim();
  if (middle_name !== undefined) updates.middle_name = middle_name.trim() || null;
  if (last_name !== undefined) updates.last_name = last_name.trim();
  if (username !== undefined) {
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.ok) {
      return res.status(400).json({ field: 'username', message: usernameCheck.message });
    }
    updates.username = usernameCheck.username;
  }
  if (phone_number !== undefined) updates.phone_number = phone_number.trim() || null;
  if (address !== undefined) updates.address = address.trim() || null;
  if (account_status !== undefined) {
    if (!USER_STATUSES.includes(account_status)) {
      return res.status(400).json({ message: 'Invalid status. Use Active, Inactive, Blocked, or Deleted.' });
    }
    updates.account_status = account_status;
  }
  if (account_status === 'Blocked') {
    const validReason = BLOCK_REASONS.some((r) => r.id === block_reason);
    setUserBlockReason(req.params.id, validReason ? block_reason : 'admin');
  }
  if (account_status === 'Active' || account_status === 'Deleted') {
    setUserBlockReason(req.params.id, null);
  }
  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    updates.password = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No fields to update.' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', req.params.id)
      .select(USER_SAFE_FIELDS_WITH_ID)
      .single();

    if (error) {
      if (isMissingColumnError(error)) {
        const retry = await supabase
          .from('users')
          .update(updates)
          .eq('user_id', req.params.id)
          .select(USER_SAFE_FIELDS)
          .single();
        if (retry.error) {
          if (retry.error.code === '23505') {
            return res.status(409).json({ message: 'Username or phone number already in use.' });
          }
          return res.status(500).json({ message: retry.error.message });
        }
        if (!retry.data) return res.status(404).json({ message: 'User not found.' });
        const retryName = `${retry.data.first_name || ''} ${retry.data.last_name || ''}`.trim() || `User #${req.params.id}`;
        logActivity(req, {
          action: account_status === 'Blocked' ? 'user.block' : account_status === 'Deleted' ? 'user.archive' : 'user.update',
          entity_type: 'user',
          entity_id: req.params.id,
          target: retryName,
          details: `Updated mobile user ${retryName}.`,
        });
        return res.json({
          ...attachIdentity(retry.data),
          block_reason: retry.data.account_status === 'Blocked' ? getUserBlockReason(retry.data.user_id) : null,
        });
      }
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Username or phone number already in use.' });
      }
      return res.status(500).json({ message: error.message });
    }
    if (!data) return res.status(404).json({ message: 'User not found.' });
    const name = `${data.first_name || ''} ${data.last_name || ''}`.trim() || `User #${req.params.id}`;
    let action = 'user.update';
    let details = `Updated mobile user ${name}.`;
    if (account_status === 'Blocked') {
      action = 'user.block';
      details = `Blocked mobile user ${name}${block_reason ? ` (reason: ${block_reason})` : ''}.`;
    } else if (account_status === 'Deleted') {
      action = 'user.archive';
      details = `Moved mobile user ${name} to archive.`;
    } else if (account_status === 'Active' && Object.keys(updates).length === 1) {
      action = 'user.restore';
      details = `Restored mobile user ${name} to Active.`;
    } else if (updates.password) {
      details = `Changed password/profile for mobile user ${name}.`;
    } else {
      const fields = Object.keys(updates).filter((k) => k !== 'password' && k !== 'account_status');
      if (fields.length) details = `Updated ${name}: ${fields.join(', ')}.`;
    }
    logActivity(req, {
      action,
      entity_type: 'user',
      entity_id: req.params.id,
      target: name,
      details,
    });
    return res.json({
      ...attachIdentity(data),
      block_reason: data.account_status === 'Blocked' ? getUserBlockReason(data.user_id) : null,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('user_id', req.params.id);

    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({
          message: 'This user has incident records. Block the account instead of deleting.',
        });
      }
      return res.status(500).json({ message: error.message });
    }
    await removeValidId(req.params.id);
    await removeProfilePhoto(req.params.id);
    logActivity(req, {
      action: 'user.delete',
      entity_type: 'user',
      entity_id: req.params.id,
      target: `User #${req.params.id}`,
      details: `Permanently deleted mobile user #${req.params.id}.`,
    });
    return res.json({ message: 'User deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/scan-id
router.post('/scan-id', async (req, res) => {
  const { id_type, image } = req.body;
  if (!id_type || !image) {
    return res.status(400).json({ match: false, message: 'id_type and image are required.' });
  }

  const result = await verifyIdImage(String(id_type).trim(), image);
  return res.json(result);
});

module.exports = router;
