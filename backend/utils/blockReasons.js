const BLOCK_REASONS = [
  {
    id: 'false_reports',
    label: 'Repeated false emergency reports',
    detail: 'Sige og send og fake Help button o dili tinuod nga emergency.',
  },
  {
    id: 'misuse',
    label: 'Misuse of the system',
    detail: 'Gamiton ang app para mangtrip, spam, o dili emergency-related nga purpose.',
  },
  {
    id: 'suspicious',
    label: 'Suspicious activity',
    detail: 'Unusual nga login attempts or activity nga possible security risk.',
  },
  {
    id: 'rules',
    label: 'Violation of system rules',
    detail: 'Dili mosunod sa terms/rules sa paggamit sa RapidRescue.',
  },
  {
    id: 'abusive',
    label: 'Abusive behavior',
    detail: 'Mang-insulto, manghulga, or inappropriate behavior ngadto sa operator/responders.',
  },
  {
    id: 'admin',
    label: 'Administrator decision',
    detail: 'Naay valid reason ang Admin/Super Admin nga temporarily i-restrict ang account.',
  },
  {
    id: 'others',
    label: 'Others',
    detail: 'Laing rason nga gihatag sa administrator.',
  },
];

function getBlockReason(id) {
  return BLOCK_REASONS.find((item) => item.id === id) || BLOCK_REASONS.find((item) => item.id === 'admin');
}

function normalizeBlockReason(value) {
  if (BLOCK_REASONS.some((item) => item.id === value && item.id !== 'others')) return value;
  if (typeof value !== 'string' || !value.startsWith('others::')) return null;
  const note = value.slice('others::'.length).replace(/\s+/g, ' ').trim().slice(0, 160);
  return note ? `others::${note}` : null;
}

function describeBlockReason(stored) {
  const raw = String(stored || '');
  if (raw.startsWith('others::')) {
    const note = raw.slice('others::'.length).trim();
    const base = getBlockReason('others');
    return { ...base, detail: note || base.detail };
  }
  return getBlockReason(raw);
}

function blockedAccountMessage(reasonId) {
  const reason = describeBlockReason(reasonId);
  return (
    '🚫 Your account has been blocked. Please contact the administrator for assistance.\n\n' +
    `Reason: ${reason.label}\n${reason.detail}`
  );
}

module.exports = { BLOCK_REASONS, getBlockReason, normalizeBlockReason, blockedAccountMessage };
