const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { logActivity } = require('../utils/activityLogger');

const FIELDS = [
  'vehicle',
  'modulation',
  'team_officer',
  'on_board',
  'time_dispatch',
  'dispatch_kmr_fuel',
  'time_touchdown',
  'touchdown_kmr_fuel',
  'log_date',
];

function pickFields(body) {
  const data = {};
  for (const key of FIELDS) {
    if (body[key] !== undefined && body[key] !== '') data[key] = body[key];
  }
  return data;
}

// GET /api/dispatch-records?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('dispatch_records')
      .select('*')
      .order('dispatch_record_id', { ascending: true });

    if (req.query.date) query = query.eq('log_date', req.query.date);

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: error.message });

    const rows = (data || []).sort((a, b) => {
      const ta = a.time_dispatch || '';
      const tb = b.time_dispatch || '';
      return ta.localeCompare(tb);
    });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/dispatch-records
router.post('/', async (req, res) => {
  const data = pickFields(req.body);
  if (!data.log_date) data.log_date = new Date().toISOString().slice(0, 10);

  try {
    const { data: row, error } = await supabase
      .from('dispatch_records')
      .insert([data])
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    logActivity(req, {
      action: 'dispatch_record.create',
      entity_type: 'dispatch_record',
      entity_id: row.dispatch_record_id,
      target: row.vehicle || `Dispatch #${row.dispatch_record_id}`,
      details: `Added dispatch record${row.vehicle ? ` for ${row.vehicle}` : ''}${row.location ? ` at ${row.location}` : ''}.`,
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/dispatch-records/:id
router.put('/:id', async (req, res) => {
  const data = pickFields(req.body);
  data.updated_at = new Date().toISOString();

  try {
    const { data: row, error } = await supabase
      .from('dispatch_records')
      .update(data)
      .eq('dispatch_record_id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    if (!row) return res.status(404).json({ message: 'Dispatch record not found.' });
    logActivity(req, {
      action: 'dispatch_record.update',
      entity_type: 'dispatch_record',
      entity_id: row.dispatch_record_id,
      target: row.vehicle || `Dispatch #${row.dispatch_record_id}`,
      details: `Updated dispatch record #${row.dispatch_record_id}${row.vehicle ? ` (${row.vehicle})` : ''}.`,
    });
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/dispatch-records/:id — permanently remove
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('dispatch_records')
      .delete()
      .eq('dispatch_record_id', req.params.id);

    if (error) return res.status(500).json({ message: error.message });
    logActivity(req, {
      action: 'dispatch_record.delete',
      entity_type: 'dispatch_record',
      entity_id: req.params.id,
      target: `Dispatch #${req.params.id}`,
      details: `Permanently deleted dispatch record #${req.params.id}.`,
    });
    return res.json({ message: 'Dispatch record permanently deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
