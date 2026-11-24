const jpeg = (() => {
  try {
    return require('jpeg-js');
  } catch {
    return null;
  }
})();

const ID_KEYWORDS = {
  'Philippine National ID': [
    // English / PhilSys
    'philippine identification',
    'philippine identification system',
    'philsys',
    'phiisys', // OCR typo
    'national id',
    'national identification',
    'psn',
    'pcn',
    // Filipino front of PhilID (common OCR reads)
    'pambansang pagkakakilanlan',
    'pambansang',
    'pagkakakilanlan',
    'pagkakakilan',
    'republika ng pilipinas',
    'republika',
    // OCR fragments often seen on PhilID
    'given names',
    'philippine id',
    'apelyido',
    'mga pangalan',
    'gitnang apelyido',
    'petsa ng kapanganakan',
    'tirahan',
  ],
  "Driver's License": [
    'land transportation',
    'lto',
    "driver's license",
    'drivers license',
    'driving license',
    'non-professional',
    'professional driver',
    'license no',
    'dl no',
  ],
  'UMID': [
    'unified multi-purpose',
    'umid',
    'multi purpose id',
    'multipurpose',
  ],
  'Passport': [
    'passport',
    'pasaporte',
    'department of foreign affairs',
    'dfa',
  ],
  'Postal ID': [
    'philippine postal',
    'philpost',
    'postal id',
    'post office',
  ],
  "Voter's ID": [
    'commission on elections',
    'comelec',
    "voter's id",
    'voter id',
    'voter identification',
  ],
  'PhilHealth ID': [
    'philhealth',
    'philippine health insurance',
  ],
  'SSS ID': [
    'social security system',
    'sss id',
  ],
  'PRC ID': [
    'professional regulation commission',
    'professional regulation',
    'regulation commission',
    'professional identification card',
    'prc id',
    'registration no',
    'registration date',
  ],
  'Senior Citizen ID': [
    'senior citizen',
    'office for senior',
    'osca',
  ],
};

/** Strong PhilID signals — any one is enough when National ID is selected */
const NATIONAL_ID_STRONG = [
  'philsys',
  'phiisys',
  'pambansang pagkakakilanlan',
  'pagkakakilanlan',
  'pagkakakilan',
  'philippine identification system',
  'philippine identification',
  'national identification',
];

const REJECT_KEYWORDS = [
  'student', 'university', 'college', 'school id', 'campus',
  'library card', 'employee id', 'company id', 'membership card',
];

/** Types where an explicitly detected past expiry should reject */
const EXPIRY_CHECK_TYPES = new Set([
  "Driver's License",
  'Passport',
  'PRC ID',
  'Postal ID',
]);

const QUALITY_DISCLAIMER =
  'These checks validate image quality and basic document readability only — not full ID authenticity.';

