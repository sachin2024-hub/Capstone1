function parseLocationAddress(raw) {
  if (!raw) {
    return { purok: '', barangay: '', city: '', display: 'Location unavailable' };
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

function buildLocationAddress({ purok, area, barangay, city, location_address }) {
  if (purok || area || barangay) {
    const display = [
      purok || area || null,
      barangay ? `Barangay ${barangay.replace(/^Barangay\s+/i, '')}` : null,
      city || 'Cabadbaran City',
    ]
      .filter(Boolean)
      .join(', ');

    return JSON.stringify({
      purok: purok || '',
      area: area || '',
      barangay: barangay || '',
      city: city || 'Cabadbaran City',
      display,
    });
  }

  return location_address || null;
}

module.exports = { parseLocationAddress, buildLocationAddress };
