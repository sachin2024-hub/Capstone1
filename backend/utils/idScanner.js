const ID_KEYWORDS = {
  'Philippine National ID': [
    'philippine identification', 'philsys', 'psn', 'national id',
    'national identification', 'philippine identification system',
  ],
  "Driver's License": [
    'land transportation', 'lto', "driver's license", 'drivers license',
    'driving license', 'non-professional', 'professional driver',
  ],
  'UMID': [
    'unified multi-purpose', 'umid', 'multi purpose id',
  ],
  'Passport': [
    'passport', 'pasaporte', 'department of foreign affairs',
  ],
  'Postal ID': [
    'philippine postal', 'philpost', 'postal id', 'post office',
  ],
  "Voter's ID": [
    'commission on elections', 'comelec', "voter's id", 'voter id', 'voter identification',
  ],
  'PhilHealth ID': [
    'philhealth', 'philippine health insurance',
  ],
  'SSS ID': [
    'social security system', 'sss id',
  ],
  'PRC ID': [
    'professional regulation commission', 'prc id', 'professional license',
  ],
  'Senior Citizen ID': [
    'senior citizen', 'office for senior', 'osca',
  ],
};

const REJECT_KEYWORDS = [
  'student', 'university', 'college', 'school id', 'campus',
  'library card', 'employee id', 'company id', 'membership card',
];

function findMatches(text, keywords) {
  return keywords.filter((kw) => text.includes(kw.toLowerCase()));
}

function detectTypes(text) {
  const detected = [];
  for (const [type, kws] of Object.entries(ID_KEYWORDS)) {
    if (kws.some((kw) => text.includes(kw.toLowerCase()))) {
      detected.push(type);
    }
  }
  return detected;
}

async function verifyIdImage(idType, image) {
  if (!idType || !image) {
    return { match: false, detected: [], message: 'Please select an ID type and take a photo.' };
  }

  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch {
    return { match: false, detected: [], message: 'ID scanner is not available. Restart the RapidRescue backend and try again.' };
  }

  try {
    const base64 = String(image).replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
    const lowerText = String(text || '').toLowerCase();
    const readable = lowerText.replace(/\s+/g, ' ').trim();

    if (readable.length < 8) {
      return {
        match: false,
        detected: [],
        text: readable.slice(0, 500),
        message: 'Could not read the ID. Take a clearer, well-lit photo and try again.',
      };
    }

    const keywords = ID_KEYWORDS[idType] || [];
    const selectedHits = findMatches(readable, keywords);
    const rejectHits = findMatches(readable, REJECT_KEYWORDS);
    const detected = detectTypes(readable);

    if (rejectHits.length && !selectedHits.length) {
      return {
        match: false,
        detected,
        text: readable.slice(0, 500),
        message: `This photo looks like a school or company ID, not a ${idType}. Please scan the correct ID.`,
      };
    }

    if (!selectedHits.length) {
      const other = detected.filter((type) => type !== idType);
      return {
        match: false,
        detected,
        text: readable.slice(0, 500),
        message: other.length
          ? `The photo looks like a ${other.join(', ')}, not a ${idType}. Please scan the correct ID.`
          : `The photo does not match a ${idType}. Please scan the ID type you selected.`,
      };
    }

    return {
      match: true,
      detected,
      text: readable.slice(0, 500),
      message: `Verified as ${idType}.`,
    };
  } catch (err) {
    return {
      match: false,
      detected: [],
      message: 'Could not scan the photo. Please retake a clearer picture.',
    };
  }
}

module.exports = { verifyIdImage, ID_KEYWORDS };