function normalizeOcr(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[|!]/g, 'i')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(text) {
  return normalizeOcr(text).replace(/\s+/g, '');
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Tolerates small OCR misreads (e.g. "PROFESSIONAI REGULATlON") for multi-word keywords */
function fuzzyKeyword(tokens, k) {
  const words = k.split(' ').filter((w) => w.length >= 4);
  if (words.length === 1 && words[0].length >= 7 && !k.includes(' ')) {
    const w = words[0];
    const max = w.length >= 10 ? 2 : 1;
    return tokens.some((t) => Math.abs(t.length - w.length) <= max && editDistance(t, w, max) <= max);
  }
  if (words.length < 2) return false;
  const found = words.filter((w) => {
    const max = w.length >= 9 ? 2 : 1;
    return tokens.some((t) => Math.abs(t.length - w.length) <= max && editDistance(t, w, max) <= max);
  });
  return found.length === words.length;
}

function textHasKeyword(text, keyword) {
  const n = normalizeOcr(text);
  const k = normalizeOcr(keyword);
  if (!k) return false;
  if (n.includes(k)) return true;
  // spaced OCR often breaks words — also try compacted form
  if (compact(n).includes(compact(k))) return true;
  return fuzzyKeyword(n.split(' '), k);
}

function findMatches(text, keywords) {
  return keywords.filter((kw) => textHasKeyword(text, kw));
}

function detectTypes(text) {
  return Object.keys(ID_KEYWORDS).filter((type) => matchesSelectedType(type, text).match);
}

/** single OCR word (>=6 letters) present allowing 1-2 character misreads */
function hasFuzzyWord(text, word) {
  const max = word.length >= 9 ? 2 : 1;
  return normalizeOcr(text)
    .split(' ')
    .some((t) => Math.abs(t.length - word.length) <= max && editDistance(t, word, max) <= max);
}

function matchesSelectedType(idType, text) {
  const keywords = ID_KEYWORDS[idType] || [];
  const hits = findMatches(text, keywords);

  if (idType === 'PRC ID') {
    // PRC cards: any two of these words (OCR-tolerant) is enough
    const signals = ['professional', 'regulation', 'commission', 'identification'].filter((w) =>
      hasFuzzyWord(text, w)
    );
    const regNo = textHasKeyword(text, 'registration no') || textHasKeyword(text, 'registration date');
    const prcOnly = signals.includes('regulation') || signals.includes('commission') ||
      textHasKeyword(text, 'professional regulation') || textHasKeyword(text, 'prc id');
    const looksLikeOther =
      textHasKeyword(text, 'land transportation') || textHasKeyword(text, 'driver') ||
      textHasKeyword(text, 'commission on elections');
    if (looksLikeOther && !textHasKeyword(text, 'professional regulation')) {
      return { match: false, hits: [] };
    }
    if (prcOnly && (hits.length > 0 || signals.length >= 2 || (signals.includes('professional') && regNo))) {
      return { match: true, hits: hits.length ? hits : ['prc signals'] };
    }
    return { match: false, hits };
  }

  if (idType === 'UMID') {
    const words = ['unified', 'multi', 'purpose'];
    const near = (w) =>
      normalizeOcr(text)
        .split(' ')
        .some((t) => (t.length >= 4 && w.startsWith(t)) ||
          (Math.abs(t.length - w.length) <= 2 && w.length >= 5 && editDistance(t, w, 2) <= 2));
    const signals = words.filter(near).length;
    const crn = /\bcrn\b|\b[c0o]\d{3}\s?\d{7}\s?\d\b/i.test(String(text || ''));
    if (hits.length > 0 || signals >= 2 || (signals >= 1 && crn)) {
      return { match: true, hits: hits.length ? hits : ['umid signals'] };
    }
    return { match: false, hits };
  }

  if (idType === 'Philippine National ID') {
    const strong = NATIONAL_ID_STRONG.some((kw) => textHasKeyword(text, kw));
    // PhilID front often OCR-reads Filipino header even when English keywords fail
    const filipinoHeader =
      textHasKeyword(text, 'pambansa') &&
      (textHasKeyword(text, 'pagkaka') || textHasKeyword(text, 'pilipinas') || textHasKeyword(text, 'republika'));
    const republikaPlusNames =
      textHasKeyword(text, 'republika ng pilipinas') &&
      (textHasKeyword(text, 'given') || textHasKeyword(text, 'last name') || textHasKeyword(text, 'middle name'));
    if (strong || filipinoHeader || republikaPlusNames || hits.length > 0) {
      return { match: true, hits: hits.length ? hits : ['philippine national id signals'] };
    }
    return { match: false, hits };
  }

  return { match: hits.length > 0, hits };
}

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLooseDate(raw) {
  const cleaned = String(raw || '').trim().replace(/\s+/g, '');
  let m = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }
  m = cleaned.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }
  return null;
}

function collectDates(raw) {
  const dateToken =
    /(\d{4}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{1,2}|\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4})/g;
  const allDates = [];
  let dm;
  while ((dm = dateToken.exec(raw)) !== null) {
    const parsed = parseLooseDate(dm[1]);
    if (parsed) {
      allDates.push({
        raw: dm[1],
        date: parsed,
        index: dm.index,
        ymd: toYmd(parsed),
      });
    }
  }
  return allDates;
}

function ageYears(date, now = new Date()) {
  let age = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age -= 1;
  return age;
}

