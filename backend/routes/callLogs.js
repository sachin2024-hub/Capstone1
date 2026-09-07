const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { archiveId, restoreId, listArchived } = require('../utils/archiveStore');
const { logActivity } = require('../utils/activityLogger');

const CALL_LOG_FIELDS = [
  'log_date', 'team', 'caller_name', 'time_of_call', 'cp_number',
  'nature_of_incident', 'chief_complaint', 'abc_status', 'type_of_code',
  'number_of_patients', 'involve_vehicle', 'location_landmark', 'hazards',
  'origin', 'destination', 'patient_name', 'age', 'address',
  'contact_no', 'ambulance_no', 'remarks',
  'incident_id', 'admin_id', 'call_duration', 'call_status',
];

function pickFields(body) {
  const data = {};
  for (const key of CALL_LOG_FIELDS) {
    if (body[key] !== undefined && body[key] !== '') data[key] = body[key];
  }
  return data;
}

function buildCallTime(logDate, timeOfCall) {
  if (!logDate || !timeOfCall) return null;
  return `${logDate}T${timeOfCall}:00`;
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    time_of_call: row.time_of_call
      || (row.call_time ? new Date(row.call_time).toTimeString().slice(0, 5) : ''),
    log_date: row.log_date
      || (row.call_time ? new Date(row.call_time).toISOString().slice(0, 10) : null),
  };
}

// GET /api/call-logs?date=YYYY-MM-DD&team=CHARLIE
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('call_logs')
      .select('*')
      .order('call_log_id', { ascending: true });

    if (req.query.date) query = query.eq('log_date', req.query.date);
    if (req.query.team) query = query.eq('team', req.query.team);

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: error.message });

    const archived = new Set(listArchived('callLogs'));
    const rows = (data || []).map(normalizeRow)
      .filter((row) => {
        const id = String(row.call_log_id);
        return req.query.archived === '1' ? archived.has(id) : !archived.has(id);
      })
      .sort((a, b) => {
        const ta = a.time_of_call || '';
        const tb = b.time_of_call || '';
        return ta.localeCompare(tb);
      });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/call-logs
router.post('/', async (req, res) => {
  const data = pickFields(req.body);
  if (!data.log_date) data.log_date = new Date().toISOString().slice(0, 10);
  if (!data.team) data.team = 'ALPHA';

  const callTime = buildCallTime(data.log_date, data.time_of_call);
  if (callTime) data.call_time = callTime;

  try {
    const { data: row, error } = await supabase
      .from('call_logs')
      .insert([data])
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    logActivity(req, {
      action: 'call_log.create',
      entity_type: 'call_log',
      entity_id: row.call_log_id,
      target: row.caller_name || `Call log #${row.call_log_id}`,
      details: `Added call log${row.caller_name ? ` for ${row.caller_name}` : ''}${row.nature_of_incident ? ` (${row.nature_of_incident})` : ''}.`,
    });
    return res.status(201).json(normalizeRow(row));
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/call-logs/:id
router.patch('/:id', async (req, res) => {
  const data = pickFields(req.body);

  if (data.log_date && data.time_of_call) {
    data.call_time = buildCallTime(data.log_date, data.time_of_call);
  } else if (data.time_of_call && !data.call_time) {
    const { data: existing } = await supabase
      .from('call_logs')
      .select('log_date, call_time')
      .eq('call_log_id', req.params.id)
      .single();
    const date = data.log_date || existing?.log_date
      || (existing?.call_time ? new Date(existing.call_time).toISOString().slice(0, 10) : null);
    if (date) data.call_time = buildCallTime(date, data.time_of_call);
  }

  if (Object.keys(data).length) {
    data.updated_at = new Date().toISOString();
  }

  try {
    const { data: row, error } = await supabase
      .from('call_logs')
      .update(data)
      .eq('call_log_id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    if (!row) return res.status(404).json({ message: 'Call log entry not found.' });
    logActivity(req, {
      action: 'call_log.update',
      entity_type: 'call_log',
      entity_id: row.call_log_id,
      target: row.caller_name || `Call log #${row.call_log_id}`,
      details: `Updated call log #${row.call_log_id}${row.caller_name ? ` (${row.caller_name})` : ''}.`,
    });
    return res.json(normalizeRow(row));
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/call-logs/:id/restore
router.patch('/:id/restore', async (req, res) => {
  restoreId('callLogs', req.params.id);
  logActivity(req, {
    action: 'call_log.restore',
    entity_type: 'call_log',
    entity_id: req.params.id,
    target: `Call log #${req.params.id}`,
    details: `Restored call log #${req.params.id}.`,
  });
  return res.json({ message: 'Call log restored.' });
});

// DELETE /api/call-logs/:id — archive, or permanently remove if ?permanent=1
router.delete('/:id', async (req, res) => {
  try {
    if (req.query.permanent === '1') {
      restoreId('callLogs', req.params.id);
      const { error } = await supabase
        .from('call_logs')
        .delete()
        .eq('call_log_id', req.params.id);

      if (error) return res.status(500).json({ message: error.message });
      logActivity(req, {
        action: 'call_log.delete',
        entity_type: 'call_log',
        entity_id: req.params.id,
        target: `Call log #${req.params.id}`,
        details: `Permanently deleted call log #${req.params.id}.`,
      });
      return res.json({ message: 'Call log entry permanently deleted.' });
    }

    archiveId('callLogs', req.params.id);
    logActivity(req, {
      action: 'call_log.archive',
      entity_type: 'call_log',
      entity_id: req.params.id,
      target: `Call log #${req.params.id}`,
      details: `Moved call log #${req.params.id} to Archive.`,
    });
    return res.json({ message: 'Call log entry moved to Archive.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
