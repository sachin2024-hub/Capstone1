export const BLOCK_REASONS = [
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
    detail: 'Laing rason. I-click aron mo-pop up ang lugar nga i-type.',
  },
];

export function formatBlockReason(stored) {
  const raw = String(stored || '');
  if (raw.startsWith('others::')) {
    const note = raw.slice('others::'.length).trim();
    return {
      id: 'others',
      label: 'Others',
      detail: note || 'Laing rason nga gihatag sa administrator.',
    };
  }
  return BLOCK_REASONS.find((item) => item.id === raw) || null;
}