function extractIdFields(text, idType = '') {
  const raw = String(text || '');
  const lower = normalizeOcr(raw);
  const extracted = {
    id_type: idType || null,
    id_number: null,
    name: null,
    birth_date: null,
    expiration_date: null,
  };

  // ID-type specific formats first, then labelled numbers, then generic fallbacks
  const idPatterns = [];
  if (idType === 'PRC ID') {
    idPatterns.push(/registration\s*(?:no|number)\.?\s*[:#]?\s*(\d{5,8})\b/i);
  }
  if (idType === "Driver's License") {
    idPatterns.push(/\b([A-Z]\d{2}[-\s]?\d{2}[-\s]?\d{6,7})\b/);
  }
  if (idType === 'Passport') {
    idPatterns.push(/\b(P\d{7}[A-Z])\b/, /\b([A-Z]{1,2}\d{6,7}[A-Z]?)\b/);
  }
  if (idType === 'UMID') {
    idPatterns.push(/\b(\d{4}[-\s]?\d{7}[-\s]?\d)\b/);
  }
  idPatterns.push(
    /\b(?:psn|pcn|crn|vin|prn|registration\s*no|license\s*no|passport\s*no|id\s*no|id#)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,21})\b/i,
    /\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/
  );
  for (const re of idPatterns) {
    const m = raw.match(re);
    if (m?.[1] && /\d/.test(m[1])) {
      extracted.id_number = m[1].replace(/\s+/g, '').trim();
      break;
    }
  }
  // PRC fallback: OCR often separates the label from its value
  if (!extracted.id_number && idType === 'PRC ID') {
    const m = raw.replace(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g, ' ').match(/\b(\d{6,7})\b/);
    if (m) extracted.id_number = m[1];
  }

  // Name (best effort): labelled last / first / middle name, or a single "NAME:" line
  const LABEL_WORDS =
    /name|apelyido|pangalan|birth|kapanganakan|date|sex|kasarian|address|tirahan|registration|valid|until|signature|blood|marital|license|number|commission|republic|philippines|identification|professional/i;
  const grab = (re) => {
    const m = raw.match(re);
    if (!m?.[1]) return null;
    // keep only the first line of the value
    const firstLine = m[1].split('\n').map((l) => l.trim()).find((l) => l) || '';
    const v = firstLine.replace(/[^A-Za-zÑñ\s.'\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (v.length < 2 || LABEL_WORDS.test(v)) return null; // got the next label instead of a value
    return v;
  };
  const VALUE = '[:\\-/]?\\s*([^\\n]*\\n?[^\\n]*)';
  const lastName = grab(new RegExp('(?:apelyido\\s*\\/\\s*)?last\\s*name\\s*' + VALUE, 'i'));
  const firstName = grab(new RegExp('(?:mga\\s*pangalan\\s*\\/\\s*)?(?:first\\s*name|given\\s*names?)\\s*' + VALUE, 'i'));
  const middleName = grab(new RegExp('(?:gitnang\\s*apelyido\\s*\\/\\s*)?middle\\s*name\\s*' + VALUE, 'i'));
  if (lastName || firstName) {
    extracted.name = [firstName, middleName, lastName].filter(Boolean).join(' ');
  } else {
    extracted.name = grab(/\bname\s*[:\-]\s*([^\n]{4,50})/i);
  }

  const allDates = collectDates(raw);
  const birthHints = /birth|bday|date\s*of\s*birth|dob|petsa\s*ng\s*kapanganakan|birthday/i;
  // Broad expiry hints — OCR often mangles these words
  const expHints =
    /expir|expires|expiry|exp\b|valid\s*until|validity|valid\s*thru|valid\s*to|date\s*of\s*expiry|exp\.?\s*date|until/i;
  const hasExpiryKeyword = expHints.test(lower);

  // 1) Direct "EXPIRES: 2006/01/12" style (strongest)
  const directExp =
    /(?:exp(?:ires|iry|iration)?|valid(?:ity)?\s*(?:until|thru|to)?|until)\s*[:\-.]?\s*(\d{4}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{1,2}|\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4})/gi;
  let direct;
  while ((direct = directExp.exec(raw)) !== null) {
    const parsed = parseLooseDate(direct[1]);
    if (parsed) {
      extracted.expiration_date = toYmd(parsed);
      break;
    }
  }

  // 2) Nearby-context labeling for birth / expiry
  for (const item of allDates) {
    const windowStart = Math.max(0, item.index - 100);
    const window = lower.slice(windowStart, item.index + item.raw.length + 24);
    if (!extracted.birth_date && birthHints.test(window)) {
      extracted.birth_date = item.ymd;
    }
    if (!extracted.expiration_date && expHints.test(window)) {
      extracted.expiration_date = item.ymd;
    }
  }

  // 2b) On IDs that carry issue/registration dates beside the expiry (PRC, DL, Passport, Postal),
  // OCR can scramble label order. The expiry is always the latest non-birth date on the card.
  if (EXPIRY_CHECK_TYPES.has(idType) && allDates.length) {
    const nowD = new Date();
    const nonBirth = allDates.filter((item) => {
      if (item.ymd === extracted.birth_date) return false;
      const age = ageYears(item.date, nowD);
      return age < 16 || age > 95; // skip dates that look like a birth date
    });
    const latest = [...nonBirth].sort((a, b) => b.date - a.date)[0];
    if (latest && (!extracted.expiration_date || latest.ymd > extracted.expiration_date)) {
      extracted.expiration_date = latest.ymd;
    }
  }

  // 3) Driver's License / Passport fallback: pick non-DOB date as expiry
  if (!extracted.expiration_date && EXPIRY_CHECK_TYPES.has(idType) && allDates.length) {
    const now = new Date();
    const birthCandidates = allDates.filter((item) => {
      const windowStart = Math.max(0, item.index - 100);
      const window = lower.slice(windowStart, item.index + item.raw.length + 24);
      if (birthHints.test(window)) return true;
      const age = ageYears(item.date, now);
      return age >= 16 && age <= 95;
    });

    const birthYmd = extracted.birth_date || (birthCandidates[0] && birthCandidates[0].ymd) || null;
    if (birthYmd && !extracted.birth_date) extracted.birth_date = birthYmd;

    const nonBirth = allDates.filter((item) => item.ymd !== birthYmd);
    // Prefer a date that is NOT a plausible DOB, or the remaining date after DOB
    let expiryCandidate = nonBirth.find((item) => {
      const age = ageYears(item.date, now);
      return age < 16 || age > 95; // not a plausible birth date
    });
    if (!expiryCandidate && nonBirth.length) {
      // If both look like ages, prefer the chronologically later date as expiry
      // (issue/expiry pairs) — expiry is usually later than DOB
      expiryCandidate = [...nonBirth].sort((a, b) => b.date - a.date)[0];
    }
    if (!expiryCandidate && !birthYmd && allDates.length === 1) {
      // Single unlabeled date near "exp" already handled; don't guess from lone DOB-like date
      const age = ageYears(allDates[0].date, now);
      if (age < 16 || age > 95) expiryCandidate = allDates[0];
    }
    // If we still have multiple dates and one is clearly in the past as card expiry
    // while another is DOB: use non-birth past dates
    if (!expiryCandidate && nonBirth.length) {
      const past = nonBirth.filter((item) => item.date < now);
      if (past.length) {
        expiryCandidate = [...past].sort((a, b) => b.date - a.date)[0];
      }
    }

    if (expiryCandidate) {
      extracted.expiration_date = expiryCandidate.ymd;
    }
  }

  // 4) Last resort for expiry-required IDs: any past date not used as birth,
  // when "exp" keyword exists anywhere on the card
  if (!extracted.expiration_date && hasExpiryKeyword && allDates.length) {
    const now = new Date();
    const past = allDates
      .filter((item) => item.ymd !== extracted.birth_date && item.date < now)
      .sort((a, b) => b.date - a.date);
    if (past[0]) extracted.expiration_date = past[0].ymd;
  }

  return { extracted, hasExpiryKeyword, allDates };
}

function evaluateExpiration(idType, extracted) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (extracted.expiration_date) {
    const parts = String(extracted.expiration_date).split('-').map((n) => parseInt(n, 10));
    const exp =
      parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999) : new Date(NaN);
    if (!Number.isNaN(exp.getTime()) && exp < now) {
      return {
        status: 'expired',
        message: 'Your ID has expired. Please provide a valid and unexpired ID.',
        expiration_date: extracted.expiration_date,
      };
    }
    if (!Number.isNaN(exp.getTime())) {
      return {
        status: 'valid',
        message: null,
        expiration_date: extracted.expiration_date,
      };
    }
  }

  // GCash-style: Driver's License / Passport / PRC / Postal must show a readable, unexpired date
  if (EXPIRY_CHECK_TYPES.has(idType)) {
    return {
      status: 'unknown',
      message:
        'Expiration date could not be detected. Please recapture your ID so the expiration date is clearly visible.',
      expiration_date: null,
    };
  }

  return { status: 'not_applicable', message: null, expiration_date: null };
}

function analyzePixelQuality(buffer) {
  if (!jpeg) return null;

  let decoded;
  try {
    decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
  } catch {
    const size = buffer.length || 0;
    const level = size >= 100_000 ? 'fair' : 'poor';
    return {
      ok: level !== 'poor',
      level,
      score: size >= 100_000 ? 55 : 30,
      width: 0,
      height: 0,
      issues: level === 'poor' ? ['Could not fully analyze image quality.'] : [],
      tips: ['Improve lighting', 'Hold camera steady', 'Place the whole ID inside the frame'],
      metrics: {},
    };
  }

  const { width, height, data } = decoded;
  const issues = [];
  const tips = [];
  let score = 100;

  if (!width || !height) {
    return {
      ok: false,
      level: 'poor',
      score: 0,
      width,
      height,
      issues: ['Could not read image dimensions.'],
      tips: ['Retake the photo.'],
      metrics: {},
    };
  }

  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  if (minSide < 420 || maxSide < 640) {
    issues.push('Image resolution is too low.');
    tips.push('Move closer');
    score -= 32;
  } else if (minSide < 560) {
    issues.push('Image resolution is quite low.');
    tips.push('Move closer');
    score -= 14;
  }

  const stepX = Math.max(1, Math.floor(width / 120));
  const stepY = Math.max(1, Math.floor(height / 80));
  const grayAt = (x, y) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let glareCount = 0;
  let brightCount = 0;
  let lapSum = 0;
  let lapCount = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const g = grayAt(x, y);
      sum += g;
      sumSq += g * g;
      count += 1;
      if (g > 245) glareCount += 1;
      if (g > 220) brightCount += 1;

      if (x >= stepX && y >= stepY && x + stepX < width && y + stepY < height) {
        const c = g;
        const l = grayAt(x - stepX, y);
        const r = grayAt(x + stepX, y);
        const u = grayAt(x, y - stepY);
        const d = grayAt(x, y + stepY);
        lapSum += Math.abs(4 * c - l - r - u - d);
        lapCount += 1;
      }
    }
  }

  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSq / count - mean * mean) : 0;
  const std = Math.sqrt(variance);
  const glareRatio = count ? glareCount / count : 0;
  const brightRatio = count ? brightCount / count : 0;
  const sharpness = lapCount ? lapSum / lapCount : 0;

  if (mean < 55) {
    issues.push('Image is too dark.');
    tips.push('Improve lighting');
    score -= 28;
  } else if (mean > 210) {
    issues.push('Image is too bright / overexposed.');
    tips.push('Improve lighting');
    score -= 22;
  }

  if (glareRatio > 0.12 || (brightRatio > 0.3 && mean > 175)) {
    issues.push('Excessive glare or reflection detected.');
    tips.push('Avoid glare');
    score -= 24;
  }

  if (sharpness < 8) {
    issues.push('Image is too blurry or out of focus.');
    tips.push('Image is too blurry');
    tips.push('Hold camera steady');
    score -= 35;
  } else if (sharpness < 13) {
    issues.push('Image focus is weak.');
    tips.push('Hold camera steady');
    score -= 14;
  }

  if (std < 14) {
    issues.push('Low contrast — ID may be blocked or not visible.');
    tips.push('Place the whole ID inside the frame');
    score -= 18;
  }

  if (std < 10 && sharpness < 9) {
    issues.push('No clear ID document detected.');
    tips.push('Place the whole ID inside the frame');
    score -= 35;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let level = 'poor';
  if (score >= 72) level = 'good';
  else if (score >= 50) level = 'fair';

  const blocking = issues.some((i) =>
    /too blurry|too dark|too bright|glare|too low|No clear ID/i.test(i)
  );

  return {
    ok: !blocking && level !== 'poor' && score >= 50,
    level,
    score,
    width,
    height,
    issues,
    tips: [...new Set(tips)],
    metrics: {
      mean: Math.round(mean),
      std: Math.round(std),
      sharpness: Math.round(sharpness * 10) / 10,
      glareRatio: Math.round(glareRatio * 1000) / 1000,
    },
  };
}

