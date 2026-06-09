const {
  matchOfficialBarangay,
  nearestBarangay,
  extractPurok,
  extractAreaLabel,
} = require('./barangays');

async function fetchNominatim(lat, lng) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
      '&format=json&addressdetails=1&zoom=18';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RapidRescue-Backend/1.0' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function resolveLocationFromGps(lat, lng) {
  const city = 'Cabadbaran City';
  const nominatim = await fetchNominatim(lat, lng);
  const nAddr = nominatim?.address || {};

  const purok = extractPurok(
    nAddr.quarter,
    nAddr.neighbourhood,
    nAddr.hamlet,
    nAddr.road,
    nAddr.house_number,
    nominatim?.display_name
  );

  // GPS coordinates are the source of truth for barangay
  let barangay = nearestBarangay(lat, lng);

  const geocodedBarangay = matchOfficialBarangay(
    nAddr.village,
    nAddr.suburb,
    nAddr.neighbourhood,
    nAddr.city_district,
    nAddr.town,
    nAddr.municipality,
    nominatim?.display_name
  );

  if (geocodedBarangay && geocodedBarangay === barangay) {
    barangay = geocodedBarangay;
  }

  const area = purok ? '' : extractAreaLabel(nAddr, barangay);

  const display = [
    purok || area || null,
    barangay ? `Barangay ${barangay}` : null,
    city,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    purok: purok || '',
    area,
    barangay,
    city,
    display,
    latitude: lat,
    longitude: lng,
  };
}

module.exports = { resolveLocationFromGps, fetchNominatim };
