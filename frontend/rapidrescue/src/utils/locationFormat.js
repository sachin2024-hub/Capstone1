export function parseLocationAddress(raw) {
  if (!raw) {
    return { purok: '', area: '', barangay: '', city: '', display: 'Location unavailable' };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.purok !== undefined || parsed.barangay !== undefined)) {
      return {
        purok: parsed.purok || '',
        area: parsed.area || '',
        barangay: parsed.barangay || '',
        city: parsed.city || '',
        display: parsed.display || raw,
      };
    }
  } catch {
    /* plain string */
  }

  const purokMatch = String(raw).match(/purok\s*[\d]+[a-z]?/i);
  const brgyMatch = String(raw).match(/barangay\s+([^,]+)/i);

  return {
    purok: purokMatch ? purokMatch[0] : '',
    area: '',
    barangay: brgyMatch ? brgyMatch[1].trim() : '',
    city: '',
    display: raw,
  };
}

/** Purok if known; otherwise road/area; never show "Not detected". */
export function formatAreaLabel({ purok, area, barangay } = {}) {
  if (purok && purok !== 'Not detected') return purok;
  if (area) return area;
  if (barangay) return `Near Barangay ${barangay}`;
  return 'GPS location';
}