function failResult(partial) {
  return {
    match: false,
    detected: partial.detected || [],
    text: partial.text || '',
    message: partial.message || 'ID validation failed.',
    quality: partial.quality || null,
    extracted: partial.extracted || null,
    expiration: partial.expiration || null,
    disclaimer: QUALITY_DISCLAIMER,
  };
}

/** Grayscale + upscale + contrast-stretch: helps OCR on coloured/patterned ID cards */
function preprocessForOcr(buffer) {
  if (!jpeg) return null;
  try {
    const src = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 128 });
    const { width: w, height: h, data } = src;
    if (!w || !h) return null;

    const scale = w < 900 ? 2 : w < 1200 ? 1.5 : 1; // phone photos are already large
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const gray = new Uint8Array(nw * nh);
    const g = (x, y) => {
      const i = (y * w + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(h - 1, y / scale);
      const y0 = Math.floor(sy);
      const y1 = Math.min(h - 1, y0 + 1);
      const fy = sy - y0;
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(w - 1, x / scale);
        const x0 = Math.floor(sx);
        const x1 = Math.min(w - 1, x0 + 1);
        const fx = sx - x0;
        const top = g(x0, y0) * (1 - fx) + g(x1, y0) * fx;
        const bot = g(x0, y1) * (1 - fx) + g(x1, y1) * fx;
        gray[y * nw + x] = top * (1 - fy) + bot * fy;
      }
    }

    // Stretch contrast between the 2nd and 98th percentile
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const lowCut = gray.length * 0.02;
    const highCut = gray.length * 0.98;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= lowCut) {
        lo = v;
        break;
      }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= highCut) {
        hi = v;
        break;
      }
    }
    const range = Math.max(30, hi - lo);
    const out = Buffer.alloc(nw * nh * 4);
    for (let i = 0; i < gray.length; i++) {
      const v = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / range));
      out[i * 4] = v;
      out[i * 4 + 1] = v;
      out[i * 4 + 2] = v;
      out[i * 4 + 3] = 255;
    }
    return jpeg.encode({ data: out, width: nw, height: nh }, 92).data;
  } catch {
    return null;
  }
}

