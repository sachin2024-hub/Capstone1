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
];

function getBlockReason(id) {
  return BLOCK_REASONS.find((item) => item.id === id) || BLOCK_REASONS[BLOCK_REASONS.length - 1];
}

function blockedAccountMessage(reasonId) {
  const reason = getBlockReason(reasonId);
  return (
    '🚫 Your account has been blocked. Please contact the administrator for assistance.\n\n' +
    `Reason: ${reason.label}\n${reason.detail}`
  );
}

module.exports = { BLOCK_REASONS, getBlockReason, blockedAccountMessage };