// One shared Tesseract worker: loading the engine costs seconds, so do it once, not per scan.
let sharedWorker = null;
let ocrQueue = Promise.resolve();

function getWorker(Tesseract) {
  if (!sharedWorker) {
    sharedWorker = Tesseract.createWorker('eng', 1, { logger: () => {} }).catch((err) => {
      sharedWorker = null;
      throw err;
    });
  }
  return sharedWorker;
}

/** Load the OCR engine ahead of time so the first scan is fast too. */
function warmUp() {
  try {
    return getWorker(require('tesseract.js')).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

/**
 * Multi-pass OCR on a shared worker. Pass 1 reads the photo as taken (usually enough).
 * Only if `isEnough(text)` is still false do we try an enhanced copy / other modes.
 * Text from all passes is combined so label/value fragments from any pass are kept.
 */
function runOcr(Tesseract, buffer, isEnough) {
  const job = ocrQueue.then(async () => {
    const worker = await getWorker(Tesseract);
    const texts = [];
    let confidence = 0;
    let enhanced; // built lazily — skipped entirely when pass 1 succeeds

    const passes = [
      () => ({ img: buffer, psm: '3' }),
      () => {
        if (enhanced === undefined) enhanced = preprocessForOcr(buffer);
        return enhanced ? { img: enhanced, psm: '6' } : null;
      },
      () => (enhanced ? { img: enhanced, psm: '11' } : null),
      () => ({ img: buffer, psm: '11' }),
    ];

    for (const make of passes) {
      const pass = make();
      if (!pass) continue;
      await worker.setParameters({ tessedit_pageseg_mode: pass.psm });
      const {
        data: { text, confidence: conf },
      } = await worker.recognize(pass.img);
      texts.push(text || '');
      if (typeof conf === 'number') confidence = Math.max(confidence, conf);
      if (isEnough && isEnough(texts.join('\n'))) break;
    }
    return { text: texts.join('\n'), confidence };
  });
  ocrQueue = job.catch(() => {}); // keep the queue alive after a failure
  return job;
}

async function verifyIdImage(idType, image, options = {}) {
  if (!idType || !image) {
    return failResult({ message: 'Please select an ID type and take a photo.' });
  }

  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch {
    return failResult({
      message: 'ID scanner is not available. Restart the RapidRescue backend and try again.',
    });
  }

  try {
    const base64 = String(image).replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length < 8_000) {
      return failResult({
        message: 'Image file is too small. Please retake a clearer photo.',
        quality: {
          ok: false,
          level: 'poor',
          score: 0,
          issues: ['Very low file size / resolution.'],
          tips: ['Move closer', 'Hold camera steady'],
        },
      });
    }

    const quality = analyzePixelQuality(buffer) || {
      ok: true,
      level: 'fair',
      score: 55,
      issues: [],
      tips: [],
      metrics: {},
    };

    if (!quality.ok || quality.level === 'poor') {
      const tip = quality.tips?.[0] || 'Retake a clearer photo.';
      return failResult({
        message: `${quality.issues?.[0] || 'ID photo quality is too low.'} ${tip}`,
        quality,
      });
    }

    // Stop OCR passes early once the ID type (and, if given, the name) is already confirmed
    const isEnough = (t) => {
      const n = normalizeOcr(t);
      if (!matchesSelectedType(idType, n).match) return false;
      if (options.names) {
        const { extracted: ex } = extractIdFields(t, idType);
        return compareNames(options.names, ex.name, n).ok;
      }
      return true;
    };
    const { text, confidence } = await runOcr(Tesseract, buffer, isEnough);

    const readable = normalizeOcr(text);
    const ocrConfidence = typeof confidence === 'number' ? confidence : 0;

    if (readable.length < 6 || ocrConfidence < 28) {
      return failResult({
        text: readable.slice(0, 500),
        quality: {
          ...quality,
          ok: false,
          level: 'poor',
          issues: [...(quality.issues || []), 'Text on the ID cannot be clearly read.'],
          tips: [...new Set([...(quality.tips || []), 'Hold camera steady', 'Improve lighting', 'Image is too blurry'])],
        },
        message:
          'Text on the ID cannot be clearly detected. Hold the camera steady, improve lighting, and keep the whole ID inside the frame.',
      });
    }

    const { extracted } = extractIdFields(text, idType);
    const expiration = evaluateExpiration(idType, extracted);

    const rejectHits = findMatches(readable, REJECT_KEYWORDS);
    const detected = detectTypes(readable);
    const typeCheck = matchesSelectedType(idType, readable);

    if (rejectHits.length && !typeCheck.match) {
      return failResult({
        detected,
        text: readable.slice(0, 500),
        quality,
        extracted,
        expiration,
        message: 'Invalid or unsupported ID. Please capture a valid government-issued ID.',
      });
    }

    if (!typeCheck.match) {
      const other = detected.filter((type) => type !== idType);
      return failResult({
        detected,
        text: readable.slice(0, 500),
        quality,
        extracted,
        expiration,
        message: other.length
          ? `The photo looks like a ${other.join(', ')}, not a ${idType}. Please scan the correct ID.`
          : 'Invalid or unsupported ID. Please capture a valid government-issued ID.',
      });
    }

    // After type match: hard-reject expired / unverifiable expiry (GCash-style)
    if (expiration.status === 'expired') {
      return failResult({
        detected: detected.length ? detected : [idType],
        text: readable.slice(0, 500),
        quality,
        extracted,
        expiration,
        message: expiration.message || 'Your ID has expired. Please provide a valid and unexpired ID.',
      });
    }

    if (expiration.status === 'unknown') {
      return failResult({
        detected: detected.length ? detected : [idType],
        text: readable.slice(0, 500),
        quality,
        extracted,
        expiration,
        message:
          expiration.message ||
          'Expiration date could not be detected. Please recapture your ID so the expiration date is clearly visible.',
      });
    }

    return {
      match: true,
      detected: detected.length ? detected : [idType],
      text: readable.slice(0, 500),
      ocrText: readable,
      message: `Verified as ${idType} (quality checks passed). ${QUALITY_DISCLAIMER}`,
      quality: { ...quality, ok: true },
      extracted,
      expiration,
      disclaimer: QUALITY_DISCLAIMER,
    };
  } catch {
    return failResult({
      message: 'Could not scan the photo. Please retake a clearer picture.',
    });
  }
}

const NAME_MISMATCH_MSG =
  'Full name does not match the captured ID. Please check your name and try again.';
const NAME_UNREADABLE_MSG =
  'Unable to read the name on your ID. Please capture a clearer image of your ID.';

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

/** lowercase, strip accents/punctuation, split into name words (suffixes ignored) */
function nameTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NAME_SUFFIXES.has(t));
}

/** exact match, or a 1-edit OCR slip on longer words (never for short names) */
function tokenInList(token, list) {
  const max = token.length >= 9 ? 2 : token.length >= 5 ? 1 : 0;
  return list.some((t) => t === token || (max > 0 && editDistance(t, token, max) <= max));
}

/**
 * Compare the name typed in the registration form with the name on the ID.
 * entered: { first_name, middle_name, last_name }
 * extractedName: best-effort name parsed from the ID (may be null)
 * ocrText: full normalized OCR text, used when label parsing fails
 * Returns { ok, reason: 'match' | 'unreadable' | 'mismatch', message }.
 */
function compareNames(entered, extractedName, ocrText) {
  const first = nameTokens(entered?.first_name);
  const middle = nameTokens(entered?.middle_name);
  const last = nameTokens(entered?.last_name);
  if (!first.length || !last.length) {
    return { ok: false, reason: 'mismatch', message: NAME_MISMATCH_MSG };
  }

  const extractedTokens = nameTokens(extractedName);
  const ocrTokens = nameTokens(ocrText);
  if (!extractedTokens.length && ocrTokens.length < 3) {
    return { ok: false, reason: 'unreadable', message: NAME_UNREADABLE_MSG };
  }

  const covers = (haystack) => {
    if (!first.every((t) => tokenInList(t, haystack))) return false;
    if (!last.every((t) => tokenInList(t, haystack))) return false;
    // Middle name is optional on some IDs (initial only); if shown in full it must match
    if (middle.length) {
      const initials = middle.map((t) => t[0]);
      const ok = middle.every((t, i) => tokenInList(t, haystack) || haystack.includes(initials[i]));
      if (!ok) return false;
    }
    return true;
  };

  if (extractedTokens.length && covers(extractedTokens)) return { ok: true, reason: 'match', message: null };
  // Label order is often scrambled by OCR: accept if the name words appear in the ID text
  if (covers(ocrTokens)) return { ok: true, reason: 'match', message: null };

  if (!extractedTokens.length) {
    return { ok: false, reason: 'unreadable', message: NAME_UNREADABLE_MSG };
  }
  return { ok: false, reason: 'mismatch', message: NAME_MISMATCH_MSG };
}

/**
 * Name to show the user for review: drop OCR noise (stray letters like "A A", "th").
 * When the name matched, keep only the words that belong to the entered name, in ID order.
 */
function cleanDisplayName(extractedName, entered, matched) {
  const words = String(extractedName || '')
    .split(/\s+/)
    .filter(Boolean);
  let kept;
  if (matched) {
    const mine = [
      ...nameTokens(entered?.first_name),
      ...nameTokens(entered?.middle_name),
      ...nameTokens(entered?.last_name),
    ];
    kept = words.filter((w) => {
      const t = nameTokens(w)[0];
      return t && tokenInList(t, mine);
    });
  } else {
    kept = words.filter((w) => w.replace(/[^A-Za-zÑñ]/g, '').length >= 3);
  }
  return kept.length ? kept.join(' ') : null;
}

module.exports = {
  compareNames,
  cleanDisplayName,
  runOcr,
  warmUp,
  detectTypes,
  normalizeOcr,
  verifyIdImage,
  ID_KEYWORDS,
  analyzePixelQuality,
  extractIdFields,
  evaluateExpiration,
  matchesSelectedType,
  QUALITY_DISCLAIMER,
};
